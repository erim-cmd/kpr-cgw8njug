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
import { onInstallChange, promptInstall, dismissInstall } from "./install.js";
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

// Kayıtlı veri eski biçimdeyse ekran çizilmeden önce yeni biçime geçir (bir kez; migrate.js)
runMigrations();

const ROUTES = {
  bugun: { mod: today, title: "Bugün", icon: "home", fab: "new-task" },
  gorevler: { mod: tasks, title: "Görevler", icon: "tasks", fab: "new-task" },
  dersler: { mod: courses, title: "Dersler", icon: "book", fab: "import-syllabus" },
  asistan: { mod: asistan, title: "Asistan", icon: "chat", fab: null, accent: true },
  donem: { mod: term, title: "Dönem", icon: "gauge", fab: null },
  secmeli: { mod: secmeli, title: "Seçmeli", icon: "compass", fab: null },
  ayarlar: { mod: settings, title: "Ayarlar", fab: null },
};
// Alt menü 5 sekme: 6'sı telefonda göz yoruyor. Program Bugün'ün "Hafta" görünümünde,
// Ortalama Dönem'in bir bölümünde; Görevler Bugün'ün altında ("Tümü" bağlantısı).
const TABS = ["bugun", "dersler", "asistan", "donem", "secmeli"];
const TAB_OF = { gorevler: "bugun" };
// v2.10 öncesi adresler (bildirimler, yer imleri): sorgu korunarak yeni yere
const REDIRECTS = {
  program: ["bugun", "gorunum", "hafta"],
  ortalama: ["donem", "bolum", "ortalama"],
};

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");
const $fab = document.getElementById("fab");
const $settings = document.getElementById("settings-link");

$tabbar.innerHTML = `<div class="tabbar-inner">${TABS.map(
  (r) => `<a class="tab${ROUTES[r].accent ? " tab-accent" : ""}" href="#/${r}" data-route="${r}"><span class="tab-ic">${icon[ROUTES[r].icon]}</span><span>${ROUTES[r].title}</span></a>`
).join("")}</div>`;
$fab.innerHTML = icon.plus;
$settings.innerHTML = icon.settings;

/** Eski adresi yenisine çevirir; bilinmeyen rota Bugün'e düşmeden ÖNCE çalışır, sorgu korunur. */
function redirectOld() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
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
 * Tek seferlik adres parametreleri: ?gorunum=hafta (Bugün → Hafta), ?bolum=ortalama (Dönem'de bölüme kaydır).
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
  if (view === "hafta" || view === "bugun") store.setSettings({ todayView: view });
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
  document.body.classList.toggle("onboarding", isOnboarding);

  if (isOnboarding) {
    $view.innerHTML = onboarding.view();
    document.title = "KPR — Öğrenci Asistanı";
    return;
  }

  const { name } = parseHash();
  const route = ROUTES[name];
  $view.innerHTML = route.mod.view();
  document.title = `${route.title} · KPR`;

  const markCurrent = (el, on) => (on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current"));
  $tabbar.querySelectorAll(".tab").forEach((a) => markCurrent(a, a.dataset.route === (TAB_OF[name] || name)));
  markCurrent($settings, name === "ayarlar");

  $fab.hidden = !route.fab;
  $fab.dataset.action = route.fab || "";
  $fab.setAttribute("aria-label", route.fab === "import-syllabus" ? "Ders ekle" : "Görev ekle");
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
    const t = store.toggleTask(el.dataset.id);
    if (t?.done) toast("Tamamlandı 🎉", { label: "Geri al", onClick: () => store.toggleTask(t.id) });
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
    if (perm === "denied") return toast("Bildirimler tarayıcı ayarlarında kapalı. Site ayarlarından izin ver.");
    const ok = await enableNotifications();
    toast(ok ? "Bildirimler açıldı" : "Bildirim izni verilmedi");
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
      toast("Devamsızlık geri alındı");
    } else {
      store.addAbsence(c.id, date, el.dataset.start);
      // Sınıra yaklaşıldıysa uygulama içinde hemen uyar
      const a = attendance(find(store.get().courses, c.id), store.get().settings.termWeeks);
      const name = c.code || c.name;
      const msg =
        a.level === "over" ? `⚠️ ${name}: devamsızlık sınırı aşıldı`
          : a.level === "last" ? `⚠️ ${name}: devamsızlık hakkın bitti`
            : a.level === "warn" ? `${name}: 1 devamsızlık hakkın kaldı`
              : "Devamsızlık kaydedildi";
      toast(msg, { label: "Geri al", onClick: () => {
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
store.subscribe(render);

// Veri değişince arka plan hatırlatma listesini güncelle (art arda değişiklikleri birleştir)
let syncTimer;
store.subscribe(() => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 800);
});
onInstallChange(render);

// Uygulama ikonuna uzun basınca çıkan kısayol: #/gorevler?yeni=1
function handleShortcut() {
  if (!store.get().profile.name || !parseHash().params.has("yeni")) return;
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
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" });

      const offerUpdate = (worker) =>
        toast("Yeni sürüm hazır", {
          label: "Yenile",
          sticky: true,
          onClick: () => worker.postMessage("SKIP_WAITING"),
        });

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
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
