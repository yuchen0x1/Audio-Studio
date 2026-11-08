/**
 * FFmpeg 参数向量构建器 —— Web(wasm) 与 Desktop(原生进程) 共用的唯一构造逻辑。
 *
 * 安全约定：
 * - 永远返回 string[]，由引擎以参数数组方式传递（不经过 shell，天然免疫命令注入）。
 * - 所有来自用户输入的路径/文件名在进入这里之前已通过 validation.ts 清洗。
 * - 过滤器数值全部经过 Number() 归一化，杜绝过滤器语法注入。
 */
import { BitDepth, FormatDef, FormatId, FORMATS } from './formats';
import { EncodeParams } from './params';
import { AudioJob, ConvertJob, MergeJob, TrimJob } from './engine';
import { assertSafeArg } from './validation';

export interface BuildContext {
  /** 源时长（毫秒）；fadeOut / trim 必需 */
  durationMs?: number;
  /** 归一化测量结果（两遍法），未提供时若启用归一化会抛错 */
  measure?: MeasureResult;
  /** 合并时解析出的目标采样率/声道（params 为 0=keep 时由引擎用探测值填充） */
  resolvedSampleRate?: number;
  resolvedChannels?: number;
  /** 源元数据（合并时用于保留第一个文件的标签，可选） */
  preserveMetadata?: boolean;
}

export interface MeasureResult {
  /** loudnorm 测量值 */
  inputI?: number;
  inputTP?: number;
  inputLRA?: number;
  inputThresh?: number;
  /** volumedetect 测量值（峰值 dB） */
  maxVolumeDb?: number;
}

const ffmpegBase = (): string[] => ['-hide_banner', '-nostdin', '-y'];

function sec(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`无效数值参数: ${String(v)}`);
  return n;
}

/** 根据格式 + 位深度选择具体 PCM 编码器 */
export function selectEncoder(format: FormatId, params: EncodeParams): { encoder: string; explicit: boolean } {
  const f: FormatDef = FORMATS[format];
  if (params.encoder) return { encoder: params.encoder, explicit: true };
  const byDepth: Partial<Record<FormatId, Record<string, string>>> = {
    wav: { '16': 'pcm_s16le', '24': 'pcm_s24le', '32': 'pcm_s32le', 'f32': 'pcm_f32le' },
    aiff: { '16': 'pcm_s16be', '24': 'pcm_s24be', '32': 'pcm_s32be' },
  };
  const depthMap = byDepth[format];
  if (depthMap && params.bitDepth !== undefined) {
    const enc = depthMap[String(params.bitDepth)];
    if (enc) return { encoder: enc, explicit: false };
  }
  return { encoder: f.encoderCandidates[0], explicit: false };
}

