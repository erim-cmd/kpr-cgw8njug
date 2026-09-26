/**
 * KPR — Uygulama girişi
 * Yönlendirme (#/bugun, #/program …), ekran çizimi, olay dağıtımı
 * ve service worker kaydı + güncelleme akışı burada.
 */

import { store } from "./store.js";
import { toast } from "./ui.js";
import { icon } from "./icons.js";
import { openCourseForm, openTaskForm, openCourseDetail } from "./forms.js";
import { openImport } from "./importer.js";
import { onInstallChange, promptInstall, dismissInstall } from "./install.js";
import * as onboarding from "./onboarding.js";
import * as today from "./today.js";
import * as schedule from "./schedule.js";
import * as tasks from "./tasks.js";
import * as courses from "./courses.js";
import * as settings from "./settings.js";
import * as term from "./term.js";

const ROUTES = {
  bugun: { mod: today, title: "Bugün", icon: "home", fab: "new-task" },
  program: { mod: schedule, title: "Program", icon: "calendar", fab: "import-syllabus" },
  gorevler: { mod: tasks, title: "Görevler", icon: "tasks", fab: "new-task" },
  dersler: { mod: courses, title: "Dersler", icon: "book", fab: "import-syllabus" },
  donem: { mod: term, title: "Dönem", icon: "chart", fab: null },
  ayarlar: { mod: settings, title: "Ayarlar", fab: null },
};
const TABS = ["bugun", "program", "gorevler", "dersler", "donem"];

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");
const $fab = document.getElementById("fab");
const $settings = document.getElementById("settings-link");

$tabbar.innerHTML = `<div class="tabbar-inner">${TABS.map(
  (r) => `<a class="tab" href="#/${r}" data-route="${r}">${icon[ROUTES[r].icon]}<span>${ROUTES[r].title}</span></a>`
).join("")}</div>`;
$fab.innerHTML = icon.plus;
$settings.innerHTML = icon.settings;

function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { name: ROUTES[path] ? path : "bugun", params: new URLSearchParams(query) };
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
  $tabbar.querySelectorAll(".tab").forEach((a) => markCurrent(a, a.dataset.route === name));
  markCurrent($settings, name === "ayarlar");

  $fab.hidden = !route.fab;
  $fab.dataset.action = route.fab || "";
  $fab.setAttribute("aria-label", route.fab === "import-syllabus" ? "Ders ekle" : "Görev ekle");
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
const refresh = () => document.visibilityState === "visible" && !isBusy() && render();
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

      // Açık kalan uygulamada saatte bir güncelleme kontrolü
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (err) {
      console.error("[KPR] Service worker kaydı başarısız:", err);
    }
  });
}
