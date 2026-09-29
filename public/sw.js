const CACHE = "farmvoice-offline-v3";
// Keep shell references plus at most 100 dynamically loaded chunks. Replacing
// a shell prunes chunks from previous releases, even when this worker is unchanged.
async function pruneAssets(cache) {
  const referenced = new Set();
  for (const path of ["/records", "/offline"]) {
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
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const path of ["/records", "/offline"]) {
        const response = await fetch(path);
        if (!response.ok || response.redirected)
          throw new Error("Offline shell unavailable");
        const html = await response.clone().text();
        await cache.put(path, response);
        const assets = [
          ...new Set(
            [
              ...html.matchAll(
                /(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g,
              ),
            ].map((m) => m[1].replace(/&amp;/g, "&")),
          ),
        ];
        await cache.addAll(assets);
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("farmvoice-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const staticAsset = url.pathname.startsWith("/_next/static/");
  const shell =
    request.mode === "navigate" &&
    ["/records", "/offline"].includes(url.pathname);
  if (!staticAsset && !shell) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => storeResponse(cache, shell ? url.pathname : request, copy)),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(shell ? url.pathname : request);
        return (
          cached ||
          (shell ? await caches.match("/offline") : null) ||
          Response.error()
        );
      }),
  );
});
