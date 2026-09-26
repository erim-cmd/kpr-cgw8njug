/**
 * KPR — "Dönem" paneli: tek bakışta GNO, dönem ortalaması, devamsızlıkta en riskli ders,
 * hedef GNO ve derslerin devamsızlık durumu.
 *
 * Kendi hesabı yok: GNO/YNO ve hedef gpa.js → projection() / needed(),
 * devamsızlık attendance.js → attendance(). Harf seçimi ve UMIS tablosu "Ortalama" ekranında.
 */

import { store } from "./store.js";
import { esc } from "./ui.js";
import { todayIdx, todayISO } from "./dates.js";
import { projection, standing, fmtGpa } from "./gpa.js";
import { attendance, attendanceText } from "./attendance.js";
import { readTarget, saveTarget, targetText } from "./gpa-view.js";
import { emptyState } from "./components.js";

const SEVERITY = { over: 4, last: 3, warn: 2, ok: 1, none: 0 };

/** Devamsızlıkta en riskli ders (devam şartı girilmiş dersler arasından). */
export function riskiest(courses, weeks) {
  return courses
    .map((c) => ({ c, a: attendance(c, weeks) }))
    .filter((x) => x.a.limit !== null)
    .sort((x, y) => SEVERITY[y.a.level] - SEVERITY[x.a.level] || x.a.left - y.a.left)[0] ?? null;
}

const riskShort = (a) =>
  a.level === "over" ? "Sınır aşıldı" : a.level === "last" ? "Hakkın bitti" : a.level === "warn" ? "1 hakkın kaldı" : `${a.left} hakkın var`;

function summary(state, p) {
  const gno = p.after ?? p.prev.avg;
  const st = standing(gno);
  const risk = riskiest(state.courses, state.settings.termWeeks);
  const hints = [];
  if (p.term.total && p.term.graded < p.term.total) hints.push(`${p.term.total - p.term.graded} dersin harf notu seçilmemiş`);
  if (p.missingCredit) hints.push(`${p.missingCredit} dersin kredisi girilmemiş`);
  if (p.source === "none") hints.push("geçmiş dönemlerin girilmemiş");
  return `<div class="stats term-stats">
    <a class="stat stat-main" href="#/ortalama">
      <b>${fmtGpa(gno)}</b><span>genel ortalama (GNO)</span>
      ${st ? `<em class="standing ${st.level}">${st.label}</em>` : ""}
    </a>
    <a class="stat" href="#/ortalama"><b>${p.term.graded ? fmtGpa(p.term.avg) : "—"}</b><span>bu dönem ortalaması (YNO)</span></a>
    <button type="button" class="stat stat-risk ${risk ? `lv-${risk.a.level}` : ""}" data-action="scroll-absence">
      <b>${risk ? esc(risk.c.code || risk.c.name) : "—"}</b>
      <span>${risk ? riskShort(risk.a) : "devamsızlıkta risk yok"}</span>
    </button>
  </div>
  ${hints.length ? `<p class="term-hint">${hints.join(", ")}. <a class="link" href="#/ortalama">Ortalama'da tamamla</a></p>` : ""}`;
}

function targetBlock(p) {
  if (!p.term.total) {
    return `<p class="calc-note">Hedef hesabı için bu dönemin derslerine kredi gir. <a class="link" href="#/ortalama">Ortalama'ya git</a></p>`;
  }
  const target = readTarget();
  const text = targetText(p, target);
  return `<div class="card-box">
    <label class="target-row"><span>Hedef GNO</span>
      <input type="number" min="0" max="4" step="0.01" inputmode="decimal" value="${target.toFixed(2)}" data-change="target" aria-label="Hedef GNO" class="num-in">
    </label>
    ${text ? `<p class="target-res">${text}</p>` : ""}
  </div>`;
}

function absenceCard(c, weeks) {
  const a = attendance(c, weeks);
  const today = c.sessions.filter((s) => s.day === todayIdx()).sort((x, y) => x.start.localeCompare(y.start));
  const pct = a.limit ? Math.min(100, (a.used / a.limit) * 100) : a.used ? 100 : 0;
  const basis = a.basis === "oran" ? `devam şartı %${c.attendPct}` : a.basis === "elle" ? "elle girilen hak" : "";
  const todayBtns = today.map((s) => {
    const on = c.absences.some((x) => x.date === todayISO() && x.start === s.start);
    return `<button type="button" class="abs-btn ${on ? "on" : ""}" data-action="mark-absent" data-id="${esc(c.id)}" data-start="${esc(s.start)}" aria-pressed="${on}">${on ? "Bugün gelmedim ✓" : "Bugün gelmedim"}${today.length > 1 ? ` · ${esc(s.start)}` : ""}</button>`;
  }).join("");
  return `<li class="abs-card lv-${a.level}" style="--c:${c.color}">
    <div class="abs-top">
      <span class="gr-name">${esc(c.code || c.name)}</span>
      <span class="abs-text ${a.level}">${a.limit === null ? "Devam şartı girilmedi" : riskShort(a)}</span>
    </div>
    ${a.limit !== null ? `<div class="bar ${a.level}" role="img" aria-label="${a.used} / ${a.limit} devamsızlık"><i style="width:${pct}%"></i></div>
    <p class="abs-meta">${esc(attendanceText(a))}${basis ? ` · ${basis}` : ""}</p>` : `<p class="abs-meta">${a.used ? `${a.used} devamsızlık kaydı var. ` : ""}Kalan hakkını hesaplamam için devam şartını gir.</p>`}
    <div class="abs-actions">
      ${todayBtns}
      <button type="button" class="btn btn-ghost btn-sm" data-action="${a.limit === null ? "edit-course" : "course-detail"}" data-id="${esc(c.id)}">${a.limit === null ? "Devam şartını gir" : c.absences.length ? `Kayıtlar (${c.absences.length})` : "Geçmiş gün ekle"}</button>
    </div>
  </li>`;
}

export function view() {
  const state = store.get();
  const head = `<header class="page-head">
    <h1 class="page-title">Dönem</h1>
    <p class="page-sub">Ortalaman ve devamsızlığın, tek bakışta</p>
  </header>`;
  if (!state.courses.length) {
    return head + emptyState("Önce derslerini ekle", "Dönem ortalaması ve devamsızlık takibi derslerine göre hesaplanır.", "import-syllabus", "Syllabus yükle", ["new-course", "Elle ekle"]);
  }
  const p = projection(state);
  const weeks = state.settings.termWeeks;
  return `${head}
    ${summary(state, p)}
    <section class="section">
      <div class="section-head"><h2>Hedef</h2><a class="link" href="#/ortalama">Harfleri seç</a></div>
      ${targetBlock(p)}
    </section>
    <section class="section" id="devamsizlik">
      <div class="section-head"><h2>Devamsızlık</h2></div>
      <ul class="list">${state.courses.map((c) => absenceCard(c, weeks)).join("")}</ul>
      <p class="term-note">Devam şartını sağlamayan öğrenci NA alır ve finale giremez (BAU Yönetmeliği Md. 19). Hak, syllabus'taki devam oranından ya da elle girdiğin sayıdan hesaplanır.</p>
    </section>`;
}

export const actions = {
  // Adres çubuğundaki # sayfa geçişi için kullanıldığından bağlantı yerine kaydırma
  "scroll-absence"() {
    document.getElementById("devamsizlik")?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
};

export const changes = {
  target(el, { render }) {
    saveTarget(el.value);
    render();
  },
};
