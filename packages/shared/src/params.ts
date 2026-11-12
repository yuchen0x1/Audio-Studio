/**
 * 统一编码参数模型：三平台共享同一套参数语义，
 * 引擎层负责把参数翻译成各自后端的调用（FFmpeg 参数向量 / MediaCodec 配置）。
 */
import { BitDepth, FormatDef, FormatId, FORMATS, getFormat } from './formats';

export type SampleRateOption = number; // 0 = 保持源采样率
export type ChannelOption = number; // 0 = 保持源声道

export interface NormalizeConfig {
  enabled: boolean;
  mode: 'peak' | 'lufs';
  /** peak: dBFS 上限（通常 -0.1 ~ -1.0）；lufs: 目标响度（流媒体 -14，播客 -16，广播 -23） */
  target: number;
}

export interface EncodeParams {
  format: FormatId;
  /** CBR 比特率 kbps（supportsBitrate 时生效）；与 vbrQuality 互斥 */
  bitrateKbps?: number;
  /** VBR 质量（各格式取值范围见 FormatDef.vbrQualityRange） */
  vbrQuality?: number;
  useVbr?: boolean;
  /** 0 = 保持源采样率 */
  sampleRate: SampleRateOption;
  /** 0 = 保持源声道数 */
  channels: ChannelOption;
  bitDepth?: BitDepth;
  /** 编码器覆盖（一般留空，引擎自动选首个可用候选） */
  encoder?: string;
  /** 压缩等级（flac/ape 等） */
  compressionLevelId?: string;
  /** 音量增益 dB，0 = 不调整（范围 -60 ~ +20） */
  gainDb: number;
  normalize: NormalizeConfig;
  fadeInMs: number;
  fadeOutMs: number;
  /** 输出文件名模板，见 naming.ts */
  filenameTemplate: string;
}

export interface ParamOptionAvailability {
  bitrate: boolean;
  vbr: boolean;
  sampleRate: boolean;
  channels: boolean;
  bitDepth: boolean;
  compression: boolean;
}

/** 根据目标格式计算哪些参数可用 —— 不适用的参数必须禁用/隐藏 */
export function paramAvailability(format: FormatId): ParamOptionAvailability {
  const f = getFormat(format);
  if (!f) {
    return {
      bitrate: false,
      vbr: false,
      sampleRate: false,
      channels: false,
      bitDepth: false,
      compression: false,
    };
  }
  return {
    bitrate: f.supportsBitrate,
    vbr: f.supportsVbrQuality,
    sampleRate: f.sampleRates.length > 0,
    channels: f.channels.length > 0,
    bitDepth: f.supportsBitDepth,
    compression: !!f.compressionLevels?.length,
  };
}

export const DEFAULT_FILENAME_TEMPLATE = '{name}_{format}';

/** 生成目标格式的默认参数：尽可能保持源参数，只做必要约束 */
export function defaultParamsFor(format: FormatId, source?: Partial<EncodeParams>): EncodeParams {
  const f: FormatDef = FORMATS[format];
  const base: EncodeParams = {
    format,
    sampleRate: 0,
    channels: 0,
    gainDb: 0,
    normalize: { enabled: false, mode: 'lufs', target: -14 },
    fadeInMs: 0,
    fadeOutMs: 0,
    filenameTemplate: source?.filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE,
  };
  if (f.supportsBitrate) {
    base.bitrateKbps = f.defaultBitrateKbps;
    base.useVbr = false;
  }
  if (f.supportsVbrQuality && f.vbrQualityRange) {
    // 默认使用 CBR（更可预期），用户可手动切 VBR
    base.vbrQuality = undefined;
  }
  if (f.supportsBitDepth && f.bitDepths?.length) {
    base.bitDepth = f.bitDepths[0];
  }
  if (f.compressionLevels?.length) {
    base.compressionLevelId = f.defaultCompressionLevelId ?? f.compressionLevels[0].id;
  }
  return base;
}

