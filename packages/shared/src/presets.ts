/** 用途预设只生成真实编码参数，不隐藏后续编辑，也不启用音量处理。 */
import { deriveParams, type EncodeParams } from './params';

export const ENCODE_PRESETS = [
  {
    id: 'music',
    format: 'mp3',
    label: { zh: '音乐分享', en: 'Music sharing' },
    detail: { zh: 'MP3 · 256 kbps · 立体声', en: 'MP3 · 256 kbps · stereo' },
  },
  {
    id: 'voice',
    format: 'opus',
    label: { zh: '语音小文件', en: 'Compact voice' },
    detail: { zh: 'Opus · 64 kbps · 单声道', en: 'Opus · 64 kbps · mono' },
  },
  {
    id: 'archive',
    format: 'flac',
    label: { zh: '无损存档', en: 'Lossless archive' },
    detail: { zh: 'FLAC · 保留支持的采样率与位深', en: 'FLAC · keep supported rate and depth' },
  },
] as const;

export type EncodePresetId = (typeof ENCODE_PRESETS)[number]['id'];

export function paramsForPreset(
  id: EncodePresetId,
  current: EncodeParams,
  sourceInfo?: { sampleRate?: number; channels?: number; bitDepth?: number | 'f32' },
): EncodeParams {
  const preset = ENCODE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown encoding preset: ${String(id)}`);
  const params = deriveParams(null, preset.format, sourceInfo);
  params.filenameTemplate = current.filenameTemplate;
  if (id === 'music') Object.assign(params, { bitrateKbps: 256, channels: 2 });
  if (id === 'voice') Object.assign(params, { bitrateKbps: 64, channels: 1, sampleRate: 48000 });
  // 未知位深时选 24-bit，避免将常见的 24-bit 源默默降为 16-bit。
  if (
    id === 'archive' &&
    (!sourceInfo?.bitDepth || sourceInfo.bitDepth === 'f32' || sourceInfo.bitDepth > 24)
  )
    params.bitDepth = 24;
  return params;
}
