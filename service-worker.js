self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Listener fetch wajib ada agar Chrome Android mengizinkan instalasi
self.addEventListener('fetch', (e) => {
  // Biarkan kosong, yang penting event listener ini terdaftar
});
