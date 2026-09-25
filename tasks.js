import { store } from "./store.js";
import { daysUntil, byDue } from "./dates.js";
import { taskItem, emptyState } from "./components.js";

let filter = "open";

const group = (title, list, courses) =>
  list.length
    ? `<section class="section">
        <div class="section-head"><h2>${title}</h2></div>
        <ul class="list">${list.map((t) => taskItem(t, courses)).join("")}</ul>
      </section>`
    : "";

export function view() {
  const { courses, tasks } = store.get();
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const done = tasks.filter((t) => t.done).sort((a, b) => byDue(b, a));

  let body;
  if (filter === "open") {
    body = open.length
      ? group("Gecikmiş", open.filter((t) => daysUntil(t.due) < 0), courses) +
        group("Bu hafta", open.filter((t) => daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6), courses) +
        group("Daha sonra", open.filter((t) => daysUntil(t.due) > 6), courses)
      : emptyState("Her şey yolunda", "Açık görevin yok. Yeni bir sınav ya da ödev ekleyebilirsin.", "new-task", "Görev ekle");
  } else {
    body = done.length
      ? `<ul class="list">${done.map((t) => taskItem(t, courses)).join("")}</ul>`
      : emptyState("Henüz tamamlanan yok", "Bir görevi bitirdiğinde yanındaki kutuya dokun.");
  }

  return `
    <header class="page-head">
      <h1 class="page-title">Görevler</h1>
      <p class="page-sub">Sınavlar, ödevler ve projeler</p>
    </header>
    <div class="seg" role="group" aria-label="Filtre">
      <button type="button" data-action="filter" data-f="open" aria-pressed="${filter === "open"}">Açık (${open.length})</button>
      <button type="button" data-action="filter" data-f="done" aria-pressed="${filter === "done"}">Tamamlanan (${done.length})</button>
    </div>
    ${body}`;
}

export const actions = {
  filter(el, { render }) {
    filter = el.dataset.f;
    render();
  },
};
