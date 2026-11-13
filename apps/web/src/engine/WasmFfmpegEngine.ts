/**
 * Web 平台音频引擎：基于 FFmpeg.wasm 的 AudioEngine 实现。
 *
 * 关键设计：
 * - 实例池：每个 FFmpeg.wasm 实例同时只跑一个作业，池大小 = 并发任务数。
 * - 真实进度：监听 ffmpeg 的 progress 事件（输出时间戳 μs）÷ 总时长。
 * - 取消：terminate 掉正在执行的 worker 实例，作业以 E_CANCELLED 拒绝。
 * - 两遍归一化：先 volumedetect / loudnorm 测量，再带测量值执行正式转换。
 * - 探测与能力检测均来自引擎真实输出，禁止硬编码。
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  AudioEngine,
  AudioSource,
  AudioJob,
  EngineCapabilities,
  EngineInfo,
  JobResult,
  ProbeResult,
  ResourceEstimate,
  TaskCallbacks,
  MeasureResult,
  buildConvertArgs,
  buildMergeArgs,
  buildTrimArgs,
  buildMeasureArgs,
  parseVolumedetect,
  parseLoudnormJson,
  expandJob,
  detectFormat,
  expectedFormatForExt,
  classifyEngineOutput,
  makeEngineError,
  WEB_SIZE_LIMIT,
  checkSizeLimit,
  estimateWasmPeakBytes,
  FORMATS,
  closestNumber,
  ConvertJob,
  TrimJob,
  MergeJob,
} from '@audio-studio/shared';
import { loadFfmpeg, createFfmpeg, takeSharedFfmpeg } from './loadFfmpeg';
import { parseProbeOutput, toProbeResult } from './parseProbe';
import { assembleCapabilities } from './capabilities';

interface PoolInstance {
  ff: FFmpeg;
  taskId?: string;
  logs: string[];
  progressHandler?: (p: { progress: number; time: number }) => void;
  dead: boolean;
}

interface Waiter {
  taskId: string;
  resolve: (inst: PoolInstance) => void;
  reject: (err: Error) => void;
}

type BuildCtx = {
  durationMs?: number;
  itemDurationsMs?: (number | undefined)[];
  measure?: MeasureResult;
  resolvedSampleRate?: number;
  resolvedChannels?: number;
};

/** 把 ffmpeg 的容器字符串映射回格式注册表 */
export function mapContainerToFormat(container: string): ProbeResult['format'] {
  const c = container.toLowerCase();
  if (c.includes('mp3')) return 'mp3';
  if (c.includes('wav')) return 'wav';
  if (c.includes('flac')) return 'flac';
  if (c.includes('mov') || c.includes('mp4') || c.includes('m4a')) return 'm4a';
  if (c.includes('ogg')) return 'ogg';
  if (c.includes('asf') || c.includes('wma')) return 'wma';
  if (c.includes('aiff') || c.includes('aif')) return 'aiff';
  if (c.includes('ape')) return 'ape';
  if (c.includes('ac3')) return 'ac3';
  if (c.includes('amr')) return 'amr';
  if (c.includes('adts') || c === 'aac') return 'aac';
  if (c.includes('matroska') || c.includes('webm')) return null;
  return null;
}

export class WasmFfmpegEngine implements AudioEngine {
  readonly info: EngineInfo = {
    kind: 'wasm',
    name: 'FFmpeg.wasm',
    version: '',
    location: 'public/ffmpeg/',
  };

