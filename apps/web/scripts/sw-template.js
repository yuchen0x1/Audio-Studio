const BUILD_ID = '__BUILD_ID__';
const PRECACHE = ['__PRECACHE__'];
const scope = new URL(self.registration.scope);
const prefix = `audio-studio:${scope.pathname}:`;
const cacheName = `${prefix}${BUILD_ID}`;
const index = new URL('index.html', scope).href;
const builtAssets = new Set(PRECACHE.map((file) => new URL(file, scope).href));
const engineAssets = new Set(
  ['ffmpeg-core.js', 'ffmpeg-core.wasm'].map((file) => new URL(`ffmpeg/${file}`, scope).href),
);

self.addEventListener('install', (event) => {
  // Cache the complete application shell before the new worker can become active.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await cache.addAll([...builtAssets].map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const older = (await caches.keys()).filter(
        (key) => key.startsWith(prefix) && key !== cacheName,
      );
      // Keep one previous build for open tabs that may still request its hashed chunks.
      await Promise.all(older.slice(0, -1).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    if (url.pathname === scope.pathname || url.pathname === new URL(index).pathname) {
      event.respondWith(
        caches.open(cacheName).then(async (cache) => (await cache.match(index)) ?? fetch(request)),
      );
    }
    return;
  }
  if (builtAssets.has(url.href)) {
    event.respondWith(
      caches.open(cacheName).then(async (cache) => (await cache.match(request)) ?? fetch(request)),
    );
  } else if (engineAssets.has(url.href)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        const mime = response.headers.get('content-type') ?? '';
        if (
          response.ok &&
          (url.pathname.endsWith('.wasm')
            ? mime.includes('application/wasm')
            : /javascript|ecmascript/.test(mime))
        ) {
          // Engine caching is optional. A quota problem must not interrupt processing.
          await cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      })(),
    );
  } else if (url.pathname.startsWith(new URL('assets/', scope).pathname)) {
    event.respondWith(
      (async () => {
        const older = (await caches.keys()).filter(
          (key) => key.startsWith(prefix) && key !== cacheName,
        );
        const previous = older.at(-1);
        const cached = previous ? await caches.match(request, { cacheName: previous }) : undefined;
        return cached ?? fetch(request);
      })(),
    );
  }
});
