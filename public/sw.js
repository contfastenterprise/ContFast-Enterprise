// Service Worker minimal para permitir la instalación de la PWA
// sin interferir con las peticiones de red del servidor (pass-through).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through: No interferir con las peticiones. Esto evita errores de red (ERR_FAILED)
  // en páginas dinámicas o redirecciones de autenticación en Next.js.
  return;
});
