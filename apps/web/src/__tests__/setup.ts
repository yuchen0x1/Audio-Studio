/**
 * Node 测试环境补丁：zustand persist 依赖 localStorage，
 * 在纯 node 环境下缺失会导致 store 创建告警/异常。
 */
const store = new Map<string, string>();

function createMemoryStorage(): Storage {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const storageAvailable = (() => {
  try {
    const existing = globalThis.localStorage;
    const probe = '__audio_studio_storage_probe__';
    existing.setItem(probe, '1');
    existing.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

if (!storageAvailable) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
}
