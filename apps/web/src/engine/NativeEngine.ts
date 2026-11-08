/**
 * Windows 桌面（Tauri）引擎适配：实现共享 AudioEngine 契约。
 * 参数向量仍由共享 TS 层构建，Rust 侧只负责校验、spawn、进度解析与事件。
 */
import type {
  AudioEngine, AudioSource, AudioJob, EngineCapabilities, EngineInfo,
  JobResult, ProbeResult, ResourceEstimate, TaskCallbacks, ConvertJob, TrimJob, MergeJob,
} from '@audio-studio/shared';
import {
  makeEngineError, buildConvertArgs, buildTrimArgs, buildMergeArgs, expandJob,
  classifyEngineOutput,
} from '@audio-studio/shared';

async function tauri() {
  const core = await import('@tauri-apps/api/core');
  const event = await import('@tauri-apps/api/event');
  return {
    invoke: core.invoke as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
    listen: event.listen as <T>(ev: string, h: (e: { payload: T }) => void) => Promise<() => void>,
  };
}

export class NativeEngine implements AudioEngine {
  readonly info: EngineInfo = { kind: 'native', name: 'FFmpeg (native)', version: '', location: '' };
  private caps: EngineCapabilities | null = null;
  private probeCache = new Map<string, ProbeResult>();
  private unlisteners: Array<() => void> = [];
  private ready = false;
  private cancelled = new Set<string>();

  async init(): Promise<EngineCapabilities> {
    if (this.caps) return this.caps;
    const { invoke, listen } = await tauri();
    try {
      const eng = await invoke<EngineInfo>('engine_info');
      this.info.version = eng.version;
      this.info.location = eng.location;
      const caps = await invoke<EngineCapabilities>('engine_capabilities');
      caps.engine = { ...eng, kind: 'native' };
      this.caps = caps;
      this.ready = true;
      void listen; // 事件订阅在 run() 内按任务订阅，避免全局句柄泄漏
      return caps;
    } catch (e) {
      throw makeEngineError('E_ENGINE_INIT', e instanceof Error ? e.message : String(e));
    }
  }

  capabilities(): EngineCapabilities {
    if (!this.caps) throw makeEngineError('E_ENGINE_INIT', '引擎尚未初始化');
    return this.caps;
  }

  async probe(source: AudioSource): Promise<ProbeResult> {
    const key = source.path ?? source.id;
    const cached = this.probeCache.get(key);
    if (cached) return cached;
    if (!source.path) throw makeEngineError('E_SOURCE_MISSING');
    const { invoke } = await tauri();
    try {
      const result = await invoke<ProbeResult>('probe', { path: source.path });
      if (result.fileSizeBytes > 0) source.sizeBytes = result.fileSizeBytes;
      this.probeCache.set(key, result);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = /E_[A-Z_]+/.exec(msg)?.[0];
      if (code) throw makeEngineError(code as never, msg);
      // Rust 侧可能返回错误分类文本
      const classified = classifyEngineOutput(msg);
      throw makeEngineError(classified, msg);
    }
  }

  async run(job: AudioJob, callbacks?: TaskCallbacks): Promise<JobResult> {
    if (!this.caps) await this.init();
    const { invoke, listen } = await tauri();

    // 多片段作业顺序执行（与 Web 引擎一致的语义）
    const jobs = expandJob(job);
    if (jobs.length > 1) {
      let last: JobResult | null = null;
      const all: JobResult[] = [];
      for (let i = 0; i < jobs.length; i++) {
        const wrapped: TaskCallbacks = {
          onProgress: (p) => callbacks?.onProgress?.({
            ...p,
            ratio: (i + p.ratio) / jobs.length,
          }),
          onLog: callbacks?.onLog,
        };
        last = await this.runSingle(jobs[i], wrapped);
        all.push(last);
      }
      if (last) (last as JobResult & { allSegments?: JobResult[] }).allSegments = all;
      return last!;
    }
    return this.runSingle(jobs[0], callbacks);
  }

