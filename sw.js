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

const VERSION = "2.13.1";
const SHELL_CACHE = `kpr-shell-${VERSION}`;
const FONT_CACHE = "kpr-fonts";

const SHELL = [
  "./",
  "./app.html",
  "./gizlilik.html",
  "./manifest.webmanifest",
  "./logo-mark.svg",
  "./tokens.css",
  "./site.css",
  "./app.css",
  "./site.js",
  "./app.js",
  "./store.js",
  "./dates.js",
  "./ui.js",
  "./icons.js",
  "./install.js",
  "./components.js",
  "./forms.js",
  "./importer.js",
  "./onboarding.js",
  "./today.js",
  "./schedule.js",
  "./tasks.js",
  "./courses.js",
  "./settings.js",
  "./gpa.js",
  "./gpa-view.js",
  "./term.js", "./density.js", "./doc-text.js", "./syllabus-local.js",
  "./asistan.js",
  "./ders.js",
  "./weights.js",
  "./migrate.js",
  "./ders-calc.js",
  "./asistan-core.js",
  "./grade-sheet.js",
  "./course-merge.js",
  "./secmeli.js",
  "./attendance.js",
  "./alerts.js",
  "./notify.js",
  "./ics.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

/**
 * Yönlendirilmiş (redirected) bir cevap, sayfa açılışına (navigate) verilirse tarayıcı reddeder
 * ve sayfa ERR_FAILED ile açılmaz. Sunucular "app.html" → "/app" gibi temiz adrese yönlendirebilir
 * (serve, Cloudflare Pages); bu yüzden önbelleğe koymadan önce yönlendirme izi silinir.
 */
function unredirect(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: "reload" }).then((res) => {
            if (!res.ok) throw new Error(`${url} ${res.status}`);
            return unredirect(res).then((clean) => cache.put(url, clean));
          })
        )
      )
    )
  );
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
      const fallback = url.pathname.endsWith("/app.html") ? "./app.html" : "./";
      event.respondWith(
        caches
          .match(request, { ignoreSearch: true })
          .then((cached) => cached || fetch(request).catch(() => caches.match(fallback)))
          .then(unredirect)
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

/* ------------------------------------------------------------------ */
/* Bildirimler                                                          */
/* ------------------------------------------------------------------ */

const REMINDER_CACHE = "kpr-reminders";
const REMINDER_URL = "./__kpr-reminders.json";

/**
 * Android Chrome: uygulama kapalıyken tarayıcı ara ara bu olayı tetikler.
 * Uygulamanın yazdığı hatırlatma listesinden zamanı gelenleri gösterir.
 */
async function showDueReminders() {
  const cache = await caches.open(REMINDER_CACHE);
  const res = await cache.match(REMINDER_URL);
  if (!res) return;
  const data = await res.json();
  const sent = data.sent || {};
  const now = Date.now();
  const due = (data.reminders || []).filter((r) => r.fireAt <= now && now - r.fireAt <= 12 * 3600 * 1000 && !sent[r.id]);
  if (!due.length) return;
  if (due.length > 3) {
    await self.registration.showNotification(`${due.length} hatırlatman var`, {
      body: due.slice(0, 4).map((r) => r.title).join("\n"), tag: "kpr-digest", icon: "icon-192.png", data: { url: "#/bugun" },
    });
  } else {
    for (const r of due) await self.registration.showNotification(r.title, { body: r.body, tag: r.id, icon: "icon-192.png", data: { url: r.url } });
  }
  for (const r of due) sent[r.id] = now;
  await cache.put(REMINDER_URL, new Response(JSON.stringify({ ...data, sent }), { headers: { "content-type": "application/json" } }));
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "kpr-reminders") event.waitUntil(showDueReminders());
});

/**
 * Web Push: bir push sunucusu kurulduğunda bildirimler buradan gelir.
 * iOS, bildirim göstermeyen push'ları birkaç kez sonra aboneliği iptal ettiği için
 * her push mutlaka bir bildirim gösterir.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Köprü", {
      body: data.body || "Yaklaşan bir hatırlatman var.", tag: data.tag, icon: "icon-192.png", data: { url: data.url || "#/bugun" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(`./app.html${event.notification.data?.url || "#/bugun"}`, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes("app.html"));
      if (open) return open.navigate(target).then((c) => (c || open).focus()).catch(() => open.focus());
      return self.clients.openWindow(target);
    })
  );
});
