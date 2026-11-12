/** 全局 Toast 通知 */
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  durationMs: number;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  dismiss: (id: string) => void;
}

let seq = 0;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    seq += 1;
    const id = `toast_${seq}`;
    const item: ToastItem = {
      id,
      kind: t.kind,
      title: t.title,
      message: t.message,
      durationMs: t.durationMs ?? (t.kind === 'error' ? 8000 : 4200),
    };
    set((s) => ({ items: [...s.items, item].slice(-5) }));
    if (item.durationMs > 0) {
      setTimeout(() => {
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      }, item.durationMs);
    }
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (title: string, message?: string) =>
    useToast.getState().push({ kind: 'info', title, message }),
  success: (title: string, message?: string) =>
    useToast.getState().push({ kind: 'success', title, message }),
  warning: (title: string, message?: string) =>
    useToast.getState().push({ kind: 'warning', title, message }),
  error: (title: string, message?: string) =>
    useToast.getState().push({ kind: 'error', title, message }),
};
