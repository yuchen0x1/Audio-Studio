import { describe, expect, it } from 'vitest';
import { parseEncoders, parseFilters, parseMuxers } from '../capabilities';

describe('parseFilters', () => {
  it('解析标准 3 列标志的过滤器列表', () => {
    const out = [
      'Filters:',
      '  T.. = Timeline support',
      '  .C. = Slice threading',
      '  A = Audio input/output',
      ' ------',
      ' ..C afade              V->A       Apply fade-in/out effect',
      ' ... volume             A->A       Change input volume',
    ].join('\n');

    const names = parseFilters(out);
    expect(names).toContain('afade');
    expect(names).toContain('volume');
    // 表头与说明行不能被当成过滤器
    expect(names).not.toContain('=');
    expect(names).not.toContain('Timeline');
  });

  it('兼容标志列变宽（4 列）与源/汇过滤器', () => {
    const out = [
      ' TSC afreqshift         A->A       Apply frequency shifting',
      ' N.. anoisesrc          |->A       Generate a noise audio signal',
    ].join('\n');

    const names = parseFilters(out);
    expect(names).toContain('afreqshift');
    expect(names).toContain('anoisesrc');
  });

  it('忽略反向行与非法行', () => {
    const out = [' A->A not-a-filter-line', '', 'garbage'].join('\n');
    expect(parseFilters(out)).toEqual([]);
  });

  it('同名过滤器只保留一次', () => {
    const out = [' ... volume             A->A  one', ' ... volume             A->A  two'].join('\n');
    expect(parseFilters(out)).toEqual(['volume']);
  });
});

describe('parseEncoders', () => {
  it('只收集音频编码器', () => {
    const out = [
      'Encoders:',
      ' V..... = Video',
      ' A....D libmp3lame      libMP3lame',
      ' A....D aac             AAC (Advanced Audio Coding)',
      ' V....D libx264         libx264 H.264',
    ].join('\n');

    expect(parseEncoders(out)).toEqual(['libmp3lame', 'aac']);
  });
});

describe('parseMuxers', () => {
  it('解析封装器与解封装器', () => {
    const out = [' E mp3            MP3 (MPEG audio layer III)', ' D wav            WAV'].join('\n');
    expect(parseMuxers(out)).toEqual(['mp3', 'wav']);
  });
});
