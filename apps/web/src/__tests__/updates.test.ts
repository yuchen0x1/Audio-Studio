// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../stores/settings';
import { useToast } from '../stores/toast';
import {
  announceRelease,
  fetchLatestRelease,
  getAvailableRelease,
  getLastUpdateCheckAt,
  isNewerVersion,
  recordUpdateCheck,
  resetUpdateStateForTests,
  shouldCheckForUpdates,
  startUpdateMonitor,
  subscribeToAvailableRelease,
} from '../updates';

vi.mock('../platform', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

const releaseResponse = {
  tag_name: 'v0.2.0',
  name: 'Audio Studio v0.2.0',
  body: 'Bug fixes and improvements',
  html_url: 'https://github.com/yuchen0x1/Audio-Studio/releases/tag/v0.2.0',
  published_at: '2026-11-09T00:00:00Z',
  assets: [
    {
      name: 'AudioStudio-v0.2.0-web.zip',
      size: 1234,
      browser_download_url:
        'https://github.com/yuchen0x1/Audio-Studio/releases/download/v0.2.0/AudioStudio-v0.2.0-web.zip',
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useSettings.getState().reset();
  useToast.setState({ items: [] });
  resetUpdateStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('update version and release utilities', () => {
  it('compares stable and prerelease versions', () => {
    expect(isNewerVersion('v0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('0.1.0', 'v0.1.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-rc.2')).toBe(true);
    expect(isNewerVersion('1.0.0-rc.2', '1.0.0-rc.10')).toBe(false);
    expect(isNewerVersion('release-next', '0.1.0')).toBe(false);
  });

  it('announces a release to subscribers', () => {
    const release = {
      tagName: 'v0.2.0',
      name: 'Audio Studio v0.2.0',
      body: 'Bug fixes and improvements',
      url: releaseResponse.html_url,
      publishedAt: releaseResponse.published_at,
      assets: [],
      hasUpdate: true,
    };
    const listener = vi.fn();
    const stop = subscribeToAvailableRelease(listener);
    announceRelease(release);
    expect(listener).toHaveBeenCalledWith(release);
    stop();
  });

  it('fetches and parses the latest GitHub release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(releaseResponse))),
    );

    await expect(fetchLatestRelease('0.1.0')).resolves.toMatchObject({
      tagName: 'v0.2.0',
      name: 'Audio Studio v0.2.0',
      body: 'Bug fixes and improvements',
      url: releaseResponse.html_url,
      hasUpdate: true,
      assets: [
        {
          name: 'AudioStudio-v0.2.0-web.zip',
          sizeBytes: 1234,
          downloadUrl: releaseResponse.assets[0].browser_download_url,
        },
      ],
    });
  });

  it('rejects an untrusted release URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ...releaseResponse, html_url: 'https://example.com/release' }),
          ),
        ),
    );

    await expect(fetchLatestRelease('0.1.0')).rejects.toThrow('Invalid GitHub release response');
  });

  it('stores a successful check timestamp and respects the daily interval', () => {
    recordUpdateCheck(12345);
    expect(getLastUpdateCheckAt()).toBe(12345);
    expect(shouldCheckForUpdates(12345 + 60_000)).toBe(false);
    expect(shouldCheckForUpdates(12345 + 24 * 60 * 60 * 1000)).toBe(true);
  });
});

describe('automatic update monitor', () => {
  it('notifies once and exposes release notes when a newer version is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(releaseResponse))),
    );
    const stop = startUpdateMonitor('0.1.0');
    await vi.waitFor(() => expect(getAvailableRelease()?.tagName).toBe('v0.2.0'));
    expect(useToast.getState().items[0]?.title).toContain('v0.2.0');
    expect(useToast.getState().items[0]?.message).toContain('打开版本页面');
    stop();
  });

  it('does not request GitHub when automatic checks are disabled', async () => {
    useSettings.getState().update({ autoCheckUpdates: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const stop = startUpdateMonitor('0.1.0');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });

  it('skips checks less than 24 hours apart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
    recordUpdateCheck(Date.now());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const stop = startUpdateMonitor('0.1.0');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });
});
