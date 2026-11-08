/**
 * 把 @ffmpeg/core 单线程核心复制到 public/ffmpeg/，
 * 保证核心资源本地部署（不依赖 CDN，离线可用）。
 *
 * 注意：只复制 dist/esm 下的**文件本体**并平铺到 public/ffmpeg/。
 * 直接 cp(esm, dest) 在 dest 已存在时会把整个目录塞进 dest/esm/，
 * 造成同一份 32MB wasm 存多份（曾使 dist 从 33MB 膨胀到 93MB）。
 */
import { copyFile, mkdir, access, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(root, '..', 'node_modules', '@ffmpeg', 'core');
const dest = path.resolve(root, '..', 'public', 'ffmpeg');

async function main() {
  // pnpm 会把依赖放在 workspace 根或包内，多做一层回退
  const candidates = [
    pkgDir,
    path.resolve(root, '..', '..', '..', 'node_modules', '@ffmpeg', 'core'),
  ];
  const src = candidates.find((p) => existsSync(path.join(p, 'dist')));
  if (!src) {
    console.warn('[copy-ffmpeg-core] @ffmpeg/core 未找到，跳过（请先 pnpm install）');
    return;
  }

  await mkdir(dest, { recursive: true });
  // @ffmpeg/core 0.12.x 的 dist 下分 esm/ 与 umd/，引擎统一用 esm 版
  const esm = path.join(src, 'dist', 'esm');
  const entries = await readdir(esm, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(path.join(esm, entry.name), path.join(dest, entry.name));
    copied += 1;
  }

  await access(path.join(dest, 'ffmpeg-core.wasm'));
  console.log(`[copy-ffmpeg-core] 已平铺复制 ${copied} 个核心文件到 ${dest}`);
}

main().catch((e) => {
  console.error('[copy-ffmpeg-core] 失败:', e);
  process.exitCode = 1;
});
