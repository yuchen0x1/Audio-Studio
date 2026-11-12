import { describe, it, expect } from 'vitest';
import { peaksFromBuffer } from '../audio/waveform';

/** 构造最小 AudioBuffer 替身（Node 环境无 Web Audio API） */
function fakeBuffer(channels: Float32Array[], sampleRate = 44100): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (c: number) => channels[c],
  } as unknown as AudioBuffer;
}

describe('peaksFromBuffer', () => {
  it('桶数被钳制在 [16, 16384]', () => {
    const buf = fakeBuffer([new Float32Array(1000)]);
    expect(peaksFromBuffer(buf, 1).buckets).toBe(16);
    expect(peaksFromBuffer(buf, 99999).buckets).toBe(16384);
  });

  it('peaks 长度 = buckets * 2（交错 min/max）', () => {
    const buf = fakeBuffer([new Float32Array(1000)]);
    const r = peaksFromBuffer(buf, 100);
    expect(r.peaks.length).toBe(r.buckets * 2);
  });

  it('正弦波峰值接近 ±1', () => {
    const n = 44100;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    const r = peaksFromBuffer(fakeBuffer([data]), 200);
    let globalMax = 0;
    let globalMin = 0;
    for (let i = 0; i < r.peaks.length; i += 2) {
      globalMin = Math.min(globalMin, r.peaks[i]);
      globalMax = Math.max(globalMax, r.peaks[i + 1]);
    }
    expect(globalMax).toBeGreaterThan(0.9);
    expect(globalMin).toBeLessThan(-0.9);
  });

  it('静音 buffer 峰值全为 0', () => {
    const r = peaksFromBuffer(fakeBuffer([new Float32Array(1000)]), 50);
    expect(r.peaks.every((v) => v === 0)).toBe(true);
  });

  it('多声道取平均（反相立体声 → 静音）', () => {
    const left = new Float32Array(1000).fill(0.8);
    const right = new Float32Array(1000).fill(-0.8);
    const r = peaksFromBuffer(fakeBuffer([left, right]), 50);
    expect(r.peaks.every((v) => Math.abs(v) < 1e-6)).toBe(true);
  });

  it('durationMs 来自 buffer.duration', () => {
    const buf = fakeBuffer([new Float32Array(44100)], 44100);
    expect(peaksFromBuffer(buf, 100).durationMs).toBe(1000);
  });

  it('每桶 min <= max', () => {
    const data = new Float32Array(5000);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const r = peaksFromBuffer(fakeBuffer([data]), 128);
    for (let b = 0; b < r.buckets; b++) {
      expect(r.peaks[b * 2]).toBeLessThanOrEqual(r.peaks[b * 2 + 1]);
    }
  });
});
