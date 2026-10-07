/**
 * KPR — Uygulama girişi
 * Yönlendirme (#/bugun, #/donem …), ekran çizimi, olay dağıtımı
 * ve service worker kaydı + güncelleme akışı burada.
 */

import { store } from "./store.js";
import { runMigrations } from "./migrate.js";
import { toast } from "./ui.js";
import { icon } from "./icons.js";
import { openCourseForm, openTaskForm, openCourseDetail } from "./forms.js";
import { openImport } from "./importer.js";
import { onInstallChange, promptInstall, dismissInstall, isNativeApp } from "./install.js";
import * as onboarding from "./onboarding.js";
import * as today from "./today.js";
import * as tasks from "./tasks.js";
import * as courses from "./courses.js";
import * as settings from "./settings.js";
import * as term from "./term.js";
import * as asistan from "./asistan.js";
import * as secmeli from "./secmeli.js";
import { attendance } from "./attendance.js";
import { dismiss } from "./today.js";
import { todayISO } from "./dates.js";
import { enableNotifications, checkReminders, sync, permissionState } from "./notify.js";
import { applyTheme } from "./theme.js";
import { setLang, getLang, t } from "./i18n.js";

// Kayıtlı veri eski biçimdeyse ekran çizilmeden önce yeni biçime geçir (bir kez; migrate.js)
runMigrations();
// Görünüm (theme-boot.js ilk kararı verdi; burada tarayıcı çubuğu rengi ve "Sistem" takibi kurulur)
applyTheme(store.get().settings.theme);
// Dil: ilk çizimden önce (sabit etiketler ve <html lang> da buna göre; büyük harf İ/I doğru olsun)
setLang(store.get().settings.lang);

const ROUTES = {
  // Alttaki ana düğme: Bugün ve Dersler'de geniş "Syllabus ekle"; Görevler'de küçük + (görev). Görev ekleme
  // Bugün'de "Bu hafta" başlığındaki küçük düğmede (Erim geri bildirimi, 7 Eki: syllabus daha belirgin, görev daha küçük)
  bugun: { mod: today, get title() { return t("Bugün"); }, icon: "home", fab: "import-syllabus" },
  gorevler: { mod: tasks, get title() { return t("Görevler"); }, icon: "tasks", fab: "new-task" },
  dersler: { mod: courses, get title() { return t("Dersler"); }, icon: "book", fab: "import-syllabus" },
  asistan: { mod: asistan, get title() { return t("Asistan"); }, icon: "chat", fab: null, accent: true },
  donem: { mod: term, get title() { return t("Dönem"); }, icon: "gauge", fab: null },
  ortalama: { mod: term.ortalama, get title() { return t("Ders harfleri"); }, fab: null },
  secmeli: { mod: secmeli, get title() { return t("Seçmeli"); }, icon: "compass", fab: null },
  ayarlar: { mod: settings, get title() { return t("Ayarlar"); }, fab: null },
};
// Alt menü 5 sekme: 6'sı telefonda göz yoruyor. Program Bugün'ün "Hafta" görünümünde,
// Ortalama Dönem'in ikincil sayfası; Görevler Bugün'ün altında ("Tümü" bağlantısı).
const TABS = ["bugun", "dersler", "asistan", "donem", "secmeli"];
const TAB_OF = { gorevler: "bugun", ortalama: "donem" };
// v2.10 öncesi adresler (bildirimler, yer imleri): sorgu korunarak yeni yere
const REDIRECTS = {
  program: ["bugun", "gorunum", "hafta"], // i18n-ok
};

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");
const $fab = document.getElementById("fab");
const $settings = document.getElementById("settings-link");
const $add = document.getElementById("add-syllabus");

// Sekme çubuğu ve üst çubuk metinleri: dil değişince render() yeniden çizer
let chromeLang = null;
function drawChrome() {
  if (chromeLang === getLang()) return;
  chromeLang = getLang();
  $tabbar.innerHTML = `<div class="tabbar-inner">${TABS.map(
    (r) => `<a class="tab${ROUTES[r].accent ? " tab-accent" : ""}" href="#/${r}" data-route="${r}"><span class="tab-ic">${icon[ROUTES[r].icon]}</span><span>${ROUTES[r].title}</span></a>`
  ).join("")}</div>`;
  $add.innerHTML = `${icon.upload}<span>${t("Syllabus ekle")}</span>`;
  document.getElementById("site-link").textContent = `← ${t("Tanıtım sayfası")}`;
}
$fab.innerHTML = icon.plus;
$settings.innerHTML = icon.settings;
drawChrome();

/** Eski adresi yenisine çevirir; bilinmeyen rota Bugün'e düşmeden ÖNCE çalışır, sorgu korunur. */
function redirectOld() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  // v2.15: Ortalama Dönem'in sekmesi değil, ayrı sayfa
  if (path === "donem" && new URLSearchParams(query).get("bolum") === "ortalama") return history.replaceState(null, "", "#/ortalama");
  const to = REDIRECTS[path];
  if (!to) return;
  const params = new URLSearchParams(query);
  params.set(to[1], to[2]);
  history.replaceState(null, "", `#/${to[0]}?${params}`);
}

