import { describe, it, expect } from 'vitest';
import { parseProbeOutput, toProbeResult } from '../engine/parseProbe';

const MP3_STDERR = `Input #0, mp3, from 'test.mp3':
  Metadata:
    title           : Test Song
    artist          : Test Artist
  Duration: 00:03:25.50, start: 0.000000, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
`;

const WAV_STDERR = `Input #0, wav, from 'test.wav':
  Duration: 00:01:00.00, start: 0.000000, bitrate: 1411 kb/s
  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, 2 channels, s16, 1411 kb/s
`;

const FLAC_WITH_COVER = `Input #0, flac, from 'test.flac':
  Metadata:
    ALBUM           : Test Album
  Duration: 00:04:00.00, start: 0.000000, bitrate: 900 kb/s
  Stream #0:0: Audio: flac, 48000 Hz, stereo, s32 (24 bit)
  Stream #0:1: Video: mjpeg (Baseline), yuvj444p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached picture)
`;

describe('parseProbeOutput', () => {
  it('解析 MP3 容器、时长、码率', () => {
    const p = parseProbeOutput(MP3_STDERR);
    expect(p.container).toBe('mp3');
    expect(p.durationMs).toBe(205500);
    expect(p.bitrateKbps).toBe(320);
  });

  it('解析 MP3 音频流参数', () => {
    const p = parseProbeOutput(MP3_STDERR);
    expect(p.audio?.codec).toBe('mp3');
    expect(p.audio?.sampleRate).toBe(44100);
    expect(p.audio?.channels).toBe(2);
    expect(p.audio?.channelLayout).toBe('stereo');
    expect(p.audio?.bitrateKbps).toBe(320);
  });

  it('解析格式级 metadata', () => {
    const p = parseProbeOutput(MP3_STDERR);
    expect(p.tags.title).toBe('Test Song');
    expect(p.tags.artist).toBe('Test Artist');
  });

  it('解析 WAV pcm_s16le 位深度（从 codec 名推断）', () => {
    const p = parseProbeOutput(WAV_STDERR);
    expect(p.audio?.codec).toBe('pcm_s16le');
    expect(p.audio?.bitDepth).toBe(16);
    expect(p.audio?.channels).toBe(2);
  });

  it('解析 "2 channels" 布局', () => {
    const p = parseProbeOutput(WAV_STDERR);
    expect(p.audio?.channels).toBe(2);
  });

  it('识别 attached picture 封面流', () => {
    const p = parseProbeOutput(FLAC_WITH_COVER);
    expect(p.videoStreams).toHaveLength(1);
    expect(p.videoStreams[0].isAttachedPicture).toBe(true);
    expect(p.videoStreams[0].codec).toBe('mjpeg');
  });

  it('FLAC 24bit 从 sample_fmt 推断位深度', () => {
    const p = parseProbeOutput(FLAC_WITH_COVER);
    expect(p.audio?.bitDepth).toBe(24);
    expect(p.audio?.sampleRate).toBe(48000);
  });

  it('Duration N/A 产生警告', () => {
    const p = parseProbeOutput(`Input #0, mp3, from 'x.mp3':
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
`);
    expect(p.durationMs).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('时长未知'))).toBe(true);
  });

  it('无音频流时产生警告', () => {
    const p = parseProbeOutput(`Input #0, avi, from 'x.avi':
  Duration: 00:01:00.00, bitrate: 1000 kb/s
  Stream #0:0: Video: mpeg4, yuv420p, 640x480
`);
    expect(p.audio).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('未找到音频流'))).toBe(true);
  });

  it('mono 布局解析为单声道', () => {
    const p = parseProbeOutput(`Input #0, wav, from 'x.wav':
  Stream #0:0: Audio: pcm_s16le, 22050 Hz, mono, s16, 352 kb/s
`);
    expect(p.audio?.channels).toBe(1);
    expect(p.audio?.channelLayout).toBe('mono');
  });

  it('5.1 环绕声布局', () => {
    const p = parseProbeOutput(`Input #0, ac3, from 'x.ac3':
  Stream #0:0: Audio: ac3, 48000 Hz, 5.1(side), fltp, 384 kb/s
`);
    expect(p.audio?.channels).toBe(6);
    expect(p.audio?.channelLayout).toBe('5.1(side)');
  });

  it('AAC LC 括号后缀被剥离', () => {
    const p = parseProbeOutput(`Input #0, mov,mp4,m4a, from 'x.m4a':
  Stream #0:0: Audio: aac (LC), 44100 Hz, stereo, fltp, 128 kb/s
`);
    expect(p.audio?.codec).toBe('aac');
  });

  it('Output 行之后不再解析（防御）', () => {
    const p = parseProbeOutput(`Input #0, mp3, from 'x.mp3':
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
Output #0, wav, to 'y.wav':
  Stream #0:0: Audio: pcm_s16le, 48000 Hz, stereo, s16, 1536 kb/s
`);
    expect(p.audio?.sampleRate).toBe(44100);
  });

  it('保留原始输出用于诊断', () => {
    const p = parseProbeOutput(MP3_STDERR);
    expect(p.raw).toBe(MP3_STDERR);
  });
});

describe('toProbeResult', () => {
  it('组装完整 ProbeResult', () => {
    const parsed = parseProbeOutput(MP3_STDERR);
    const r = toProbeResult(parsed, { fileSizeBytes: 8220000, format: 'mp3' });
    expect(r.format).toBe('mp3');
    expect(r.codec).toBe('mp3');
    expect(r.container).toBe('mp3');
    expect(r.durationMs).toBe(205500);
    expect(r.fileSizeBytes).toBe(8220000);
    expect(r.tags.title).toBe('Test Song');
    expect(r.sampleRate).toBe(44100);
  });

  it('音频流码率优先于容器码率', () => {
    const parsed = parseProbeOutput(MP3_STDERR);
    parsed.bitrateKbps = 999;
    const r = toProbeResult(parsed, { fileSizeBytes: 100, format: 'mp3' });
    expect(r.bitrateKbps).toBe(320);
  });

  it('无音频流时 codec 为 unknown', () => {
    const parsed = parseProbeOutput('');
    const r = toProbeResult(parsed, { fileSizeBytes: 0, format: null });
    expect(r.codec).toBe('unknown');
    expect(r.format).toBeNull();
  });

  it('传递 extensionMismatch 与 coverArt', () => {
    const parsed = parseProbeOutput(MP3_STDERR);
    const cover = { mime: 'image/jpeg', data: new Uint8Array([1, 2, 3]) };
    const r = toProbeResult(parsed, {
      fileSizeBytes: 100,
      format: 'mp3',
      extensionMismatch: { declared: 'wav', actual: 'mp3' },
      coverArt: cover,
    });
    expect(r.extensionMismatch?.declared).toBe('wav');
    expect(r.coverArt).toBe(cover);
  });
});
