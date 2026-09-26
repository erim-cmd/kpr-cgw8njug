/** KPR — Birden çok ekranda kullanılan HTML parçaları. */

import { TASK_TYPES } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { daysUntil, relLabel, fmtShort, toMin } from "./dates.js";
import { installMode, isDismissed } from "./install.js";
import { attendanceOf, levelText } from "./attendance.js";

/** Belirli bir gündeki tüm ders saatleri, saate göre sıralı. */
export function sessionsOn(courses, day) {
  return courses
    .flatMap((c) => c.sessions.filter((s) => s.day === day).map((s) => ({ ...s, course: c })))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** now: dakika cinsinden şu an (sadece bugünün listesi için), yoksa null */
export function sessionItem(s, now = null) {
  let state = "";
  if (now !== null) {
    if (now >= toMin(s.end)) state = "past";
    else if (now >= toMin(s.start)) state = "now";
  }
  const meta = [s.course.code, s.room].filter(Boolean).map(esc).join(" · ");
  return `<li>
    <button class="session ${state}" style="--c:${s.course.color}" data-action="course-detail" data-id="${esc(s.course.id)}">
      <span class="session-time">${esc(s.start)}<small>${esc(s.end)}</small></span>
      <span>
        <span class="session-name">${esc(s.course.name)}${state === "now" ? '<span class="badge">Şu an</span>' : ""}</span>
        ${meta ? `<span class="session-meta">${meta}</span>` : ""}
      </span>
    </button>
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

/** Syllabus yükleme çağrısı: ders ekleme noktalarında gösterilir. */
export function importCard() {
  return `<button class="import-card" type="button" data-action="import-syllabus">
    <span class="import-icon">${icon.upload}</span>
    <span><strong>Syllabus'tan ekle</strong><small>PDF ya da fotoğraf yükle, ders saatleri ve sınav tarihleri otomatik gelsin.</small></span>
  </button>`;
}

/** Devamsızlıkta sınıra yaklaşan/aşan dersler için "Bugün" ekranındaki uyarı. */
export function attendanceAlert(courses, settings) {
  const risky = courses
    .map((c) => ({ c, a: attendanceOf(c, settings) }))
    .filter((x) => ["warn", "danger", "over"].includes(x.a.level))
    .sort((x, y) => x.a.remaining - y.a.remaining);
  if (!risky.length) return "";
  const worst = risky[0].a.level;
  return `<a class="alert-card ${worst === "warn" ? "lv-warn" : "lv-danger"}" href="#/donem">
    <strong>Devamsızlık uyarısı</strong>
    ${risky.slice(0, 3).map((x) => `<span>${esc(x.c.code || x.c.name)}: ${levelText(x.a)}</span>`).join("")}
  </a>`;
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
    <span class="brand-mark">K</span>
    <div><strong>KPR'yi telefonuna kur</strong><p>${text}</p></div>
    ${mode === "prompt" ? '<button class="btn btn-primary" type="button" data-action="install">Kur</button>' : ""}
    <button class="icon-btn sm" type="button" data-action="dismiss-install" aria-label="Kapat">${icon.close}</button>
  </div>`;
}
