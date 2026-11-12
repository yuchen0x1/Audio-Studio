import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// 部分受限环境（沙箱 / 只读系统临时目录）下 Vitest 写 SSR 模块缓存会 EPERM，
// 导致个别测试文件被静默跳过。这里把临时目录固定到项目内，保证全量收集。
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
  // 缓存放项目内，避免系统临时目录权限问题
  cacheDir: './node_modules/.vitest-cache',
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts'],
    },
  },
});
