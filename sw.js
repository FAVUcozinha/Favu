const CACHE_NAME = 'favu-app-v7';
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
  './images/favu.png',
  './images/topo.png',
  './images/roda.png',
  './images/logoroda.png',
  './images/BS.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});