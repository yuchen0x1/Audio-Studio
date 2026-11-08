import { describe, it, expect } from 'vitest';
import { FORMATS, FORMAT_IDS, formatFromExtension, getFormat } from '../formats';

describe('格式注册系统', () => {
  it('13 种格式全部注册且字段完整', () => {
    expect(FORMAT_IDS).toHaveLength(13);
    for (const id of FORMAT_IDS) {
      const f = FORMATS[id];
      expect(f, `缺少格式 ${id}`).toBeDefined();
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.extensions.length).toBeGreaterThan(0);
      expect(f.encoderCandidates.length).toBeGreaterThan(0);
      expect(f.muxer.length).toBeGreaterThan(0);
      expect(f.sampleRates.length).toBeGreaterThan(0);
      expect(f.channels.length).toBeGreaterThan(0);
    }
  });

  it('无损格式声明正确', () => {
    expect(FORMATS.wav.lossless).toBe(true);
    expect(FORMATS.flac.lossless).toBe(true);
    expect(FORMATS.ape.lossless).toBe(true);
    expect(FORMATS.alac.lossless).toBe(true);
    expect(FORMATS.aiff.lossless).toBe(true);
    expect(FORMATS.mp3.lossless).toBe(false);
    expect(FORMATS.opus.lossless).toBe(false);
  });

  it('采样率列表升序且无重复', () => {
    for (const id of FORMAT_IDS) {
      const rates = FORMATS[id].sampleRates;
      const sorted = [...rates].sort((a, b) => a - b);
      expect(rates, `${id} 采样率未排序`).toEqual(sorted);
      expect(new Set(rates).size, `${id} 采样率重复`).toBe(rates.length);
    }
  });

  it('扩展名解析（含 m4a/alac 歧义）', () => {
    expect(formatFromExtension('song.mp3')).toBe('mp3');
    expect(formatFromExtension('song.FLAC')).toBe('flac');
    expect(formatFromExtension('录音.ape')).toBe('ape');
    expect(formatFromExtension('a.m4a')).toBe('m4a');
    expect(formatFromExtension('unknown.xyz')).toBeNull();
    expect(formatFromExtension('noext')).toBeNull();
  });

  it('getFormat 对未知 id 返回 null', () => {
    expect(getFormat('mp3')).not.toBeNull();
    expect(getFormat('xyz')).toBeNull();
    expect(getFormat(null)).toBeNull();
    expect(getFormat(undefined)).toBeNull();
  });

  it('每个格式的编码器候选非空且无重复', () => {
    for (const id of FORMAT_IDS) {
      const c = FORMATS[id].encoderCandidates;
      expect(new Set(c).size).toBe(c.length);
      for (const e of c) expect(e.trim()).toBe(e);
    }
  });
});
