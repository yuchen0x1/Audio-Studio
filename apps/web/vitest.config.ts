import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 受限环境（沙箱 / 只读系统临时目录）下 Vitest 写 SSR 缓存会 EPERM，
// 导致测试文件被静默跳过；把临时目录固定到项目内。
const tmpDir = join(process.cwd(), '.vitest-tmp');
try {
  mkdirSync(tmpDir, { recursive: true });
  process.env.TMPDIR = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TEMP = tmpDir;
} catch {
  // 创建失败则沿用系统默认目录
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 与 vite.config.ts 保持一致：源码里用包名导入共享包
      '@audio-studio/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