/** 输入格式 → 输出格式的推荐默认参数（如 44.1k 源 → MP3 保持 44.1k） */
export function deriveParams(
  sourceFormat: FormatId | null,
  targetFormat: FormatId,
  sourceInfo?: { sampleRate?: number; channels?: number; bitDepth?: number | 'f32' },
): EncodeParams {
  const p = defaultParamsFor(targetFormat);
  const f = FORMATS[targetFormat];
  if (sourceInfo?.sampleRate && f.sampleRates.includes(sourceInfo.sampleRate)) {
    p.sampleRate = 0; // 保持
  } else if (sourceInfo?.sampleRate) {
    // 源采样率目标不支持 → 选择最接近的
    p.sampleRate = closestNumber(f.sampleRates, sourceInfo.sampleRate);
  }
  if (sourceInfo?.channels && f.channels.includes(sourceInfo.channels)) {
    p.channels = 0; // 保持
  } else if (sourceInfo?.channels) {
    p.channels = closestNumber(f.channels, sourceInfo.channels);
  }
  if (f.supportsBitDepth && sourceInfo?.bitDepth && f.bitDepths?.length) {
    const bd = f.bitDepths.includes(sourceInfo.bitDepth as BitDepth)
      ? (sourceInfo.bitDepth as BitDepth)
      : f.bitDepths.includes(16)
        ? 16
        : f.bitDepths[0];
    p.bitDepth = bd;
  }
  void sourceFormat;
  return p;
}

export function closestNumber(list: number[], target: number): number {
  let best = list[0];
  let bestDiff = Math.abs(target - best);
  for (const n of list) {
    const d = Math.abs(target - n);
    if (d < bestDiff) {
      best = n;
      bestDiff = d;
    }
  }
  return best;
}

/** 参数合法性校验（引擎入口处强制执行，防止非法值进入引擎） */
export function validateParams(params: EncodeParams): string[] {
  const errors: string[] = [];
  const f = getFormat(params.format);
  if (!f) {
    errors.push(`不支持的目标格式: ${params.format}`);
    return errors;
  }
  if (f.supportsBitrate) {
    if (params.bitrateKbps !== undefined) {
      const opts = f.bitrateOptionsKbps ?? [];
      if (opts.length && !opts.includes(params.bitrateKbps)) {
        errors.push(`比特率 ${params.bitrateKbps}kbps 不在 ${f.label} 支持范围内`);
      }
    }
  }
  if (params.sampleRate !== 0 && !f.sampleRates.includes(params.sampleRate)) {
    errors.push(`采样率 ${params.sampleRate}Hz 不受 ${f.label} 支持`);
  }
  if (params.channels !== 0 && !f.channels.includes(params.channels)) {
    errors.push(`声道数 ${params.channels} 不受 ${f.label} 支持`);
  }
  if (f.supportsBitDepth && params.bitDepth !== undefined) {
    if (f.bitDepths && !(f.bitDepths as (string | number)[]).includes(params.bitDepth)) {
      errors.push(`位深度 ${params.bitDepth} 不受 ${f.label} 支持`);
    }
  }
  if (params.gainDb < -60 || params.gainDb > 20) {
    errors.push('音量增益需在 -60 ~ +20 dB 之间');
  }
  if (params.normalize.enabled) {
    if (
      params.normalize.mode === 'peak' &&
      (params.normalize.target > 0 || params.normalize.target < -24)
    ) {
      errors.push('峰值归一化目标需在 -24 ~ 0 dBFS 之间');
    }
    if (
      params.normalize.mode === 'lufs' &&
      (params.normalize.target > -5 || params.normalize.target < -36)
    ) {
      errors.push('LUFS 目标需在 -36 ~ -5 之间');
    }
  }
  if (params.fadeInMs < 0 || params.fadeOutMs < 0) {
    errors.push('淡入淡出时长不能为负数');
  }
  if (params.bitrateKbps !== undefined && params.bitrateKbps <= 0) {
    errors.push('比特率必须大于 0');
  }
  return errors;
}
