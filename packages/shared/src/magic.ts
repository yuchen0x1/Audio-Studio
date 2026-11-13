/**
 * 基于文件头（magic bytes）的真实格式检测 —— Web 与 Windows 两端共用同一规则。
 * 扩展名与实际内容不一致时，以内容为准并在 ProbeResult 中给出 warning。
 */
import { FormatId } from './formats';

export interface MagicDetection {
  format: FormatId | null;
  container: string;
  /** 从字节流中进一步确认的编码（如 Ogg 内的 Opus/Vorbis） */
  codecHint?: string;
  confidence: 'certain' | 'likely' | 'unknown';
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function matchesPrefix(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

const ASF_GUID = [
  0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
];

/** 检测文件头字节（至少传入前 64KB 更可靠） */
export function detectFormat(bytes: Uint8Array): MagicDetection {
  if (bytes.length < 4) return { format: null, container: '', confidence: 'unknown' };

  // RIFF .... WAVE
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    return { format: 'wav', container: 'wav', confidence: 'certain' };
  }
  // fLaC
  if (ascii(bytes, 0, 4) === 'fLaC') {
    return { format: 'flac', container: 'flac', confidence: 'certain' };
  }
  // OggS
  if (ascii(bytes, 0, 4) === 'OggS') {
    const head = ascii(bytes, 0, Math.min(64, bytes.length));
    if (head.includes('OpusHead'))
      return { format: 'opus', container: 'ogg', codecHint: 'opus', confidence: 'certain' };
    if (head.includes('vorbis'))
      return { format: 'ogg', container: 'ogg', codecHint: 'vorbis', confidence: 'certain' };
    if (head.includes('FLAC'))
      return { format: 'flac', container: 'ogg', codecHint: 'flac', confidence: 'likely' };
    if (head.includes('Speex'))
      return { format: null, container: 'ogg', codecHint: 'speex', confidence: 'likely' };
    return { format: 'ogg', container: 'ogg', confidence: 'likely' };
  }
  // ID3 / MP3 frame sync
  if (ascii(bytes, 0, 3) === 'ID3') {
    return { format: 'mp3', container: 'mp3', confidence: 'certain' };
  }
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const layer = (bytes[1] >> 1) & 0x03;
    const bitrateIdx = (bytes[2] >> 4) & 0x0f;
    const samplerateIdx = (bytes[2] >> 2) & 0x03;
    // MPEG layer I/II/III、非保留采样率、非保留码率
    if (layer !== 0 && bitrateIdx !== 0x0f && samplerateIdx !== 0x03) {
      return { format: 'mp3', container: 'mp3', confidence: 'likely' };
    }
  }
  // MP4/M4A: size(4) + 'ftyp'
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brandRaw = ascii(bytes, 8, 4);
    const brand = brandRaw.trim();
    // 用 brand 粗分音频/视频容器；真正的流信息需要 probe 确认
    if (
      ['M4A', 'M4B', 'M4P', 'F4A', 'M4A', 'ALAC', 'mp42'].includes(brandRaw) ||
      ['M4A', 'M4B', 'M4P', 'F4A', 'ALAC'].includes(brand)
    ) {
      return {
        format: 'm4a',
        container: 'mp4',
        codecHint: brand === 'ALAC' ? 'alac' : undefined,
        confidence: 'certain',
      };
    }
    return { format: 'm4a', container: 'mp4', codecHint: `brand:${brand}`, confidence: 'likely' };
  }
  // AIFF: FORM .... AIFF
  if (
    ascii(bytes, 0, 4) === 'FORM' &&
    (ascii(bytes, 8, 4) === 'AIFF' || ascii(bytes, 8, 4) === 'AIFC')
  ) {
    return { format: 'aiff', container: 'aiff', confidence: 'certain' };
  }
  // APE: 'MAC '
  if (ascii(bytes, 0, 4) === 'MAC ') {
    return { format: 'ape', container: 'ape', confidence: 'certain' };
  }
  // AMR: '#!AMR'
  if (ascii(bytes, 0, 5) === '#!AMR') {
    return { format: 'amr', container: 'amr', confidence: 'certain' };
  }
  // ASF/WMA
  if (matchesPrefix(bytes, ASF_GUID)) {
    return { format: 'wma', container: 'asf', confidence: 'certain' };
  }
  // AC3: 0x0B77 sync + 合法的 bsid(2..8) 在高 5 位
  if (bytes.length >= 6 && bytes[0] === 0x0b && bytes[1] === 0x77) {
    const bsid = (bytes[5] >> 3) & 0x1f;
    if (bsid <= 16) {
      return { format: 'ac3', container: 'ac3', confidence: 'likely' };
    }
  }
  // AAC ADTS: 0xFF 0xFx sync, layer=00
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return { format: 'aac', container: 'adts', confidence: 'likely' };
  }
  // AU: .snd
  if (ascii(bytes, 0, 4) === '.snd') {
    return { format: null, container: 'au', confidence: 'certain' };
  }

  return { format: null, container: '', confidence: 'unknown' };
}

/** 扩展名（不含点，小写）→ 期望格式，用于与 magic 结果比对 */
export function expectedFormatForExt(ext: string): FormatId | null {
  const map: Record<string, FormatId> = {
    mp3: 'mp3',
    wav: 'wav',
    wave: 'wav',
    flac: 'flac',
    aac: 'aac',
    m4a: 'm4a',
    m4b: 'm4a',
    mp4: 'm4a',
    ogg: 'ogg',
    oga: 'ogg',
    opus: 'opus',
    wma: 'wma',
    aiff: 'aiff',
    aif: 'aiff',
    ape: 'ape',
    ac3: 'ac3',
    amr: 'amr',
  };
  return map[ext.toLowerCase()] ?? null;
}
