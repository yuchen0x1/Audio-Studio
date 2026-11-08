/** 历史记录（IndexedDB 持久化，支持搜索/筛选/删除/重新执行） */
import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import type { EncodeParams } from '@audio-studio/shared';

export interface HistoryRecord {
  id: string;                     // taskId
  kind: 'convert' | 'trim' | 'merge';
  sourceLabel: string;
  sourcePath?: string;            // 桌面端：可用于重新执行
  sourceFormat?: string;
  targetFormat?: string;
  params: EncodeParams;
  outputPath?: string;
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
  status: 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  createdAt: number;
  finishedAt: number;
  elapsedMs: number;
}

const DB_NAME = 'audio-studio';
const STORE = 'history';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
          s.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

export type HistoryStatusFilter = 'all' | 'completed' | 'failed' | 'cancelled';
export type HistoryKindFilter = 'all' | 'convert' | 'trim' | 'merge';

interface HistoryState {
  records: HistoryRecord[];
  loaded: boolean;
  query: string;
  statusFilter: HistoryStatusFilter;
  kindFilter: HistoryKindFilter;
  load: () => Promise<void>;
  add: (rec: HistoryRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  setQuery: (q: string) => void;
  setStatusFilter: (f: HistoryStatusFilter) => void;
  setKindFilter: (f: HistoryKindFilter) => void;
}

export const useHistory = create<HistoryState>((set, get) => ({
  records: [],
  loaded: false,
  query: '',
  statusFilter: 'all',
  kindFilter: 'all',

  load: async () => {
    if (get().loaded) return;
    try {
      const d = await db();
      const records = (await d.getAll(STORE)) as HistoryRecord[];
      records.sort((a, b) => b.createdAt - a.createdAt);
      set({ records, loaded: true });
    } catch (e) {
      console.error('[history] load failed', e);
      set({ loaded: true });
    }
  },

  add: async (rec) => {
    try {
      const d = await db();
      await d.put(STORE, rec);
      set((s) => ({
        records: [rec, ...s.records.filter((r) => r.id !== rec.id)].sort((a, b) => b.createdAt - a.createdAt),
      }));
    } catch (e) {
      console.error('[history] add failed', e);
    }
  },

  remove: async (id) => {
    try {
      const d = await db();
      await d.delete(STORE, id);
    } catch { /* ignore */ }
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
  },

  clear: async () => {
    try {
      const d = await db();
      await d.clear(STORE);
    } catch { /* ignore */ }
    set({ records: [] });
  },

  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
}));

/** 应用搜索与筛选（组件内用 useMemo 调用） */
export function filterHistory(recs: HistoryRecord[], q: string, status: HistoryStatusFilter, kind: HistoryKindFilter): HistoryRecord[] {
  const query = q.trim().toLowerCase();
  return recs.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (kind !== 'all' && r.kind !== kind) return false;
    if (query) {
      const hay = `${r.sourceLabel} ${r.fileName ?? ''} ${r.targetFormat ?? ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}
