const CACHE = "farmvoice-offline-v8";
const INSTALL_SHELLS = ["/records", "/team/crew", "/offline"];
const CACHEABLE_SHELLS = new Set([
  "/records",
  "/fields",
  "/map",
  "/team",
  "/team/crew",
  "/worker",
  "/h2a",
  "/h2a/arrival",
  "/h2a/housing",
  "/offline",
]);

async function pruneAssets(cache) {
  const referenced = new Set();
  for (const path of CACHEABLE_SHELLS) {
    const shell = await cache.match(path);
    if (!shell) continue;
    for (const match of (await shell.text()).matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g))
      referenced.add(new URL(match[1].replace(/&amp;/g, "&"), self.location.origin).href);
  }
  const extra = (await cache.keys()).filter(request =>
    new URL(request.url).pathname.startsWith("/_next/static/") && !referenced.has(request.url));
  for (const request of extra.slice(0, Math.max(0, extra.length - 100)))
    await cache.delete(request);
}

async function storeResponse(cache, key, response) {
  await cache.put(key, response);
  await pruneAssets(cache);
}

async function cacheShell(cache, path, response) {
  const html = await response.clone().text();
  await cache.put(path, response);
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)]
        .map((m) => m[1].replace(/&amp;/g, "&")),
    ),
  ];
  await Promise.all(
    assets.map(async (asset) => {
      try {
        const res = await fetch(asset);
        if (res.ok) await cache.put(asset, res);
      } catch {}
    }),
  );
  await pruneAssets(cache);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const path of INSTALL_SHELLS) {
        const response = await fetch(path);
        if (!response.ok || response.redirected)
          throw new Error("Offline shell unavailable");
        await cacheShell(cache, path, response);
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("farmvoice-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const path = event.data?.type === "CACHE_SHELL" ? event.data.path : null;
  if (!path || !CACHEABLE_SHELLS.has(path)) return;
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(path, { credentials: "include" });
        if (!response.ok || response.redirected) return;
        const cache = await caches.open(CACHE);
        await cacheShell(cache, path, response);
      } catch {}
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const staticAsset = url.pathname.startsWith("/_next/static/");
  const shell = request.mode === "navigate" && CACHEABLE_SHELLS.has(url.pathname);
  if (!staticAsset && !shell) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) =>
              shell
                ? cacheShell(cache, url.pathname, copy)
                : storeResponse(cache, request, copy),
            ),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(shell ? url.pathname : request);
        return cached || (shell ? await caches.match("/offline") : null) || Response.error();
      }),
  );
});
