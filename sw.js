/**
 * KPR — Service Worker (kapsam: tüm site)
 *
 * Strateji: önce önbellek, sürüm sürüm.
 *   - Tanıtım sitesi, uygulama (/app/) ve gizlilik sayfası kurulumda önbelleğe alınır;
 *     hepsi internetsiz açılır. HTML/CSS/JS hep aynı sürümden gelir.
 *   - /api/ istekleri (syllabus okuma) asla önbelleğe alınmaz.
 *   - Yazı tipleri (fonts/*.woff2) kabukta; dışarıdan yazı tipi yüklenmez.
 *
 * YAYIN KURALI: Herhangi bir dosyayı değiştirip yayınladığında VERSION'ı artır.
 * Uygulamada "Yeni sürüm hazır → Yenile" uyarısı çıkar (bkz. js/app.js).
 */

const VERSION = "2.25.1";
const SHELL_CACHE = `kpr-shell-${VERSION}`;

const SHELL = [
  "./",
  "./app.html",
  "./gizlilik.html",
  "./manifest.webmanifest",
  "./logo-mark.svg",
  "./tokens.css",
  "./theme-boot.js",
  "./theme.js",
  "./i18n.js",
  "./lang/en.js",
  "./lang/en-core.js",
  "./lang/en-a.js",
  "./lang/en-b.js",
  "./lang/en-c.js",
  "./lang/en-d.js",
  "./fonts/inter-latin.woff2",
  "./fonts/inter-latin-ext.woff2",
  "./fonts/space-grotesk-latin.woff2",
  "./fonts/space-grotesk-latin-ext.woff2",
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
  "./mail.js",
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
  // skipWaiting burada yok: sayfa karar verir (app.js — açılışta hemen, kullanımda arka plana geçince ya da "Yenile" ile).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Eski kabuk sürümleri ve v2.14.1 öncesinin Google Fonts önbelleği ("kpr-fonts") silinir
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("kpr-shell-") && k !== SHELL_CACHE) || k === "kpr-fonts").map((k) => caches.delete(k))))
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
});

/* ------------------------------------------------------------------ */
/* Bildirimler                                                          */
/* ------------------------------------------------------------------ */

const REMINDER_CACHE = "kpr-reminders";
const REMINDER_URL = "./__kpr-reminders.json";

/**
 * Bildirim metni ve "şimdi gösterilecekler" mantığı: alerts.js'teki describeReminder / pickDueReminders'ın
 * BİREBİR kopyası (worker modül değil, import edemez). Değişirse ikisi birlikte değişir;
 * test/reminders.mjs iki kopyanın kaynak metnini ve çıktısını karşılaştırır.
 */
function describeReminder(r, now, L) {
  var f = function (s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v && k in v ? String(v[k]) : m; }); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  if (r.kind === "day" || !L) return { title: r.title, body: r.body };
  var tg = new Date(r.target);
  var nw = new Date(now);
  var days = Math.round((new Date(tg.getFullYear(), tg.getMonth(), tg.getDate()) - new Date(nw.getFullYear(), nw.getMonth(), nw.getDate())) / 86400000);
  var ms = r.target - now;
  var hhmm = pad(tg.getHours()) + ":" + pad(tg.getMinutes());
  var mins = Math.max(1, Math.ceil(ms / 60000));
  var when;
  if (r.kind === "class") return { title: f(L.cls, { n: mins, ders: r.ad }), body: r.body };
  if (r.hasTime && ms < 2 * 3600000) when = f(L.min, { n: mins });
  else if (r.hasTime && days === 0 && ms < 6 * 3600000) when = f(L.hour, { n: Math.max(1, Math.round(ms / 3600000)) });
  else if (days <= 0) when = r.hasTime ? f(L.todayAt, { saat: hhmm }) : L.today;
  else if (days === 1) when = r.hasTime ? f(L.tomorrowAt, { saat: hhmm }) : L.tomorrow;
  else when = f(L.days, { n: days });
  if (r.kind === "exam") {
    var body = days >= 2 ? L.examPlan
      : days === 1 ? (r.hasTime ? f(L.examEve, { saat: r.time }) : L.examEveNoTime)
        : (r.hasTime ? f(L.examStart, { saat: r.time }) : L.examToday);
    return { title: f(L.exam, { when: when, ad: r.ad }), body: body };
  }
  return { title: f(L.due, { when: when, ad: r.ad }), body: f(L.dueBody, { tur: r.tur, saat: r.hasTime ? r.time : L.dayEnd }) };
}

function digestNotice(texts, L) {
  var lines = texts.slice(0, 4).map(function (r) { return r.title; });
  if (texts.length > 4) lines.push(L.more.replace("{n}", texts.length - 4));
  return { title: L.digest.replace("{n}", texts.length), body: lines.join("\n") };
}
function pickDueReminders(list, sent, now, catchUp) {
  var show = [];
  var skip = [];
  list.forEach(function (r) {
    if (sent[r.id] || r.fireAt > now || now - r.fireAt > catchUp) return;
    if (now >= r.target) skip.push(r);
    else show.push(r);
  });
  var latest = show.filter(function (r) {
    return !r.taskId || !show.some(function (o) { return o !== r && o.taskId === r.taskId && o.fireAt > r.fireAt; });
  });
  show.forEach(function (r) { if (latest.indexOf(r) < 0) skip.push(r); });
  return { show: latest, skip: skip };
}


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
  // Hedefi geçmiş ya da yenisi gelmiş hatırlatma gösterilmez, gönderildi sayılır (notify.js ile aynı mantık)
  const { show, skip } = pickDueReminders(data.reminders || [], sent, now, 12 * 3600 * 1000);
  for (const r of skip) sent[r.id] = now;
  if (show.length) {
    // Metin gösterim anındaki kalan süreye göre; eski önbellekte "strings" yoksa planlanan metin kalır
    const texts = show.map((r) => Object.assign({}, r, describeReminder(r, now, data.strings)));
    // Eski önbellekte strings ya da "more" yoksa Türkçe yedek
    const L = Object.assign({ digest: "{n} hatırlatman var", more: "+{n} tane daha" }, data.strings || {});
    if (texts.length > 3) {
      const d = digestNotice(texts, L);
      await self.registration.showNotification(d.title, { body: d.body, tag: "kpr-digest", icon: "icon-192.png", data: { url: "#/bugun" } });
    } else {
      for (const r of texts) await self.registration.showNotification(r.title, { body: r.body, tag: r.id, icon: "icon-192.png", data: { url: r.url } });
    }
  } else if (!skip.length) return;
  for (const r of show) sent[r.id] = now;
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