  private async runSingle(job: AudioJob, callbacks?: TaskCallbacks): Promise<JobResult> {
    const { invoke, listen } = await tauri();
    if (this.cancelled.has(job.taskId)) {
      this.cancelled.delete(job.taskId);
      throw makeEngineError('E_CANCELLED');
    }
    const args = buildArgsForJob(job);
    const outputPath = job.outputDir ? `${job.outputDir}/${job.outputFileName}` : job.outputFileName;
    const totalMs = await this.totalDurationOf(job);
    const t0 = performance.now();

    const unsubs: Array<() => void> = [];
    try {
      const result = await new Promise<JobResult>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        void listen<{ taskId: string; timeUs: number }>('task://progress', (e) => {
          if (e.payload.taskId !== job.taskId) return;
          const processedMs = Math.max(0, Math.round(e.payload.timeUs / 1000));
          const ratio = totalMs > 0 ? Math.min(1, processedMs / totalMs) : 0;
          callbacks?.onProgress?.({ ratio, processedMs, totalMs });
        }).then((un) => unsubs.push(un));

        void listen<{ taskId: string; code: string; message: string }>('task://error', (e) => {
          if (e.payload.taskId !== job.taskId) return;
          finish(() => {
            const code = /^E_[A-Z_]+$/.test(e.payload.code) ? (e.payload.code as never) : classifyEngineOutput(e.payload.message);
            reject(makeEngineError(code, e.payload.message));
          });
        }).then((un) => unsubs.push(un));

        void listen<{ taskId: string; outputPath?: string; sizeBytes: number; elapsedMs: number }>('task://done', (e) => {
          if (e.payload.taskId !== job.taskId) return;
          // 冲突重命名时 Rust 侧返回真实落盘路径（如 "mix (1).mp3"），以它为准
          const realPath = e.payload.outputPath || outputPath;
          const realName = realPath.split(/[\\/]/).pop() || job.outputFileName;
          finish(() => resolve({
            outputPath: realPath,
            fileName: realName,
            sizeBytes: e.payload.sizeBytes,
            elapsedMs: e.payload.elapsedMs || Math.round(performance.now() - t0),
          }));
        }).then((un) => unsubs.push(un));

        invoke('start_task', { taskId: job.taskId, args, outputPath })
          .then(() => {
            // 覆盖“取消发生在 start_task 注册之前”的窗口期
            if (this.cancelled.has(job.taskId)) {
              this.cancelled.delete(job.taskId);
              void invoke('cancel_task', { taskId: job.taskId }).catch(() => undefined);
            }
          })
          .catch((err) => finish(() => {
            const msg = err instanceof Error ? err.message : String(err);
            reject(makeEngineError(classifyEngineOutput(msg), msg));
          }));
      });

      // 真实校验输出
      if (result.sizeBytes > 0) {
        try {
          result.outputProbe = await this.probe({
            id: `out_${job.taskId}`,
            name: job.outputFileName,
            sizeBytes: result.sizeBytes,
            path: outputPath,
          });
        } catch { /* 校验失败不阻断交付 */ }
      }
      return result;
    } finally {
      for (const u of unsubs) {
        try { u(); } catch { /* ignore */ }
      }
    }
  }

  private async totalDurationOf(job: AudioJob): Promise<number> {
    try {
      if (job.kind === 'trim') return Math.max(0, job.endMs - job.startMs);
      if (job.kind === 'convert') {
        const p = await this.probe(job.source);
        return p.durationMs ?? 0;
      }
      let sum = 0;
      for (const item of job.items) {
        const p = await this.probe(item.source);
        sum += p.durationMs ?? 0;
      }
      return sum + Math.max(0, job.items.length - 1) * Math.max(0, job.gapMs);
    } catch {
      return 0;
    }
  }

  async cancel(taskId: string): Promise<void> {
    this.cancelled.add(taskId);
    const { invoke } = await tauri();
    try {
      await invoke('cancel_task', { taskId });
    } catch (e) {
      // 任务尚未注册时保留标记，start_task 返回后会补发取消
      console.warn('[native] cancel deferred/failed', e);
    }
  }

  estimate(source: AudioSource): ResourceEstimate {
    const warnings: string[] = [];
    if (source.sizeBytes > 4 * 1024 * 1024 * 1024) {
      warnings.push('文件超过 4GB，请确认磁盘空间充足');
    }
    return { inputBytes: source.sizeBytes, estimatedPeakBytes: source.sizeBytes * 2, warnings };
  }

  async dispose(): Promise<void> {
    for (const u of this.unlisteners) {
      try { u(); } catch { /* ignore */ }
    }
    this.unlisteners = [];
    this.probeCache.clear();
    this.ready = false;
    this.caps = null;
  }
}

function buildArgsForJob(job: AudioJob): string[] {
  if (job.kind === 'convert') {
    const c = job as ConvertJob;
    return buildConvertArgs(c, {});
  }
  if (job.kind === 'trim') {
    const t = job as TrimJob;
    return buildTrimArgs(t, { durationMs: Math.max(0, t.endMs - t.startMs) });
  }
  const m = job as MergeJob;
  return buildMergeArgs(m, {
    resolvedSampleRate: m.params.sampleRate || undefined,
    resolvedChannels: m.params.channels || undefined,
  });
}

/** 测试辅助：当前是否已就绪 */
export function nativeReady(engine: NativeEngine): boolean {
  return engine.capabilities !== undefined && (engine as unknown as { ready: boolean }).ready === true;
}
