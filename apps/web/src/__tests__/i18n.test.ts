import { describe, it, expect } from 'vitest';
import { DICTS, translate } from '../i18n';

describe('i18n 词典完整性', () => {
  it('中英文 key 集合完全一致', () => {
    const zhKeys = Object.keys(DICTS.zh).sort();
    const enKeys = Object.keys(DICTS.en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('没有空文案', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [key, value] of Object.entries(DICTS[lang])) {
        expect(value.trim(), `${lang}:${key} 为空`).not.toBe('');
      }
    }
  });

  it('key 数量达到完整 UI 覆盖量级', () => {
    // 防止误删整段词典导致界面大面积回退到 key
    expect(Object.keys(DICTS.zh).length).toBeGreaterThan(200);
  });
});

describe('translate', () => {
  it('按语言返回对应文案', () => {
    expect(translate('zh', 'nav.home')).toBe('首页');
    expect(translate('en', 'nav.home')).toBe('Home');
    expect(translate('zh', 'updates.available', { version: 'v0.2.0' })).toBe('发现新版本 v0.2.0');
    expect(translate('en', 'updates.available', { version: 'v0.2.0' })).toBe(
      'Version v0.2.0 is available',
    );
  });

  it('替换 {var} 占位符', () => {
    expect(translate('zh', 'settings.capabilitiesCount', { n: 78 })).toBe('78 个编码器可用');
    expect(translate('en', 'settings.capabilitiesCount', { n: 78 })).toBe('78 encoders available');
  });

  it('未知 key 回退为 key 本身', () => {
    const unknown = 'not.exist.key' as never;
    expect(translate('zh', unknown)).toBe('not.exist.key');
  });
});