function parseHash() {
  redirectOld();
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { name: ROUTES[path] ? path : "bugun", params: new URLSearchParams(query) };
}

/**
 * Tek seferlik adres parametreleri: ?gorunum=hafta (Bugün → Hafta), ?bolum=akis (Dönem'de bölüme kaydır).
 * Uygulanınca adresten silinir; yoksa her yeniden çizimde tekrar kaydırırdı.
 */
function applyParams() {
  if (!store.get().profile.name) return;
  const { name, params } = parseHash();
  const view = params.get("gorunum");
  const section = params.get("bolum");
  if (!view && !section) return;
  params.delete("gorunum");
  params.delete("bolum");
  const rest = params.toString();
  history.replaceState(null, "", `#/${name}${rest ? `?${rest}` : ""}`);
  if (view === "hafta" || view === "bugun") store.setSettings({ todayView: view }); // i18n-ok
  // hashchange dinleyicisinin scrollTo(0, 0) çağrısından sonra çalışsın
  if (section) setTimeout(() => term.scrollToSection(section, false), 0);
}

function currentModule() {
  return store.get().profile.name ? ROUTES[parseHash().name].mod : onboarding;
}

// ------------------------------------------------------------------
// Çizim
// ------------------------------------------------------------------
function render() {
  const isOnboarding = !store.get().profile.name;
  drawChrome();
  document.body.classList.toggle("onboarding", isOnboarding);

  if (isOnboarding) {
    $view.innerHTML = onboarding.view();
    document.title = "Köprü"; // i18n-ok
    return;
  }

  const { name } = parseHash();
  const route = ROUTES[name];
  $view.innerHTML = route.mod.view();
  document.title = `${route.title} · Köprü`; // i18n-ok

  const markCurrent = (el, on) => (on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current"));
  $tabbar.querySelectorAll(".tab").forEach((a) => markCurrent(a, a.dataset.route === (TAB_OF[name] || name)));
  markCurrent($settings, name === "ayarlar");

  // Ders yokken tek eylem "Syllabus ekle": + düğmesi (görev ekle) gizli
  const hasCourses = store.get().courses.length > 0;
  $add.hidden = true; // üst çubuktaki eski "Syllabus ekle" yerine alttaki geniş düğme
  $fab.hidden = !route.fab || !hasCourses;
  $fab.dataset.action = route.fab || "";
  const wide = route.fab === "import-syllabus";
  $fab.classList.toggle("fab-wide", wide);
  $fab.innerHTML = wide ? `${icon.upload}<span>${t("Syllabus ekle")}</span>` : icon.plus;
  if (wide) $fab.removeAttribute("aria-label"); else $fab.setAttribute("aria-label", t("Görev ekle"));
  // Onboarding sonrası ilk çizim dahil: eski adresten gelen ?gorunum / ?bolum burada uygulanır
  applyParams();
}

// ------------------------------------------------------------------
// Olaylar: data-action (tıklama), data-change, data-submit
// ------------------------------------------------------------------
const find = (list, id) => list.find((x) => x.id === id);

const globalActions = {
  "new-task": () => openTaskForm(),
  "new-course": () => openCourseForm(),
  "edit-task": (el) => openTaskForm(find(store.get().tasks, el.dataset.id)),
  "edit-course": (el) => openCourseForm(find(store.get().courses, el.dataset.id)),
  "course-detail": (el) => openCourseDetail(el.dataset.id),
  "import-syllabus": () => openImport(),
  "toggle-task": (el) => {
    const task = store.toggleTask(el.dataset.id);
    if (task?.done) toast(t("Tamamlandı 🎉"), { label: t("Geri al"), onClick: () => store.toggleTask(task.id) });
  },
  install: () => promptInstall(),

  // Uyarılar
  "open-alert": (el) => {
    const { task, course, route } = el.dataset;
    if (task) openTaskForm(find(store.get().tasks, task));
    else if (course) openCourseDetail(course);
    else if (route) location.hash = `#/${route}`;
  },
  "dismiss-alert": (el, { render }) => {
    dismiss(el.dataset.id);
    render();
  },
  "enable-notify": async (_el, { render }) => {
    const perm = permissionState();
    if (perm === "denied") return toast(t("Bildirimler tarayıcı ayarlarında kapalı. Site ayarlarından izin ver."));
    const ok = await enableNotifications();
    toast(ok ? t("Bildirimler açıldı") : t("Bildirim izni verilmedi"));
    render();
  },

  // Devamsızlık: biten derste "Gitmedim" (Geri al bildirimi 5 sn)
  "mark-absent": (el) => {
    const c = find(store.get().courses, el.dataset.id);
    if (!c) return;
    // Bugün listesinde dünkü (son 24 saatte biten) dersler de olabilir: tarih düğmeden gelir
    const date = el.dataset.date || todayISO();
    const existing = c.absences.find((a) => a.date === date && a.start === el.dataset.start);
    if (existing) {
      store.removeAbsence(c.id, existing.id);
      toast(t("Devamsızlık geri alındı"));
    } else {
      store.addAbsence(c.id, date, el.dataset.start);
      // Sınıra yaklaşıldıysa uygulama içinde hemen uyar
      const a = attendance(find(store.get().courses, c.id), store.get().settings.termWeeks);
      const name = c.code || c.name;
      const msg =
        a.level === "over" ? t("{ders}: devamsızlık sınırı aşıldı", { ders: name })
          : a.level === "last" ? t("{ders}: devamsızlık hakkın bitti", { ders: name })
            : a.level === "warn" ? t("{ders}: 1 devamsızlık hakkın kaldı", { ders: name })
              : t("Devamsızlık kaydedildi");
      toast(msg, { label: t("Geri al"), onClick: () => {
        const again = find(store.get().courses, c.id)?.absences.find((a) => a.date === date && a.start === el.dataset.start);
        if (again) store.removeAbsence(c.id, again.id);
      } });
    }
  },
  "dismiss-install": () => dismissInstall(),
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.closest("dialog")) return;
  const name = el.dataset.action;
  const fn = currentModule().actions?.[name] || globalActions[name];
  if (fn) {
    e.preventDefault();
    fn(el, { render });
  }
});

