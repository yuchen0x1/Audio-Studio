import { describe, it, expect, beforeEach } from 'vitest';
import { useSettings } from '../stores/settings';
import { DEFAULT_FILENAME_TEMPLATE } from '@audio-studio/shared';

beforeEach(() => {
  useSettings.getState().reset();
});

describe('settings store', () => {
  it('默认值符合预期', () => {
    const s = useSettings.getState();
    expect(s.defaultFormat).toBe('mp3');
    expect(s.defaultBitrateKbps).toBe(192);
    expect(s.concurrency).toBe(2);
    expect(s.filenameTemplate).toBe(DEFAULT_FILENAME_TEMPLATE);
    expect(s.keepOriginal).toBe(true);
    expect(s.autoCheckUpdates).toBe(true);
    expect(s.lang).toBe('zh');
  });

  it('update 局部更新不影响其他字段', () => {
    useSettings
      .getState()
      .update({ defaultFormat: 'flac', concurrency: 4, autoCheckUpdates: false });
    const s = useSettings.getState();
    expect(s.defaultFormat).toBe('flac');
    expect(s.concurrency).toBe(4);
    expect(s.defaultBitrateKbps).toBe(192);
    expect(s.autoCheckUpdates).toBe(false);
  });

  it('reset 恢复全部默认值', () => {
    useSettings.getState().update({ defaultFormat: 'opus', lang: 'en', autoDownload: true });
    useSettings.getState().reset();
    const s = useSettings.getState();
    expect(s.defaultFormat).toBe('mp3');
    expect(s.lang).toBe('zh');
    expect(s.autoDownload).toBe(false);
    expect(s.autoCheckUpdates).toBe(true);
  });

  it('切换语言与主题', () => {
    useSettings.getState().update({ lang: 'en', theme: 'light' });
    expect(useSettings.getState().lang).toBe('en');
    expect(useSettings.getState().theme).toBe('light');
  });
});
