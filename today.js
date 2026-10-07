import { store } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { todayIdx, todayISO, toISO, toMin, nowMin, daysUntil, fmtLong, fmtShort, greeting, byDue, relLabel, parseISO, DAYS } from "./dates.js";
import { TASK_TYPES, isExam, isLight } from "./store.js";
import { sessionsOn, sessionItem, taskItem, emptyState, installCard, startCard } from "./components.js";
import { buildAlerts } from "./alerts.js";
import { permissionState } from "./notify.js";
import { weekView, resetDay, setDay, actions as weekActions } from "./schedule.js";

const DISMISS_KEY = "kpr:dismissed";
// Uyarılar varsayılan katlı: ekranda öne çıkan tek şey "Sıradaki" kartı
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

/** Katlı "Dikkat" satırı: sayı + ilk uyarının başlığı; dokununca liste açılır. */
function alertsBlock(alerts) {
  if (!alerts.length) return "";
  const danger = alerts.some((a) => a.level === "danger");
  return `<section class="section">
    <button type="button" class="alerts-fold${danger ? " danger" : ""}" data-action="toggle-alerts" aria-expanded="${expanded}">
      <span class="alert-icon">${icon.alert}</span>
      <span><strong>Dikkat · ${alerts.length} uyarı</strong>${expanded ? "" : `<small>${esc(alerts[0].title)}</small>`}</span>
      <span class="fold-caret" aria-hidden="true">${expanded ? "▴" : "▾"}</span>
    </button>
    ${expanded ? `<ul class="list alerts-open">${alerts.map(alertCard).join("")}</ul>` : ""}
  </section>`;
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
      <div><strong>iPhone'da bildirim için</strong><p>Önce Köprü'yü ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra oradan aç.</p></div>
      <button class="icon-btn sm" type="button" data-action="dismiss-alert" data-id="notify-card" aria-label="Kapat">${icon.close}</button>
    </div>`;
  }
  return "";
}

/** Sıradaki işin rengi: kırmızı sadece yakın sınavda, sarı yakın teslimde; gerisi nötr. */
function toneOf(t, n) {
  if (isExam(t)) return n <= 2 ? "danger" : n <= 7 ? "warn" : "";
  return n <= 1 ? "warn" : "";
}

/** Ekranın odağı: sıradaki iş tek kartta, gün bilgisi bir kez. Ayrı bir sınav yaklaşıyorsa kartın altında. */
/**
 * "Sıradaki" kartının seçimi tek yerde: sadece teslim ve sınav; okuma/kişisel (isLight) karta çıkmaz,
 * "Bu hafta" listesinde kalır (ders ekranındaki "sıradaki değerlendirme" ile tutarlı).
 * exam: karttaki işten ayrı, 30 gün içindeki en yakın sınav.
 */
function heroPick(open) {
  const task = open.filter((t) => !isLight(t) && daysUntil(t.due) >= 0).sort(byDue)[0] || null;
  const exam = open.filter((t) => isExam(t) && t.id !== task?.id && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 30).sort(byDue)[0] || null;
  return { task, exam };
}

function heroBlock(open, courses) {
  const { task: next, exam } = heroPick(open);
  if (!next) return "";
  const c = courses.find((x) => x.id === next.courseId);
  const ec = exam && courses.find((x) => x.id === exam.courseId);
  const n = daysUntil(next.due);
  const when = n === 0 ? "Bugün" : n === 1 ? "Yarın" : n <= 6 ? `${n} gün` : esc(fmtShort(next.due));
  const sub = n <= 6 ? `${esc(n <= 1 ? DAYS[(parseISO(next.due).getDay() + 6) % 7] : fmtShort(next.due))}${next.time ? ` · ${esc(next.time)}` : ""}` : esc(next.time || "");
  return `<section class="focus ${toneOf(next, n)}" style="--c:${c?.color || "var(--cyan)"}">
    <div class="focus-top">
      <span class="focus-label">${isExam(next) ? "Sıradaki sınav" : "Sıradaki teslim"}</span>
      ${c ? `<span class="focus-course"><i></i>${esc(c.code || c.name)}</span>` : ""}
    </div>
    <div class="focus-main">
      <button type="button" class="focus-title" data-action="edit-task" data-id="${esc(next.id)}">${esc(next.title)}<small>${TASK_TYPES[next.type]}${c && c.code ? ` · ${esc(c.name)}` : ""}</small></button>
      <div class="focus-when"><b>${when}</b>${sub ? `<small>${sub}</small>` : ""}</div>
    </div>
    <button type="button" class="focus-done" data-action="toggle-task" data-id="${esc(next.id)}">${icon.check}Bitti</button>
    ${exam ? `<button type="button" class="focus-exam" data-action="edit-task" data-id="${esc(exam.id)}">
      <span>Sonraki sınav</span><span><b>${esc(exam.title)}</b>${ec ? ` · ${esc(ec.code || ec.name)}` : ""}</span><b class="${daysUntil(exam.due) <= 2 ? "danger-text" : ""}">${relLabel(daysUntil(exam.due))}</b></button>` : ""}
  </section>`;
}

/**
 * Hafta şeridi: bu takvim haftasının 7 günü; her günün altında sınav / teslim noktası.
 * Dönem başlangıcı girildiyse üstünde "3. hafta / 14 · Gelecek hafta: vize haftası" (Dönem akışıyla aynı hesap).
 * Güne dokununca Hafta görünümü o günle açılır.
 */
// Hafta şeridi components.js'te (Hafta görünümüyle ortak)

/** Selamın altındaki tek cümle: bugünün ve haftanın özeti. */
function summary(state, open, sessions, now) {
  if (!state.courses.length) return "";
  const left = sessions.filter((s) => now < toMin(s.end)).length;
  const week = open.filter((t) => !isLight(t) && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6 - todayIdx()).length;
  const a = !sessions.length ? "Bugün dersin yok" : left ? `Bugün ${left} dersin var` : "Bugünkü derslerin bitti";
  const b = week ? `bu hafta ${week} teslimin var` : "bu hafta başka teslimin yok";
  return `<p class="page-sub">${a}, ${b}.</p>`;
}

/** Dersin olmayan gün: boş kutu yerine sıradaki dersi söyle. */
function nextClassNote(courses) {
  const ti = todayIdx();
  for (let k = 1; k <= 7; k++) {
    const day = (ti + k) % 7;
    const s = sessionsOn(courses, day)[0];
    if (s) {
      const when = k === 1 ? "Yarın" : DAYS[day];
      return `<p class="muted-note">Bugün dersin yok. Sıradaki: <b>${when} ${esc(s.start)}</b> · ${esc(s.course.name)}</p>`;
    }
  }
  return '<p class="muted-note">Bugün dersin yok.</p>';
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
  const now = nowMin();
  const mode = state.settings.todayView;
  // Sıradaki teslim üstteki kartta; liste ondan sonrakileri 7 gün boyunca gösterir
  const { task: heroTask, exam: heroExam } = heroPick(open);
  const heroId = heroTask?.id;
  const upcoming = open.filter((t) => t.id !== heroId && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7).sort(byDue);
  const hidden = dismissed();
  // Üstteki kartın gösterdiği görev için uyarıyı tekrarlama
  // Kartta görünen sınav da uyarı listesinde tekrar etmesin
  // "Bu hafta" listesindeki görevler de uyarıda tekrar etmez (aynı bilgi iki kez gösterilmez)
  const shown = new Set([heroTask?.id, heroExam?.id, ...upcoming.map((t) => t.id)].filter(Boolean));
  // Yaklaşan ders uyarısı Bugün'de gereksiz: aynı bilgi ders satırında ("30 dk sonra") duruyor
  const alerts = buildAlerts(state).filter((a) => !hidden[a.id] && !shown.has(a.taskId) && !a.id.startsWith("class:"));

  const seg = `<div class="seg today-seg" role="group" aria-label="Görünüm">
      <button type="button" data-action="today-view" data-view="bugun" aria-pressed="${mode === "bugun"}">Bugün</button>
      <button type="button" data-action="today-view" data-view="hafta" aria-pressed="${mode === "hafta"}">Hafta</button>
    </div>`;
  const head = `<header class="page-head">
      <p class="eyebrow">${fmtLong(new Date())}</p>
      <h1 class="page-title">${greeting()}, ${esc(profile.name)}</h1>
      ${mode === "bugun" ? summary(state, open, sessions, now) : ""}
    </header>`;

  // İlk açılış: ders yokken tek eylem "Syllabus ekle" (görünüm düğmesi, boş listeler yok)
  if (!courses.length) {
    return `${head}${startCard()}
      ${upcoming.length || heroId ? `${heroBlock(open, courses)}<section class="section">
        <div class="section-head"><h2>Bu hafta</h2><a class="link" href="#/gorevler">Tümü</a></div>
        <ul class="list">${upcoming.map((t) => taskItem(t, courses)).join("")}</ul></section>` : ""}`;
  }

  // Hafta: eski "Program" sekmesi (gün çipleri + seçilen günün dersleri)
  if (mode === "hafta") {
    return `${head}${seg}
      <section class="section week-view">${weekView()}</section>
      <p class="week-more"><a class="link" href="#/gorevler">Tüm görevleri gör</a></p>`;
  }

  let todayBlock;
  if (!sessions.length) {
    todayBlock = nextClassNote(courses);
  } else {
    todayBlock = `<ul class="list">${sessions.map((s) => sessionItem(s, now, todayISO())).join("")}</ul>`;
  }

  return `
    ${head}
    ${seg}

    ${heroBlock(open, courses)}
    ${alertsBlock(alerts)}

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
        : emptyState("Yaklaşan bir şey yok", "Sınav ve ödevlerini ekle, geri sayımı Köprü tutsun.", "new-task", "Görev ekle")}
    </section>

    ${installCard()}
    ${notifyCard(state)}`;
}

export const actions = {
  ...weekActions,
  "today-view"(el) {
    if (el.dataset.view === "hafta") resetDay();
    store.setSettings({ todayView: el.dataset.view });
    window.scrollTo(0, 0);
  },
  "strip-day"(el) {
    setDay(Number(el.dataset.day));
    store.setSettings({ todayView: "hafta" });
    window.scrollTo(0, 0);
  },
  "toggle-alerts"(_el, { render }) {
    expanded = !expanded;
    render();
  },
};
