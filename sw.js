const CACHE_NAME = 'favu-app-v11-titulo-opcional';
const urlsToCache = [
  './',
  './index.html',
  './cardapio.html',
  './admin.html',
  './style.css',
  './style-cardapio.css',
  './script.js',
  './script-cardapio.js',
  './admin.js',
  './manifest.json',
  './images/favu.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ESTRATÉGIA: Rede Primeiro, Cache como backup (Network First)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});