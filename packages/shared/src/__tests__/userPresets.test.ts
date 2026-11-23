import { describe, it, expect } from 'vitest';
import {
  MAX_USER_PRESETS,
  createUserPresetId,
  parseUserPresets,
  serializeUserPresets,
  updateUserPreset,
  validateUserPreset,
  type UserPreset,
} from '../userPresets';
import { defaultParamsFor } from '../params';

function preset(over: Partial<UserPreset> = {}): UserPreset {
  return {
    id: createUserPresetId(),
    name: 'Podcast',
    params: { ...defaultParamsFor('mp3'), bitrateKbps: 128 },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe('user presets', () => {
  it('创建与校验合法预设', () => {
    const p = preset();
    const result = validateUserPreset(p);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset.name).toBe('Podcast');
      expect(result.preset.params.format).toBe('mp3');
    }
  });

  it('拒绝空名称与非法参数', () => {
    expect(validateUserPreset(preset({ name: ' ' })).ok).toBe(false);
    expect(
      validateUserPreset({
        ...preset(),
        params: { ...defaultParamsFor('mp3'), format: 'not-a-format' },
      }).ok,
    ).toBe(false);
  });

  it('归一化时以格式默认值补齐缺失字段', () => {
    const result = validateUserPreset({
      id: 'up_abcdef',
      name: 'Minimal',
      params: { format: 'flac' },
      createdAt: 1,
      updatedAt: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preset.params.filenameTemplate).toBeTruthy();
      expect(result.preset.params.normalize.enabled).toBe(false);
      expect(result.preset.params.bitDepth).toBe(16);
    }
  });

  it('导出再导入保持参数一致', () => {
    const p = preset({ description: 'Voice chain' });
    const parsed = parseUserPresets(serializeUserPresets([p]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(p.id);
    expect(parsed[0].params.bitrateKbps).toBe(128);
    expect(parsed[0].description).toBe('Voice chain');
  });

  it('拒绝损坏 JSON 与超限量', () => {
    expect(() => parseUserPresets('{oops')).toThrow('预设文件不是有效 JSON');
    const many = Array.from({ length: MAX_USER_PRESETS + 1 }, (_, i) =>
      preset({ id: `up_test_${i}`, name: `P${i}` }),
    );
    expect(() => parseUserPresets(JSON.stringify({ presets: many }))).toThrow('预设数量超过上限');
  });

  it('导入时遇到一个非法项就整体拒绝，避免半有效状态', () => {
    const good = preset();
    expect(() =>
      parseUserPresets(JSON.stringify({ presets: [good, { id: 'bad', name: '' }] })),
    ).toThrow();
  });

  it('更新保留 id 与创建时间，并刷新 updatedAt', () => {
    const p = preset({ createdAt: 5, updatedAt: 5 });
    const [next] = updateUserPreset([p], p.id, { name: '  Interview  ' });
    expect(next.id).toBe(p.id);
    expect(next.name).toBe('Interview');
    expect(next.createdAt).toBe(5);
    expect(next.updatedAt).toBeGreaterThan(5);
  });
});
