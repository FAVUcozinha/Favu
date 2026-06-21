const CACHE_NAME = 'favu-client-v100-upload-sem-nome-sem-preview-vazio';
const urlsToCache = [
  './',
  './index.html',
  './cardapio.html',
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
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.warn('Falha ao pré-cachear alguns arquivos:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Rede primeiro, mas sem interceptar uploads/APIs Firebase.
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = req.url;

  // Nunca intercepte upload, POST, PUT, PATCH, DELETE etc.
  if (req.method !== 'GET') return;

  // Nunca intercepte Firebase/Google APIs. Isso evita conflito com Auth, Firestore e Storage.
  if (
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('www.googleapis.com') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
