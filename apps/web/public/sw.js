/**
 * Audio Studio Service Worker（PWA 离线壳）
 * 策略：
 * - 导航请求 → network-first，失败回缓存 index.html（离线可启动）
 * - 静态资源（js/css/wasm/字体/图标）→ stale-while-revalidate
 * - 跨域/未知 → passthrough
 * 注意：ffmpeg-core.wasm 体积大，缓存后可显著加速二次启动。
 */
const VERSION = 'audio-studio-v1';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域直连

  // 导航：network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(RUNTIME_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  const isStatic = /\.(js|css|wasm|woff2?|png|svg|jpg|webp|json|webmanifest)$/i.test(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
