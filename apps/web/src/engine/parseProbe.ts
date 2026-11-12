/**
 * FFmpeg 探测输出（stderr）解析器 —— 纯函数，可在 Node 下直接测试。
 * 信息来源必须是引擎真实输出，禁止写死。
 */
import type { ProbeResult } from '@audio-studio/shared';

export interface ParsedProbe {
  container: string;
  durationMs?: number;
  bitrateKbps?: number;
  audio?: {
    codec: string;
    codecLongName?: string;
    sampleRate?: number;
    channels?: number;
    channelLayout?: string;
    sampleFormat?: string;
    bitDepth?: number | 'f32';
    bitrateKbps?: number;
    tags: Record<string, string>;
  };
  videoStreams: Array<{ codec: string; description: string; isAttachedPicture: boolean }>;
  tags: Record<string, string>;
  warnings: string[];
  raw: string;
}

function parseDuration(line: string): number | undefined {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  if (!m) return undefined;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = parseFloat(m[3]);
  if (!Number.isFinite(h * 3600 + min * 60 + s)) return undefined;
  return Math.round((h * 3600 + min * 60 + s) * 1000);
}

function bitDepthFromSampleFmt(fmt: string | undefined): number | 'f32' | undefined {
  if (!fmt) return undefined;
  if (/^fltp$|^flt$|^f32/.test(fmt)) return 'f32';
  if (/s64/.test(fmt)) return 64;
  if (/s32/.test(fmt)) return 32;
  if (/s24/.test(fmt)) return 24;
  if (/s16/.test(fmt)) return 16;
  if (/u8/.test(fmt)) return 8;
  return undefined;
}

/** 解析 `ffmpeg -i` 的 stderr 输出 */
export function parseProbeOutput(stderr: string): ParsedProbe {
  const result: ParsedProbe = {
    container: '',
    audio: undefined,
    videoStreams: [],
    tags: {},
    warnings: [],
    raw: stderr,
  };

  const lines = stderr.split(/\r?\n/);
  let inFormatMetadata = false;
  let inStreamMetadata = false;
  let currentStreamIsAudio = false;
  let audioTagTarget: Record<string, string> | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) continue;

    // Input #0, mp3, from 'xxx':
    const inputM = /^\s*Input #0,\s*([^,]+),\s*from\s+'(.*)':/.exec(line);
    if (inputM) {
      result.container = inputM[1].trim();
      inFormatMetadata = false;
      inStreamMetadata = false;
      continue;
    }

    // Duration / start / bitrate
    if (/^\s*Duration:/.test(line)) {
      const d = parseDuration(line);
      if (d !== undefined) result.durationMs = d;
      const br = /bitrate:\s*(\d+)\s*kb\/s/.exec(line);
      if (br) result.bitrateKbps = parseInt(br[1], 10);
      if (/Duration:\s*N\/A/.test(line))
        result.warnings.push('文件时长未知（流损坏或为直播流格式）');
      continue;
    }

    // Stream 行
    if (/^\s*Stream #/.test(line)) {
      inFormatMetadata = false;
      inStreamMetadata = false;
      const isAudio = /:\s*Audio:/.test(line);
      currentStreamIsAudio = isAudio;
      if (isAudio && !result.audio) {
        const parsedAudio = parseAudioStream(line);
        if (parsedAudio) {
          result.audio = parsedAudio;
          audioTagTarget = parsedAudio.tags;
          if (parsedAudio.codec === 'unknown') {
            result.warnings.push('无法解析音频编码信息');
          }
        } else {
          result.warnings.push('音频流信息无法解析');
        }
      } else if (!isAudio) {
        const codecM = /:\s*Video:\s*([^,]+)/.exec(line);
        const desc = line.trim();
        const isCover =
          /attached picture/i.test(line) ||
          (/mjpeg|png|bmp|webp/i.test(line ?? '') && /disposition.*attached/i.test(line));
        result.videoStreams.push({
          codec: codecM ? codecM[1].trim().replace(/\s*\(.*\)$/, '') : 'unknown',
          description: desc,
          isAttachedPicture: /attached picture/i.test(desc) || (isCover && !/Display/i.test(desc)),
        });
      }
      continue;
    }

    // Output 行（探测时不应有，防御）
    if (/^\s*Output #/.test(line)) break;

    // Metadata 区块
    if (/^\s*Metadata:\s*$/.test(line)) {
      const indent = line.length - line.trimStart().length;
      if (indent <= 4 && !currentStreamIsAudio) {
        inFormatMetadata = true;
        audioTagTarget = undefined;
      } else {
        inFormatMetadata = false;
        inStreamMetadata = true;
      }
      continue;
    }

    // key: value（缩进解析）
    const kv = /^\s+([A-Za-z_][\w ]*?)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].trim().toLowerCase();
      const value = kv[2].trim();
      if (inFormatMetadata) {
        result.tags[key] = value;
      } else if (inStreamMetadata && audioTagTarget) {
        audioTagTarget[key] = value;
      }
      continue;
    }

    // 非 metadata 行结束区块
    if (/^\s{0,2}\S/.test(line)) {
      inFormatMetadata = false;
      inStreamMetadata = false;
    }
  }

  if (!result.audio) {
    result.warnings.push('未找到音频流');
  }
  return result;
}

