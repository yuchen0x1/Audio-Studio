/** 全局快捷键：跳过输入控件，避免与搜索框/参数编辑冲突。 */
import { useEffect } from 'react';
import { useNav, PAGE_ORDER, type PageId } from '../stores/nav';
import { useSession } from '../stores/session';

const DIRECT_PAGES: Record<string, PageId> = {
  '1': 'home',
  '2': 'convert',
  '3': 'batch',
  '4': 'clip',
  '5': 'merge',
  '6': 'analyze',
  '7': 'metadata',
  '8': 'history',
  '9': 'settings',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest('[role="dialog"]')
  );
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (isTypingTarget(e.target)) return;

      // 页面切换：Alt+1..9，不干扰浏览器标签快捷键
      if (e.altKey && !meta && DIRECT_PAGES[e.key]) {
        e.preventDefault();
        useNav.getState().goto(DIRECT_PAGES[e.key]);
        return;
      }

      if (!meta) {
        if (e.key === '[' || e.key === ']') {
          e.preventDefault();
          const current = PAGE_ORDER.indexOf(useNav.getState().page);
          const nextIndex = Math.max(
            0,
            Math.min(PAGE_ORDER.length - 1, current + (e.key === ']' ? 1 : -1)),
          );
          useNav.getState().goto(PAGE_ORDER[nextIndex]);
        }
        return;
      }

      const session = useSession.getState();
      const active = session.tasks.filter((t) =>
        ['queued', 'preparing', 'running', 'paused'].includes(t.status),
      );
      if (e.key === 'Enter') {
        e.preventDefault();
        if (active.length) active.forEach((t) => session.startTask(t.id));
        else session.startAll();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        active
          .filter((t) => ['queued', 'running', 'preparing'].includes(t.status))
          .forEach((t) => session.pauseTask(t.id));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        active.forEach((t) => session.cancelTask(t.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
