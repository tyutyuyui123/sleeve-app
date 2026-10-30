// 牌套精靈 service worker: precache everything, serve cache-first so it works fully offline.
const CACHE = 'sleeve-test4-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sleeveparse.js', 'data.js', 'manifest.webmanifest',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;  // Firestore etc. go straight to network
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r ||
    fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
