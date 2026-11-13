/**
 * 统一音频格式注册系统（Web 与 Windows 两端共享的唯一事实来源）。
 *
 * 规则：
 * - 界面只能展示 registry 中声明、且运行时能力检测通过的格式。
 * - encoderCandidates 为按优先级排列的 FFmpeg 编码器候选，
 *   引擎运行时探测（ffmpeg -encoders）后取第一个可用项。
 * - 任何"界面显示支持但实际无法转换"的情况都视为 bug。
 */

export type FormatId =
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'aac'
  | 'm4a'
  | 'ogg'
  | 'opus'
  | 'wma'
  | 'aiff'
  | 'ape'
  | 'ac3'
  | 'amr'
  | 'alac';

export type BitDepth = 16 | 24 | 32 | 'f32';

/** 标签体系：决定元数据编辑页展示哪些字段 */
export type TagSystem = 'id3' | 'vorbis' | 'mp4' | 'asf' | 'apev2' | 'none';

export interface CompressionLevel {
  id: string;
  label: string;
  /** 直接传给 ffmpeg 的参数值 */
  value: number;
}

export interface FormatDef {
  id: FormatId;
  label: string;
  /** 主扩展名在前，其余为别名 */
  extensions: string[];
  mimeTypes: string[];
  /** 有损 / 无损 / 有损压缩无损（APE/ALAC 属于压缩无损） */
  kind: 'lossy' | 'lossless' | 'compressive-lossless';
  lossless: boolean;
  /** FFmpeg 编码器候选，按优先级排列 */
  encoderCandidates: string[];
  /** 显式 muxer（-f 参数）；空字符串表示交给 ffmpeg 按扩展名推断 */
  muxer: string;
  /** 解复用器名（能力检测用） */
  demuxer: string;
  supportsBitrate: boolean;
  supportsBitDepth: boolean;
  supportsVbrQuality: boolean;
  /** -q:a 的取值范围（含） */
  vbrQualityRange?: [number, number];
  /** 质量档位说明（VBR 时展示） */
  vbrQualityLabels?: Record<number, string>;
  bitDepths?: BitDepth[];
  sampleRates: number[];
  channels: number[];
  defaultBitrateKbps?: number;
  bitrateOptionsKbps?: number[];
  compressionLevels?: CompressionLevel[];
  defaultCompressionLevelId?: string;
  tagSystem: TagSystem;
  /** 是否支持内嵌专辑封面 */
  coverArt: boolean;
  /** 展示用备注（如格式限制） */
  note?: string;
}

const STD_RATES_LOW: number[] = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
const STD_RATES_WIDE: number[] = [
  8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400, 192000,
];
const CH_STEREO: number[] = [1, 2];

