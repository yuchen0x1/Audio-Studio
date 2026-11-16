/** 历史记录（IndexedDB 持久化，支持搜索/筛选/删除/重新执行） */
import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import type { EncodeParams } from '@audio-studio/shared';

export interface HistoryRecord {
  id: string; // taskId
  kind: 'convert' | 'trim' | 'merge';
  sourceLabel: string;
  sourcePath?: string; // 桌面端：可用于重新执行
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
export const HISTORY_EXPORT_VERSION = 1;
const MAX_HISTORY_RECORDS = 5000;
const MAX_HISTORY_JSON_BYTES = 2 * 1024 * 1024;

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
  importRecords: (records: HistoryRecord[]) => Promise<number>;
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
        records: [rec, ...s.records.filter((r) => r.id !== rec.id)].sort(
          (a, b) => b.createdAt - a.createdAt,
        ),
      }));
    } catch (e) {
      console.error('[history] add failed', e);
    }
  },

  remove: async (id) => {
    try {
      const d = await db();
      await d.delete(STORE, id);
    } catch {
      /* ignore */
    }
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
  },

  clear: async () => {
    try {
      const d = await db();
      await d.clear(STORE);
    } catch {
      /* ignore */
    }
    set({ records: [] });
  },

  importRecords: async (records) => {
    const normalized = records
      .slice(0, MAX_HISTORY_RECORDS)
      .sort((a, b) => b.createdAt - a.createdAt);
    try {
      const d = await db();
      const tx = d.transaction(STORE, 'readwrite');
      for (const record of normalized) await tx.store.put(record);
      await tx.done;
      set((s) => {
        const byId = new Map(s.records.map((r) => [r.id, r]));
        for (const record of normalized) byId.set(record.id, record);
        return {
          records: [...byId.values()]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_HISTORY_RECORDS),
        };
      });
      return normalized.length;
    } catch (e) {
      console.error('[history] import failed', e);
      throw e;
    }
  },

  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
}));

/** 应用搜索与筛选（组件内用 useMemo 调用） */
export function filterHistory(
  recs: HistoryRecord[],
  q: string,
  status: HistoryStatusFilter,
  kind: HistoryKindFilter,
): HistoryRecord[] {
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

/** 导出带版本号的 JSON，便于未来迁移而不是把内部 IndexedDB 结构暴露给用户。 */
export function serializeHistory(records: HistoryRecord[]): string {
  return JSON.stringify(
    {
      version: HISTORY_EXPORT_VERSION,
      exportedAt: Date.now(),
      records: records.slice(0, MAX_HISTORY_RECORDS),
    },
    null,
    2,
  );
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<HistoryRecord>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.sourceLabel === 'string' &&
    (r.kind === 'convert' || r.kind === 'trim' || r.kind === 'merge') &&
    (r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled') &&
    !!r.params &&
    typeof r.params === 'object' &&
    Number.isFinite(r.createdAt) &&
    Number.isFinite(r.finishedAt) &&
    Number.isFinite(r.elapsedMs)
  );
}

/** 解析并校验导入文件；拒绝过大的或部分损坏的文件，避免静默污染历史。 */
export function parseHistoryJson(text: string): HistoryRecord[] {
  if (new TextEncoder().encode(text).byteLength > MAX_HISTORY_JSON_BYTES) {
    throw new Error('历史文件过大');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('历史文件不是有效 JSON');
  }
  const records = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { records?: unknown }).records)
      ? (payload as { records: unknown[] }).records
      : null;
  if (!records) throw new Error('历史文件缺少 records 数组');
  if (records.length > MAX_HISTORY_RECORDS) throw new Error('历史记录数量超过上限');
  if (!records.every(isHistoryRecord)) throw new Error('历史文件包含无效记录');
  return (records as HistoryRecord[]).sort((a, b) => b.createdAt - a.createdAt);
}
