import { store } from "./store.js";
import { DAYS, DAYS_SHORT, todayIdx, nowMin } from "./dates.js";
import { sessionsOn, sessionItem, emptyState } from "./components.js";

let selected = null;

export function view() {
  const { courses } = store.get();
  const today = todayIdx();
  if (selected === null) selected = today;
  const sessions = sessionsOn(courses, selected);

  const chips = DAYS_SHORT.map((label, i) => {
    const has = courses.some((c) => c.sessions.some((s) => s.day === i));
    return `<button type="button" class="chip ${has ? "has" : ""} ${i === today ? "today" : ""}"
      data-action="pick-day" data-day="${i}" aria-pressed="${i === selected}" aria-label="${DAYS[i]}">${label}<i></i></button>`;
  }).join("");

  let body;
  if (!courses.length) {
    body = emptyState("Programın boş", "Bir ders ekle ve haftanın hangi günleri olduğunu seç.", "new-course", "Ders ekle");
  } else if (!sessions.length) {
    body = '<p class="muted-note">Bu gün dersin yok.</p>';
  } else {
    body = `<ul class="list">${sessions.map((s) => sessionItem(s, selected === today ? nowMin() : null)).join("")}</ul>`;
  }

  return `
    <header class="page-head">
      <h1 class="page-title">Program</h1>
      <p class="page-sub">Haftalık ders saatlerin</p>
    </header>
    <div class="chips" role="group" aria-label="Gün seç">${chips}</div>
    <h2 class="day-title">${DAYS[selected]}${selected === today ? '<span class="badge">Bugün</span>' : ""}</h2>
    ${body}`;
}

export const actions = {
  "pick-day"(el, { render }) {
    selected = Number(el.dataset.day);
    render();
  },
};
