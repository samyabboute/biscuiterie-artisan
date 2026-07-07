// Service Worker — cache l'intégralité du shell applicatif au fil de l'eau
// (stratégie « réseau puis cache », mise à jour en arrière-plan) afin que la
// PWA fonctionne hors-ligne après une première visite complète en ligne.
// Les appels à l'API Supabase ne sont jamais mis en cache ici : les données
// métier passent par IndexedDB + le moteur de synchro (src/lib/pwa/sync.js).
const CACHE_NOM = 'artisan-livreur-v1';
// Dossier de l'app déduit de l'URL du service worker lui-même (et non codé
// en dur) : fonctionne aussi bien à la racine qu'un sous-dossier GitHub
// Pages (ex. /biscuiterie-artisan/app/) sans rien à modifier au déploiement.
const BASE = new URL('./', self.location.href).pathname;
const PRECACHE_URLS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_NOM)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE_NOM).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evenement) => {
  const { request } = evenement;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.hostname.includes('supabase.co')) return; // données dynamiques : jamais en cache SW
  if (url.origin !== self.location.origin) return;

  evenement.respondWith(
    caches.match(request).then((reponseCache) => {
      const depuisReseau = fetch(request)
        .then((reponseReseau) => {
          if (reponseReseau && reponseReseau.status === 200) {
            const copie = reponseReseau.clone();
            caches.open(CACHE_NOM).then((cache) => cache.put(request, copie));
          }
          return reponseReseau;
        })
        .catch(() => reponseCache);

      return reponseCache || depuisReseau;
    })
  );
});
