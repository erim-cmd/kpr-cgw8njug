/**
 * KPR — Haftalık program: Bugün ekranının "Hafta" görünümü (v2.10'dan önce ayrı "Program" sekmesiydi).
 * Bugün'deki hafta şeridi (seçili gün halkalı) + seçilen günün dersleri. Boş program durumu Bugün'ün kendi boş durumudur.
 */

import { store } from "./store.js";
import { DAYS, todayIdx, nowMin } from "./dates.js";
import { sessionsOn, sessionItem, weekStripHtml } from "./components.js";
import { t } from "./i18n.js";

let selected = null;

/** Hafta görünümünün gövdesi (dersi olan kullanıcı için). */
export function weekView() {
  const { courses } = store.get();
  const today = todayIdx();
  if (selected === null) selected = today;
  const sessions = sessionsOn(courses, selected);


  const body = sessions.length
    ? `<ul class="list">${sessions.map((s) => sessionItem(s, selected === today ? nowMin() : null)).join("")}</ul>`
    : `<p class="muted-note">${selected === today ? t("Bugün dersin yok.") : t("O gün dersin yok.")}</p>`;

  return `
    ${weekStripHtml({ state: store.get(), selected, action: "pick-day" })}
    <h2 class="day-title">${DAYS[selected]}${selected === today ? `<span class="badge">${t("Bugün")}</span>` : ""}</h2>
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
