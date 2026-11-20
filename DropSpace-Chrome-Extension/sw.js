const CACHE_NAME = "dropspace-app-shell-v1";
const APP_ROOT = new URL("./", self.registration.scope).href;
const APP_SHELL = [
  "./",
  "./site.webmanifest",
  "./dropspace-logo.png",
  "./dropspace-icon-192.png",
  "./dropspace-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("dropspace-app-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(APP_ROOT, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_ROOT)) || Response.error()),
    );
    return;
  }

  const isBuiltAsset = requestUrl.pathname.includes("/assets/") ||
    /\.(?:png|svg|ico|jpe?g|webp|woff2?)$/i.test(requestUrl.pathname);
  if (isBuiltAsset) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});