/** 音频滤镜链：增益 / 归一化 / 淡入淡出（数值均经归一化） */
export function buildAudioFilters(params: EncodeParams, ctx: BuildContext): string[] {
  const filters: string[] = [];

  if (params.normalize?.enabled) {
    if (params.normalize.mode === 'peak') {
      if (ctx.measure?.maxVolumeDb === undefined) {
        throw new Error('归一化缺少峰值测量结果');
      }
      const target = num(params.normalize.target);
      const gain = target - ctx.measure.maxVolumeDb; // 目标 - 实测
      const clamped = Math.max(-60, Math.min(30, gain));
      filters.push(`volume=${clamped.toFixed(2)}dB`);
    } else {
      const m = ctx.measure;
      if (m?.inputI === undefined || m.inputTP === undefined || m.inputLRA === undefined || m.inputThresh === undefined) {
        throw new Error('归一化缺少 LUFS 测量结果');
      }
      const target = num(params.normalize.target);
      filters.push(
        `loudnorm=I=${target.toFixed(1)}:TP=-1.5:LRA=11` +
        `:measured_I=${num(m.inputI).toFixed(2)}` +
        `:measured_TP=${num(m.inputTP).toFixed(2)}` +
        `:measured_LRA=${num(m.inputLRA).toFixed(2)}` +
        `:measured_thresh=${num(m.inputThresh).toFixed(2)}` +
        `:linear=true`,
      );
    }
  }

  const gainDb = num(params.gainDb ?? 0);
  if (gainDb !== 0 && !filters.some((f) => f.startsWith('volume='))) {
    filters.push(`volume=${gainDb.toFixed(2)}dB`);
  }

  const fadeIn = num(params.fadeInMs ?? 0);
  const fadeOut = num(params.fadeOutMs ?? 0);
  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${(fadeIn / 1000).toFixed(3)}`);
  }
  if (fadeOut > 0) {
    const dur = ctx.durationMs;
    if (!dur || dur <= 0) throw new Error('淡出需要源时长信息（缺少 durationMs）');
    const start = Math.max(0, (dur - fadeOut) / 1000);
    filters.push(`afade=t=out:st=${start.toFixed(3)}:d=${(fadeOut / 1000).toFixed(3)}`);
  }
  return filters;
}

/** 输出编码参数 */
export function buildCodecArgs(params: EncodeParams, f: FormatDef): string[] {
  const { encoder } = selectEncoder(params.format, params);
  const args = ['-c:a', encoder];

  if (f.supportsBitrate) {
    if (params.useVbr && f.supportsVbrQuality && params.vbrQuality !== undefined) {
      args.push('-q:a', String(num(params.vbrQuality)));
    } else if (params.bitrateKbps !== undefined) {
      args.push('-b:a', `${num(params.bitrateKbps)}k`);
    }
  }
  if (f.supportsBitDepth && params.bitDepth !== undefined) {
    if (params.format === 'flac') {
      if (params.bitDepth === 16) args.push('-sample_fmt', 's16');
      else args.push('-sample_fmt', 's32', '-bits_per_raw_sample', String(params.bitDepth));
    } else if (params.format === 'alac') {
      if (params.bitDepth === 16) args.push('-sample_fmt', 's16p');
      else args.push('-sample_fmt', 's32p');
    }
    // wav/aiff 的位深度由所选 pcm 编码器决定，无需额外参数
  }
  if (f.compressionLevels?.length && params.compressionLevelId) {
    const level = f.compressionLevels.find((c) => c.id === params.compressionLevelId);
    if (level) {
      if (params.format === 'flac') args.push('-compression_level', String(num(level.value)));
      else if (params.format === 'ape') args.push('-compression_a', String(num(level.value)));
    }
  }
  if (params.format === 'm4a' || params.format === 'alac') {
    args.push('-movflags', '+faststart');
  }
  return args;
}

function outputTail(params: EncodeParams, f: FormatDef, ctx: BuildContext, filters: string[]): string[] {
  const args: string[] = [];
  if (filters.length) args.push('-af', filters.join(','));
  if (params.sampleRate !== 0) args.push('-ar', String(num(params.sampleRate)));
  else if (ctx.resolvedSampleRate) args.push('-ar', String(num(ctx.resolvedSampleRate)));
  if (params.channels !== 0) args.push('-ac', String(num(params.channels)));
  else if (ctx.resolvedChannels) args.push('-ac', String(num(ctx.resolvedChannels)));
  args.push(...buildCodecArgs(params, f));
  args.push('-f', f.muxer);
  return args;
}

/** 转换作业 → FFmpeg 参数向量 */
export function buildConvertArgs(job: ConvertJob, ctx: BuildContext = {}): string[] {
  const f = FORMATS[job.params.format];
  if (!f) throw new Error(`未知目标格式: ${job.params.format}`);
  const input = job.source.path ?? job.source.name;
  assertSafeArg(input, 0, 'path');
  const out = `${job.outputDir}/${job.outputFileName}`;
  assertSafeArg(out, 1, 'path');

  const filters = buildAudioFilters(job.params, ctx);
  return [
    ...ffmpegBase(),
    '-i', input,
    '-map', '0:a:0', '-vn',
    ...outputTail(job.params, f, ctx, filters),
    out,
  ];
}

/** 裁剪作业 → FFmpeg 参数向量（输出侧 -ss/-t，采样级精确） */
export function buildTrimArgs(job: TrimJob, ctx: BuildContext = {}): string[] {
  const f = FORMATS[job.params.format];
  if (!f) throw new Error(`未知目标格式: ${job.params.format}`);
  const input = job.source.path ?? job.source.name;
  assertSafeArg(input, 0, 'path');
  const out = `${job.outputDir}/${job.outputFileName}`;
  assertSafeArg(out, 1, 'path');

  const startMs = Math.max(0, num(job.startMs));
  const endMs = num(job.endMs);
  if (endMs <= startMs) throw new Error('裁剪区间无效：结束时间必须大于开始时间');
  const durationMs = endMs - startMs;

  // 淡入淡出以裁剪后的区间为基准（ctx.durationMs 传区间长度）
  const trimCtx: BuildContext = { ...ctx, durationMs };
  const filters = buildAudioFilters(job.params, trimCtx);

  return [
    ...ffmpegBase(),
    '-i', input,
    '-ss', sec(startMs),
    '-t', sec(durationMs),
    '-map', '0:a:0', '-vn',
    ...outputTail(job.params, f, ctx, filters),
    out,
  ];
}

/** 合并作业 → FFmpeg 参数向量（concat 滤镜 + 间隔静音 + 每段增益/淡化） */
export function buildMergeArgs(job: MergeJob, ctx: BuildContext = {}): string[] {
  const f = FORMATS[job.params.format];
  if (!f) throw new Error(`未知目标格式: ${job.params.format}`);
  if (job.items.length === 0) throw new Error('合并至少需要一个输入');

  const rate = num(ctx.resolvedSampleRate ?? job.params.sampleRate ?? 0) || 44100;
  const ch = num(ctx.resolvedChannels ?? job.params.channels ?? 0) || 2;
  const layout = ch === 1 ? 'mono' : ch >= 6 ? '5.1' : 'stereo';

  const args = ffmpegBase();
  for (const item of job.items) {
    const p = item.source.path ?? item.source.name;
    assertSafeArg(p, args.length, 'path');
    args.push('-i', p);
  }
  const gapSec = Math.max(0, num(job.gapMs)) / 1000;
  const gapInputs: number[] = [];
  if (gapSec > 0 && job.items.length > 1) {
    for (let i = 1; i < job.items.length; i++) {
      gapInputs.push(args.length / 2); // 不精确但仅用于调试；真实索引 = 之后 push 的顺序
      args.push('-f', 'lavfi', '-t', gapSec.toFixed(3), '-i', `anullsrc=r=${rate}:cl=${layout}`);
    }
  }

  // 构建 filter_complex
  const parts: string[] = [];
  const labels: string[] = [];
  job.items.forEach((item, i) => {
    const chain: string[] = [
      `aformat=sample_rates=${rate}:channel_layouts=${layout}`,
    ];
    const g = num(item.gainDb ?? 0);
    if (g !== 0) chain.push(`volume=${g.toFixed(2)}dB`);
    if (num(item.fadeInMs ?? 0) > 0) {
      chain.push(`afade=t=in:st=0:d=${(num(item.fadeInMs) / 1000).toFixed(3)}`);
    }
    const fi = num(item.fadeOutMs ?? 0);
    if (fi > 0) {
      // 该片段自身时长未知时，用淡出时长前的边界：引擎在 ctx 提供片段时长数组
      const segDur = ctx.durationMs && job.items.length === 1 ? ctx.durationMs : undefined;
      const st = segDur ? Math.max(0, (segDur - fi) / 1000) : 0;
      chain.push(`afade=t=out:st=${st.toFixed(3)}:d=${(fi / 1000).toFixed(3)}`);
    }
    const label = `a${i}`;
    parts.push(`[${i}:a]${chain.join(',')}[${label}]`);
    labels.push(`[${label}]`);
    void item;
  });

  // 间隙静音片段
  if (gapSec > 0 && job.items.length > 1) {
    job.items.slice(1).forEach((_, i) => {
      const idx = job.items.length + i;
      const label = `g${i}`;
      parts.push(`[${idx}:a]aformat=sample_rates=${rate}:channel_layouts=${layout}[${label}]`);
      labels.push(`[${label}]`);
    });
  }

  let finalLabel: string;
  if (labels.length === 1) {
    finalLabel = labels[0].slice(1, -1); // [a0] → a0
  } else {
    // concat 的输入标签必须直接前置在 concat 滤镜之前
    parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[cout]`);
    finalLabel = 'cout';
  }

  const filters = buildAudioFilters(job.params, ctx);
  if (filters.length) {
    parts.push(`[${finalLabel}]${filters.join(',')}[cout2]`);
    finalLabel = 'cout2';
  }

  args.push('-filter_complex', parts.join(';'), '-map', `[${finalLabel}]`, '-vn');
  // codec/muxer（合并时 -af 不能与 -filter_complex 并用，故单独处理）
  const codecArgs: string[] = [];
  const dummyFilters: string[] = [];
  codecArgs.push(...outputTailNoAf(job.params, f, ctx, dummyFilters));
  args.push(...codecArgs);
  const out = `${job.outputDir}/${job.outputFileName}`;
  assertSafeArg(out, args.length, 'path');
  args.push(out);
  return args;
}