  private pool: PoolInstance[] = [];
  private inUse = new Set<PoolInstance>();
  private waiters: Waiter[] = [];
  private cancelResolvers = new Map<string, Array<() => void>>();
  private cancelled = new Set<string>();
  private caps: EngineCapabilities | null = null;
  private probeCache = new Map<string, ProbeResult>();
  private maxConcurrent: number;
  private disposed = false;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, Math.min(4, maxConcurrent));
  }

  setConcurrency(n: number): void {
    this.maxConcurrent = Math.max(1, Math.min(4, n));
  }

  async init(): Promise<EngineCapabilities> {
    if (this.caps) return this.caps;
    try {
      const ff = await loadFfmpeg();
      // 收集 -version 输出
      const versionLogs: string[] = [];
      const handler = ({ message }: { message: string }) => versionLogs.push(message);
      ff.on('log', handler);
      try {
        await ff.exec(['-version']);
      } finally {
        ff.off('log', handler);
      }
      const versionLine = versionLogs.find((l) => l.startsWith('ffmpeg version')) ?? '';
      this.info.version = /ffmpeg version\s+(\S+)/.exec(versionLine)?.[1] ?? 'unknown';
    } catch (e) {
      throw makeEngineError('E_ENGINE_INIT', e instanceof Error ? e.message : String(e));
    }

    try {
      const enc = await this.runInfoCommand(['-encoders']);
      const mux = await this.runInfoCommand(['-muxers']);
      const dem = await this.runInfoCommand(['-demuxers']);
      const flt = await this.runInfoCommand(['-filters']);
      this.caps = assembleCapabilities(this.info, enc, mux, dem, flt);
      if (!this.caps.encoders.includes('libmp3lame')) {
        // 核心不完整时给出明确提示，而不是假装支持
        console.warn('[engine] 核心缺少 libmp3lame，MP3 输出将不可用');
      }
      return this.caps;
    } catch (e) {
      throw makeEngineError('E_ENGINE_INIT', e instanceof Error ? e.message : String(e));
    }
  }

  capabilities(): EngineCapabilities {
    if (!this.caps) throw makeEngineError('E_ENGINE_INIT', '引擎尚未初始化');
    return this.caps;
  }

  private async runInfoCommand(args: string[]): Promise<string> {
    const inst = await this.acquire('__info__');
    try {
      inst.logs = [];
      await inst.ff.exec(args);
      return inst.logs.join('\n');
    } finally {
      this.release(inst);
    }
  }

  // ---------- 池管理 ----------

  private wrap(ff: FFmpeg): PoolInstance {
    const inst: PoolInstance = { ff, logs: [], dead: false };
    ff.on('progress', (p: { progress: number; time: number }) => {
      inst.progressHandler?.(p);
    });
    ff.on('log', ({ message }: { message: string }) => {
      inst.logs.push(message);
      if (inst.logs.length > 5000) inst.logs.splice(0, 2500);
    });
    return inst;
  }

  private async acquire(taskId: string): Promise<PoolInstance> {
    if (this.disposed) throw makeEngineError('E_ENGINE_INIT', '引擎已释放');
    // 有空闲实例
    const idle = this.pool.find((i) => !i.taskId && !i.dead);
    if (idle) {
      idle.taskId = taskId;
      idle.logs = [];
      this.inUse.add(idle);
      return idle;
    }
    // 可以创建新实例：首次优先复用启动探测用的共享实例，之后每次新建独立实例
    // （FFmpeg.wasm 单实例不支持并发 exec，池里必须是不同实例）
    if (this.pool.length < this.maxConcurrent) {
      const ff = takeSharedFfmpeg() ?? (await createFfmpeg());
      const inst = this.wrap(ff);
      inst.taskId = taskId;
      this.pool.push(inst);
      this.inUse.add(inst);
      return inst;
    }
    // 等待释放
    return new Promise<PoolInstance>((resolve, reject) => {
      this.waiters.push({ taskId, resolve, reject });
    });
  }

  private release(inst: PoolInstance): void {
    inst.progressHandler = undefined;
    this.inUse.delete(inst);
    if (inst.dead) {
      this.pool = this.pool.filter((p) => p !== inst);
    } else {
      inst.taskId = undefined;
    }
    const w = this.waiters.shift();
    if (!w) return;
    if (inst.dead) {
      void this.acquire(w.taskId).then(w.resolve).catch(w.reject);
    } else {
      inst.taskId = w.taskId;
      inst.logs = [];
      this.inUse.add(inst);
      w.resolve(inst);
    }
  }

  // ---------- 取消 ----------

  private registerCancel(taskId: string): Promise<void> {
    const p = new Promise<void>((_, reject) => {
      const list = this.cancelResolvers.get(taskId) ?? [];
      list.push(() => {
        reject(makeEngineError('E_CANCELLED'));
      });
      this.cancelResolvers.set(taskId, list);
    });
    // 防止在 attach 到 race 之前产生 unhandled rejection
    p.catch(() => undefined);
    return p;
  }

  private clearCancel(taskId: string): void {
    this.cancelResolvers.delete(taskId);
    this.cancelled.delete(taskId);
  }

  async cancel(taskId: string): Promise<void> {
    this.cancelled.add(taskId);
    const resolvers = this.cancelResolvers.get(taskId) ?? [];
    for (const r of resolvers) r();
    // 终止正在执行该任务的实例（真正停止 CPU 计算）；
    // 对应作业的 exec promise 会被 terminate 拒绝，runSingle 的 finally 负责回收实例
    for (const inst of this.pool) {
      if (inst.taskId === taskId && !inst.dead) {
        inst.dead = true;
        try {
          inst.ff.terminate();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ---------- 探测 ----------

  async probe(source: AudioSource): Promise<ProbeResult> {
    const cached = this.probeCache.get(source.id);
    if (cached) return cached;

    const header = await this.readHeader(source, 65536);
    const magic = detectFormat(header);

    const inName = this.fsName(source, 'probe');
    const inst = await this.acquire(`probe:${source.id}`);
    try {
      await inst.ff.writeFile(inName, await this.readAll(source));
      inst.logs = [];
      let code = 1;
      try {
        code = await inst.ff.exec(['-i', inName]);
      } catch (e) {
        if (this.cancelled.has(`probe:${source.id}`)) throw makeEngineError('E_CANCELLED');
        throw makeEngineError('E_CORRUPT_FILE', e instanceof Error ? e.message : String(e));
      }
      const stderr = inst.logs.join('\n');

      if (/no such file or directory/i.test(stderr)) {
        throw makeEngineError('E_SOURCE_MISSING');
      }
      if (
        /invalid data found when processing input|could not find codec parameters|error while decoding|moov atom not found/i.test(
          stderr,
        )
      ) {
        throw makeEngineError('E_CORRUPT_FILE', stderr.slice(-2000));
      }
      if (!/Input #0/.test(stderr)) {
        // -i 无输出文件时退出码为 1 是正常的；连 Input 都没有则文件不可识别
        if (code !== 0 && !/Duration:/.test(stderr)) {
          throw makeEngineError('E_UNSUPPORTED_FORMAT', stderr.slice(-2000));
        }
      }

      const parsed = parseProbeOutput(stderr);
      if (!parsed.audio) {
        throw makeEngineError('E_UNSUPPORTED_FORMAT', stderr.slice(-2000), {
          message: '文件中没有音频流',
        });
      }

      // 真实格式 = 容器解析 + 文件头比对
      const fromContainer = mapContainerToFormat(parsed.container);
      const actualFormat = magic.format ?? fromContainer;
      const declaredExt = (source.name.split('.').pop() ?? '').toLowerCase();
      const expected = expectedFormatForExt(declaredExt);
      const mismatch =
        expected && actualFormat && expected !== actualFormat
          ? { declared: declaredExt, actual: actualFormat }
          : undefined;

      // 封面（真实提取）
      let coverArt: ProbeResult['coverArt'];
      if (parsed.videoStreams.some((v) => v.isAttachedPicture)) {
        coverArt = await this.extractCover(inst, inName);
      }

      const result = toProbeResult(parsed, {
        fileSizeBytes: source.sizeBytes,
        format: actualFormat,
        extensionMismatch: mismatch,
        coverArt,
      });
      if (mismatch) {
        result.warnings.push(
          `扩展名 .${declaredExt} 与实际格式 ${actualFormat} 不一致，已按实际格式处理`,
        );
      }
      if (magic.confidence === 'unknown' && !magic.format) {
        result.warnings.push('无法通过文件头识别格式，信息来自解码器输出');
      }

      this.probeCache.set(source.id, result);
      return result;
    } finally {
      try {
        await inst.ff.deleteFile(inName);
      } catch {
        /* ignore */
      }
      this.release(inst);
    }
  }

  private async extractCover(inst: PoolInstance, inName: string): Promise<ProbeResult['coverArt']> {
    const outName = 'cover_extract.bin';
    try {
      inst.logs = [];
      await inst.ff.exec([
        '-i',
        inName,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-f',
        'image2',
        outName,
      ]);
      const data = await inst.ff.readFile(outName);
      const bytes = toBytes(data);
      if (!bytes.length) return undefined;
      return { mime: sniffImageMime(bytes), data: bytes };
    } catch {
      return undefined;
    } finally {
      try {
        await inst.ff.deleteFile(outName);
      } catch {
        /* ignore */
      }
    }
  }

  // ---------- 执行作业 ----------

  async run(job: AudioJob, callbacks?: TaskCallbacks): Promise<JobResult> {
    const t0 = performance.now();
    if (this.cancelled.has(job.taskId)) {
      // 一次性取消语义：清除标记后拒绝（支持“暂停后重新入队”）
      this.cancelled.delete(job.taskId);
      throw makeEngineError('E_CANCELLED');
    }
    if (!this.caps) await this.init();

    const jobs = expandJob(job);
    if (jobs.length === 1) return this.runSingle(jobs[0], callbacks, t0);

    // 多片段：顺序执行，进度按片段数合并
    let last: JobResult | null = null;
    const results: JobResult[] = [];
    for (let i = 0; i < jobs.length; i++) {
      if (this.cancelled.has(job.taskId)) throw makeEngineError('E_CANCELLED');
      const wrapped: TaskCallbacks = {
        onProgress: (p) =>
          callbacks?.onProgress?.({
            ...p,
            ratio: (i + p.ratio) / jobs.length,
            processedMs: p.processedMs,
          }),
        onLog: callbacks?.onLog,
      };
      last = await this.runSingle(jobs[i], wrapped, t0);
      results.push(last);
    }
    // 返回最后一个片段的结果（多文件下载由 UI 处理 results 列表）
    if (last) (last as JobResult & { allSegments?: JobResult[] }).allSegments = results;
    return last!;
  }

  private async runSingle(
    job: AudioJob,
    callbacks: TaskCallbacks | undefined,
    t0: number,
  ): Promise<JobResult> {
    const taskId = job.taskId;
    if (this.cancelled.has(taskId)) throw makeEngineError('E_CANCELLED');

    const cancelPromise = this.registerCancel(taskId);
    const inst = await this.acquire(taskId);
    const written: string[] = [];
    if (this.cancelled.has(taskId)) {
      // 取消发生在等待实例期间
      this.clearCancel(taskId);
      this.release(inst);
      throw makeEngineError('E_CANCELLED');
    }

    try {
      // 1. 写入输入文件
      let totalMs = 0;
      let ctx: BuildCtx = {};

      if (job.kind === 'convert') {
        const inName = await this.writeInput(inst, job.source, written);
        job = { ...job, source: { ...job.source, path: inName } };
        const pr = await this.probeUncached(job.source, inName, inst);
        totalMs = pr.durationMs ?? 0;
        ctx = await this.buildCtx(job, pr, callbacks, cancelPromise, inst);
      } else if (job.kind === 'trim') {
        const inName = await this.writeInput(inst, job.source, written);
        job = { ...job, source: { ...job.source, path: inName } };
        totalMs = Math.max(0, job.endMs - job.startMs);
        ctx = { durationMs: totalMs };
        if (job.params.normalize?.enabled) {
          // 测量同样限定在裁剪区间内（buildMeasureArgs 对 trim 作业追加 -ss/-t）
          ctx = { ...ctx, ...(await this.measure(job, inst, cancelPromise, callbacks)) };
        }
      } else {
        // merge：全部输入写入并探测，取得真实时长/采样率/声道
        const paths: string[] = [];
        for (let i = 0; i < job.items.length; i++) {
          const item = job.items[i];
          const inName = await this.writeInput(inst, item.source, written, i);
          paths.push(inName);
          job.items[i] = { ...item, source: { ...item.source, path: inName } };
        }
        const probes: ProbeResult[] = [];
        for (let i = 0; i < job.items.length; i++) {
          probes.push(await this.probeUncached(job.items[i].source, paths[i], inst));
        }
        const sum = probes.reduce((a, p) => a + (p.durationMs ?? 0), 0);
        totalMs = sum + Math.max(0, job.items.length - 1) * Math.max(0, job.gapMs);
        const targetFormat = FORMATS[job.params.format];
        const resolvedSampleRate =
          job.params.sampleRate ||
          closestNumber(targetFormat.sampleRates, probes[0].sampleRate || 44100);
        const maxChannels = Math.max(...probes.map((p) => p.channels ?? 2));
        const resolvedChannels =
          job.params.channels || closestNumber(targetFormat.channels, maxChannels);
        ctx = {
          durationMs: totalMs,
          itemDurationsMs: probes.map((p) => p.durationMs),
          resolvedSampleRate,
          resolvedChannels,
        };
        if (job.params.normalize?.enabled) {
          ctx = { ...ctx, ...(await this.measure(job, inst, cancelPromise, callbacks)) };
        }
      }

      // 2. 进度回调
      const outDurationMs = job.kind === 'trim' ? Math.max(0, job.endMs - job.startMs) : totalMs;
      inst.progressHandler = (p) => {
        if (!callbacks) return;
        const outUs = typeof p.time === 'number' && p.time > 0 ? p.time : 0;
        const processedMs = Math.round(outUs / 1000);
        const ratio = outDurationMs > 0 ? Math.min(1, processedMs / outDurationMs) : 0;
        callbacks.onProgress?.({ ratio, processedMs, totalMs: outDurationMs });
      };

      // 3. 构建参数并执行
      const outName = `out_${sanitizeFs(taskId)}${extOf(job)}`;
      const args = this.buildArgs(job, ctx, outName);

      const execPromise = inst.ff.exec(args);
      const guarded = Promise.race([execPromise, cancelPromise as unknown as Promise<number>]);
      let code: number;
      try {
        code = await guarded;
      } catch (e) {
        if (this.cancelled.has(taskId)) throw makeEngineError('E_CANCELLED');
        throw e;
      }
      const stderr = inst.logs.join('\n');
      if (this.cancelled.has(taskId)) throw makeEngineError('E_CANCELLED');
      if (code !== 0) {
        const errCode = classifyEngineOutput(stderr);
        throw makeEngineError(errCode, stderr.slice(-3000));
      }

      // 4. 读取输出
      const data = await inst.ff.readFile(outName);
      const bytes = toBytes(data);
      if (!bytes.length)
        throw makeEngineError('E_UNKNOWN', stderr.slice(-2000), { message: '输出文件为空' });

      // 5. 真实校验输出（直接探测仍在虚拟 FS 中的结果文件，避免内存 buffer 被转移）
      let outputProbe: ProbeResult | undefined;
      try {
        outputProbe = await this.probeFsOutput(inst, outName, job.outputFileName, bytes.length);
      } catch {
        outputProbe = undefined; // 校验失败不阻断交付，但会在 UI 提示
      }

      callbacks?.onProgress?.({ ratio: 1, processedMs: outDurationMs, totalMs: outDurationMs });

      return {
        outputPath: `${job.outputDir ? job.outputDir + '/' : ''}${job.outputFileName}`,
        fileName: job.outputFileName,
        sizeBytes: bytes.length,
        data: bytes,
        outputProbe,
        elapsedMs: Math.round(performance.now() - t0),
      };
    } finally {
      // 清理虚拟文件系统，防止临时文件泄漏
      for (const f of written) {
        try {
          await inst.ff.deleteFile(f);
        } catch {
          /* ignore */
        }
      }
      try {
        await inst.ff.deleteFile(`out_${sanitizeFs(taskId)}${extOf(job)}`);
      } catch {
        /* ignore */
      }
      this.clearCancel(taskId);
      this.release(inst);
    }
  }

  private buildArgs(
    job: AudioJob,
    ctx: Parameters<typeof buildConvertArgs>[1],
    outName: string,
  ): string[] {
    const withOut = (args: string[]): string[] => {
      // 把输出文件名替换进参数末尾
      const copy = [...args];
      copy[copy.length - 1] = outName;
      return copy;
    };
    if (job.kind === 'convert') return withOut(buildConvertArgs(job as ConvertJob, ctx));
    if (job.kind === 'trim') return withOut(buildTrimArgs(job as TrimJob, ctx));
    return withOut(buildMergeArgs(job as MergeJob, ctx));
  }

  /** 归一化测量（两遍法第一遍） */
  private async measure(
    job: AudioJob,
    inst: PoolInstance,
    cancelPromise: Promise<void>,
    callbacks?: TaskCallbacks,
  ): Promise<{ measure?: MeasureResult }> {
    const mode = job.params.normalize.mode;
    const args = buildMeasureArgs(job, mode);
    callbacks?.onLog?.(`[measure] ${mode} 归一化测量中…`);
    const execPromise = inst.ff.exec(args);
    try {
      await Promise.race([execPromise, cancelPromise]);
    } catch (e) {
      if (this.cancelled.has(job.taskId)) throw makeEngineError('E_CANCELLED');
      throw e;
    }
    const allLogs = inst.logs.join('\n');
    if (mode === 'peak') {
      const maxVol = parseVolumedetect(allLogs);
      if (maxVol === undefined)
        throw makeEngineError('E_UNKNOWN', allLogs.slice(-2000), { message: '峰值测量失败' });
      return { measure: { maxVolumeDb: maxVol } };
    }
    const lm = parseLoudnormJson(allLogs);
    if (!lm || lm.inputI === undefined)
      throw makeEngineError('E_UNKNOWN', allLogs.slice(-2000), { message: 'LUFS 测量失败' });
    return { measure: lm };
  }

  // ---------- 内部工具 ----------

  private fsName(source: AudioSource, _tag: string): string {
    return `in_${sanitizeFs(source.id)}.${extOfSource(source.name)}`;
  }

  private async writeInput(
    inst: PoolInstance,
    source: AudioSource,
    written: string[],
    idx = 0,
  ): Promise<string> {
    const ext = extOfSource(source.name);
    const name = `in_${sanitizeFs(source.id)}${idx > 0 ? `_${idx}` : ''}.${ext}`;
    const bytes = await this.readAll(source);
    await inst.ff.writeFile(name, bytes);
    written.push(name);
    return name;
  }

  private async probeUncached(
    source: AudioSource,
    fsName: string,
    inst: PoolInstance,
  ): Promise<ProbeResult> {
    const cached = this.probeCache.get(source.id);
    if (cached) return cached;
    inst.logs = [];
    try {
      await inst.ff.exec(['-i', fsName]);
    } catch {
      /* -i 无输出时非零退出是正常的 */
    }
    const stderr = inst.logs.join('\n');
    const parsed = parseProbeOutput(stderr);
    if (!parsed.audio)
      throw makeEngineError('E_UNSUPPORTED_FORMAT', stderr.slice(-1000), {
        message: '文件中没有音频流',
      });
    const result = toProbeResult(parsed, {
      fileSizeBytes: source.sizeBytes,
      format:
        detectFormat(await this.readHeader(source, 4096)).format ??
        mapContainerToFormat(parsed.container),
    });
    this.probeCache.set(source.id, result);
    return result;
  }

  /** 探测虚拟 FS 中的结果文件（输出校验用） */
  private async probeFsOutput(
    inst: PoolInstance,
    fsName: string,
    fileName: string,
    sizeBytes: number,
  ): Promise<ProbeResult> {
    inst.logs = [];
    await inst.ff.exec(['-i', fsName]);
    const parsed = parseProbeOutput(inst.logs.join('\n'));
    if (!parsed.audio) throw makeEngineError('E_UNKNOWN', '输出文件探测失败');
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    return toProbeResult(parsed, {
      fileSizeBytes: sizeBytes,
      format: expectedFormatForExt(ext) ?? mapContainerToFormat(parsed.container),
      fileName,
    });
  }

  private async buildCtx(
    job: ConvertJob,
    pr: ProbeResult,
    callbacks: TaskCallbacks | undefined,
    cancelPromise: Promise<void>,
    inst: PoolInstance,
  ): Promise<BuildCtx> {
    const ctx: BuildCtx = {
      durationMs: pr.durationMs ?? 0,
      resolvedSampleRate: job.params.sampleRate || pr.sampleRate,
      resolvedChannels: job.params.channels || pr.channels,
    };
    if (job.params.normalize?.enabled) {
      const m = await this.measure(job, inst, cancelPromise, callbacks);
      Object.assign(ctx, m);
    }
    return ctx;
  }

  private async readAll(source: AudioSource): Promise<Uint8Array> {
    if (source.file) {
      const buf = await source.file.arrayBuffer();
      return new Uint8Array(buf);
    }
    throw makeEngineError('E_SOURCE_MISSING', '浏览器引擎需要 File 对象');
  }

  private async readHeader(source: AudioSource, n: number): Promise<Uint8Array> {
    if (source.file) {
      const slice = source.file.slice(0, n);
      return new Uint8Array(await slice.arrayBuffer());
    }
    return new Uint8Array(0);
  }

  estimate(source: AudioSource): ResourceEstimate {
    const warnings: string[] = [];
    const durationMs = this.probeCache.get(source.id)?.durationMs;
    const peak = estimateWasmPeakBytes(source.sizeBytes, durationMs);
    const verdict = checkSizeLimit(source.sizeBytes, WEB_SIZE_LIMIT);
    if (verdict === 'reject') {
      warnings.push(
        `文件 ${fmtSize(source.sizeBytes)} 超出浏览器引擎处理上限（${fmtSize(WEB_SIZE_LIMIT.hardStopBytes)}），请使用桌面版`,
      );
    } else if (verdict === 'warn') {
      warnings.push(
        `文件较大（${fmtSize(source.sizeBytes)}），预计峰值内存约 ${fmtSize(peak)}，请勿关闭页面`,
      );
    }
    if (peak > 1.5 * 1024 * 1024 * 1024) {
      warnings.push('预计内存需求超过 1.5GB，可能触发浏览器内存限制');
    }
    return { inputBytes: source.sizeBytes, estimatedPeakBytes: peak, warnings };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const inst of this.pool) {
      inst.dead = true;
      try {
        inst.ff.terminate();
      } catch {
        /* ignore */
      }
    }
    this.pool = [];
    this.inUse.clear();
    this.waiters = [];
    this.probeCache.clear();
  }
}

// ---------- 小工具 ----------

/** readFile 结果统一转 bytes（部分版本返回 string） */
function toBytes(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
  return out;
}

function sanitizeFs(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function extOfSource(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase().slice(0, 8) : 'bin';
}

function extOf(job: AudioJob): string {
  const f = job.params.format;
  return FORMATS[f]?.extensions[0] ?? 'bin';
}

function sniffImageMime(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

// 防止未使用导入告警
