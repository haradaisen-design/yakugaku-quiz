// オフラインでも使えるようにする Service Worker
//   アプリ本体: 版ごとに保存し、保存したものを使う（版が変わると入れ替わる）
//   data/meta.json: 毎回ネットを優先（つながらなければ保存したもの）
//   data/*.bin: 内容ごとにファイル名が変わるので、保存したものを使う
// BUILD:BEGIN（scripts/build.mjs が自動で書き換える）
const APP_VERSION = '67e6e7bb092f';
const APP_SHELL = [
  "./",
  "css/app.css",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "js/app.js",
  "js/crypto.js",
  "js/daily.js",
  "js/data.js",
  "js/main.js",
  "js/render.js",
  "js/srs.js",
  "js/store.js",
  "js/util.js",
  "js/views/browse.js",
  "js/views/home.js",
  "js/views/quiz.js",
  "js/views/settings.js",
  "js/views/unlock.js",
  "manifest.webmanifest",
  "vendor/katex/contrib/auto-render.min.js",
  "vendor/katex/contrib/mhchem.min.js",
  "vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  "vendor/katex/katex.min.css",
  "vendor/katex/katex.min.js"
];
// BUILD:END
const SHELL_CACHE = `yq-shell-${APP_VERSION}`;
const DATA_CACHE = 'yq-data';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('yq-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);

  if (path === 'data/meta.json') {
    event.respondWith(networkFirst(request));
  } else if (path.startsWith('data/')) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(caches.match(self.registration.scope, { cacheName: SHELL_CACHE, ignoreSearch: true }).then((r) => r || fetch(request)));
  } else {
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((r) => r || fetch(request)));
  }
});
