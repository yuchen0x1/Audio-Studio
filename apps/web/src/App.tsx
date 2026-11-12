/**
 * 应用根组件：路由分发 + 外壳 + 全局层（Toast / 播放器 / 主题）。
 */
import { Suspense, lazy, useEffect } from 'react';
import { useNav } from './stores/nav';
import { useSession } from './stores/session';
import { useSettings, applyTheme, watchSystemTheme } from './stores/settings';
import { useHistory } from './stores/history';
import { useI18n, useT } from './i18n';
import { Shell } from './components/Shell';
import { ToastHost } from './components/ToastHost';
import { PlayerBar } from './components/PlayerBar';
import { UpdatePrompt } from './components/UpdatePrompt';
import { startUpdateMonitor } from './updates';
import { HomePage } from './pages/HomePage';
import { ConvertPage } from './pages/ConvertPage';
import { BatchPage } from './pages/BatchPage';
import { ClipPage } from './pages/ClipPage';
import { MergePage } from './pages/MergePage';

// CRUD 页面（独立开发，懒加载减小首屏）
const AnalyzePage = lazy(() =>
  import('./pages/AnalyzePage').then((m) => ({ default: m.AnalyzePage })),
);
const MetadataPage = lazy(() =>
  import('./pages/MetadataPage').then((m) => ({ default: m.MetadataPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function PageFallback() {
  const t = useT();
  return (
    <div className="page-container">
      <div className="empty" role="status" aria-label={t('common.loading')}>
        <span className="spinner" />
        <div className="empty-desc">…</div>
      </div>
    </div>
  );
}

export default function App() {
  const page = useNav((s) => s.page);
  const ensureEngine = useSession((s) => s.ensureEngine);
  const loadHistory = useHistory((s) => s.load);
  const lang = useI18n((s) => s.lang);

  // 启动：主题、语言、历史、引擎预热
  useEffect(() => {
    applyTheme(useSettings.getState().theme);
    const unwatch = watchSystemTheme();
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    void loadHistory();
    const stopUpdateMonitor = startUpdateMonitor(__APP_VERSION__);
    return () => {
      unwatch();
      stopUpdateMonitor();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  }, [lang]);

  // 引擎预热：首页空闲时初始化（导入时也会 ensure，这里只是提前）
  useEffect(() => {
    const timer = setTimeout(() => {
      void ensureEngine().catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [ensureEngine]);

  return (
    <>
      <Shell>
        <Suspense fallback={<PageFallback />}>
          {page === 'home' && <HomePage />}
          {page === 'convert' && <ConvertPage />}
          {page === 'batch' && <BatchPage />}
          {page === 'clip' && <ClipPage />}
          {page === 'merge' && <MergePage />}
          {page === 'analyze' && <AnalyzePage />}
          {page === 'metadata' && <MetadataPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'settings' && <SettingsPage />}
        </Suspense>
      </Shell>
      <PlayerBar />
      <ToastHost />
      <UpdatePrompt />
    </>
  );
}
