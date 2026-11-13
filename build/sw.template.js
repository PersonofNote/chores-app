/* House Monitor service worker. Generated at build time from build/sw.template.js:
 * the plugin in build/service-worker.ts fills in the precache list and version.
 *
 * - Install: precache every built file (the whole app is a few dozen KB).
 * - Fetch: same-origin GETs come from the cache, falling back to the network;
 *   page navigations get the cached app shell, so the app opens offline.
 * - Activate: delete caches from older versions.
 * - Updates wait until the page asks (message SKIP_WAITING), so code never
 *   changes under someone mid-use.
 */
const VERSION = '__CACHE_VERSION__'
const PRECACHE = __PRECACHE_MANIFEST__
const PREFIX = 'house-monitor-'
const CACHE = PREFIX + VERSION
const SHELL = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.location).href))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(SHELL)) || fetch(request)),
    )
    return
  }
  event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)))
})