$view.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  currentModule().changes?.[el?.dataset.change]?.(el, { render });
});

$view.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-submit]");
  const fn = currentModule().submits?.[form?.dataset.submit];
  if (fn) {
    e.preventDefault();
    fn(form, { render });
  }
});

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
  handleShortcut();
});
// Dil, ekran çizilmeden önce güncellenir (yedekten yüklemede de dil uysun)
store.subscribe(() => setLang(store.get().settings.lang));
store.subscribe(render);
// Yedekten yükleme / sıfırlama da tema tercihini değiştirebilir
store.subscribe(() => applyTheme(store.get().settings.theme));

// Veri değişince arka plan hatırlatma listesini güncelle (art arda değişiklikleri birleştir)
let syncTimer;
store.subscribe(() => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 800);
});
onInstallChange(render);

// Uygulama ikonuna uzun basınca çıkan kısayol: #/gorevler?yeni=1
function handleShortcut() {
  if (!store.get().profile.name || !parseHash().params.has("yeni")) return; // i18n-ok
  history.replaceState(null, "", `#/${parseHash().name}`);
  openTaskForm();
}

// Gece yarısı / ders saatleri değişince "Bugün" güncel kalsın.
// Kullanıcı bir form doldururken ekranı yeniden çizmiyoruz.
const isBusy = () =>
  document.querySelector("dialog[open]") || $view.contains(document.activeElement) && document.activeElement.matches("input, select, textarea");
const refresh = () => {
  checkReminders();
  if (document.visibilityState === "visible" && !isBusy()) render();
};
setInterval(refresh, 60 * 1000);
document.addEventListener("visibilitychange", refresh);

render();
handleShortcut();

// ------------------------------------------------------------------
// Service worker + "Yeni sürüm hazır" akışı
// ------------------------------------------------------------------
// Mağaza uygulamasında dosyalar uygulamanın içinde, güncelleme mağazadan gelir: service worker yok
if ("serviceWorker" in navigator && !isNativeApp()) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" });

      const offerUpdate = (worker) =>
        toast(t("Yeni sürüm hazır"), {
          label: t("Yenile"),
          sticky: true,
          onClick: () => worker.postMessage("SKIP_WAITING"),
        });

      // Yeni sürüm kullanıcı "Yenile"ye basmadan da gelsin (Erim, 7 Eki: telefonda eski sürüm kalıyordu):
      //  - açılışta bekleyen sürüm varsa hemen geçilir (henüz bir şey yazılmadı);
      //  - kullanım sırasında gelirse "Yenile" önerilir, uygulama arka plana geçince (form açık değilse) kendiliğinden geçilir.
      const startedAt = Date.now();
      const apply = (worker) => worker.postMessage("SKIP_WAITING");
      const applyWhenHidden = (worker) => {
        const onHide = () => {
          if (document.visibilityState !== "hidden" || document.querySelector("dialog[open]")) return;
          document.removeEventListener("visibilitychange", onHide);
          apply(worker);
        };
        document.addEventListener("visibilitychange", onHide);
      };
      const handle = (worker) => {
        if (Date.now() - startedAt < 8000 && !document.querySelector("dialog[open]")) return apply(worker);
        offerUpdate(worker);
        applyWhenHidden(worker);
      };
      if (reg.waiting && navigator.serviceWorker.controller) handle(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) handle(worker);
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });

      // Hatırlatmalar: kaçanları göster, arka plan listesini tazele
      navigator.serviceWorker.ready.then(() => {
        checkReminders();
        sync();
      });

      // Açık kalan uygulamada saatte bir güncelleme kontrolü
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (err) {
      console.error("[KPR] Service worker kaydı başarısız:", err);
    }
  });
}
