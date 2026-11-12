/** GitHub Releases-based update discovery for the shared Web/Tauri UI. */
import { notify } from './platform';
import { useSettings } from './stores/settings';
import { toast } from './stores/toast';
import { translate, useI18n } from './i18n';

const REPOSITORY = 'yuchen0x1/Audio-Studio';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const CHECKED_AT_KEY = 'as-update-check-at';
const NOTIFIED_TAG_KEY = 'as-update-notified-tag';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface LatestRelease {
  tagName: string;
  name: string;
  body: string;
  url: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
  hasUpdate: boolean;
}

export interface ReleaseAsset {
  name: string;
  sizeBytes: number | null;
  downloadUrl: string;
}

interface GitHubReleaseResponse {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

let memoryCheckedAt = 0;
let memoryNotifiedTag = '';
let availableRelease: LatestRelease | null = null;
let inFlightRelease: { currentVersion: string; promise: Promise<LatestRelease> } | null = null;
const releaseListeners = new Set<(release: LatestRelease) => void>();

export function getAvailableRelease(): LatestRelease | null {
  return availableRelease?.hasUpdate ? availableRelease : null;
}

export function subscribeToAvailableRelease(
  listener: (release: LatestRelease) => void,
): () => void {
  releaseListeners.add(listener);
  const current = availableRelease;
  if (current?.hasUpdate) listener(current);
  return () => {
    releaseListeners.delete(listener);
  };
}

function publishAvailableRelease(release: LatestRelease): void {
  availableRelease = release;
  for (const listener of releaseListeners) listener(release);
}

/** 将一次检查结果广播给设置页和全局更新弹窗。 */
export function announceRelease(release: LatestRelease): void {
  publishAvailableRelease(release);
}

function readStorage(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory fallback; update checks must not interrupt app use.
  }
}

export function recordUpdateCheck(at = Date.now()): void {
  memoryCheckedAt = at;
  writeStorage(CHECKED_AT_KEY, String(at));
}

export function getLastUpdateCheckAt(): number | null {
  const raw = readStorage(CHECKED_AT_KEY);
  const stored = raw === null ? 0 : Number(raw);
  const checkedAt = Number.isFinite(stored) && stored > 0 ? stored : memoryCheckedAt;
  return checkedAt > 0 ? checkedAt : null;
}

export function shouldCheckForUpdates(now = Date.now()): boolean {
  const checkedAt = getLastUpdateCheckAt();
  return checkedAt === null || now - checkedAt >= CHECK_INTERVAL_MS;
}

function parseVersion(value: string): { numbers: number[]; prerelease: string[] | null } | null {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return {
    numbers: match[1].split('.').map((part) => Number(part)),
    prerelease: match[2] ? match[2].split('.') : null,
  };
}

function parseReleaseAssets(value: unknown): ReleaseAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ReleaseAsset[] => {
    if (!item || typeof item !== 'object') return [];
    const asset = item as Record<string, unknown>;
    const name = typeof asset.name === 'string' ? asset.name.trim() : '';
    const downloadUrl =
      typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '';
    if (!name || !/^https:\/\/github\.com\//.test(downloadUrl)) return [];
    const size = typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : null;
    return [{ name, sizeBytes: size, downloadUrl }];
  });
}

/** Compare supported semver-like version strings; tags with non-version names are ignored. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;

  const length = Math.max(next.numbers.length, installed.numbers.length);
  for (let i = 0; i < length; i += 1) {
    const delta = (next.numbers[i] ?? 0) - (installed.numbers[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }

  if (next.prerelease === null) return installed.prerelease !== null;
  if (installed.prerelease === null) return false;
  for (let i = 0; i < Math.max(next.prerelease.length, installed.prerelease.length); i += 1) {
    const nextPart = next.prerelease[i];
    const installedPart = installed.prerelease[i];
    if (nextPart === undefined) return false;
    if (installedPart === undefined) return true;
    if (nextPart === installedPart) continue;
    const nextNumber = /^\d+$/.test(nextPart) ? Number(nextPart) : null;
    const installedNumber = /^\d+$/.test(installedPart) ? Number(installedPart) : null;
    if (nextNumber !== null && installedNumber !== null) return nextNumber > installedNumber;
    if (nextNumber !== null) return true;
    if (installedNumber !== null) return false;
    return nextPart > installedPart;
  }
  return false;
}

export async function fetchLatestRelease(currentVersion: string): Promise<LatestRelease> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const release = (await response.json()) as GitHubReleaseResponse;
    const tagName = typeof release.tag_name === 'string' ? release.tag_name : '';
    const url = typeof release.html_url === 'string' ? release.html_url : '';
    if (!tagName || !/^https:\/\/github\.com\//.test(url)) {
      throw new Error('Invalid GitHub release response');
    }
    return {
      tagName,
      name: typeof release.name === 'string' && release.name ? release.name : tagName,
      body: typeof release.body === 'string' ? release.body : '',
      url,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      assets: parseReleaseAssets(release.assets),
      hasUpdate: isNewerVersion(tagName, currentVersion),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function fetchLatestReleaseShared(currentVersion: string): Promise<LatestRelease> {
  if (inFlightRelease?.currentVersion === currentVersion) return inFlightRelease.promise;
  const promise = fetchLatestRelease(currentVersion).finally(() => {
    if (inFlightRelease?.promise === promise) inFlightRelease = null;
  });
  inFlightRelease = { currentVersion, promise };
  return promise;
}

function wasNotified(tagName: string): boolean {
  return readStorage(NOTIFIED_TAG_KEY) === tagName || memoryNotifiedTag === tagName;
}

function recordNotified(tagName: string): void {
  memoryNotifiedTag = tagName;
  writeStorage(NOTIFIED_TAG_KEY, tagName);
}

/** Check once per 24 hours while the app is running; no background polling when closed. */
export function startUpdateMonitor(currentVersion: string): () => void {
  let stopped = false;
  let checking = false;

  const checkIfDue = async () => {
    if (stopped || checking || !useSettings.getState().autoCheckUpdates) return;
    if (!shouldCheckForUpdates()) return;

    checking = true;
    try {
      const release = await fetchLatestReleaseShared(currentVersion);
      recordUpdateCheck();
      if (stopped) return;
      if (!release.hasUpdate) {
        publishAvailableRelease(release);
        return;
      }
      publishAvailableRelease(release);
      if (wasNotified(release.tagName)) return;
      recordNotified(release.tagName);
      const lang = useI18n.getState().lang;
      const title = translate(lang, 'updates.available', { version: release.tagName });
      const message = translate(lang, 'updates.openReleaseHint');
      toast.info(title, message);
      void notify(title, message);
    } catch {
      // Keep the previous successful-check timestamp so temporary network failures can retry.
    } finally {
      checking = false;
    }
  };

  void checkIfDue();
  const timer = window.setInterval(() => void checkIfDue(), 60 * 60 * 1000);
  const unsubscribe = useSettings.subscribe((state, previous) => {
    if (state.autoCheckUpdates && !previous.autoCheckUpdates) void checkIfDue();
  });

  return () => {
    stopped = true;
    window.clearInterval(timer);
    unsubscribe();
  };
}

export function markReleaseNotified(tagName: string): void {
  recordNotified(tagName);
}

export function resetUpdateStateForTests(): void {
  memoryCheckedAt = 0;
  memoryNotifiedTag = '';
  availableRelease = null;
  inFlightRelease = null;
  releaseListeners.clear();
}
