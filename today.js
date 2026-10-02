import { store } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { todayIdx, todayISO, toISO, toMin, nowMin, daysUntil, fmtLong, fmtShort, greeting, byDue, relLabel } from "./dates.js";
import { TASK_TYPES, isExam } from "./store.js";
import { density } from "./density.js";
import { sessionsOn, sessionItem, taskItem, emptyState, installCard } from "./components.js";
import { buildAlerts } from "./alerts.js";
import { permissionState } from "./notify.js";
import { weekView, resetDay, actions as weekActions } from "./schedule.js";

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

/** Geri sayım metni: "Bugün 23:59", "Yarın", "5 gün". */
function countdown(t) {
  const n = daysUntil(t.due);
  if (n === 0) return t.time ? `Bugün ${t.time}` : "Bugün";
  if (n === 1) return t.time ? `Yarın ${t.time}` : "Yarın";
  return `${n} gün`;
}

/** Ekranın üstü: sıradaki teslim büyük kartta; ayrı bir sınav yaklaşıyorsa altında geri sayımı. */
function heroBlock(open, courses) {
  const next = open.filter((t) => daysUntil(t.due) >= 0).sort(byDue)[0];
  if (!next) return "";
  const c = courses.find((x) => x.id === next.courseId);
  const exam = open.filter((t) => isExam(t) && t.id !== next.id && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 30).sort(byDue)[0];
  const ec = exam && courses.find((x) => x.id === exam.courseId);
  const urgent = daysUntil(next.due) <= 1;
  return `<section class="hero ${urgent ? "urgent" : ""}" style="--c:${c?.color || "var(--cyan)"}">
    <p class="hero-eyebrow">Sıradaki · ${TASK_TYPES[next.type]}${c ? ` · ${esc(c.code || c.name)}` : ""}</p>
    <div class="hero-main">
      <button type="button" class="hero-title" data-action="edit-task" data-id="${esc(next.id)}">${esc(next.title)}</button>
      <div class="hero-count"><b>${countdown(next)}</b><small>${fmtShort(next.due)}</small></div>
    </div>
    <button type="button" class="btn btn-ghost hero-done" data-action="toggle-task" data-id="${esc(next.id)}">${icon.check}Bitti</button>
    ${exam ? `<button type="button" class="hero-exam" data-action="edit-task" data-id="${esc(exam.id)}">
      <span>Sıradaki sınav: <b>${esc(exam.title)}</b>${ec ? ` · ${esc(ec.code || ec.name)}` : ""}</span><b class="need">${relLabel(daysUntil(exam.due))}</b></button>` : ""}
  </section>`;
}

let weekOpen = false; // hafta satırının altındaki liste açık mı

/**
 * Bu hafta ve gelecek hafta tek satırda (Dönem akışıyla aynı hesap).
 * Haftada teslim varsa dokununca o haftanın teslimleri satırın altında açılır; sakin hafta düz metin.
 */
function weekLine(state, open) {
  const d = density(open, state.settings);
  if (d.current === null) return "";
  const cur = d.weeks[d.current];
  const nxt = d.weeks[d.current + 1];
  const tag = (w) => (w.final ? "final haftası" : w.vize ? "vize haftası" : w.busy ? "yoğun" : "sakin");
  const text = `<span><b>${d.current + 1}. hafta</b> · ${cur.items.length ? `${cur.items.length} teslim` : "sakin"}</span>
    ${nxt ? `<span>Gelecek hafta: <b class="${nxt.busy || nxt.vize || nxt.final ? "warn-text" : ""}">${tag(nxt)}</b></span>` : ""}`;
  if (!cur.items.length) return `<div class="week-line calm">${text}</div>`;
  const list = [...cur.items].sort(byDue).map((t) => taskItem(t, state.courses)).join("");
  return `<button type="button" class="week-line" data-action="toggle-week" aria-expanded="${weekOpen}">${text}<span class="chev" aria-hidden="true">${weekOpen ? "▴" : "▾"}</span></button>
    ${weekOpen ? `<ul class="list week-list">${list}</ul>` : ""}`;
}

/** Dünkü dersler: bitişinin üstünden 24 saat geçmediyse "Gitmedim" için listede kalır. */
function yesterdayBlock(courses, now) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const list = sessionsOn(courses, (todayIdx() + 6) % 7).filter((s) => now < toMin(s.end));
  if (!list.length) return "";
  const iso = toISO(y);
  return `<p class="mini-title gap-t">Dün</p>
    <ul class="list">${list.map((s) => sessionItem(s, 24 * 60, iso)).join("")}</ul>`;
}

