// Service worker minimal : sert uniquement à rendre l'app installable
// (icône écran d'accueil, lancement plein écran) et à accélérer les
// rechargements du shell statique. PAS d'ambition hors-ligne réelle —
// l'app dépend entièrement de Supabase/OpenAI, donc rien n'est utilisable
// sans réseau de toute façon. Les appels /api/* et Supabase ne sont
// jamais interceptés.
const CACHE = 'wishlist-studio-shell-v1';
const SHELL = ['/', '/styles.css', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // laisse passer Supabase/OpenAI/Google Fonts
  if (url.pathname.startsWith('/api/')) return; // jamais de cache sur les endpoints IA

  // Pages HTML : réseau d'abord (toujours la dernière version des liens
  // versionnés app.js?v=N/db.js?v=N), repli sur le cache si hors-ligne.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Fichiers versionnés (?v=N) : immuables une fois récupérés, cache
  // d'abord pour la vitesse, sinon réseau (et on les met en cache).
  if (url.searchParams.has('v')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }))
    );
    return;
  }
});
