/** 用户设置（localStorage 持久化），三平台语义一致 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FormatId } from '@audio-studio/shared';
import { DEFAULT_FILENAME_TEMPLATE } from '@audio-studio/shared';
import type { Lang } from '../i18n';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface SettingsState {
  defaultFormat: FormatId;
  defaultBitrateKbps: number;
  outputDirName: string;          // Web: 下载提示用；Desktop: 真实目录
  filenameTemplate: string;
  concurrency: number;            // 1..4
  theme: ThemeMode;
  lang: Lang;
  notifyOnDone: boolean;
  keepOriginal: boolean;          // 永不覆盖源文件（默认开启且不可关闭核心语义）
  autoDownload: boolean;          // Web: 完成后自动下载
  update: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

const DEFAULTS = {
  defaultFormat: 'mp3' as FormatId,
  defaultBitrateKbps: 192,
  outputDirName: 'AudioStudio',
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  concurrency: 2,
  theme: 'dark' as ThemeMode,
  lang: 'zh' as Lang,
  notifyOnDone: true,
  keepOriginal: true,
  autoDownload: false,
};

export const useSettings = create<SettingsState>()(persist(
  (set) => ({
    ...DEFAULTS,
    update: (patch) => set(patch),
    reset: () => set({ ...DEFAULTS }),
  }),
  {
    name: 'as-settings',
    partialize: (s) => ({
      defaultFormat: s.defaultFormat,
      defaultBitrateKbps: s.defaultBitrateKbps,
      outputDirName: s.outputDirName,
      filenameTemplate: s.filenameTemplate,
      concurrency: s.concurrency,
      theme: s.theme,
      lang: s.lang,
      notifyOnDone: s.notifyOnDone,
      keepOriginal: s.keepOriginal,
      autoDownload: s.autoDownload,
    }),
  },
));

/** 应用主题到 <html data-theme> */
export function applyTheme(mode: ThemeMode): void {
  const sysDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  const effective = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0b0d12' : '#f4f6fa');
}

export function watchSystemTheme(): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => undefined;
  const handler = () => {
    const { theme } = useSettings.getState();
    if (theme === 'system') applyTheme('system');
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
