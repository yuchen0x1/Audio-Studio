import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  return {
    base: './',
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __APP_TARGET__: JSON.stringify(isDesktop ? 'desktop' : 'web'),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    },
    worker: {
      format: 'es',
    },
    // @ffmpeg/ffmpeg 内部用 new URL('./worker.js', import.meta.url) 定位 worker。
    // 一旦被 Vite 预构建，import.meta.url 被改写到 .vite/deps/，worker 变成 404 →
    // ff.load() 直接失败（表现为「音频引擎初始化失败」）。必须排除预构建。
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    server: {
      port: 5180,
      headers: {
        // 单线程 core 不强制要求，但提前声明便于未来切换多线程核心
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    preview: { port: 5180 },
  };
});
