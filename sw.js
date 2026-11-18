// InvestAI service worker: veikia kaip programėlė ir be interneto rodo paskutinį turinį.
// Puslapiai ir duomenys – pirmiausia iš tinklo (kad visada būtų naujausi), CSS/JS su ?v= ir OCR failai – iš talpyklos.
const VERSION = "v8";
const SHELL = `investai-shell-${VERSION}`;
const STATIC = `investai-static-${VERSION}`;
const OCR = "investai-ocr-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["./", "portfelis.html", "rinkos.html", "apzvalga.html", "naujienos.html", "irankiai.html", "rytas.html", "zodynas.html", "aktyvas.html", "manifest.webmanifest"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("investai-") && ![SHELL, STATIC, OCR].includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // TradingView, šriftai – naršyklė tvarko pati
  if (req.mode === "navigate" || url.pathname.endsWith(".html")) return e.respondWith(networkFirst(req, SHELL));
  if (url.pathname.includes("/assets/ocr/")) return e.respondWith(cacheFirst(req, OCR));
  if (url.pathname.includes("/assets/logos/") || url.pathname.includes("/assets/vendor/")) return e.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.includes("/assets/") && url.search.includes("v=")) return e.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.includes("/data/") || url.pathname.includes("/assets/")) return e.respondWith(networkFirst(req, STATIC));
});
