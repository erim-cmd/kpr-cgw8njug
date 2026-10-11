/**
 * KPR — Ara (sağ üstteki kapsül): dersler, sınavlar ve görevler içinde, cihazdaki veride.
 * Türkçe harf ve büyük/küçük harf duyarsız ("matematik" = "MATEMATİK", "odev" = "Ödev"); birden çok kelime
 * hepsi geçen kayıtları bulur. Ağ isteği yok.
 */
import { store, isExam, TASK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet } from "./ui.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";
import { fmtShort } from "./dates.js";
import { openTaskForm, openCourseDetail } from "./forms.js";

const norm = (s) =>
  String(s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** { courses, exams, tasks } — en az 2 harf; her grup en fazla `limit` sonuç (sınav/görev tarihe göre). */
export function searchAll(state, q, limit = 8) {
  const words = norm(q).trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return { courses: [], exams: [], tasks: [] };
  const hit = (...fields) => {
    const h = norm(fields.filter(Boolean).join(" "));
    return words.every((w) => h.includes(w));
  };
  const byId = new Map(state.courses.map((c) => [c.id, c]));
  const courses = state.courses.filter((c) => hit(c.name, c.code, c.instructor));
  const tasks = state.tasks
    .filter((x) => hit(x.title, x.note, TASK_TYPES[x.type], byId.get(x.courseId)?.code, byId.get(x.courseId)?.name))
    .sort((a, b) => a.due.localeCompare(b.due));
  return { courses: courses.slice(0, limit), exams: tasks.filter(isExam).slice(0, limit), tasks: tasks.filter((x) => !isExam(x)).slice(0, limit) };
}

function results(state, q) {
  const r = searchAll(state, q);
  const byId = new Map(state.courses.map((c) => [c.id, c]));
  const taskRow = (x) => {
    const c = byId.get(x.courseId);
    return `<li><button type="button" class="search-row" data-task="${esc(x.id)}">
      <span><strong>${esc(x.title)}${x.done ? " ✓" : ""}</strong><small>${esc([c?.code || c?.name, TASK_TYPES[x.type]].filter(Boolean).join(" · "))}</small></span>
      <em>${esc(fmtShort(x.due))}</em></button></li>`;
  };
  const group = (title, items, row) => (items.length ? `<h3 class="mini-title">${title}</h3><ul class="search-list">${items.map(row).join("")}</ul>` : "");
  if (norm(q).trim().length < 2) return `<p class="fine">${t("Ders, sınav ya da görev adı yaz.")}</p>`;
  const html =
    group(t("Dersler"), r.courses, (c) => `<li><button type="button" class="search-row" data-course="${esc(c.id)}">
      <span><strong>${esc(c.code || c.name)}</strong><small>${esc(c.code ? c.name : c.instructor || "")}</small></span>${icon.chevron}</button></li>`) +
    group(t("Sınavlar"), r.exams, taskRow) +
    group(t("Görevler"), r.tasks, taskRow);
  return html || `<p class="fine">${t("Sonuç yok.")}</p>`;
}

export function openSearch() {
  openSheet(
    `<div class="sheet-form search-sheet">
      <header class="sheet-head search-head">
        <label class="search-box">${icon.search}<input type="search" name="q" autocomplete="off" enterkeyhint="search" placeholder="${t("Ders, sınav, görev ara")}" aria-label="${t("Ara")}" autofocus></label>
        <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button>
      </header>
      <div class="sheet-body" data-results>${results(store.get(), "")}</div>
    </div>`,
    (d) => {
      const input = d.querySelector('input[name="q"]');
      const out = d.querySelector("[data-results]");
      input.addEventListener("input", () => (out.innerHTML = results(store.get(), input.value)));
      out.addEventListener("click", (e) => {
        const b = e.target.closest("[data-task], [data-course]");
        if (!b) return;
        closeSheet();
        if (b.dataset.course) openCourseDetail(b.dataset.course);
        else openTaskForm(store.get().tasks.find((x) => x.id === b.dataset.task));
      });
    },
  );
}
