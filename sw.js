/* Service worker : l'application doit s'ouvrir hors connexion depuis l'écran
   d'accueil. Les fichiers de l'app sont servis depuis le cache ; les tuiles de
   carte passent par le réseau, avec repli sur le cache si la connexion manque. */
const VERSION = 'carnet-v10';
const FICHIERS = ['./', './index.html', './manifest.webmanifest',
                  './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FICHIERS).catch(()=>{}))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'tuiles').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Tuiles de carte : réseau d'abord, cache ensuite, plafonné pour ne pas
     remplir l'appareil. */
  if (url.hostname.endsWith('openstreetmap.org')) {
    e.respondWith(
      fetch(req).then(r => {
        const copie = r.clone();
        caches.open('tuiles').then(c => c.put(req, copie).then(() => limiterTuiles(c)));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  /* Fichiers de l'application : cache d'abord, mise à jour en arrière-plan. */
  e.respondWith(
    caches.match(req).then(cache => {
      const reseau = fetch(req).then(r => {
        if (r && r.status === 200 && url.origin === location.origin)
          caches.open(VERSION).then(c => c.put(req, r.clone()));
        return r;
      }).catch(() => cache);
      return cache || reseau;
    })
  );
});

async function limiterTuiles(c) {
  const ks = await c.keys();
  if (ks.length > 400) for (const k of ks.slice(0, ks.length - 400)) c.delete(k);
}
