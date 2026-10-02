/**
 * KPR — "Dönem" ekranı. Bölümler (üstte yapışkan gezinme şeridi):
 *   Özet        — GNO, YNO, devamsızlıkta en riskli ders, Hedef GNO (tek kart)
 *   Ortalama    — UMIS tablosu, harf seçimi, HESAPLA, geçmiş dönemler (gpa-view.js → section())
 *   Devamsızlık — derslerin devam durumu
 *   Akış        — dönem haftaları, vize/final/yoğun haftalar
 *
 * Kendi hesabı yok: GNO/YNO ve hedef gpa.js → projection() / needed(),
 * devamsızlık attendance.js → attendance(), akış density.js.
 */

import { store } from "./store.js";
import { esc } from "./ui.js";
import { todayIdx, todayISO } from "./dates.js";
import { projection, standing, fmtGpa } from "./gpa.js";
import { attendance, attendanceText } from "./attendance.js";
import { readTarget, saveTarget, targetText, section as gpaSection, actions as gpaActions, changes as gpaChanges } from "./gpa-view.js";
import { emptyState } from "./components.js";
import { density } from "./density.js";
import { fmtShort, parseISO, toISO } from "./dates.js";

let selWeek = null; // şeritte seçilen hafta (index); null → bu hafta

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
    <button type="button" class="stat stat-main" data-action="scroll-to" data-to="ortalama">
      <b>${fmtGpa(gno)}</b><span>genel ortalama (GNO)</span>
      ${st ? `<em class="standing ${st.level}">${st.label}</em>` : ""}
    </button>
    <button type="button" class="stat" data-action="scroll-to" data-to="ortalama"><b>${p.term.graded ? fmtGpa(p.term.avg) : "—"}</b><span>bu dönem ortalaması (YNO)</span></button>
    <button type="button" class="stat stat-risk ${risk ? `lv-${risk.a.level}` : ""}" data-action="scroll-absence">
      <b>${risk ? esc(risk.c.code || risk.c.name) : "—"}</b>
      <span>${risk ? riskShort(risk.a) : "devamsızlıkta risk yok"}</span>
    </button>
  </div>
  ${hints.length ? `<p class="term-hint">${hints.join(", ")}. <button type="button" class="link" data-action="scroll-to" data-to="ortalama">Ortalama'da tamamla</button></p>` : ""}`;
}

function targetBlock(p) {
  if (!p.term.total) {
    return `<p class="calc-note">Hedef hesabı için bu dönemin derslerine kredi gir. <button type="button" class="link" data-action="scroll-to" data-to="ortalama">Ortalama'ya git</button></p>`;
  }
  const target = readTarget();
  const text = targetText(p, target);
  return `<div class="card-box">
    <label class="target-row"><span>Hedef GNO<small>Dönem sonunda ulaşmak istediğin ortalama</small></span>
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

const range = (w) => {
  const end = parseISO(w.start);
  end.setDate(end.getDate() + 6);
  return `${fmtShort(w.start)} – ${fmtShort(toISO(end))}`;
};

function flowBlock(state) {
  const open = state.tasks.filter((t) => !t.done);
  const d = density(open, state.settings);
  const byId = new Map(state.courses.map((c) => [c.id, c]));
  const idx = selWeek ?? d.current ?? 0;
  const w = d.weeks[Math.min(idx, d.weeks.length - 1)];

  const cols = d.weeks.map((x, i) => `<button type="button" class="wk lv${x.level}${x.current ? " now" : ""}${x.past ? " past" : ""}${i === idx ? " sel" : ""}"
      data-action="pick-week" data-i="${i}" aria-label="${x.n}. hafta, ${x.items.length} teslim${x.label ? `, ${x.label}` : ""}" aria-pressed="${i === idx}">
      <span class="wk-tag ${x.final ? "fin" : x.vize ? "viz" : x.busy ? "busy" : ""}">${x.final ? "F" : x.vize ? "V" : x.busy ? "!" : ""}</span>
      <span class="wk-bar"><i></i></span>
      <span class="wk-n">${x.n}</span>
    </button>`).join("");

  let hint = "";
  if (d.next && d.nextIn !== null && d.nextIn <= 2) {
    const what = d.next.final ? "final haftası" : d.next.vize ? "vize haftası" : "yoğun bir hafta";
    const first = [...d.next.items].sort((a, b) => (b.type === "proje") - (a.type === "proje"))[0];
    hint = `<p class="flow-hint">${d.nextIn === 1 ? "Gelecek hafta" : `${d.nextIn} hafta sonra`} ${what}: <b>${d.next.items.length} teslim</b>. ${first ? `Hazırlığa bu hafta başla, önce <b>${esc(first.title)}</b>.` : ""}</p>`;
  } else if (d.next) {
    hint = `<p class="flow-hint calm">Sıradaki ${d.next.final ? "final" : d.next.vize ? "vize" : "yoğun"} haftası: ${d.next.n}. hafta (${range(d.next)}).</p>`;
  }

  const list = w.items.length
    ? `<ul class="kv">${[...w.items].sort((a, b) => a.due.localeCompare(b.due)).map((t) => {
        const c = byId.get(t.courseId);
        return `<li><b>${esc(t.title)}</b><span>${c ? esc(c.code || c.name) + " · " : ""}${fmtShort(t.due)}</span></li>`;
      }).join("")}</ul>`
    : '<p class="calc-note">Bu hafta teslim yok.</p>';

  return `<section class="section" id="akis">
    <div class="section-head"><h2>Dönem akışı</h2>${d.current !== null ? `<span class="u-term">${d.current + 1}. hafta / ${d.weeks.length}</span>` : ""}</div>
    ${hint}
    <div class="flow" style="--n:${d.weeks.length}">${cols}</div>
    <div class="flow-legend"><span><i class="lg viz"></i>Vize</span><span><i class="lg fin"></i>Final</span><span><i class="lg busy"></i>Yoğun</span><span><i class="lg now"></i>Bu hafta</span></div>
    <div class="flow-week">
      <p class="mini-title">${w.n}. hafta · ${range(w)}${w.label ? ` · ${w.label}` : ""}</p>
      ${list}
    </div>
    <label class="flow-start">Dönem başlangıcı${d.guessed ? ' <small>(tahmini, ilk teslimden)</small>' : ""}
      <input type="date" value="${d.guessed ? "" : state.settings.termStart}" data-change="term-start" aria-label="Dönem başlangıç tarihi"></label>
  </section>`;
}

const NAV = [
  ["ozet", "Özet"],
  ["ortalama", "Ortalama"],
  ["devamsizlik", "Devamsızlık"],
  ["akis", "Akış"],
];

export function view() {
  const state = store.get();
  const p = projection(state);
  const head = `<header class="page-head">
    <h1 class="page-title">Dönem</h1>
    <p class="page-sub">Ortalaman, devamsızlığın ve dönemin akışı</p>
  </header>`;
  // Dersi olmayan öğrenci de geçmiş dönemlerini/UMIS özetini girebilsin: Ortalama bölümü her zaman var
  if (!state.courses.length) {
    return head + emptyState("Önce derslerini ekle", "Dönem ortalaması ve devamsızlık takibi derslerine göre hesaplanır.", "import-syllabus", "Syllabus yükle", ["new-course", "Elle ekle"]) + gpaSection(state, p);
  }
  const weeks = state.settings.termWeeks;
  return `${head}
    <nav class="sec-nav" aria-label="Dönem bölümleri">${NAV.map(([id, label]) => `<button type="button" data-action="scroll-to" data-to="${id}">${label}</button>`).join("")}</nav>
    <section class="section" id="ozet">
      ${summary(state, p)}
      <div class="section-head gap-t"><h2>Hedef</h2>${p.term.total ? `<button type="button" class="link" data-action="scroll-to" data-to="ortalama">Harfleri seç</button>` : ""}</div>
      ${targetBlock(p)}
    </section>
    ${gpaSection(state, p)}
    <section class="section" id="devamsizlik">
      <div class="section-head"><h2>Devamsızlık</h2></div>
      <ul class="list">${state.courses.map((c) => absenceCard(c, weeks)).join("")}</ul>
      <p class="term-note">Devam şartını sağlamayan öğrenci NA alır ve finale giremez (BAU Yönetmeliği Md. 19). Hak, syllabus'taki devam oranından ya da elle girdiğin sayıdan hesaplanır.</p>
    </section>
    ${flowBlock(state)}`;
}

/** Yapışkan şeridin ve üst menünün altında kalmadan bölüme kaydır. */
export function scrollToSection(id, smooth = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = (document.querySelector(".topbar")?.offsetHeight || 0) + (document.querySelector(".sec-nav")?.offsetHeight || 0) + 8;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: smooth ? "smooth" : "auto" });
}

export const actions = {
  ...gpaActions,
  "scroll-to"(el) {
    scrollToSection(el.dataset.to);
  },
  "pick-week"(el, { render }) {
    selWeek = Number(el.dataset.i);
    render();
  },
  // Adres çubuğundaki # sayfa geçişi için kullanıldığından bağlantı yerine kaydırma
  "scroll-absence"() {
    scrollToSection("devamsizlik");
  },
};

export const changes = {
  ...gpaChanges,
  "term-start"(el, { render }) {
    store.setSettings({ termStart: el.value });
    selWeek = null;
    render();
  },
  target(el, { render }) {
    saveTarget(el.value);
    render();
  },
};
