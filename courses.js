import { store, isExam } from "./store.js";
import { esc } from "./ui.js";
import { DAYS_SHORT, toMin, todayISO, daysUntil, dayLabel, byDue } from "./dates.js";
import { startCard } from "./components.js";
import { t, decimal } from "./i18n.js";

/** Dersin en yakın açık işi (bugün ya da sonrası, tarihli). Kartta "N açık görev" yerine bu gösterilir. */
export function nextDue(courseId, tasks, today = todayISO()) {
  return tasks.filter((x) => x.courseId === courseId && !x.done && x.due && x.due >= today).sort(byDue)[0] || null;
}

function courseCard(c, tasks) {
  const next = nextDue(c.id, tasks);
  const critical = c.policies.filter((p) => p.severity === "kritik" && !p.hidden).length;
  const credit = c.credit ? t("{n} kredi", { n: decimal(c.credit) }) : "";
  const meta = [c.code, credit, c.instructor].filter(Boolean).map(esc).join(" · ");
  // Renk anlamı: sınav kırmızı, 2 gün içindeki teslim sarı, gerisi sakin
  const tone = next ? (isExam(next) ? "exam" : daysUntil(next.due) <= 2 ? "soon" : "") : "";
  const times = [...c.sessions]
    .sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start))
    .map((s) => `<span class="pill">${DAYS_SHORT[s.day]} ${esc(s.start)}–${esc(s.end)}</span>`)
    .join("");
  return `<li>
    <button class="course" style="--c:${c.color}" data-action="course-detail" data-id="${esc(c.id)}">
      <span class="course-top">
        <span>
          <span class="course-name">${esc(c.name)}</span>
          ${meta ? `<span class="course-meta">${meta}</span>` : ""}
        </span>
        ${critical ? `<span class="badges"><span class="badge flag-badge">${t("{n} kritik kural", { n: critical })}</span></span>` : ""}
      </span>
      ${next ? `<span class="course-next ${tone}"><b>${esc(dayLabel(next.due))}</b><span>${esc(next.title)}</span></span>` : ""}
      <span class="course-times">${times || `<span class="pill">${t("Saat eklenmedi")}</span>`}</span>
    </button>
  </li>`;
}

export function view() {
  const { courses, tasks } = store.get();
  return `
    <header class="page-head">
      <h1 class="page-title">${t("Dersler")}</h1>
      ${courses.length ? "" : `<p class="page-sub">${t("Bu dönemki derslerin")}</p>`}
    </header>
    ${courses.length
      ? `<ul class="list">${courses.map((c) => courseCard(c, tasks)).join("")}</ul>`
      : startCard()}`;
}
