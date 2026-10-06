// Offline support: keeps a copy of the app files on the device.
// Your expense data is NOT here — it lives only in the app's local storage.
const CACHE = "expense-app-v12";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png"
];
const NET_TIMEOUT = 3000;   // on a weak signal, wait at most 3 s for the internet, then open the saved copy

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The saved copy of the app page
async function cachedPage() {
  const c = await caches.open(CACHE);
  return (await c.match("./index.html")) || (await c.match("./")) || null;
}
// Save the page only if it is a real, good response (never save error pages)
async function savePage(res) {
  if (res && res.ok && res.type === "basic") {
    const c = await caches.open(CACHE);
    await c.put("./index.html", res.clone());
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Opening the app: try the internet for the newest version, but never wait long.
  if (req.mode === "navigate") {
    const network = fetch(req, { cache: "no-store" });
    e.waitUntil(network.then(savePage).catch(() => {}));      // keep the saved copy fresh in the background
    e.respondWith((async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), NET_TIMEOUT));
      try {
        const res = await Promise.race([network, timeout]);
        if (res !== "timeout" && res.ok) return res;           // good, fresh page
      } catch (err) { /* offline */ }
      const saved = await cachedPage();                        // offline, slow or error → saved copy
      if (saved) return saved;
      try { return await network; } catch (err) {}             // nothing saved yet → wait for the internet
      return new Response("<h2 style='font-family:sans-serif;padding:24px'>You are offline. Please connect to the internet once to set up the app.</h2>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } });
    })());
    return;
  }

  // Everything else (icons, manifest): saved copy first, then internet.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
