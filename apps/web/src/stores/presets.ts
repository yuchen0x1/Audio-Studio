/**
 * 用户预设（localStorage 持久化）：保存/覆盖/删除/导入导出。
 * 参数校验与序列化全部复用 packages/shared，Web 与桌面 UI 行为一致。
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  MAX_USER_PRESETS,
  createUserPresetId,
  parseUserPresets,
  serializeUserPresets,
  updateUserPreset,
  type EncodeParams,
  type UserPreset,
} from '@audio-studio/shared';

interface PresetState {
  presets: UserPreset[];
  save: (input: {
    name: string;
    params: EncodeParams;
    description?: string;
    basedOn?: string;
  }) => UserPreset | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  importFrom: (text: string) => number;
  exportAll: () => string;
}

export const usePresets = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [],

      save: ({ name, params, description, basedOn }) => {
        const clean = name.trim();
        if (!clean) return null;
        const existing = get().presets.find(
          (p) => p.name.toLocaleLowerCase() === clean.toLocaleLowerCase(),
        );
        if (existing) {
          set((s) => ({
            presets: updateUserPreset(s.presets, existing.id, {
              params: { ...params },
              description,
            }),
          }));
          return { ...existing, params: { ...params }, description };
        }
        if (get().presets.length >= MAX_USER_PRESETS) return null;
        const now = Date.now();
        const next: UserPreset = {
          id: createUserPresetId(),
          name: clean,
          description,
          params: { ...params },
          createdAt: now,
          updatedAt: now,
          basedOn,
        };
        set((s) => ({ presets: [next, ...s.presets] }));
        return next;
      },

      rename: (id, name) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({ presets: updateUserPreset(s.presets, id, { name: clean }) }));
      },

      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      importFrom: (text) => {
        const incoming = parseUserPresets(text);
        set((s) => {
          const byId = new Map(s.presets.map((p) => [p.id, p]));
          for (const preset of incoming) byId.set(preset.id, preset);
          const merged = [...byId.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_USER_PRESETS);
          return { presets: merged };
        });
        return incoming.length;
      },

      exportAll: () => serializeUserPresets(get().presets),
    }),
    {
      name: 'as-presets',
      version: 1,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ presets: s.presets }),
    },
  ),
);

function safeStorage(): Storage {
  try {
    const probe = '__audio_studio_presets_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    // 隐私模式/配额受限：退化为内存存储，应用仍可使用但刷新后丢失
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
      key: (i) => Array.from(map.keys())[i] ?? null,
      get length() {
        return map.size;
      },
    };
  }
}
