import { store } from "./store.js";
import { esc } from "./ui.js";
import { todayIdx, nowMin, daysUntil, fmtLong, greeting, byDue } from "./dates.js";
import { sessionsOn, sessionItem, taskItem, emptyState, installCard } from "./components.js";

export function view() {
  const { profile, courses, tasks } = store.get();
  const sessions = sessionsOn(courses, todayIdx());
  const open = tasks.filter((t) => !t.done);
  const upcoming = open.filter((t) => daysUntil(t.due) <= 14).sort(byDue);
  const thisWeek = open.filter((t) => daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6).length;
  const exams = open.filter((t) => t.type === "sinav" && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 30).length;
  const now = nowMin();

  let todayBlock;
  if (!courses.length) {
    todayBlock = emptyState(
      "Dönemine başla",
      "Bir dersin syllabus'unu yükle; ders saatleri, sınav tarihleri ve not dağılımı otomatik gelsin.",
      "import-syllabus", "Syllabus yükle",
      ["new-course", "Elle ekle"]
    );
  } else if (!sessions.length) {
    todayBlock = '<p class="muted-note">Bugün dersin yok. Keyfini çıkar ✨</p>';
  } else {
    todayBlock = `<ul class="list">${sessions.map((s) => sessionItem(s, now)).join("")}</ul>`;
  }

  return `
    <header class="page-head">
      <p class="eyebrow">${fmtLong(new Date())}</p>
      <h1 class="page-title">${greeting()}, ${esc(profile.name)}</h1>
    </header>

    ${installCard()}

    <div class="stats">
      <div class="stat"><b>${sessions.length}</b><span>ders bugün</span></div>
      <div class="stat"><b>${thisWeek}</b><span>görev bu hafta</span></div>
      <div class="stat"><b>${exams}</b><span>sınav 30 gün içinde</span></div>
    </div>

    <section class="section">
      <div class="section-head"><h2>Bugünkü dersler</h2><a class="link" href="#/program">Haftalık program</a></div>
      ${todayBlock}
    </section>

    <section class="section">
      <div class="section-head"><h2>Önümüzdeki 2 hafta</h2><a class="link" href="#/gorevler">Tümü</a></div>
      ${upcoming.length
        ? `<ul class="list">${upcoming.map((t) => taskItem(t, courses)).join("")}</ul>`
        : emptyState("Yaklaşan bir şey yok", "Sınav ve ödevlerini ekle, geri sayımı KPR tutsun.", "new-task", "Görev ekle")}
    </section>`;
}
