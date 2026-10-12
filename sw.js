// Photos: pinned CDN commit, so cache-first forever. App files: network-first so updates land, cache for a gym with no signal.
// ponytail: network-first waits on a slow connection before falling back; switch to stale-while-revalidate if that hurts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open('photos').then(async c => (await c.match(r)) || fetch(r).then(res => {
      if (res.ok) c.put(r, res.clone());
      return res;
    })));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open('app').then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true })));
  }
});
