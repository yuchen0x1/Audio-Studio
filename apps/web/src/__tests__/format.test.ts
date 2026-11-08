import { describe, it, expect } from 'vitest';
import {
  fmtDuration, fmtDurationMs, parseTimeInput, fmtSize,
  fmtBitrate, fmtSampleRate, fmtChannels, fmtPercent, fmtElapsed,
} from '../utils/format';

describe('fmtDuration', () => {
  it('非法输入返回占位符', () => {
    expect(fmtDuration(undefined)).toBe('--:--');
    expect(fmtDuration(Number.NaN)).toBe('--:--');
    expect(fmtDuration(-1)).toBe('--:--');
  });

  it('小于一小时输出 mm:ss', () => {
    expect(fmtDuration(0)).toBe('00:00');
    expect(fmtDuration(59_999)).toBe('00:59');
    expect(fmtDuration(65_000)).toBe('01:05');
    expect(fmtDuration(3_599_000)).toBe('59:59');
  });

  it('超过一小时输出 h:mm:ss', () => {
    expect(fmtDuration(3_600_000)).toBe('1:00:00');
    expect(fmtDuration(3_661_000)).toBe('1:01:01');
  });
});

describe('fmtDurationMs', () => {
  it('保留毫秒三位', () => {
    expect(fmtDurationMs(0)).toBe('00:00.000');
    expect(fmtDurationMs(61_234)).toBe('01:01.234');
    expect(fmtDurationMs(5)).toBe('00:00.005');
  });

  it('非法输入归零', () => {
    expect(fmtDurationMs(-5)).toBe('00:00.000');
    expect(fmtDurationMs(Number.NaN)).toBe('00:00.000');
  });
});

describe('parseTimeInput', () => {
  it('纯数字按毫秒解析', () => {
    expect(parseTimeInput('1234')).toBe(1234);
    expect(parseTimeInput('12.6')).toBe(13);
  });

  it('mm:ss 与 mm:ss.mmm', () => {
    expect(parseTimeInput('1:05')).toBe(65_000);
    expect(parseTimeInput('01:05.5')).toBe(65_500);
    expect(parseTimeInput('0:00.123')).toBe(123);
  });

  it('非法输入返回 null', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('1:75')).toBeNull(); // 秒数越界
    expect(parseTimeInput('1:5:3')).toBeNull();
  });
});

describe('fmtSize', () => {
  it('按单位换算', () => {
    expect(fmtSize(0)).toBe('0 B');
    expect(fmtSize(1023)).toBe('1023 B');
    expect(fmtSize(1024)).toBe('1.0 KB');
    expect(fmtSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
    expect(fmtSize(1024 ** 3 * 2)).toBe('2.00 GB');
  });

  it('非法输入返回占位符', () => {
    expect(fmtSize(undefined)).toBe('--');
    expect(fmtSize(-1)).toBe('--');
  });
});

describe('其余展示格式化', () => {
  it('fmtBitrate', () => {
    expect(fmtBitrate(192)).toBe('192 kbps');
    expect(fmtBitrate(undefined)).toBe('--');
  });

  it('fmtSampleRate', () => {
    expect(fmtSampleRate(44_100)).toBe('44.10 kHz');
    expect(fmtSampleRate(48_000)).toBe('48.0 kHz');
    expect(fmtSampleRate(0)).toBe('--');
  });

  it('fmtChannels 优先使用布局名', () => {
    expect(fmtChannels(2)).toBe('Stereo');
    expect(fmtChannels(1)).toBe('Mono');
    expect(fmtChannels(6)).toBe('6 ch');
    expect(fmtChannels(2, 'stereo')).toBe('stereo');
    expect(fmtChannels(undefined)).toBe('--');
  });

  it('fmtPercent 自动夹紧到 0..1', () => {
    expect(fmtPercent(0)).toBe('0%');
    expect(fmtPercent(0.5)).toBe('50%');
    expect(fmtPercent(1.5)).toBe('100%');
    expect(fmtPercent(-1)).toBe('0%');
  });

  it('fmtElapsed 按量级切换单位', () => {
    expect(fmtElapsed(120)).toBe('120ms');
    expect(fmtElapsed(1500)).toBe('1.5s');
    expect(fmtElapsed(125_000)).toBe('2m5s');
  });
});
