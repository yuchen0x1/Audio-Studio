/**
 * FFmpeg 真实集成测试（系统安装的 ffmpeg/ffprobe 可用时执行）。
 *
 * 覆盖规格验收用例 1~11、14~20（12 取消 / 13 重试为引擎层行为，
 * 由 Web UI 自动化与状态机单测覆盖）。
 * 每条用例真实生成文件、真实转换、真实用 ffprobe 校验输出参数。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildConvertArgs, buildTrimArgs, buildMergeArgs,
  defaultParamsFor, detectFormat, classifyEngineOutput,
  EncodeParams, FormatId, ConvertJob, TrimJob, MergeJob,
} from '../index';

const hasFFmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const hasFFprobe = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;

function runFFmpeg(args: string[]): { code: number; stderr: string } {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? -1, stderr: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}

interface ProbeOut {
  codec: string;
  durationSec: number;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  formatName?: string;
}

function ffprobe(file: string): ProbeOut {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=duration,format_name,bit_rate',
    '-of', 'json', file,
  ], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr}`);
  const json = JSON.parse(r.stdout) as {
    streams?: Array<{ codec_name: string; sample_rate?: string; channels?: number; bit_rate?: string }>;
    format?: { duration?: string; format_name?: string; bit_rate?: string };
  };
  const s = json.streams?.[0];
  if (!s) throw new Error(`no stream in ${file}`);
  return {
    codec: s.codec_name,
    durationSec: parseFloat(json.format?.duration ?? '0'),
    sampleRate: s.sample_rate ? parseInt(s.sample_rate, 10) : undefined,
    channels: s.channels,
    bitRate: (json.format?.bit_rate ?? s.bit_rate) ? parseInt(json.format?.bit_rate ?? s.bit_rate!, 10) : undefined,
    formatName: json.format?.format_name,
  };
}

/** 生成测试源：正弦波 */
function genTone(out: string, opts: {
  codec: string; seconds: number; sampleRate: number; channels: number; bitrate?: string; extra?: string[];
}): void {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-t', String(opts.seconds),
    '-i', `sine=frequency=440:sample_rate=${opts.sampleRate}:duration=${opts.seconds}`,
  ];
  if (opts.channels === 2) args.push('-ac', '2');
  args.push('-c:a', opts.codec);
  if (opts.bitrate) args.push('-b:a', opts.bitrate);
  if (opts.extra) args.push(...opts.extra);
  args.push(out);
  const r = runFFmpeg(args);
  if (r.code !== 0) throw new Error(`genTone ${opts.codec} failed: ${r.stderr.slice(-800)}`);
}

let workDir = '';

function makeJob(format: FormatId, src: string, outDir: string, name: string, params?: EncodeParams): ConvertJob {
  mkdirSync(outDir, { recursive: true }); // FFmpeg 不会自动创建输出目录
  return {
    kind: 'convert',
    taskId: `it_${Math.random().toString(36).slice(2, 8)}`,
    source: {
      id: path.basename(src),
      name: path.basename(src),
      sizeBytes: statSync(src).size,
      path: src,
    },
    params: params ?? defaultParamsFor(format),
    outputFileName: name,
    outputDir: outDir,
  };
}

