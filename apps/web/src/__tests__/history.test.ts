import { describe, it, expect } from 'vitest';
import { filterHistory, type HistoryRecord } from '../stores/history';
import { defaultParamsFor } from '@audio-studio/shared';

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 't1',
    kind: 'convert',
    sourceLabel: 'song.mp3',
    targetFormat: 'wav',
    params: defaultParamsFor('wav'),
    fileName: 'song.wav',
    status: 'completed',
    createdAt: 1000,
    finishedAt: 2000,
    elapsedMs: 1000,
    ...over,
  };
}

const RECORDS: HistoryRecord[] = [
  rec({
    id: '1',
    sourceLabel: 'Alpha.mp3',
    fileName: 'Alpha.wav',
    kind: 'convert',
    status: 'completed',
    targetFormat: 'wav',
  }),
  rec({
    id: '2',
    sourceLabel: 'Beta.flac',
    fileName: 'Beta.mp3',
    kind: 'convert',
    status: 'failed',
    targetFormat: 'mp3',
  }),
  rec({
    id: '3',
    sourceLabel: 'Gamma.wav',
    fileName: 'Gamma_clip.wav',
    kind: 'trim',
    status: 'completed',
    targetFormat: 'wav',
  }),
  rec({
    id: '4',
    sourceLabel: 'Delta.ogg',
    fileName: 'Delta_merged.ogg',
    kind: 'merge',
    status: 'cancelled',
    targetFormat: 'ogg',
  }),
];

describe('filterHistory', () => {
  it('无筛选返回全部', () => {
    expect(filterHistory(RECORDS, '', 'all', 'all')).toHaveLength(4);
  });

  it('按状态筛选', () => {
    const r = filterHistory(RECORDS, '', 'completed', 'all');
    expect(r.map((x) => x.id)).toEqual(['1', '3']);
  });

  it('按类型筛选', () => {
    const r = filterHistory(RECORDS, '', 'all', 'trim');
    expect(r.map((x) => x.id)).toEqual(['3']);
  });

  it('状态 + 类型组合筛选', () => {
    const r = filterHistory(RECORDS, '', 'completed', 'convert');
    expect(r.map((x) => x.id)).toEqual(['1']);
  });

  it('搜索匹配源文件名（大小写不敏感）', () => {
    expect(filterHistory(RECORDS, 'alpha', 'all', 'all').map((x) => x.id)).toEqual(['1']);
  });

  it('搜索匹配输出文件名', () => {
    expect(filterHistory(RECORDS, 'merged', 'all', 'all').map((x) => x.id)).toEqual(['4']);
  });

  it('搜索匹配源文件名中的格式词', () => {
    expect(filterHistory(RECORDS, 'flac', 'all', 'all').map((x) => x.id)).toEqual(['2']);
    expect(filterHistory(RECORDS, 'beta', 'all', 'all').map((x) => x.id)).toEqual(['2']);
  });

  it('搜索词首尾空白被忽略', () => {
    expect(filterHistory(RECORDS, '  gamma  ', 'all', 'all').map((x) => x.id)).toEqual(['3']);
  });

  it('搜索 + 筛选同时生效', () => {
    const r = filterHistory(RECORDS, 'wav', 'completed', 'all');
    expect(r.map((x) => x.id)).toEqual(['1', '3']);
  });

  it('空记录返回空数组', () => {
    expect(filterHistory([], 'x', 'all', 'all')).toEqual([]);
  });
});