export function view() {
  const state = store.get();
  const { profile, courses, tasks } = state;
  const sessions = sessionsOn(courses, todayIdx());
  const open = tasks.filter((t) => !t.done);
  // Sıradaki teslim üstteki kartta; liste ondan sonrakileri 7 gün boyunca gösterir
  const heroId = open.filter((t) => daysUntil(t.due) >= 0).sort(byDue)[0]?.id;
  const upcoming = open.filter((t) => t.id !== heroId && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7).sort(byDue);
  const now = nowMin();
  const hidden = dismissed();
  // Üstteki kartın gösterdiği görev için uyarıyı tekrarlama
  const heroTask = open.filter((t) => daysUntil(t.due) >= 0).sort(byDue)[0];
  const alerts = buildAlerts(state).filter((a) => !hidden[a.id] && a.taskId !== heroTask?.id);

  const mode = state.settings.todayView;
  const seg = `<div class="seg today-seg" role="group" aria-label="Görünüm">
      <button type="button" data-action="today-view" data-view="bugun" aria-pressed="${mode === "bugun"}">Bugün</button>
      <button type="button" data-action="today-view" data-view="hafta" aria-pressed="${mode === "hafta"}">Hafta</button>
    </div>`;
  const startEmpty = () => emptyState(
      "Dönemine başla",
      "Bir dersin syllabus'unu yükle; ders saatleri, sınav tarihleri ve not dağılımı otomatik gelsin.",
      "import-syllabus", "Syllabus yükle",
      ["new-course", "Elle ekle"]
    );
  const head = `<header class="page-head">
      <p class="eyebrow">${fmtLong(new Date())}</p>
      <h1 class="page-title">${greeting()}, ${esc(profile.name)}</h1>
    </header>`;

  // Hafta: eski "Program" sekmesi (gün çipleri + seçilen günün dersleri). Programı boşsa tek boş durum.
  if (mode === "hafta") {
    return `${head}${seg}
      ${courses.length ? `<section class="section week-view">${weekView()}</section>` : startEmpty()}
      <p class="week-more"><a class="link" href="#/gorevler">Tüm görevleri gör</a></p>`;
  }

  let todayBlock;
  if (!courses.length) {
    todayBlock = startEmpty();
  } else if (!sessions.length) {
    todayBlock = '<p class="muted-note">Bugün dersin yok. Keyfini çıkar ✨</p>';
  } else {
    todayBlock = `<ul class="list">${sessions.map((s) => sessionItem(s, now, todayISO())).join("")}</ul>`;
  }

  return `
    ${head}
    ${seg}

    ${installCard()}
    ${notifyCard(state)}

    ${heroBlock(open, courses)}
    ${weekLine(state, open)}

    ${alerts.length ? `<section class="section">
      <div class="section-head"><h2>Dikkat</h2></div>
      <ul class="list">${(expanded ? alerts : alerts.slice(0, SHOW)).map(alertCard).join("")}</ul>
      ${alerts.length > SHOW ? `<button type="button" class="link more-link" data-action="toggle-alerts">${expanded ? "Daha az göster" : `${alerts.length - SHOW} uyarı daha`}</button>` : ""}
    </section>` : ""}

    <section class="section">
      <div class="section-head"><h2>Bugünkü dersler</h2><button type="button" class="link" data-action="today-view" data-view="hafta">Haftalık program</button></div>
      ${todayBlock}
      ${courses.length ? yesterdayBlock(courses, now) : ""}
    </section>

    <section class="section">
      <div class="section-head"><h2>Bu hafta</h2><a class="link" href="#/gorevler">Tümü</a></div>
      ${upcoming.length
        ? `<ul class="list">${upcoming.map((t) => taskItem(t, courses)).join("")}</ul>`
        : heroId ? '<p class="muted-note">Bu hafta başka teslim yok.</p>'
        : emptyState("Yaklaşan bir şey yok", "Sınav ve ödevlerini ekle, geri sayımı KPR tutsun.", "new-task", "Görev ekle")}
    </section>`;
}

export const actions = {
  ...weekActions,
  "today-view"(el) {
    if (el.dataset.view === "hafta") resetDay();
    store.setSettings({ todayView: el.dataset.view });
    window.scrollTo(0, 0);
  },
  "toggle-week"(_el, { render }) {
    weekOpen = !weekOpen;
    render();
  },
  "toggle-alerts"(_el, { render }) {
    expanded = !expanded;
    render();
  },
};
