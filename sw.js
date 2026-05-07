// オフライン用 Service Worker（キャッシュ優先）
const CACHE_NAME = 'engi-map-v1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './booths.json',
  './routes.json',
  './map.webp',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
