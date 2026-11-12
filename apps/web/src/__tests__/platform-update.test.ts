// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockServiceWorker {
  getRegistration: ReturnType<typeof vi.fn>;
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

function installServiceWorkerMock(serviceWorker: MockServiceWorker): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
}

function mockReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  vi.stubGlobal('window', {
    location: { reload },
    setTimeout,
    clearTimeout,
  });
  return reload;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('__APP_TARGET__', 'web');
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
});

describe('refreshWebUpdate Service Worker 时序', () => {
  it('发现 waiting worker 后发送 SKIP_WAITING，等待 controllerchange 再刷新', async () => {
    const reload = mockReload();
    let controllerListener: EventListener | undefined;
    const worker = {
      postMessage: vi.fn(() => {
        controllerListener?.(new Event('controllerchange'));
      }),
    };
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
      waiting: worker,
      active: null,
    };
    const serviceWorker = {
      getRegistration: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') controllerListener = listener;
      }),
      removeEventListener: vi.fn(),
    } satisfies MockServiceWorker;
    installServiceWorkerMock(serviceWorker);
    const { refreshWebUpdate } = await import('../platform');
    const progress: Array<number | null> = [];

    await refreshWebUpdate((value) => progress.push(value));

    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(serviceWorker.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
      { once: true },
    );
    expect(progress).toEqual([0, 1]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('没有 waiting worker 时仍完成刷新流程，不发送 skip waiting', async () => {
    const reload = mockReload();
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
      waiting: null,
      active: null,
    };
    const serviceWorker = {
      getRegistration: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies MockServiceWorker;
    installServiceWorkerMock(serviceWorker);
    const { refreshWebUpdate } = await import('../platform');

    await refreshWebUpdate();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('没有注册信息时直接刷新，不报告更新进度', async () => {
    const reload = mockReload();
    const serviceWorker = {
      getRegistration: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies MockServiceWorker;
    installServiceWorkerMock(serviceWorker);
    const { refreshWebUpdate } = await import('../platform');
    const progress = vi.fn();

    await refreshWebUpdate(progress);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalled();
  });
});
