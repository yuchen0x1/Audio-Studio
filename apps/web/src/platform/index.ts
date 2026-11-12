/**
 * 平台适配层：Web 与 Windows 桌面（Tauri）的差异全部收敛在这里。
 * 页面组件不直接接触 File API / Tauri API。
 */
import type { AudioSource } from '@audio-studio/shared';

export type Target = 'web' | 'desktop';

export const APP_TARGET: Target = __APP_TARGET__ === 'desktop' ? 'desktop' : 'web';

export type UpdateProgressHandler = (progress: number | null) => void;

export interface DesktopUpdateInfo {
  version: string;
  body: string;
  date: string | null;
}

export const isDesktop: boolean =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

let idSeq = 0;
export function makeSourceId(): string {
  idSeq += 1;
  return `f_${Date.now().toString(36)}_${idSeq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function sourceFromFile(file: File): AudioSource {
  return {
    id: makeSourceId(),
    name: file.name,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    file,
  };
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : '';
}

export function dirOf(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, '');
}

const AUDIO_ACCEPT =
  '.mp3,.wav,.flac,.aac,.m4a,.ogg,.oga,.opus,.wma,.aiff,.aif,.ape,.ac3,.amr,audio/*';

/** 打开文件选择器（Web: <input>；Desktop: Tauri dialog） */
export async function pickAudioFiles(multiple = true): Promise<AudioSource[]> {
  if (isDesktop) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({
      multiple,
      directory: false,
      title: '选择音频文件',
      filters: [
        {
          name: '音频文件',
          extensions: [
            'mp3',
            'wav',
            'flac',
            'aac',
            'm4a',
            'ogg',
            'oga',
            'opus',
            'wma',
            'aiff',
            'aif',
            'ape',
            'ac3',
            'amr',
          ],
        },
      ],
    });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];
    return paths.map((p) => ({
      id: makeSourceId(),
      name: baseName(p),
      sizeBytes: 0, // probe 后填充
      path: p,
    }));
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = AUDIO_ACCEPT;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      resolve(files.map(sourceFromFile));
    };
    // 用户取消时不 resolve（保持 pending 无副作用）
    input.click();
  });
}

/** 拖放文件 → AudioSource（仅 Web；桌面端由 Tauri 拖放事件处理） */
export function sourcesFromDataTransfer(dt: DataTransfer): AudioSource[] {
  const files: File[] = [];
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) files.push(f);
  }
  return files.map(sourceFromFile);
}

/** 下载结果（Web: Blob；Desktop: 文件已写盘，直接打开位置） */
export async function deliverResult(opts: {
  fileName: string;
  data?: Uint8Array;
  outputPath?: string;
}): Promise<void> {
  if (isDesktop) {
    // 桌面端输出已落盘，通知用户即可
    return;
  }
  if (!opts.data) throw new Error('缺少输出数据');
  const blob = new Blob([opts.data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 批量下载（逐个触发，浏览器可能限制多文件，逐个间隔触发） */
export async function deliverAll(
  results: Array<{ fileName: string; data?: Uint8Array; outputPath?: string }>,
): Promise<number> {
  let ok = 0;
  for (const r of results) {
    try {
      await deliverResult(r);
      ok += 1;
      await new Promise((res) => setTimeout(res, 350));
    } catch {
      /* 跳过失败项 */
    }
  }
  return ok;
}

/** 在文件管理器中显示输出文件 */
export async function revealOutput(path: string): Promise<void> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reveal_in_folder', { path });
    return;
  }
  throw new Error('浏览器环境不支持打开目录，请在下载列表中查找文件');
}

export async function openOutputDir(dir: string): Promise<void> {
  if (isDesktop) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_path', { path: dir });
    return;
  }
  throw new Error('浏览器环境不支持打开目录');
}

/** 系统通知 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isDesktop) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('notify', { title, body });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* 通知失败静默（不阻断任务） */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isDesktop) return true;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

/**
 * 检查并安装桌面端签名更新。Tauri updater 只在桌面壳中加载，Web 端返回 null。
 * 安装完成后由调用方负责 relaunch，避免更新组件擅自结束当前会话。
 */
export async function installDesktopUpdate(
  onProgress?: UpdateProgressHandler,
): Promise<DesktopUpdateInfo | null> {
  if (!isDesktop) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;

  let contentLength = 0;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      contentLength = event.data.contentLength ?? 0;
      downloaded = 0;
      onProgress?.(contentLength > 0 ? 0 : null);
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.(contentLength > 0 ? Math.min(1, downloaded / contentLength) : null);
    } else if (event.event === 'Finished') {
      onProgress?.(1);
    }
  });

  return {
    version: update.version,
    body: update.body ?? '',
    date: update.date ?? null,
  };
}

/** 让桌面壳在更新安装完成后退出当前进程并打开新版本。 */
export async function relaunchDesktop(): Promise<void> {
  if (!isDesktop) return;
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/**
 * 等待一次更新安装完成并返回 waiting worker。
 * install 阶段不能主动 skipWaiting，否则页面可能在用户确认前被替换。
 */
async function findWaitingWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  const existingWaiting = registration.waiting;
  const installingBeforeUpdate = registration.installing;
  await registration.update();
  if (registration.waiting) return registration.waiting;
  if (existingWaiting && existingWaiting.state !== 'redundant') return existingWaiting;

  const installing = registration.installing ?? installingBeforeUpdate;
  if (!installing) return null;
  if (installing.state === 'installed') {
    return registration.waiting === installing ? installing : registration.waiting;
  }
  if (installing.state === 'redundant') return null;

  return new Promise<ServiceWorker | null>((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(registration.waiting), 10_000);
    const finish = (worker: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      installing.removeEventListener('statechange', onStateChange);
      resolve(worker);
    };
    const onStateChange = () => {
      if (installing.state === 'installed') {
        finish(registration.waiting === installing ? installing : registration.waiting);
      } else if (installing.state === 'redundant') {
        finish(null);
      }
    };
    installing.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

async function waitForControllerChange(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(false), 10_000);
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(changed);
    };
    const onControllerChange = () => finish(true);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
      once: true,
    });
  });
}

async function clearWebCaches(registration: ServiceWorkerRegistration): Promise<void> {
  const active = registration.active ?? navigator.serviceWorker.controller;
  if (!active) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 5_000);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    active.postMessage({ type: 'CLEAR_CACHES' }, [channel.port2]);
  });
}

/**
 * 让 Web Service Worker 获取最新资源并刷新页面。
 * 浏览器不能替换服务器部署文件，因此“立即更新”只负责拉取已发布的新版本。
 */
export async function refreshWebUpdate(onProgress?: UpdateProgressHandler): Promise<void> {
  if (isDesktop) return;
  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    // 页面刚启动时注册可能仍在进行，短暂等待 ready，避免错过 installing worker。
    registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 2_000)),
    ]);
  }
  if (!registration) {
    window.location.reload();
    return;
  }

  onProgress?.(0);
  const worker = await findWaitingWorker(registration);
  if (worker) {
    // 监听必须先于 SKIP_WAITING 注册，确保不丢失 controllerchange。
    const controllerChange = waitForControllerChange();
    if (registration.waiting === worker) worker.postMessage({ type: 'SKIP_WAITING' });
    const changed = await controllerChange;
    if (changed) await clearWebCaches(registration);
  } else {
    // update() 没有产生 waiting worker 时，仍清理旧缓存，避免刷新继续命中旧资源。
    await clearWebCaches(registration);
  }
  onProgress?.(1);
  window.location.reload();
}

/** 估算可用磁盘空间（桌面端真实查询，Web 返回 null 表示不可知） */
export async function estimateFreeSpace(
  path: string,
  neededBytes: number,
): Promise<{ ok: boolean; freeBytes?: number }> {
  if (isDesktop) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('estimate_disk_space', { path, neededBytes });
    } catch {
      return { ok: true };
    }
  }
  return { ok: true };
}
