import { describe, it, expect } from 'vitest';
import {
  buildConvertArgs,
  buildTrimArgs,
  buildMergeArgs,
  buildMeasureArgs,
  parseVolumedetect,
  parseLoudnormJson,
  selectEncoder,
  buildAudioFilters,
} from '../args';
import { defaultParamsFor, deriveParams, validateParams } from '../params';
import type { ConvertJob, TrimJob, MergeJob } from '../engine';

const src = { id: 's1', name: 'input.mp3', sizeBytes: 1000, path: 'C:/music/input.mp3' };

function convertJob(
  format: Parameters<typeof defaultParamsFor>[0],
  params = defaultParamsFor(format),
): ConvertJob {
  return {
    kind: 'convert',
    taskId: 't1',
    source: src,
    params,
    outputFileName: 'out.' + format,
    outputDir: 'C:/out',
  };
}

describe('FFmpeg 参数向量构建', () => {
  it('MP3 → WAV：包含输入、映射、编码器、muxer、输出路径', () => {
    const job = convertJob('wav');
    const args = buildConvertArgs(job, { resolvedSampleRate: 44100, resolvedChannels: 2 });
    expect(args).toContain('-i');
    expect(args[args.indexOf('-i') + 1]).toBe('C:/music/input.mp3');
    expect(args).toContain('pcm_s16le');
    expect(args).toContain('-f');
    expect(args[args.indexOf('-f') + 1]).toBe('wav');
    expect(args[args.length - 1]).toBe('C:/out/out.wav');
    expect(args).toContain('-vn');
    expect(args).toContain('0:a:0');
  });

  it('WAV → MP3：默认 192k CBR', () => {
    const job = convertJob('mp3');
    const args = buildConvertArgs(job);
    expect(args).toContain('libmp3lame');
    expect(args).toContain('192k');
  });

  it('位深度驱动编码器选择（wav）', () => {
    expect(selectEncoder('wav', { ...defaultParamsFor('wav'), bitDepth: 16 }).encoder).toBe(
      'pcm_s16le',
    );
    expect(selectEncoder('wav', { ...defaultParamsFor('wav'), bitDepth: 24 }).encoder).toBe(
      'pcm_s24le',
    );
    expect(selectEncoder('wav', { ...defaultParamsFor('wav'), bitDepth: 'f32' }).encoder).toBe(
      'pcm_f32le',
    );
    expect(selectEncoder('aiff', { ...defaultParamsFor('aiff'), bitDepth: 24 }).encoder).toBe(
      'pcm_s24be',
    );
  });

  it('FLAC 压缩等级映射', () => {
    const p = defaultParamsFor('flac');
    p.compressionLevelId = 'high';
    const args = buildConvertArgs(convertJob('flac', p));
    const i = args.indexOf('-compression_level');
    expect(i).toBeGreaterThan(0);
    expect(args[i + 1]).toBe('8');
  });

  it('M4A 输出包含 faststart', () => {
    const args = buildConvertArgs(convertJob('m4a'));
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
  });

  it('采样率/声道映射', () => {
    const p = defaultParamsFor('mp3');
    p.sampleRate = 22050;
    p.channels = 1;
    const args = buildConvertArgs(convertJob('mp3', p));
    expect(args[args.indexOf('-ar') + 1]).toBe('22050');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
  });

  it('淡出需要时长信息，缺失时抛错（防止生成错误音频）', () => {
    const p = defaultParamsFor('mp3');
    p.fadeOutMs = 2000;
    expect(() => buildConvertArgs(convertJob('mp3', p), {})).toThrow(/淡出/);
    expect(() => buildConvertArgs(convertJob('mp3', p), { durationMs: 10000 })).not.toThrow();
  });

  it('淡入淡出生成 afade 滤镜且数值归一化', () => {
    const p = defaultParamsFor('mp3');
    p.fadeInMs = 500;
    p.fadeOutMs = 1000;
    const filters = buildAudioFilters(p, { durationMs: 30000 });
    expect(filters).toContain('afade=t=in:st=0:d=0.500');
    expect(filters).toContain('afade=t=out:st=29.000:d=1.000');
  });

  it('音量增益滤镜', () => {
    const p = defaultParamsFor('mp3');
    p.gainDb = -3.5;
    expect(buildAudioFilters(p, {})).toContain('volume=-3.50dB');
  });

  it('峰值归一化两遍法：缺少测量结果时抛错', () => {
    const p = defaultParamsFor('mp3');
    p.normalize = { enabled: true, mode: 'peak', target: -1 };
    expect(() => buildConvertArgs(convertJob('mp3', p), {})).toThrow(/峰值测量/);
    const args = buildConvertArgs(convertJob('mp3', p), { measure: { maxVolumeDb: -8.2 } });
    const af = args[args.indexOf('-af') + 1];
    expect(af).toContain('volume=7.20dB');
  });

  it('LUFS 归一化生成 linear loudnorm', () => {
    const p = defaultParamsFor('mp3');
    p.normalize = { enabled: true, mode: 'lufs', target: -14 };
    const args = buildConvertArgs(convertJob('mp3', p), {
      measure: { inputI: -20.5, inputTP: -3.2, inputLRA: 7.1, inputThresh: -30.4 },
    });
    const af = args[args.indexOf('-af') + 1];
    expect(af).toContain('loudnorm=I=-14.0');
    expect(af).toContain('measured_I=-20.50');
    expect(af).toContain('linear=true');
  });

  it('裁剪：输出侧 -ss/-t 精确区间', () => {
    const job: TrimJob = {
      kind: 'trim',
      taskId: 't2',
      source: src,
      startMs: 1500,
      endMs: 8250,
      params: defaultParamsFor('mp3'),
      outputFileName: 'cut.mp3',
      outputDir: 'C:/out',
    };
    const args = buildTrimArgs(job);
    expect(args[args.indexOf('-ss') + 1]).toBe('1.500');
    expect(args[args.indexOf('-t') + 1]).toBe('6.750');
  });

  it('裁剪区间非法时抛错', () => {
    const job: TrimJob = {
      kind: 'trim',
      taskId: 't3',
      source: src,
      startMs: 5000,
      endMs: 1000,
      params: defaultParamsFor('mp3'),
      outputFileName: 'x.mp3',
      outputDir: 'o',
    };
    expect(() => buildTrimArgs(job)).toThrow(/结束时间/);
  });

  it('合并：concat 滤镜 + 间隙静音 + 每段音量', () => {
    const job: MergeJob = {
      kind: 'merge',
      taskId: 't4',
      items: [
        { source: src, gainDb: -3, fadeInMs: 200 },
        { source: { ...src, id: 's2', name: 'b.wav', path: 'C:/music/b.wav' }, fadeOutMs: 300 },
      ],
      gapMs: 500,
      params: defaultParamsFor('mp3'),
      outputFileName: 'merged.mp3',
      outputDir: 'C:/out',
    };
    const args = buildMergeArgs(job, { resolvedSampleRate: 44100, resolvedChannels: 2 });
    expect(args).toContain('-filter_complex');
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('concat=n=3:v=0:a=1');
    expect(fc).toContain('volume=-3.00dB');
    expect(fc).toContain('[g0]');
    // 间隙静音作为 lavfi 输入注入
    expect(args.join(' ')).toContain('anullsrc=r=44100:cl=stereo');
    expect(fc).toContain('aformat=sample_rates=44100:channel_layouts=stereo');
    expect(args.filter((a) => a === '-i')).toHaveLength(2 + 1); // 2 音频 + 1 静音
    expect(args[args.length - 1]).toBe('C:/out/merged.mp3');
  });

  it('合并无间隙时不注入静音输入', () => {
    const job: MergeJob = {
      kind: 'merge',
      taskId: 't5',
      items: [{ source: src }, { source: { ...src, id: 's2', path: 'b.wav' } }],
      gapMs: 0,
      params: defaultParamsFor('flac'),
      outputFileName: 'm.flac',
      outputDir: 'o',
    };
    const args = buildMergeArgs(job, { resolvedSampleRate: 44100, resolvedChannels: 2 });
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('concat=n=2:v=0:a=1');
  });

  it('测量作业输出到 null muxer', () => {
    const peak = buildMeasureArgs(convertJob('mp3'), 'peak');
    expect(peak).toContain('volumedetect');
    expect(peak[peak.length - 1]).toBe('-');
    const lufs = buildMeasureArgs(convertJob('mp3'), 'lufs');
    expect(lufs).toContain('loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json');
  });

  it('路径以 "-" 开头被拦截（防参数注入）', () => {
    const job = convertJob('mp3');
    job.source = { ...src, path: '-vf', name: '-vf' };
    expect(() => buildConvertArgs(job)).toThrow(/路径不能以 "-" 开头/);
  });
});

