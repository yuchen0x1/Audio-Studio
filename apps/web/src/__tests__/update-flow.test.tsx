// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let releaseListener: ((release: LatestRelease) => void) | null = null;
  const release: LatestRelease = {
    tagName: 'v0.2.0',
    name: 'Audio Studio v0.2.0',
    body: '修复问题',
    url: 'https://github.com/yuchen0x1/Audio-Studio/releases/tag/v0.2.0',
    publishedAt: null,
    assets: [],
    hasUpdate: true,
  };
  return {
    release,
    refreshWebUpdate: vi.fn(),
    installDesktopUpdate: vi.fn(),
    relaunchDesktop: vi.fn(),
    getAvailableRelease: vi.fn(() => null),
    subscribeToAvailableRelease: vi.fn((listener: (release: LatestRelease) => void) => {
      releaseListener = listener;
      return () => {
        if (releaseListener === listener) releaseListener = null;
      };
    }),
    announce: () => releaseListener?.(release),
  };
});

type LatestRelease = {
  tagName: string;
  name: string;
  body: string;
  url: string;
  publishedAt: string | null;
  assets: Array<{ name: string; sizeBytes: number | null; downloadUrl: string }>;
  hasUpdate: boolean;
};

vi.mock('../platform', () => ({
  isDesktop: false,
  refreshWebUpdate: mocks.refreshWebUpdate,
  installDesktopUpdate: mocks.installDesktopUpdate,
  relaunchDesktop: mocks.relaunchDesktop,
}));

vi.mock('../updates', () => ({
  getAvailableRelease: mocks.getAvailableRelease,
  subscribeToAvailableRelease: mocks.subscribeToAvailableRelease,
}));

import { UpdatePrompt } from '../components/UpdatePrompt';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAvailableRelease.mockReturnValue(null);
  mocks.refreshWebUpdate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('UpdatePrompt 更新流程', () => {
  it('订阅到可用版本后显示弹窗，并可选择稍后提醒', async () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => mocks.announce());
    expect(await screen.findByRole('dialog')).toHaveTextContent('v0.2.0');

    fireEvent.click(screen.getByRole('button', { name: '稍后提醒' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.refreshWebUpdate).not.toHaveBeenCalled();
  });

  it('立即更新调用 Web 刷新，并在执行期间防止重复点击', async () => {
    let resolveUpdate!: () => void;
    mocks.refreshWebUpdate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<UpdatePrompt />);
    act(() => mocks.announce());

    const installButton = await screen.findByRole('button', { name: '立即更新' });
    fireEvent.click(installButton);
    expect(mocks.refreshWebUpdate).toHaveBeenCalledTimes(1);
    expect(installButton).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载最新网页资源');

    fireEvent.click(installButton);
    expect(mocks.refreshWebUpdate).toHaveBeenCalledTimes(1);

    await act(async () => resolveUpdate());
  });

  it('更新失败显示重试按钮，重试时再次调用且仍防止重复点击', async () => {
    mocks.refreshWebUpdate
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    render(<UpdatePrompt />);
    act(() => mocks.announce());

    fireEvent.click(await screen.findByRole('button', { name: '立即更新' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('更新失败');
    const retryButton = screen.getByRole('button', { name: '重试' });

    fireEvent.click(retryButton);
    expect(mocks.refreshWebUpdate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });
});
