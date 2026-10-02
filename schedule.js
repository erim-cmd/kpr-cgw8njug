/**
 * KPR — Haftalık program: Bugün ekranının "Hafta" görünümü (v2.10'dan önce ayrı "Program" sekmesiydi).
 * Gün çipleri + seçilen günün dersleri. Boş program durumu Bugün'ün kendi boş durumudur.
 */

import { store } from "./store.js";
import { DAYS, DAYS_SHORT, todayIdx, nowMin } from "./dates.js";
import { sessionsOn, sessionItem } from "./components.js";

let selected = null;

/** Hafta görünümünün gövdesi (dersi olan kullanıcı için). */
export function weekView() {
  const { courses } = store.get();
  const today = todayIdx();
  if (selected === null) selected = today;
  const sessions = sessionsOn(courses, selected);

  const chips = DAYS_SHORT.map((label, i) => {
    const has = courses.some((c) => c.sessions.some((s) => s.day === i));
    return `<button type="button" class="chip ${has ? "has" : ""} ${i === today ? "today" : ""}"
      data-action="pick-day" data-day="${i}" aria-pressed="${i === selected}" aria-label="${DAYS[i]}">${label}<i></i></button>`;
  }).join("");

  const body = sessions.length
    ? `<ul class="list">${sessions.map((s) => sessionItem(s, selected === today ? nowMin() : null)).join("")}</ul>`
    : '<p class="muted-note">Bu gün dersin yok.</p>';

  return `
    <div class="chips" role="group" aria-label="Gün seç">${chips}</div>
    <h2 class="day-title">${DAYS[selected]}${selected === today ? '<span class="badge">Bugün</span>' : ""}</h2>
    ${body}`;
}

/** Hafta görünümüne her girişte bugün seçili açılsın. */
export function resetDay() {
  selected = null;
}

/** Bugün ekranındaki hafta şeridinden bir güne dokununca Hafta görünümü o günle açılır. */
export function setDay(i) {
  selected = Number.isInteger(i) && i >= 0 && i <= 6 ? i : null;
}

export const actions = {
  "pick-day"(el, { render }) {
    selected = Number(el.dataset.day);
    render();
  },
};