function outputTailNoAf(params: EncodeParams, f: FormatDef, ctx: BuildContext, filters: string[]): string[] {
  void filters;
  const args: string[] = [];
  if (params.sampleRate !== 0) args.push('-ar', String(num(params.sampleRate)));
  else if (ctx.resolvedSampleRate) args.push('-ar', String(num(ctx.resolvedSampleRate)));
  if (params.channels !== 0) args.push('-ac', String(num(params.channels)));
  else if (ctx.resolvedChannels) args.push('-ac', String(num(ctx.resolvedChannels)));
  args.push(...buildCodecArgs(params, f));
  args.push('-f', f.muxer);
  return args;
}

/**
 * 归一化测量作业：-af volumedetect（峰值）或 loudnorm print_format=json（LUFS），
 * 输出到 null muxer，仅用于测量。裁剪作业会把测量限定在选区内。
 */
export function buildMeasureArgs(job: AudioJob, mode: 'peak' | 'lufs', ctx: BuildContext = {}): string[] {
  const source = job.kind === 'merge' ? job.items[0].source : job.source;
  const input = source.path ?? source.name;
  assertSafeArg(input, 0, 'path');
  const filters = mode === 'peak'
    ? 'volumedetect'
    : 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json';
  const seek: string[] = [];
  if (job.kind === 'trim') {
    const dur = Math.max(0, job.endMs - job.startMs);
    seek.push('-ss', sec(job.startMs), '-t', sec(dur));
  }
  void ctx;
  return [...ffmpegBase(), ...seek, '-i', input, '-map', '0:a:0', '-vn', '-af', filters, '-f', 'null', '-'];
}