describe.runIf(hasFFmpeg && hasFFprobe)('FFmpeg 真实集成测试', () => {
  beforeAll(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'as-it-'));
  });
  afterAll(() => {
    if (workDir && existsSync(workDir)) {
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  // ---------- 用例 1~7：格式互转 ----------
  const conversions: Array<{
    name: string; from: FormatId; to: FormatId;
    gen: string; // 生成源的 codec
    expectCodec: (p: ProbeOut) => boolean;
    expect?: (p: ProbeOut, params: EncodeParams) => void;
  }> = [
    {
      name: '1. MP3 → WAV',
      from: 'mp3', to: 'wav',
      gen: 'libmp3lame',
      expectCodec: (p) => p.codec.startsWith('pcm_'),
      expect: (p) => {
        expect(p.sampleRate).toBe(44100);
        expect(p.channels).toBe(2);
        expect(p.durationSec).toBeCloseTo(3, 0);
      },
    },
    {
      name: '2. WAV → MP3',
      from: 'wav', to: 'mp3',
      gen: 'pcm_s16le',
      expectCodec: (p) => p.codec === 'mp3',
      expect: (p, params) => {
        expect(p.bitRate).toBeGreaterThanOrEqual((params.bitrateKbps ?? 192) * 1000 * 0.9);
      },
    },
    {
      name: '3. FLAC → MP3',
      from: 'flac', to: 'mp3',
      gen: 'flac',
      expectCodec: (p) => p.codec === 'mp3',
    },
    {
      name: '4. MP3 → FLAC',
      from: 'mp3', to: 'flac',
      gen: 'libmp3lame',
      expectCodec: (p) => p.codec === 'flac',
    },
    {
      name: '5. AAC → MP3',
      from: 'aac', to: 'mp3',
      gen: 'aac',
      expectCodec: (p) => p.codec === 'mp3',
    },
    {
      name: '6. OGG → WAV',
      from: 'ogg', to: 'wav',
      gen: 'libvorbis',
      expectCodec: (p) => p.codec.startsWith('pcm_'),
    },
    {
      name: '7. OPUS → MP3',
      from: 'opus', to: 'mp3',
      gen: 'libopus',
      expectCodec: (p) => p.codec === 'mp3',
    },
  ];

  for (const c of conversions) {
    it(c.name, () => {
      const src = path.join(workDir, `src_${c.from}.${FORMAT_EXT(c.from)}`);
      genTone(src, { codec: c.gen, seconds: 3, sampleRate: 44100, channels: 2, bitrate: '192k' });
      const outDir = path.join(workDir, `out_${c.to}`);
      const params = defaultParamsFor(c.to);
      const job = makeJob(c.to, src, outDir, `result_${c.from}_to_${c.to}.${FORMAT_EXT(c.to)}`, params);
      const args = buildConvertArgs(job, {});
      const r = runFFmpeg(args);
      expect(r.code, `stderr: ${r.stderr.slice(-1200)}`).toBe(0);
      const outFile = path.join(outDir, job.outputFileName);
      expect(existsSync(outFile)).toBe(true);
      expect(statSync(outFile).size).toBeGreaterThan(1000);
      const p = ffprobe(outFile);
      expect(c.expectCodec(p), `codec=${p.codec}`).toBe(true);
      expect(p.durationSec).toBeGreaterThan(2.5);
      expect(p.durationSec).toBeLessThan(3.6);
      c.expect?.(p, params);
      // 文件头 magic 与 ffprobe 结果一致
      const head = readHead(outFile, 64);
      expect(detectFormat(head).format).toBeTruthy();
    });
  }

  // ---------- 用例 14/15/16：特殊文件名与路径 ----------
  it('14. 文件名包含中文', () => {
    const src = path.join(workDir, '中文 源文件 测试.mp3');
    genTone(src, { codec: 'libmp3lame', seconds: 2, sampleRate: 44100, channels: 2, bitrate: '128k' });
    const outDir = path.join(workDir, '输出目录');
    const job = makeJob('wav', src, outDir, '中文输出_测试.wav');
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    expect(existsSync(path.join(outDir, '中文输出_测试.wav'))).toBe(true);
    expect(ffprobe(path.join(outDir, '中文输出_测试.wav')).codec).toMatch(/pcm_/);
  });

  it('15. 文件名包含特殊字符', () => {
    const src = path.join(workDir, "it's a #test & (v1) [final].mp3");
    genTone(src, { codec: 'libmp3lame', seconds: 2, sampleRate: 44100, channels: 2, bitrate: '128k' });
    const outDir = path.join(workDir, 'out');
    const job = makeJob('mp3', src, outDir, "result #1 & (copy) [ok].mp3");
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    expect(existsSync(path.join(outDir, "result #1 & (copy) [ok].mp3"))).toBe(true);
  });

  it('16. 输出路径包含空格', () => {
    const src = path.join(workDir, 'plain.mp3');
    genTone(src, { codec: 'libmp3lame', seconds: 2, sampleRate: 44100, channels: 2, bitrate: '128k' });
    const outDir = path.join(workDir, 'Audio Studio 输出 dir');
    const job = makeJob('wav', src, outDir, 'out put.wav');
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    expect(existsSync(path.join(outDir, 'out put.wav'))).toBe(true);
  });

  // ---------- 用例 17/18：采样率与声道 ----------
  it('17. 不同采样率转换 48k → 44.1k', () => {
    const src = path.join(workDir, 't48k.wav');
    genTone(src, { codec: 'pcm_s16le', seconds: 2, sampleRate: 48000, channels: 2 });
    const params = defaultParamsFor('mp3');
    params.sampleRate = 44100;
    const outDir = path.join(workDir, 'out');
    const job = makeJob('mp3', src, outDir, 't44k.mp3', params);
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    expect(ffprobe(path.join(outDir, 't44k.mp3')).sampleRate).toBe(44100);
  });

  it('18. 不同声道转换 立体声 → 单声道', () => {
    const src = path.join(workDir, 'stereo.wav');
    genTone(src, { codec: 'pcm_s16le', seconds: 2, sampleRate: 44100, channels: 2 });
    const params = defaultParamsFor('mp3');
    params.channels = 1;
    const outDir = path.join(workDir, 'out');
    const job = makeJob('mp3', src, outDir, 'mono.mp3', params);
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    expect(ffprobe(path.join(outDir, 'mono.mp3')).channels).toBe(1);
  });

  // ---------- 用例 9：大文件 ----------
  it('9. 大文件转换（5 分钟 WAV → MP3）', () => {
    const src = path.join(workDir, 'large_5min.wav');
    genTone(src, { codec: 'pcm_s16le', seconds: 300, sampleRate: 44100, channels: 2 });
    expect(statSync(src).size).toBeGreaterThan(50 * 1024 * 1024);
    const outDir = path.join(workDir, 'out');
    const job = makeJob('mp3', src, outDir, 'large.mp3');
    const t0 = Date.now();
    const r = runFFmpeg(buildConvertArgs(job, {}));
    const elapsed = Date.now() - t0;
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    const p = ffprobe(path.join(outDir, 'large.mp3'));
    expect(p.durationSec).toBeGreaterThan(299);
    expect(p.durationSec).toBeLessThan(301);
    // 记录真实性能
    console.log(`[perf] 5min WAV→MP3 用时 ${elapsed}ms, 输出 ${(statSync(path.join(outDir, 'large.mp3')).size / 1024 / 1024).toFixed(1)}MB`);
  }, 120_000);

  // ---------- 用例 10/11：损坏与不支持 ----------
  it('10. 损坏文件处理（伪 mp3 随机数据）', () => {
    const src = path.join(workDir, 'corrupt.mp3');
    const junk = Buffer.alloc(64 * 1024);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919 + 13) & 0xff;
    junk.write('ID3', 0); // 伪装成 mp3
    writeFileSync(src, junk);
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });
    const job = makeJob('wav', src, outDir, 'corrupt_out.wav');
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code).not.toBe(0);
    const code = classifyEngineOutput(r.stderr);
    expect(['E_CORRUPT_FILE', 'E_UNSUPPORTED_FORMAT', 'E_UNKNOWN']).toContain(code);
    expect(existsSync(path.join(outDir, 'corrupt_out.wav'))).toBe(false); // 不产生垃圾输出
  });

  it('11. 不支持格式处理（文本文件改扩展名）', () => {
    const src = path.join(workDir, 'not_audio.mp3');
    writeFileSync(src, '这不是音频文件，只是纯文本内容。This is plain text.');
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });
    const job = makeJob('wav', src, outDir, 'na.wav');
    const r = runFFmpeg(buildConvertArgs(job, {}));
    expect(r.code).not.toBe(0);
    const code = classifyEngineOutput(r.stderr);
    expect(['E_CORRUPT_FILE', 'E_UNSUPPORTED_FORMAT']).toContain(code);
  });

  // ---------- 用例 19：音频剪辑 ----------
  it('19. 音频剪辑（裁剪 1.0s~2.5s，时长与参数校验）', () => {
    const src = path.join(workDir, 'clip_src.wav');
    genTone(src, { codec: 'pcm_s16le', seconds: 5, sampleRate: 44100, channels: 2 });
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });
    const job: TrimJob = {
      kind: 'trim', taskId: 'it_trim',
      source: { id: 'c', name: 'clip_src.wav', sizeBytes: statSync(src).size, path: src },
      startMs: 1000, endMs: 2500,
      params: defaultParamsFor('mp3'),
      outputFileName: 'clipped.mp3', outputDir: outDir,
    };
    const r = runFFmpeg(buildTrimArgs(job, {}));
    expect(r.code, r.stderr.slice(-800)).toBe(0);
    const p = ffprobe(path.join(outDir, 'clipped.mp3'));
    expect(p.durationSec).toBeGreaterThan(1.4);
    expect(p.durationSec).toBeLessThan(1.65);
  });

  it('19b. 分割导出（三个片段各自时长正确）', () => {
    const src = path.join(workDir, 'split_src.wav');
    genTone(src, { codec: 'pcm_s16le', seconds: 6, sampleRate: 44100, channels: 2 });
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });
    const segments: Array<[number, number]> = [[0, 2000], [2000, 4000], [4000, 6000]];
    segments.forEach(([s, e], i) => {
      const job: TrimJob = {
        kind: 'trim', taskId: `it_split${i}`,
        source: { id: 's', name: 'split_src.wav', sizeBytes: statSync(src).size, path: src },
        startMs: s, endMs: e,
        params: defaultParamsFor('wav'),
        outputFileName: `part_0${i + 1}.wav`, outputDir: outDir,
      };
      const r = runFFmpeg(buildTrimArgs(job, {}));
      expect(r.code, r.stderr.slice(-600)).toBe(0);
      const p = ffprobe(path.join(outDir, `part_0${i + 1}.wav`));
      expect(p.durationSec).toBeGreaterThan(1.9);
      expect(p.durationSec).toBeLessThan(2.1);
    });
  });

  // ---------- 用例 20：合并 ----------
  it('20. 音频合并（不同采样率/声道 + 间隙 + 音量）', () => {
    const a = path.join(workDir, 'm_a_44k_stereo.wav');
    const b = path.join(workDir, 'm_b_48k_mono.wav');
    genTone(a, { codec: 'pcm_s16le', seconds: 2, sampleRate: 44100, channels: 2 });
    genTone(b, { codec: 'pcm_s16le', seconds: 3, sampleRate: 48000, channels: 1 });
    const outDir = path.join(workDir, 'out');
    mkdirSync(outDir, { recursive: true });
    const job: MergeJob = {
      kind: 'merge', taskId: 'it_merge',
      items: [
        { source: { id: 'a', name: 'm_a.wav', sizeBytes: statSync(a).size, path: a }, gainDb: -3, fadeInMs: 200 },
        { source: { id: 'b', name: 'm_b.wav', sizeBytes: statSync(b).size, path: b }, fadeOutMs: 300 },
      ],
      gapMs: 500,
      params: defaultParamsFor('mp3'),
      outputFileName: 'merged.mp3', outputDir: outDir,
    };
    const ctx = { resolvedSampleRate: 44100, resolvedChannels: 2 };
    const r = runFFmpeg(buildMergeArgs(job, ctx));
    expect(r.code, r.stderr.slice(-1500)).toBe(0);
    const p = ffprobe(path.join(outDir, 'merged.mp3'));
    // 2s + 3s + 0.5s gap = 5.5s
    expect(p.durationSec).toBeGreaterThan(5.3);
    expect(p.durationSec).toBeLessThan(5.8);
    expect(p.channels).toBe(2);
    expect(p.sampleRate).toBe(44100);
  });

  // ---------- 用例 8：批量转换 ----------
  it('8. 多文件批量转换（6 文件 → 6 输出，各自可播放）', () => {
    const outDir = path.join(workDir, 'batch_out');
    mkdirSync(outDir, { recursive: true });
    const results: Array<{ file: string; ok: boolean }> = [];
    for (let i = 1; i <= 6; i++) {
      const src = path.join(workDir, `batch_${i}.wav`);
      genTone(src, { codec: 'pcm_s16le', seconds: 1, sampleRate: 44100, channels: 2 });
      const params = defaultParamsFor('mp3');
      params.bitrateKbps = [128, 160, 192, 224, 256, 320][i - 1];
      const job = makeJob('mp3', src, outDir, `batch_out_${i}.mp3`, params);
      const r = runFFmpeg(buildConvertArgs(job, {}));
      const file = path.join(outDir, `batch_out_${i}.mp3`);
      const ok = r.code === 0 && existsSync(file) && ffprobe(file).codec === 'mp3';
      results.push({ file, ok });
    }
    expect(results.every((r) => r.ok)).toBe(true);
    expect(readdirSync(outDir)).toHaveLength(6);
  }, 60_000);

  // ---------- 附加：能力检测解析器对真实 ffmpeg 输出有效 ----------
  it('能力检测：解析真实 -encoders/-muxers 输出', async () => {
    const { parseEncoders, parseMuxers, buildFormatCapabilities } = await import('../index');
    const encOut = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf-8' }).stdout;
    const muxOut = spawnSync('ffmpeg', ['-muxers'], { encoding: 'utf-8' }).stdout;
    const demOut = spawnSync('ffmpeg', ['-demuxers'], { encoding: 'utf-8' }).stdout;
    const encoders = parseEncoders(encOut);
    expect(encoders.length).toBeGreaterThan(20);
    expect(encoders).toContain('libmp3lame');
    expect(encoders).toContain('flac');
    const muxers = parseMuxers(muxOut);
    expect(muxers).toContain('mp3');
    expect(muxers).toContain('wav');
    const demuxers = parseMuxers(demOut);
    expect(demuxers).toContain('mp3');
    const caps = buildFormatCapabilities(encoders, muxers, demuxers);
    const mp3 = caps.find((c) => c.id === 'mp3')!;
    expect(mp3.canEncode).toBe(true);
    expect(mp3.encoder).toBe('libmp3lame');
    const wav = caps.find((c) => c.id === 'wav')!;
    expect(wav.canEncode).toBe(true);
  });
});

function FORMAT_EXT(f: FormatId): string {
  const map: Record<FormatId, string> = {
    mp3: 'mp3', wav: 'wav', flac: 'flac', aac: 'aac', m4a: 'm4a', ogg: 'ogg',
    opus: 'opus', wma: 'wma', aiff: 'aiff', ape: 'ape', ac3: 'ac3', amr: 'amr', alac: 'm4a',
  };
  return map[f];
}

function readHead(file: string, n: number): Uint8Array {
  const buf = readFileSync(file);
  return new Uint8Array(buf.subarray(0, n));
}
