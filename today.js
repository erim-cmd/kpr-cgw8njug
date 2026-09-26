import { store } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { todayIdx, todayISO, nowMin, daysUntil, fmtLong, greeting, byDue } from "./dates.js";
import { sessionsOn, sessionItem, taskItem, emptyState, installCard } from "./components.js";
import { buildAlerts } from "./alerts.js";
import { permissionState } from "./notify.js";

const DISMISS_KEY = "kpr:dismissed";
const SHOW = 3; // aynı anda en fazla bu kadar uyarı; gerisi katlanır
let expanded = false;

export function dismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY)) || {};
  } catch {
    return {};
  }
}

export function dismiss(id) {
  const d = dismissed();
  d[id] = Date.now();
  const cutoff = Date.now() - 60 * 86400000;
  for (const k of Object.keys(d)) if (d[k] < cutoff) delete d[k];
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
  } catch {}
}

function alertCard(a) {
  const target = a.taskId ? `data-task="${esc(a.taskId)}"` : a.courseId ? `data-course="${esc(a.courseId)}"` : a.route ? `data-route="${esc(a.route)}"` : "";
  return `<li class="alert ${a.level}">
    <button type="button" class="alert-body" data-action="open-alert" ${target}>
      <span class="alert-icon">${icon.alert}</span>
      <span><strong>${esc(a.title)}</strong>${a.text ? `<small>${esc(a.text)}</small>` : ""}</span>
    </button>
    <button type="button" class="icon-btn sm" data-action="dismiss-alert" data-id="${esc(a.id)}" aria-label="Uyarıyı kapat">${icon.close}</button>
  </li>`;
}

/** Bildirimleri açmaya davet: sadece görev varsa ve kullanıcı kapatmadıysa. */
function notifyCard(state) {
  const perm = permissionState();
  if (!state.tasks.length || state.settings.notify || dismissed()["notify-card"]) return "";
  if (perm === "default") {
    return `<div class="install-card notify-card">
      <span class="alert-icon ok">${icon.bell}</span>
      <div><strong>Sınavdan önce haber verelim mi?</strong><p>Sınav, teslim ve günlük özet bildirimleri.</p></div>
      <button class="btn btn-primary" type="button" data-action="enable-notify">Aç</button>
      <button class="icon-btn sm" type="button" data-action="dismiss-alert" data-id="notify-card" aria-label="Kapat">${icon.close}</button>
    </div>`;
  }
  if (perm === "ios-install") {
    return `<div class="install-card notify-card">
      <span class="alert-icon ok">${icon.bell}</span>
      <div><strong>iPhone'da bildirim için</strong><p>Önce KPR'yi ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra oradan aç.</p></div>
      <button class="icon-btn sm" type="button" data-action="dismiss-alert" data-id="notify-card" aria-label="Kapat">${icon.close}</button>
    </div>`;
  }
  return "";
}

export function view() {
  const state = store.get();
  const { profile, courses, tasks } = state;
  const sessions = sessionsOn(courses, todayIdx());
  const open = tasks.filter((t) => !t.done);
  const upcoming = open.filter((t) => daysUntil(t.due) <= 14).sort(byDue);
  const thisWeek = open.filter((t) => daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6).length;
  const exams = open.filter((t) => t.type === "sinav" && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 30).length;
  const now = nowMin();
  const hidden = dismissed();
  const alerts = buildAlerts(state).filter((a) => !hidden[a.id]);

  let todayBlock;
  if (!courses.length) {
    todayBlock = emptyState(
      "Dönemine başla",
      "Bir dersin syllabus'unu yükle; ders saatleri, sınav tarihleri ve not dağılımı otomatik gelsin.",
      "import-syllabus", "Syllabus yükle",
      ["new-course", "Elle ekle"]
    );
  } else if (!sessions.length) {
    todayBlock = '<p class="muted-note">Bugün dersin yok. Keyfini çıkar ✨</p>';
  } else {
    todayBlock = `<ul class="list">${sessions.map((s) => sessionItem(s, now, todayISO())).join("")}</ul>`;
  }

  return `
    <header class="page-head">
      <p class="eyebrow">${fmtLong(new Date())}</p>
      <h1 class="page-title">${greeting()}, ${esc(profile.name)}</h1>
    </header>

    ${installCard()}
    ${notifyCard(state)}

    <div class="stats">
      <div class="stat"><b>${sessions.length}</b><span>ders bugün</span></div>
      <div class="stat"><b>${thisWeek}</b><span>görev bu hafta</span></div>
      <div class="stat"><b>${exams}</b><span>sınav 30 gün içinde</span></div>
    </div>

    ${alerts.length ? `<section class="section">
      <div class="section-head"><h2>Dikkat</h2></div>
      <ul class="list">${(expanded ? alerts : alerts.slice(0, SHOW)).map(alertCard).join("")}</ul>
      ${alerts.length > SHOW ? `<button type="button" class="link more-link" data-action="toggle-alerts">${expanded ? "Daha az göster" : `${alerts.length - SHOW} uyarı daha`}</button>` : ""}
    </section>` : ""}

    <section class="section">
      <div class="section-head"><h2>Bugünkü dersler</h2><a class="link" href="#/program">Haftalık program</a></div>
      ${todayBlock}
    </section>

    <section class="section">
      <div class="section-head"><h2>Önümüzdeki 2 hafta</h2><a class="link" href="#/gorevler">Tümü</a></div>
      ${upcoming.length
        ? `<ul class="list">${upcoming.map((t) => taskItem(t, courses)).join("")}</ul>`
        : emptyState("Yaklaşan bir şey yok", "Sınav ve ödevlerini ekle, geri sayımı KPR tutsun.", "new-task", "Görev ekle")}
    </section>`;
}

export const actions = {
  "toggle-alerts"(_el, { render }) {
    expanded = !expanded;
    render();
  },
};
