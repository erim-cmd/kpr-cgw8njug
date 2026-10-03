/** KPR — Birden çok ekranda kullanılan HTML parçaları. */

import { TASK_TYPES, POLICY_KINDS, isExam, isLight } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { daysUntil, relLabel, fmtShort, toMin, toISO, todayIdx, DAYS, DAYS_SHORT } from "./dates.js";
import { density } from "./density.js";
import { installMode, isDismissed } from "./install.js";

/** Belirli bir gündeki tüm ders saatleri, saate göre sıralı. */
export function sessionsOn(courses, day) {
  return courses
    .flatMap((c) => c.sessions.filter((s) => s.day === day).map((s) => ({ ...s, course: c })))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

/**
 * now: dakika cinsinden şu an (sadece bugünün listesi için), yoksa null
 * absentDate: verilirse BİTMİŞ derste "Gitmedim" düğmesi çıkar (devamsızlık; varsayılan: derse gittin).
 * Düğme ders bitiminden 24 saat sonrasına kadar durur; dünkü dersler için çağıran now=1440 verir.
 */
export function sessionItem(s, now = null, absentDate = null) {
  let state = "";
  if (now !== null) {
    if (now >= toMin(s.end)) state = "past";
    else if (now >= toMin(s.start)) state = "now";
  }
  const absent = absentDate && s.course.absences.some((a) => a.date === absentDate && a.start === s.start);
  const absBtn = absentDate && (state === "past" || absent)
    ? `<button type="button" class="abs-btn ${absent ? "on" : ""}" data-action="mark-absent" data-id="${esc(s.course.id)}" data-start="${esc(s.start)}" data-date="${esc(absentDate)}" aria-pressed="${!!absent}">${absent ? "Gitmedim ✓" : "Gitmedim"}</button>`
    : "";
  const meta = [s.course.code, s.room].filter(Boolean).map(esc).join(" · ");
  // Bugün başlamasına 2 saatten az kalan ders: "40 dk sonra"
  const left = now !== null && !state ? toMin(s.start) - now : null;
  const soon = left !== null && left > 0 && left <= 120 ? `<span class="badge soft">${left < 60 ? `${left} dk sonra` : `${Math.floor(left / 60)} sa ${left % 60 ? `${left % 60} dk ` : ""}sonra`}</span>` : "";
  return `<li class="${absBtn ? "session-wrap" : ""}">
    <button class="session ${state} ${absent ? "absent" : ""}" style="--c:${s.course.color}" data-action="course-detail" data-id="${esc(s.course.id)}">
      <span class="session-time">${esc(s.start)}<small>${esc(s.end)}</small></span>
      <span>
        <span class="session-name">${esc(s.course.name)}${state === "now" ? '<span class="badge">Şu an</span>' : soon}</span>
        ${meta ? `<span class="session-meta">${meta}</span>` : ""}
      </span>
    </button>${absBtn}
  </li>`;
}

export function taskItem(t, courses) {
  const course = courses.find((c) => c.id === t.courseId);
  const n = daysUntil(t.due);
  const cls = t.done ? "done" : n < 0 ? "overdue" : n <= 2 ? "soon" : "";
  const when = t.done ? fmtShort(t.due) : relLabel(n);
  const sub = t.done ? (t.time || "") : `${fmtShort(t.due)}${t.time ? " · " + t.time : ""}`;
  return `<li class="task ${cls}">
    <button class="check" data-action="toggle-task" data-id="${esc(t.id)}" aria-pressed="${t.done}"
      aria-label="${esc(t.title)}: ${t.done ? "tamamlanmadı olarak işaretle" : "tamamlandı olarak işaretle"}">${icon.check}</button>
    <button class="task-body" data-action="edit-task" data-id="${esc(t.id)}">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">
        <span class="tag tag-${t.type}">${TASK_TYPES[t.type]}</span>
        ${course ? `<span class="dot" style="--c:${course.color}"></span><span class="course-ref">${esc(course.code || course.name)}</span>` : ""}
      </span>
    </button>
    <span class="task-when"><b>${when}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
  </li>`;
}

export function emptyState(title, text, action, label, secondary) {
  return `<div class="empty">
    <strong>${title}</strong>
    <p>${text}</p>
    <div class="empty-actions">
      ${action ? `<button class="btn btn-primary" type="button" data-action="${action}">${action === "import-syllabus" ? icon.upload : icon.plus}${label}</button>` : ""}
      ${secondary ? `<button class="btn btn-ghost" type="button" data-action="${secondary[0]}">${secondary[1]}</button>` : ""}
    </div>
  </div>`;
}

/**
 * Ders yokken ekranın tek eylemi: ilk syllabus'u ekle (Bugün, Dersler, Dönem aynı kartı gösterir).
 * Elle ekleme ikincil bir bağlantı; + düğmesi ve üstteki "Syllabus ekle" bu sırada gizli (app.js).
 */
export function startCard(text = "PDF ya da Word dosyasını seç; ders saatleri, sınav tarihleri ve not dağılımı dönem planına dönüşsün.") {
  return `<section class="start">
    <span class="start-icon">${icon.upload}</span>
    <h2>İlk syllabus'unu ekle</h2>
    <p>${text}</p>
    <button class="btn btn-primary btn-block start-btn" type="button" data-action="import-syllabus">${icon.upload}Syllabus ekle</button>
    <button class="link start-alt" type="button" data-action="new-course">Syllabus'um yok, dersi elle ekleyeceğim</button>
  </section>`;
}

export function installCard() {
  if (isDismissed()) return "";
  const mode = installMode();
  if (!mode) return "";
  const text =
    mode === "ios"
      ? "Safari'de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>'ye dokun."
      : "Ana ekranına ekle, uygulama gibi tam ekran ve internetsiz kullan.";
  return `<div class="install-card">
    <img class="brand-mark" src="logo-mark.svg" alt="" width="32" height="32">
    <div><strong>Köprü'yü telefonuna kur</strong><p>${text}</p></div>
    ${mode === "prompt" ? '<button class="btn btn-primary" type="button" data-action="install">Kur</button>' : ""}
    <button class="icon-btn sm" type="button" data-action="dismiss-install" aria-label="Kapat">${icon.close}</button>
  </div>`;
}

const SEV_ORDER = { kritik: 0, dikkat: 1, bilgi: 2 };
export const SEV_LABEL = { kritik: "Kritik", dikkat: "Dikkat", bilgi: "İpucu" };
export const sortFlags = (list) => [...list].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

/** Bir syllabus kuralı (kırmızı bayrak). withHide: ders sayfasında "Gizle" bağlantısı. */
export function flagItem(p, withHide = false) {
  return `<li class="flag ${p.severity}">
    <span class="flag-tag">${SEV_LABEL[p.severity]} · ${POLICY_KINDS[p.kind]}</span>
    <p class="flag-rule">${esc(p.rule)}</p>
    ${p.consequence ? `<p class="flag-cons">→ ${esc(p.consequence)}</p>` : ""}
    ${p.source || withHide ? `<p class="flag-foot">${p.source ? `<small class="irow-src">“${esc(p.source)}”</small>` : ""}
      ${withHide ? `<button type="button" class="link" data-hide-policy="${esc(p.id)}">Gizle</button>` : ""}</p>` : ""}
  </li>`;
}

/** Açıklama / yönetmelik notu: ekranda tek satırlık "ⓘ" bağlantısı, dokununca açılır. */
export function infoNote(summary, text) {
  return `<details class="info-note"><summary><span aria-hidden="true">ⓘ</span>${summary}</summary><p>${text}</p></details>`;
}

/**
 * Hafta şeridi (Bugün ve Hafta görünümü ortak): Pzt–Paz, gün numarası, sınav (kırmızı) / teslim (sarı) noktası.
 * Bugün dolu camgöbeği daire; selected verilirse o gün halkalı (aria-pressed).
 * action: "strip-day" (Bugün: dokununca Hafta o günle açılır) ya da "pick-day" (Hafta: o günün dersleri).
 */
export function weekStripHtml({ state, selected = null, action }) {
  const open = state.tasks.filter((t) => !t.done);
  const d = density(open, state.settings);
  const ti = todayIdx();
  const monday = new Date();
  monday.setDate(monday.getDate() - ti);
  const tag = (w) => (w.final ? "final haftası" : w.vize ? "vize haftası" : w.busy ? "yoğun" : "sakin");
  const cur = d.current !== null ? d.weeks[d.current] : null;
  const nxt = cur ? d.weeks[d.current + 1] : null;
  const days = DAYS_SHORT.map((label, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const iso = toISO(day);
    const due = open.filter((t) => t.due === iso && !isLight(t));
    const exam = due.some(isExam);
    const task = due.some((t) => !isExam(t));
    const what = [exam && "sınav", task && "teslim"].filter(Boolean).join(", ");
    const sel = selected !== null && i === selected;
    return `<button type="button" class="wk-day${i === ti ? " is-today" : ""}${i < ti ? " is-past" : ""}${sel ? " is-sel" : ""}" data-action="${action}" data-day="${i}"
      ${selected !== null ? `aria-pressed="${sel}"` : ""} aria-label="${DAYS[i]} ${day.getDate()}${what ? `: ${what}` : ""}">
      <span class="wk-dn">${label}</span><span class="wk-num">${day.getDate()}</span>
      <span class="wk-dots">${exam ? '<i class="ex"></i>' : ""}${task ? '<i class="due"></i>' : ""}</span>
    </button>`;
  }).join("");
  return `<section class="wk" aria-label="Bu hafta">
    <div class="wk-head">
      <span>${cur ? `<b>${d.current + 1}. hafta</b> / ${d.weeks.length}` : `<b>Bu hafta</b>`}</span>
      ${nxt ? `<span>Gelecek hafta: <b class="${nxt.final || nxt.vize ? "danger-text" : nxt.busy ? "warn-text" : ""}">${tag(nxt)}</b></span>` : ""}
    </div>
    <div class="wk-days" role="group" aria-label="Gün seç">${days}</div>
    <div class="wk-legend" aria-hidden="true"><span><i class="ex"></i>Sınav</span><span><i class="due"></i>Teslim</span></div>
  </section>`;
}
