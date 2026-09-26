/**
 * KPR — Service Worker (kapsam: tüm site)
 *
 * Strateji: önce önbellek, sürüm sürüm.
 *   - Tanıtım sitesi, uygulama (/app/) ve gizlilik sayfası kurulumda önbelleğe alınır;
 *     hepsi internetsiz açılır. HTML/CSS/JS hep aynı sürümden gelir.
 *   - /api/ istekleri (syllabus okuma) asla önbelleğe alınmaz.
 *   - Google Fonts ayrı önbellekte, "önce önbellek, arkada tazele".
 *
 * YAYIN KURALI: Herhangi bir dosyayı değiştirip yayınladığında VERSION'ı artır.
 * Uygulamada "Yeni sürüm hazır → Yenile" uyarısı çıkar (bkz. js/app.js).
 */

const VERSION = "2.1.0";
const SHELL_CACHE = `kpr-shell-${VERSION}`;
const FONT_CACHE = "kpr-fonts";

const SHELL = [
  "/",
  "/app/",
  "/gizlilik",
  "/manifest.webmanifest",
  "/css/tokens.css",
  "/css/site.css",
  "/css/app.css",
  "/js/site.js",
  "/js/app.js",
  "/js/store.js",
  "/js/dates.js",
  "/js/ui.js",
  "/js/icons.js",
  "/js/install.js",
  "/js/components.js",
  "/js/forms.js",
  "/js/importer.js",
  "/js/gpa.js",
  "/js/attendance.js",
  "/js/views/onboarding.js",
  "/js/views/today.js",
  "/js/views/schedule.js",
  "/js/views/tasks.js",
  "/js/views/courses.js",
  "/js/views/settings.js",
  "/js/views/term.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  // skipWaiting burada yok: yeni sürüm, kullanıcı "Yenile"ye basınca devreye girer.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kpr-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return;

    if (request.mode === "navigate") {
      // Sayfa açılışı: önbellekteki sayfa; yoksa ağ; ağ da yoksa uygulama kabuğu
      const fallback = url.pathname.startsWith("/app") ? "/app/" : "/";
      event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(
          (cached) => cached || fetch(request).catch(() => caches.match(fallback))
        )
      );
      return;
    }

    event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok || res.type === "opaque") cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
