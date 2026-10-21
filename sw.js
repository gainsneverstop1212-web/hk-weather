/* Service worker for 香港天氣.
   - The page itself and weather data: network first, falling back to the last saved copy when offline.
   - The 3D engine and Lands Department map tiles: saved after the first download and reused, so
     returning visits draw the map at once. Map tiles are capped so the cache cannot grow without limit.
   - Google 3D tiles are never stored (their terms do not allow it). */
const VERSION = "v1";
const SHELL = "shell-" + VERSION;
const ENGINE = "engine-" + VERSION;
const TILES = "tiles-" + VERSION;
const DATA = "data-" + VERSION;
const MAX_TILES = 4000;

const SHELL_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, ENGINE, TILES, DATA]);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function kind(url) {
  if (url.origin === self.location.origin) return "shell";
  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/cesium@")) return "engine";
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return "engine";
  if (url.hostname === "data.map.gov.hk" || url.hostname === "mapapi.geodata.gov.hk") return "tiles";
  if (url.hostname === "data.weather.gov.hk" || url.hostname === "raw.githubusercontent.com") return "data";
  return null;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: cacheName === SHELL });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && (res.type === "cors" || res.type === "basic")) {
    await cache.put(req, res.clone());
    if (limit) trim(cache, limit);
  }
  return res;
}

let trimming = false;
async function trim(cache, limit) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.length - limit;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const k = kind(url);
  if (k === "shell" || k === "data") event.respondWith(networkFirst(req, k === "shell" ? SHELL : DATA));
  else if (k === "engine") event.respondWith(cacheFirst(req, ENGINE));
  else if (k === "tiles") event.respondWith(cacheFirst(req, TILES, MAX_TILES));
});

// Clicking a warning notification brings the app to the front.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
