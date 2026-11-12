/** 应用外壳：侧边导航 + 顶栏 + 状态栏（响应式，窄屏抽屉式侧栏） */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNav, type PageId } from '../stores/nav';
import { useSession } from '../stores/session';
import { useSettings, applyTheme, watchSystemTheme } from '../stores/settings';
import { useI18n, useT, type MessageKey } from '../i18n';
import { usePlayer } from '../stores/player';
import { isDesktop } from '../platform';
import {
  IconHome,
  IconConvert,
  IconBatch,
  IconClip,
  IconMerge,
  IconAnalyze,
  IconMetadata,
  IconHistory,
  IconSettings,
  IconMenu,
  IconClose,
  IconWave,
  IconSun,
  IconMoon,
} from './Icons';

type IconComp = (p: { size?: number }) => React.ReactElement;

interface NavEntry {
  id: PageId;
  labelKey: MessageKey;
  icon: IconComp;
}

const SECTIONS: Array<{ titleKey: MessageKey; items: NavEntry[] }> = [
  {
    titleKey: 'nav.section.work',
    items: [
      { id: 'home', labelKey: 'nav.home', icon: IconHome },
      { id: 'convert', labelKey: 'nav.convert', icon: IconConvert },
      { id: 'batch', labelKey: 'nav.batch', icon: IconBatch },
    ],
  },
  {
    titleKey: 'nav.section.tools',
    items: [
      { id: 'clip', labelKey: 'nav.clip', icon: IconClip },
      { id: 'merge', labelKey: 'nav.merge', icon: IconMerge },
      { id: 'analyze', labelKey: 'nav.analyze', icon: IconAnalyze },
      { id: 'metadata', labelKey: 'nav.metadata', icon: IconMetadata },
    ],
  },
  {
    titleKey: 'nav.section.data',
    items: [
      { id: 'history', labelKey: 'nav.history', icon: IconHistory },
      { id: 'settings', labelKey: 'nav.settings', icon: IconSettings },
    ],
  },
];

const PAGE_TITLES: Record<PageId, MessageKey> = {
  home: 'nav.home',
  convert: 'nav.convert',
  batch: 'nav.batch',
  clip: 'nav.clip',
  merge: 'nav.merge',
  analyze: 'nav.analyze',
  metadata: 'nav.metadata',
  history: 'nav.history',
  settings: 'nav.settings',
};

const PAGE_SUBS: Partial<Record<PageId, MessageKey>> = {
  home: 'home.greeting',
  convert: 'convert.title',
  batch: 'batch.title',
  clip: 'clip.desc',
  merge: 'merge.desc',
  analyze: 'analyze.desc',
  metadata: 'meta.desc',
  history: 'history.desc',
  settings: 'settings.title',
};

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const page = useNav((s) => s.page);
  const goto = useNav((s) => s.goto);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tasks = useSession((s) => s.tasks);
  const engineState = useSession((s) => s.engineState);

  // 主题（挂载时应用 + 监听系统主题）
  useEffect(() => {
    applyTheme(useSettings.getState().theme);
    return watchSystemTheme();
  }, []);

  // 路由变化时收起窄屏侧栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [page]);

  // 窄屏下根据容器宽度决定菜单按钮显隐（CSS 控制），这里只管状态
  const runningCount = useMemo(
    () => tasks.filter((x) => x.status === 'running' || x.status === 'preparing').length,
    [tasks],
  );

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside id="app-sidebar" className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">
            <IconWave size={17} />
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="brand-name">Audio Studio</div>
            <div className="brand-sub">{t('app.tagline')}</div>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('aria.closeMenu')}
          >
            <IconClose size={15} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label={t('aria.mainNav')}>
          {SECTIONS.map((sec) => (
            <div key={sec.titleKey}>
              <div className="nav-section-title">{t(sec.titleKey)}</div>
              {sec.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`nav-item${page === item.id ? ' active' : ''}`}
                    onClick={() => goto(item.id)}
                    aria-current={page === item.id ? 'page' : undefined}
                  >
                    <span className="nav-icon">
                      <Icon size={17} />
                    </span>
                    {t(item.labelKey)}
                    {item.id === 'batch' && runningCount > 0 && (
                      <span className="nav-badge">{runningCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span
            className={`status-dot ${
              engineState === 'ready'
                ? 'ok'
                : engineState === 'error'
                  ? 'err'
                  : engineState === 'initializing'
                    ? 'busy'
                    : ''
            }`}
          >
            {t(
              engineState === 'ready'
                ? 'engine.ready'
                : engineState === 'error'
                  ? 'engine.error'
                  : engineState === 'initializing'
                    ? 'engine.initializing'
                    : 'engine.idle',
            )}
          </span>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon topbar-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={t('aria.menu')}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
          >
            <IconMenu size={18} />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="topbar-title truncate">{t(PAGE_TITLES[page])}</div>
            {PAGE_SUBS[page] && <div className="topbar-sub truncate">{t(PAGE_SUBS[page]!)}</div>}
          </div>
          <TopbarActions />
        </header>

        <main className="page-scroll">{children}</main>
      </div>

      <StatusBar />
    </div>
  );
}

function TopbarActions() {
  const t = useT();
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  const toggleTheme = () => {
    const eff =
      theme === 'system'
        ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    const next = eff === 'dark' ? 'light' : 'dark';
    update({ theme: next });
    applyTheme(next);
  };

  return (
    <div className="row" style={{ gap: 'var(--sp-2)', flex: 'none' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        title={t('aria.language')}
        aria-label={t('aria.language')}
        aria-pressed={lang === 'en'}
      >
        {lang === 'zh' ? '中' : 'EN'}
      </button>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        title={t('aria.toggleTheme')}
        aria-label={t('aria.toggleTheme')}
        aria-pressed={theme === 'light'}
        onClick={toggleTheme}
      >
        {theme === 'light' ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
    </div>
  );
}

function StatusBar() {
  const t = useT();
  const tasks = useSession((s) => s.tasks);
  const engineState = useSession((s) => s.engineState);
  const running = tasks.filter((x) => x.status === 'running' || x.status === 'preparing').length;
  const done = tasks.filter((x) => x.status === 'completed').length;
  const failed = tasks.filter((x) => x.status === 'failed').length;
  const playing = usePlayer((s) => s.playing);

  return (
    <footer className="statusbar">
      <span className="sb-item">
        <span
          className={`status-dot ${engineState === 'ready' ? 'ok' : engineState === 'error' ? 'err' : engineState === 'initializing' ? 'busy' : ''}`}
          style={{ fontSize: 'inherit' }}
        />
        {t(
          engineState === 'ready'
            ? 'engine.ready'
            : engineState === 'error'
              ? 'engine.error'
              : engineState === 'initializing'
                ? 'engine.initializing'
                : 'engine.idle',
        )}
      </span>
      <span className="sb-item">
        {t('engine.tasks')}: {running} / {tasks.length}
      </span>
      {done > 0 && (
        <span className="sb-item" style={{ color: 'var(--success)' }}>
          ✓ {done}
        </span>
      )}
      {failed > 0 && (
        <span className="sb-item" style={{ color: 'var(--danger)' }}>
          ✕ {failed}
        </span>
      )}
      <span className="sb-right">
        {playing && <span className="sb-item">{t('player.play')}…</span>}
        <span className="sb-item">{isDesktop ? 'Windows Desktop' : 'Web · 本地处理'}</span>
        <span className="sb-item">v{__APP_VERSION__}</span>
      </span>
    </footer>
  );
}
