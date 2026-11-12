/** 简单 hash 路由（无第三方依赖），支持浏览器前进后退 */
import { create } from 'zustand';

export type PageId =
  'home' | 'convert' | 'batch' | 'clip' | 'merge' | 'analyze' | 'metadata' | 'history' | 'settings';

export const PAGE_ORDER: PageId[] = [
  'home',
  'convert',
  'batch',
  'clip',
  'merge',
  'analyze',
  'metadata',
  'history',
  'settings',
];

function parseHash(): PageId {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (PAGE_ORDER as string[]).includes(h) ? (h as PageId) : 'home';
}

interface NavState {
  page: PageId;
  goto: (page: PageId) => void;
}

export const useNav = create<NavState>((set) => ({
  page: typeof window !== 'undefined' ? parseHash() : 'home',
  goto: (page) => {
    window.location.hash = `#/${page}`;
    set({ page });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useNav.setState({ page: parseHash() });
  });
}
