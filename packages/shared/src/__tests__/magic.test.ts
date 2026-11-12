import { describe, it, expect } from 'vitest';
import { detectFormat, expectedFormatForExt } from '../magic';
import {
  sanitizeFileName,
  isPathUnsafe,
  isOutputNameSafe,
  validateFilenameTemplate,
  checkSizeLimit,
  WEB_SIZE_LIMIT,
  estimateWasmPeakBytes,
} from '../validation';
import { buildOutputFileName, applyTemplate } from '../naming';
import { FORMATS } from '../formats';
import { classifyEngineOutput, makeEngineError } from '../errors';
import { expandJob } from '../plan';
import type { TrimJob } from '../engine';
import { defaultParamsFor } from '../params';

function bytes(...arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}
function withAscii(s: string, len = 64): Uint8Array {
  const b = new Uint8Array(len);
  for (let i = 0; i < s.length && i < len; i++) b[i] = s.charCodeAt(i);
  return b;
}

describe('magic bytes 格式检测', () => {
  it('WAV', () => {
    const b = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(detectFormat(b).format).toBe('wav');
  });
  it('FLAC', () => {
    expect(detectFormat(withAscii('fLaC....')).format).toBe('flac');
  });
  it('OggS + OpusHead → opus', () => {
    const b = withAscii('OggS', 8);
    const full = new Uint8Array(64);
    full.set(b);
    full.set(new TextEncoder().encode('OpusHead'), 28);
    expect(detectFormat(full).format).toBe('opus');
  });
  it('OggS + vorbis → ogg', () => {
    const full = new Uint8Array(64);
    full.set(withAscii('OggS', 4));
    full.set(new TextEncoder().encode('\x01vorbis'), 28);
    expect(detectFormat(full).format).toBe('ogg');
  });
  it('ID3 → mp3', () => {
    expect(detectFormat(withAscii('ID3\x04\x00\x00')).format).toBe('mp3');
  });
  it('MP3 帧同步（无 ID3）→ mp3 likely', () => {
    const b = bytes(0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00);
    const r = detectFormat(b);
    expect(r.format).toBe('mp3');
    expect(r.confidence).toBe('likely');
  });
  it('MP4 ftyp M4A → m4a', () => {
    const b = new Uint8Array(16);
    b.set([0x00, 0x00, 0x00, 0x20]);
    b.set(withAscii('ftypM4A ', 8), 4);
    const r = detectFormat(b);
    expect(r.format).toBe('m4a');
    expect(r.confidence).toBe('certain');
  });
  it('AIFF', () => {
    const b = new Uint8Array(16);
    b.set(withAscii('FORM', 4));
    b.set(withAscii('AIFF', 4), 8);
    expect(detectFormat(b).format).toBe('aiff');
  });
  it('APE', () => {
    expect(detectFormat(withAscii('MAC 0500')).format).toBe('ape');
  });
  it('AMR', () => {
    expect(detectFormat(withAscii('#!AMR\n')).format).toBe('amr');
  });
  it('ASF GUID → wma', () => {
    const guid = [
      0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce,
      0x6c,
    ];
    expect(detectFormat(bytes(...guid, 0, 0, 0, 0)).format).toBe('wma');
  });
  it('未知数据 → null', () => {
    expect(detectFormat(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)).format).toBeNull();
    expect(detectFormat(bytes(1)).format).toBeNull();
  });
  it('扩展名映射', () => {
    expect(expectedFormatForExt('MP3')).toBe('mp3');
    expect(expectedFormatForExt('m4b')).toBe('m4a');
    expect(expectedFormatForExt('xyz')).toBeNull();
  });
});

describe('安全清洗与校验', () => {
  it('文件名清洗保留中文与空格，移除非法字符', () => {
    expect(sanitizeFileName('我的歌曲 <最终版>.mp3')).toBe('我的歌曲 _最终版_.mp3');
    expect(sanitizeFileName('a/b\\c:d*e?f"g|h')).toBe('a_b_c_d_e_f_g_h');
    expect(sanitizeFileName('  spaced  name  ')).toBe('spaced name');
  });
  it('结尾点/空格去除（Windows）', () => {
    expect(sanitizeFileName('name. ')).toBe('name');
  });
  it('Windows 保留名加前缀', () => {
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('nul.txt')).toBe('_nul.txt');
  });
  it('超长文件名截断且保留扩展名', () => {
    const long = 'x'.repeat(300) + '.mp3';
    const out = sanitizeFileName(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('.mp3')).toBe(true);
  });
  it('路径遍历检测', () => {
    expect(isPathUnsafe('a/../b')).toBe(true);
    expect(isPathUnsafe('..')).toBe(true);
    expect(isPathUnsafe('C:/music/out')).toBe(false);
    expect(isPathUnsafe('name\u0000')).toBe(true);
  });
  it('输出名安全', () => {
    expect(isOutputNameSafe('a_b.mp3')).toBe(true);
    expect(isOutputNameSafe('a/b.mp3')).toBe(false);
    expect(isOutputNameSafe('')).toBe(false);
  });
  it('模板校验', () => {
    expect(validateFilenameTemplate('{name}_{format}')).toBeNull();
    expect(validateFilenameTemplate('')).not.toBeNull();
    expect(validateFilenameTemplate('a/b')).not.toBeNull();
  });
  it('大小限制分级', () => {
    expect(checkSizeLimit(100, WEB_SIZE_LIMIT)).toBe('ok');
    expect(checkSizeLimit(300 * 1024 * 1024, WEB_SIZE_LIMIT)).toBe('warn');
    expect(checkSizeLimit(900 * 1024 * 1024, WEB_SIZE_LIMIT)).toBe('reject');
  });
  it('WASM 内存估算随大小增长', () => {
    const small = estimateWasmPeakBytes(10 * 1024 * 1024);
    const big = estimateWasmPeakBytes(500 * 1024 * 1024);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(64 * 1024 * 1024);
  });
});