export const FORMATS: Record<FormatId, FormatDef> = {
  mp3: {
    id: 'mp3',
    label: 'MP3',
    extensions: ['mp3'],
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['libmp3lame'],
    muxer: 'mp3',
    demuxer: 'mp3',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: true,
    vbrQualityRange: [0, 9],
    vbrQualityLabels: {
      0: 'VBR 最高 (~245k)',
      2: 'VBR 极高 (~190k)',
      4: 'VBR 高 (~165k)',
      5: 'VBR 中高 (~130k)',
      6: 'VBR 中 (~115k)',
      9: 'VBR 最低 (~65k)',
    },
    sampleRates: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000],
    channels: CH_STEREO,
    defaultBitrateKbps: 192,
    bitrateOptionsKbps: [96, 112, 128, 160, 192, 224, 256, 320],
    tagSystem: 'id3',
    coverArt: true,
    note: '通用格式，兼容性最佳',
  },
  wav: {
    id: 'wav',
    label: 'WAV',
    extensions: ['wav'],
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
    kind: 'lossless',
    lossless: true,
    encoderCandidates: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le'],
    muxer: 'wav',
    demuxer: 'wav',
    supportsBitrate: false,
    supportsBitDepth: true,
    supportsVbrQuality: false,
    bitDepths: [16, 24, 32, 'f32'],
    sampleRates: STD_RATES_WIDE,
    channels: CH_STEREO,
    tagSystem: 'none',
    coverArt: false,
    note: '未压缩，体积大但兼容性最好',
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    extensions: ['flac'],
    mimeTypes: ['audio/flac', 'audio/x-flac'],
    kind: 'lossless',
    lossless: true,
    encoderCandidates: ['flac'],
    muxer: 'flac',
    demuxer: 'flac',
    supportsBitrate: false,
    supportsBitDepth: true,
    supportsVbrQuality: false,
    bitDepths: [16, 24],
    sampleRates: STD_RATES_WIDE,
    channels: CH_STEREO,
    compressionLevels: [
      { id: 'fast', label: '快 (0)', value: 0 },
      { id: 'default', label: '默认 (5)', value: 5 },
      { id: 'high', label: '高压缩 (8)', value: 8 },
    ],
    defaultCompressionLevelId: 'default',
    tagSystem: 'vorbis',
    coverArt: true,
    note: '无损压缩，音质等同 WAV，体积约 60%',
  },
  aac: {
    id: 'aac',
    label: 'AAC (.aac)',
    extensions: ['aac'],
    mimeTypes: ['audio/aac', 'audio/aacp', 'audio/mp4a-latm'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['aac'],
    muxer: 'adts',
    demuxer: 'aac',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: true,
    vbrQualityRange: [0.1, 1.0],
    sampleRates: STD_RATES_LOW,
    channels: CH_STEREO,
    defaultBitrateKbps: 192,
    bitrateOptionsKbps: [64, 96, 128, 160, 192, 256, 320],
    tagSystem: 'none',
    coverArt: false,
    note: 'ADTS 裸流，适合播放器直接播放；需要标签请选择 M4A',
  },
  m4a: {
    id: 'm4a',
    label: 'M4A',
    extensions: ['m4a'],
    mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['aac'],
    muxer: 'ipod',
    demuxer: 'mov',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: true,
    vbrQualityRange: [0.1, 1.0],
    sampleRates: STD_RATES_LOW,
    channels: CH_STEREO,
    defaultBitrateKbps: 192,
    bitrateOptionsKbps: [64, 96, 128, 160, 192, 256, 320],
    tagSystem: 'mp4',
    coverArt: true,
    note: 'Apple 生态标准格式，支持标签与封面',
  },
  ogg: {
    id: 'ogg',
    label: 'OGG Vorbis',
    extensions: ['ogg', 'oga'],
    mimeTypes: ['audio/ogg', 'audio/vorbis'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['libvorbis', 'vorbis'],
    muxer: 'ogg',
    demuxer: 'ogg',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: true,
    vbrQualityRange: [0, 10],
    vbrQualityLabels: { 0: '极低', 3: '低', 5: '中', 7: '高', 10: '极高' },
    sampleRates: [6000, 8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000],
    channels: CH_STEREO,
    defaultBitrateKbps: 160,
    bitrateOptionsKbps: [64, 96, 128, 160, 192, 256, 320],
    tagSystem: 'vorbis',
    coverArt: true,
  },
  opus: {
    id: 'opus',
    label: 'OPUS',
    extensions: ['opus'],
    mimeTypes: ['audio/opus', 'audio/ogg; codecs=opus'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['libopus', 'opus'],
    muxer: 'opus',
    demuxer: 'ogg',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: false,
    sampleRates: [48000],
    channels: [1, 2],
    defaultBitrateKbps: 128,
    bitrateOptionsKbps: [32, 64, 96, 128, 160, 192, 256, 320, 510],
    tagSystem: 'vorbis',
    coverArt: true,
    note: '低码率下音质最佳；内部固定 48kHz 采样率',
  },
  wma: {
    id: 'wma',
    label: 'WMA',
    extensions: ['wma'],
    mimeTypes: ['audio/x-ms-wma'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['wmav2', 'wmav1'],
    muxer: 'asf',
    demuxer: 'asf',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: false,
    sampleRates: [8000, 11025, 16000, 22050, 44100, 48000],
    channels: CH_STEREO,
    defaultBitrateKbps: 128,
    bitrateOptionsKbps: [48, 64, 128, 192, 320],
    tagSystem: 'asf',
    coverArt: false,
    note: 'Windows Media 格式，兼容性依播放器而定',
  },
  aiff: {
    id: 'aiff',
    label: 'AIFF',
    extensions: ['aiff', 'aif'],
    mimeTypes: ['audio/aiff', 'audio/x-aiff'],
    kind: 'lossless',
    lossless: true,
    encoderCandidates: ['pcm_s16be', 'pcm_s24be', 'pcm_s32be'],
    muxer: 'aiff',
    demuxer: 'aiff',
    supportsBitrate: false,
    supportsBitDepth: true,
    supportsVbrQuality: false,
    bitDepths: [16, 24, 32],
    sampleRates: STD_RATES_WIDE,
    channels: CH_STEREO,
    tagSystem: 'none',
    coverArt: false,
    note: 'Apple 传统无损格式（大端 PCM）',
  },
  ape: {
    id: 'ape',
    label: "APE (Monkey's Audio)",
    extensions: ['ape'],
    mimeTypes: ['audio/x-ape'],
    kind: 'compressive-lossless',
    lossless: true,
    encoderCandidates: ['ape'],
    muxer: 'ape',
    demuxer: 'ape',
    supportsBitrate: false,
    supportsBitDepth: true,
    supportsVbrQuality: false,
    bitDepths: [16, 24],
    sampleRates: [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000],
    channels: CH_STEREO,
    tagSystem: 'apev2',
    coverArt: false,
    note: '压缩无损，解码资源消耗较高',
  },
  ac3: {
    id: 'ac3',
    label: 'AC3 (Dolby Digital)',
    extensions: ['ac3'],
    mimeTypes: ['audio/ac3'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['ac3'],
    muxer: 'ac3',
    demuxer: 'ac3',
    supportsBitrate: true,
    supportsBitDepth: false,
    supportsVbrQuality: false,
    sampleRates: [32000, 44100, 48000],
    channels: [1, 2, 6],
    defaultBitrateKbps: 448,
    bitrateOptionsKbps: [128, 192, 256, 320, 384, 448, 640],
    tagSystem: 'none',
    coverArt: false,
    note: '环绕声常用格式，采样率仅支持 32/44.1/48kHz',
  },
  amr: {
    id: 'amr',
    label: 'AMR-NB',
    extensions: ['amr'],
    mimeTypes: ['audio/amr', 'audio/3gpp'],
    kind: 'lossy',
    lossless: false,
    encoderCandidates: ['libopencore_amrnb'],
    muxer: 'amr',
    demuxer: 'amr',
    supportsBitrate: false,
    supportsBitDepth: false,
    supportsVbrQuality: false,
    sampleRates: [8000],
    channels: [1],
    tagSystem: 'none',
    coverArt: false,
    note: '语音优化格式，仅 8kHz 单声道，需引擎内置 amr 编码器',
  },
  alac: {
    id: 'alac',
    label: 'ALAC (Apple Lossless)',
    extensions: ['m4a'],
    mimeTypes: ['audio/alac', 'audio/mp4'],
    kind: 'compressive-lossless',
    lossless: true,
    encoderCandidates: ['alac'],
    muxer: 'ipod',
    demuxer: 'mov',
    supportsBitrate: false,
    supportsBitDepth: true,
    supportsVbrQuality: false,
    bitDepths: [16, 24],
    sampleRates: [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000],
    channels: CH_STEREO,
    tagSystem: 'mp4',
    coverArt: true,
    note: 'Apple 生态无损；与 AAC-M4A 共用 .m4a 扩展名',
  },
};

export const FORMAT_IDS: FormatId[] = [
  'mp3',
  'wav',
  'flac',
  'aac',
  'm4a',
  'ogg',
  'opus',
  'wma',
  'aiff',
  'ape',
  'ac3',
  'amr',
  'alac',
];

export function getFormat(id: string | null | undefined): FormatDef | null {
  if (!id) return null;
  return (FORMATS as Record<string, FormatDef>)[id] ?? null;
}

/** 由文件名扩展名推断格式（仅作提示，真实格式以 magic/probe 为准） */
export function formatFromExtension(fileName: string): FormatId | null {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  for (const id of FORMAT_IDS) {
    if (FORMATS[id].extensions.includes(ext)) {
      // .m4a 同时属于 m4a / alac，优先 m4a（最常见的 AAC-M4A）
      if (ext === 'm4a' && id === 'alac') continue;
      return id;
    }
  }
  return null;
}

/** 主扩展名 → 格式（用于输出文件补全扩展名） */
export function formatFromPrimaryExt(ext: string): FormatId | null {
  const e = ext.replace(/^\./, '').toLowerCase();
  for (const id of FORMAT_IDS) {
    if (FORMATS[id].extensions[0] === e) return id;
  }
  return null;
}