describe('测量输出解析', () => {
  it('volumedetect', () => {
    const stderr =
      '[Parsed_volumedetect_0 @ 0x1] mean_volume: -23.1 dB\n[Parsed_volumedetect_0 @ 0x1] max_volume: -6.4 dB';
    expect(parseVolumedetect(stderr)).toBeCloseTo(-6.4);
    expect(parseVolumedetect('no data')).toBeUndefined();
  });

  it('loudnorm JSON（多段取最后一次）', () => {
    const stderr = `
{ "input_i" : "-20.50", "input_tp" : "-3.20", "input_lra" : "7.10", "input_thresh" : "-30.40", "output_i" : "-14.00", ... }
{ "input_i" : "-18.20", "input_tp" : "-2.10", "input_lra" : "6.50", "input_thresh" : "-28.10", "output_i" : "-14.00", ... }
`;
    const r = parseLoudnormJson(stderr);
    expect(r?.inputI).toBeCloseTo(-18.2);
    expect(r?.inputTP).toBeCloseTo(-2.1);
    expect(parseLoudnormJson('nothing')).toBeUndefined();
  });
});

describe('参数模型', () => {
  it('默认参数按格式生成', () => {
    const mp3 = defaultParamsFor('mp3');
    expect(mp3.bitrateKbps).toBe(192);
    expect(mp3.sampleRate).toBe(0);
    const wav = defaultParamsFor('wav');
    expect(wav.bitDepth).toBe(16);
    expect(wav.bitrateKbps).toBeUndefined(); // wav 不支持比特率参数
    const flac = defaultParamsFor('flac');
    expect(flac.compressionLevelId).toBe('default');
  });

  it('deriveParams 保持源采样率或选择最接近值', () => {
    const p1 = deriveParams('wav', 'mp3', { sampleRate: 44100, channels: 2 });
    expect(p1.sampleRate).toBe(0); // mp3 支持 44.1k → 保持
    const p2 = deriveParams('wav', 'mp3', { sampleRate: 96000, channels: 6 });
    expect(p2.sampleRate).toBe(48000); // mp3 最高 48k
    expect(p2.channels).toBe(2); // mp3 不支持 6 声道
    const p3 = deriveParams('mp3', 'ac3', { sampleRate: 44100, channels: 2 });
    expect(p3.sampleRate).toBe(0);
  });

  it('validateParams 拦截非法值', () => {
    const p = defaultParamsFor('mp3');
    p.bitrateKbps = 999;
    expect(validateParams(p).length).toBeGreaterThan(0);

    const p2 = defaultParamsFor('mp3');
    p2.sampleRate = 12345;
    expect(validateParams(p2).some((e) => e.includes('采样率'))).toBe(true);

    const p3 = defaultParamsFor('mp3');
    p3.gainDb = 50;
    expect(validateParams(p3).some((e) => e.includes('增益'))).toBe(true);

    const p4 = defaultParamsFor('mp3');
    expect(validateParams(p4)).toHaveLength(0);
  });
});
