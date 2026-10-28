/* Offline cache for one Stoic Ranger web app. tools/build-web.mjs fills in VERSION and FILES.
   Every file is cached on install, so the app starts without signal at the range. A new build gets a new
   cache; the open app keeps running on the old files and the next start uses the new ones.
   Only app files are cached: the data lives in IndexedDB and is never touched here. */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'sr-' + self.registration.scope + '-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(k => k.startsWith('sr-' + self.registration.scope + '-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;   // e.g. the Claude API goes straight out
  e.respondWith(caches.open(CACHE).then(c => c.match(r, { ignoreSearch: true }).then(hit => hit
    || fetch(r).catch(() => r.mode === 'navigate' ? c.match('index.html') : Response.error()))));
});
