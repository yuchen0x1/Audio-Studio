import { describe, expect, it } from 'vitest';
import {
  ENCODE_PRESETS,
  paramsForPreset,
  defaultParamsFor,
  validateParams,
  buildConvertArgs,
} from '../index';

describe('用途预设', () => {
  it.each(ENCODE_PRESETS)('$id 生成可执行参数，并保留用户命名规则', ({ id }) => {
    const current = { ...defaultParamsFor('wav'), filenameTemplate: '{name}_export' };
    const params = paramsForPreset(id, current);
    expect(validateParams(params)).toEqual([]);
    expect(params.filenameTemplate).toBe('{name}_export');
    expect(
      buildConvertArgs({
        kind: 'convert',
        taskId: 'preset',
        source: { id: 'source', name: 'source.wav', sizeBytes: 20 },
        params,
        outputDir: 'out',
        outputFileName: `result.${params.format}`,
      }),
    ).toContain('-c:a');
    expect(current.format).toBe('wav');
  });

  it('语音预设明确重采样、下混，禁用旧音效与编码器覆盖', () => {
    const current = {
      ...defaultParamsFor('wav'),
      encoder: 'pcm_s24le',
      gainDb: 10,
      fadeOutMs: 500,
    };
    const params = paramsForPreset('voice', current);
    expect(params).toMatchObject({
      format: 'opus',
      bitrateKbps: 64,
      sampleRate: 48000,
      channels: 1,
      gainDb: 0,
      fadeOutMs: 0,
      normalize: { enabled: false },
    });
    expect(params.encoder).toBeUndefined();
  });

  it('无损存档保留源 24-bit，未知源使用 24-bit', () => {
    expect(paramsForPreset('archive', defaultParamsFor('mp3'), { bitDepth: 24 }).bitDepth).toBe(24);
    expect(paramsForPreset('archive', defaultParamsFor('mp3')).bitDepth).toBe(24);
    expect(paramsForPreset('archive', defaultParamsFor('mp3'), { bitDepth: 'f32' }).bitDepth).toBe(
      24,
    );
    expect(paramsForPreset('archive', defaultParamsFor('mp3'), { bitDepth: 16 }).bitDepth).toBe(16);
  });

  it('每次返回独立的嵌套参数', () => {
    const first = paramsForPreset('voice', defaultParamsFor('mp3'));
    first.normalize.enabled = true;
    expect(paramsForPreset('voice', defaultParamsFor('mp3')).normalize.enabled).toBe(false);
  });
});
