import { store } from "./store.js";
import { esc } from "./ui.js";
import { DAYS_SHORT, toMin } from "./dates.js";
import { startCard } from "./components.js";
import { t } from "./i18n.js";

function courseCard(c, tasks) {
  const openCount = tasks.filter((t) => t.courseId === c.id && !t.done).length;
  const critical = c.policies.filter((p) => p.severity === "kritik" && !p.hidden).length;
  const meta = [c.code, c.instructor].filter(Boolean).map(esc).join(" · ");
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
        ${openCount || critical ? `<span class="badges">
          ${openCount ? `<span class="badge">${t("{n} açık görev", { n: openCount })}</span>` : ""}
          ${critical ? `<span class="badge flag-badge">${t("{n} kritik kural", { n: critical })}</span>` : ""}
        </span>` : ""}
      </span>
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
