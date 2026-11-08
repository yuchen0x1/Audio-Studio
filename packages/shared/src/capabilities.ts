/**
 * FFmpeg 能力解析：`-encoders` / `-muxers` / `-demuxers` / `-filters` 输出解析
 * + 格式注册表求交集，生成 FormatCapability。
 * 纯函数，可在 Node 下直接测试。
 */
import { FORMAT_IDS, FormatDef, FORMATS, FormatId } from './formats';
import type { EngineCapabilities, FormatCapability } from './engine';

/** 解析 `ffmpeg -encoders` 输出的音频编码器名列表 */
export function parseEncoders(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    // A....D libmp3lame   libMP3 lame (MPEG audio layer III)   —— flags 固定 6 列
    const m = /^\s*([VAS][.\w]{5})\s+([A-Za-z0-9_]+)\s/.exec(line);
    if (m && m[1][0] === 'A') names.push(m[2]);
  }
  return [...new Set(names)];
}

/** 解析 `ffmpeg -muxers` / `-demuxers` 输出 */
export function parseMuxers(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    //  E mp3          MP3 (MPEG audio layer III)
    //  D mp3          MP3 (MPEG audio layer III)
    const m = /^\s{1,2}([ ED]{1,2})\s+([A-Za-z0-9_,-]+)\s+\S/.exec(line);
    if (m) names.push(m[2]);
  }
  return [...new Set(names)];
}

/** 解析 `ffmpeg -filters` 输出 */
export function parseFilters(output: string): string[] {
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    // 不依赖固定列宽：不同 ffmpeg 版本的表头标志列宽度不同
    //  ..C afade            V->A       Apply fade-in/out effect
    //  TSC afreqshift       A->A       Apply frequency shifting
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [flags, name, io] = parts;
    if (!/^[.TSCAVN|]{2,5}$/.test(flags)) continue; // 标志列
    if (!/^[A-Z|*]+->[A-Z|*]+$/.test(io)) continue; // 输入输出列
    if (!/^[A-Za-z0-9_,]+$/.test(name)) continue; // 名称列
    names.add(name);
  }
  return [...names];
}

/**
 * 由注册表 + 可用能力列表生成每个格式的能力与不可用原因。
 * 规则：界面只能展示 canEncode=true 的输出格式。
 */
export function buildFormatCapabilities(
  encoders: string[],
  muxers: string[],
  demuxers: string[],
): FormatCapability[] {
  const enc = new Set(encoders);
  const mux = new Set(muxers);
  const dem = new Set(demuxers);
  return FORMAT_IDS.map((id) => {
    const f: FormatDef = FORMATS[id];
    const availableEncoder = f.encoderCandidates.find((c) => enc.has(c));
    const muxerOk = mux.has(f.muxer);
    const demuxerOk = dem.has(f.demuxer);

    let reason: string | undefined;
    if (!availableEncoder) {
      reason = `引擎缺少 ${f.label} 编码器（需要 ${f.encoderCandidates.join(' / ')}）`;
    } else if (!muxerOk) {
      reason = `引擎缺少 ${f.label} 封装器 (${f.muxer})`;
    }

    return {
      id,
      canEncode: !!availableEncoder && muxerOk,
      canDecode: demuxerOk,
      encoder: availableEncoder,
      reason,
    };
  });
}

export function assembleCapabilities(
  engineInfo: EngineCapabilities['engine'],
  encoderOutput: string,
  muxerOutput: string,
  demuxerOutput: string,
  filterOutput: string,
): EngineCapabilities {
  const encoders = parseEncoders(encoderOutput);
  const muxers = parseMuxers(muxerOutput);
  const demuxers = parseMuxers(demuxerOutput);
  const filters = parseFilters(filterOutput);
  return {
    engine: engineInfo,
    encoders,
    muxers,
    filters,
    formats: buildFormatCapabilities(encoders, muxers, demuxers),
  };
}

/** 同步查询工具 */
export function findCapability(caps: EngineCapabilities, id: FormatId): FormatCapability | undefined {
  return caps.formats.find((f) => f.id === id);
}