function parseAudioStream(line: string): ParsedProbe['audio'] | undefined {
  // Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
  // Stream #0:0(eng): Audio: aac (LC), 44100 Hz, stereo, fltp, 128 kb/s
  // Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s
  const m =
    /Audio:\s*([^,]+),\s*(\d+)\s*Hz,\s*([^,]+?)(?:,\s*([^,]+))?(?:,\s*(\d+)\s*kb\/s)?\s*$/.exec(
      line,
    );
  if (!m) {
    // 宽松回退
    const codecM = /Audio:\s*([^,]+)/.exec(line);
    if (!codecM) return undefined;
    return { codec: codecM[1].trim(), tags: {} };
  }
  const codecRaw = m[1].trim();
  const codec = codecRaw.replace(/\s*\(.*\)$/, '');
  const sampleRate = parseInt(m[2], 10);
  const layoutRaw = m[3].trim();
  const sampleFormat = m[4]?.trim();
  const bitrateKbps = m[5] ? parseInt(m[5], 10) : undefined;

  let channels: number | undefined;
  let channelLayout: string | undefined;
  if (/^\d+\s+channels?$/.test(layoutRaw)) {
    channels = parseInt(layoutRaw, 10);
  } else if (/mono/i.test(layoutRaw)) {
    channels = 1;
    channelLayout = 'mono';
  } else if (/stereo/i.test(layoutRaw)) {
    channels = 2;
    channelLayout = 'stereo';
  } else if (/2\.1|3\.0|4\.0|4\.1|5\.0|5\.1|6\.0|6\.1|7\.1/.test(layoutRaw)) {
    channelLayout = layoutRaw;
    // 布局可能带后缀（如 "5.1(side)"），按数字部分查表
    const layoutNum = /(\d\.\d)/.exec(layoutRaw)?.[1] ?? layoutRaw;
    channels =
      { '2.1': 3, '3.0': 3, '4.0': 4, '4.1': 5, '5.0': 5, '5.1': 6, '6.0': 6, '6.1': 7, '7.1': 8 }[
        layoutNum
      ] ?? undefined;
  } else {
    channelLayout = layoutRaw;
  }

  // 位深度：优先从 codec 名推断（pcm_s24le），否则从 sample_fmt
  let bitDepth: number | 'f32' | undefined;
  const pcmM = /pcm_[su](\d+)(?:le|be)?/.exec(codec);
  if (pcmM) bitDepth = parseInt(pcmM[1], 10);
  if (bitDepth === undefined) bitDepth = bitDepthFromSampleFmt(sampleFormat);
  // FFmpeg 显式标注的真实位深度（如 "s32 (24 bit)"）优先于容器位宽
  const bitAnnotation = /\((\d+)\s*bit\)/i.exec(line);
  if (bitAnnotation) bitDepth = parseInt(bitAnnotation[1], 10);

  return {
    codec,
    codecLongName: undefined,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
    channels,
    channelLayout,
    sampleFormat,
    bitDepth,
    bitrateKbps,
    tags: {},
  };
}

/** 把解析结果组装为共享 ProbeResult（格式由 magic + 容器名共同确认） */
export function toProbeResult(
  parsed: ParsedProbe,
  opts: {
    fileSizeBytes: number;
    format: ProbeResult['format'];
    extensionMismatch?: ProbeResult['extensionMismatch'];
    coverArt?: ProbeResult['coverArt'];
    fileName?: string;
  },
): ProbeResult {
  const a = parsed.audio;
  return {
    format: opts.format,
    extensionMismatch: opts.extensionMismatch,
    codec: a?.codec ?? 'unknown',
    codecLongName: a?.codecLongName,
    container: parsed.container,
    durationMs: parsed.durationMs,
    bitrateKbps: a?.bitrateKbps ?? parsed.bitrateKbps,
    sampleRate: a?.sampleRate,
    channels: a?.channels,
    channelLayout: a?.channelLayout,
    bitDepth: a?.bitDepth,
    fileSizeBytes: opts.fileSizeBytes,
    tags: { ...parsed.tags, ...(a?.tags ?? {}) },
    coverArt: opts.coverArt,
    streamSummary: parsed.videoStreams.map((v) => v.description),
    warnings: parsed.warnings,
  };
}