/** 解析 volumedetect 输出 */
export function parseVolumedetect(stderr: string): number | undefined {
  const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
  return m ? parseFloat(m[1]) : undefined;
}

/** 解析 loudnorm JSON（取最后一次测量结果；对不规范输出做字段级容错） */
export function parseLoudnormJson(stderr: string): MeasureResult | undefined {
  const matches = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  const candidates = matches?.length ? [stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g)!.slice(-1)[0]] : [];
  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>;
      return {
        inputI: parseFloat(obj.input_i),
        inputTP: parseFloat(obj.input_tp),
        inputLRA: parseFloat(obj.input_lra),
        inputThresh: parseFloat(obj.input_thresh),
      };
    } catch {
      // 字段级提取兜底
      const pick = (k: string): number | undefined => {
        const m = new RegExp(`"${k}"\\s*:\\s*"(-?\\d+(?:\\.\\d+)?)"`).exec(raw);
        return m ? parseFloat(m[1]) : undefined;
      };
      const inputI = pick('input_i');
      if (inputI !== undefined) {
        return {
          inputI,
          inputTP: pick('input_tp'),
          inputLRA: pick('input_lra'),
          inputThresh: pick('input_thresh'),
        };
      }
    }
  }
  return undefined;
}

/** 从 -progress 输出解析 out_time_ms（微秒级字段，实际为微秒） */
export function parseProgressLine(line: string): { key: string; value: string } | null {
  const m = /^([a-z_]+)=(.+)$/.exec(line.trim());
  return m ? { key: m[1], value: m[2] } : null;
}
