/**
 * FFmpeg.wasm 加载器：核心资源本地部署（public/ffmpeg/），不依赖 CDN，
 * 页面完全离线可用。加载有超时保护与清晰的失败原因。
 *
 * 注意：FFmpeg.wasm 单个实例不支持并发 exec，因此引擎实例池必须持有
 * **各自独立的 FFmpeg 实例**。loadFfmpeg() 返回共享单例（供启动探测复用），
 * createFfmpeg() 每次返回全新实例（池扩容用）。
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';

let sharedInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

function coreUrl(file: string): string {
  // Vite BASE_URL 在构建时为 './'，开发时为 '/'
  const base = import.meta.env.BASE_URL || '/';
  return new URL(`${base}ffmpeg/${file}`, window.location.href).href;
}

/** 新建一个独立的 FFmpeg 实例并完成核心加载 */
export async function createFfmpeg(): Promise<FFmpeg> {
  const ff = new FFmpeg();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('音频引擎核心加载超时（30 秒）')), 30_000);
  });
  try {
    await Promise.race([
      ff.load({
        coreURL: coreUrl('ffmpeg-core.js'),
        wasmURL: coreUrl('ffmpeg-core.wasm'),
      }),
      timeout,
    ]);
  } catch (e) {
    try {
      ff.terminate();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`音频引擎核心加载失败: ${msg}（请确认 public/ffmpeg/ 下核心文件完整）`, {
      cause: e,
    });
  }
  return ff;
}

/** 共享单例（引擎启动探测用，避免重复加载 32MB wasm） */
export async function loadFfmpeg(): Promise<FFmpeg> {
  if (sharedInstance) return sharedInstance;
  if (loadPromise) return loadPromise;

  loadPromise = createFfmpeg()
    .then((ff) => {
      sharedInstance = ff;
      return ff;
    })
    .catch((e) => {
      loadPromise = null;
      throw e;
    });

  return loadPromise;
}

/**
 * 取走共享单例（交给实例池独占使用）。
 * 归还后 loadFfmpeg() 会重新加载，因此只在引擎首次初始化时调用一次。
 */
export function takeSharedFfmpeg(): FFmpeg | null {
  const ff = sharedInstance;
  sharedInstance = null;
  loadPromise = null;
  return ff;
}

/** 释放共享实例（换核心版本/重置引擎时用） */
export async function unloadFfmpeg(): Promise<void> {
  if (sharedInstance) {
    try {
      sharedInstance.terminate();
    } catch {
      /* ignore */
    }
    sharedInstance = null;
    loadPromise = null;
  }
}