describe('文件名模板', () => {
  const now = new Date(2026, 10, 8, 14, 5, 3);
  it('token 替换', () => {
    const name = applyTemplate('{name}_{format}_{date}_{time}', {
      sourceName: '现场录音',
      format: FORMATS.mp3,
      now,
    });
    expect(name).toBe('现场录音_mp3_20261108_140503');
  });
  it('索引与元数据 token', () => {
    const name = applyTemplate('{index}_{artist} - {title}', {
      sourceName: 'x',
      format: FORMATS.mp3,
      index: 3,
      tags: { artist: '坂本龍一', title: 'Energy Flow' },
    });
    expect(name).toBe('3_坂本龍一 - Energy Flow');
  });
  it('输出扩展名始终等于所选格式', () => {
    const ctx = { sourceName: 'song', format: FORMATS.wav };
    expect(buildOutputFileName('{name}', ctx)).toBe('song.wav');
    // 错误音频扩展名 → 替换
    expect(buildOutputFileName('{name}.mp3', ctx)).toBe('song.wav');
    // 非音频扩展名 → 追加
    expect(buildOutputFileName('{name}.bak', ctx)).toBe('song.bak.wav');
    // 已正确 → 保留
    expect(buildOutputFileName('{name}.wav', ctx)).toBe('song.wav');
  });
  it('空结果兜底', () => {
    expect(buildOutputFileName('///', { sourceName: 'a', format: FORMATS.mp3 })).toMatch(/\.mp3$/);
  });
});

describe('错误分类', () => {
  it('FFmpeg stderr → 错误码', () => {
    expect(classifyEngineOutput('Invalid data found when processing input')).toBe('E_CORRUPT_FILE');
    expect(classifyEngineOutput('Unknown encoder libfoo')).toBe('E_ENCODER_UNAVAILABLE');
    expect(classifyEngineOutput('No space left on device')).toBe('E_DISK_FULL');
    expect(classifyEngineOutput('Permission denied')).toBe('E_PERMISSION');
    expect(classifyEngineOutput('something odd')).toBe('E_UNKNOWN');
  });
  it('错误对象带默认消息与可重试标记', () => {
    const e = makeEngineError('E_DISK_FULL', 'path x');
    expect(e.code).toBe('E_DISK_FULL');
    expect(e.retryable).toBe(true);
    expect(e.message).toContain('磁盘');
    expect(makeEngineError('E_CORRUPT_FILE').retryable).toBe(false);
  });
});

describe('多片段裁剪展开', () => {
  const base: TrimJob = {
    kind: 'trim',
    taskId: 'seg',
    source: { id: 's', name: 'a.mp3', sizeBytes: 1 },
    startMs: 1000,
    endMs: 10000,
    splitPointsMs: [4000, 7000],
    exportSegments: true,
    params: defaultParamsFor('mp3'),
    outputFileName: 'part.mp3',
    outputDir: 'o',
  };
  it('按分割点展开为独立作业', () => {
    const jobs = expandJob(base) as TrimJob[];
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => [j.startMs, j.endMs])).toEqual([
      [1000, 4000],
      [4000, 7000],
      [7000, 10000],
    ]);
    expect(jobs[0].outputFileName).toBe('part_seg01.mp3');
    expect(jobs[2].outputFileName).toBe('part_seg03.mp3');
    expect(jobs[0].taskId).not.toBe(jobs[1].taskId);
  });
  it('非分段裁剪原样返回', () => {
    const single = { ...base, splitPointsMs: undefined, exportSegments: false };
    expect(expandJob(single)).toHaveLength(1);
  });
  it('空区间抛错', () => {
    expect(() => expandJob({ ...base, splitPointsMs: [], endMs: 1000 })).toThrow(/空/);
  });
});
