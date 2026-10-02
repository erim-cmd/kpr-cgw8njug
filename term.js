/**
 * KPR — "Dönem" ekranı. Bölümler (üstte yapışkan gezinme şeridi):
 *   Özet        — tek GNO kartı: bu dönem YNO, yeni GNO tahmini, Hedef GNO → gereken YNO
 *   Ortalama    — UMIS tablosu, harf seçimi, HESAPLA (gpa-view.js → section())
 *   Devamsızlık — derslerin devam durumu; geçmiş gün ekleme/silme (ders.js → openAbsences)
 *   Akış        — haftalık not ağırlığı grafiği (density.js; inline SVG, kütüphane yok)
 *
 * Kendi hesabı yok: GNO/YNO ve hedef gpa.js → projection() / needed(),
 * devamsızlık attendance.js → attendance(), akış density.js. Okulun verisine erişim yok:
 * geçmiş GNO öğrencinin girdiği iki sayıdan (gpaBase = { credits, gno }).
 */

import { store } from "./store.js";
import { esc } from "./ui.js";
import { projection, standing, fmtGpa } from "./gpa.js";
import { attendance, attendanceText } from "./attendance.js";
import { readTarget, saveTarget, targetText, openBaseForm, section as gpaSection, actions as gpaActions, changes as gpaChanges } from "./gpa-view.js";
import { emptyState } from "./components.js";
import { openNumberSheet } from "./grade-sheet.js";
import { density } from "./density.js";
import { fmtShort, parseISO, toISO } from "./dates.js";
import { openAbsences } from "./ders.js";
import { TASK_TYPES } from "./store.js";

let selWeek = null; // grafikte seçilen hafta (index); null → bu hafta

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

const pct = (x) => `%${(Math.round(x * 10) / 10).toLocaleString("tr-TR")}`;

/* ------------------------------------------------------------------ */
/* Özet: tek GNO kartı                                                 */
/* ------------------------------------------------------------------ */

function gnoCard(state, p) {
  const base = state.gpaBase;
  // Bir kerelik soru: geçmiş GNO (UMIS transkriptinde yazar). İsteğe bağlı, "Atla" var.
  const ask = !base && !state.settings.gnoSkip
    ? `<div class="gno-ask">
        <p><b>Şu anki GNO'n?</b> <b>Tamamladığın kredi?</b><br><small>UMIS transkriptinin en altında yazar. Girersen dönem sonu GNO'nu da hesaplarım.</small></p>
        <div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-action="edit-base">Gir</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="skip-gno">Atla</button></div>
      </div>`
    : "";
  const yno = p.term.graded ? fmtGpa(p.term.avg) : "—";
  const ynoSub = p.term.total ? `${p.term.graded}/${p.term.total} derste harf seçildi` : "derslerine kredi gir";
  const rows = [`<div class="gno-row"><span>Bu dönem tahmini YNO</span><b>${yno}</b><small>${ynoSub}</small></div>`];
  if (base) {
    const st = standing(p.after ?? base.gno);
    rows.push(`<div class="gno-row main"><span>Yeni GNO tahmini</span><b>${fmtGpa(p.after ?? base.gno)}</b>
      <small>şu an ${fmtGpa(base.gno)} · ${base.credits.toLocaleString("tr-TR")} kredi${st ? ` · <em class="standing ${st.level}">${st.label}</em>` : ""}</small></div>`);
  }
  let target = "";
  if (base && p.term.total) {
    const t = readTarget();
    const text = targetText(p, t);
    target = `<label class="target-row gno-target"><span>Hedef GNO</span>
        <button type="button" class="u-pick tgt-pick" data-action="pick-target" aria-label="Hedef GNO ${t.toFixed(2)}">${t.toFixed(2).replace(".", ",")}</button></label>
      ${text ? `<p class="target-res">${text.replace("ortalama gerekiyor", "YNO gerekiyor")}</p>` : ""}`;
  }
  const foot = base
    ? `<button type="button" class="link" data-action="edit-base">GNO'nu düzenle</button>`
    : ask ? "" : `<button type="button" class="link" data-action="edit-base">GNO'nu ekle</button>`;
  const hints = [];
  if (p.missingCredit) hints.push(`${p.missingCredit} dersin kredisi girilmemiş`);
  if (p.term.total && p.term.graded < p.term.total) hints.push(`${p.term.total - p.term.graded} dersin harfi seçilmemiş`);
  return `${ask}<div class="card-box gno-card">
      ${rows.join("")}
      ${target}
      <p class="gno-foot">${hints.length ? `${hints.join(", ")} · <button type="button" class="link" data-action="scroll-to" data-to="ortalama">Ortalama'da tamamla</button>` : ""}${hints.length && foot ? " · " : ""}${foot}</p>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Devamsızlık                                                         */
/* ------------------------------------------------------------------ */

function absenceCard(c, weeks) {
  const a = attendance(c, weeks);
  const fill = a.limit ? Math.min(100, (a.used / a.limit) * 100) : a.used ? 100 : 0;
  const basis = a.basis === "oran" ? `devam şartı %${c.attendPct}` : a.basis === "elle" ? "elle girilen hak" : "";
  return `<li class="abs-card lv-${a.level}" style="--c:${c.color}">
    <div class="abs-top">
      <span class="gr-name">${esc(c.code || c.name)}</span>
      <span class="abs-text ${a.level}">${a.limit === null ? "Devam şartı girilmedi" : riskShort(a)}</span>
    </div>
    ${a.limit !== null ? `<div class="bar ${a.level}" role="img" aria-label="${a.used} / ${a.limit} devamsızlık"><i style="width:${fill}%"></i></div>
    <p class="abs-meta">${esc(attendanceText(a))}${basis ? ` · ${basis}` : ""}</p>` : `<p class="abs-meta">${a.used ? `${a.used} devamsızlık kaydı var. ` : ""}Kalan hakkını hesaplamam için devam şartını gir.</p>`}
    <div class="abs-actions">
      ${a.limit === null ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit-course" data-id="${esc(c.id)}">Devam şartını gir</button>` : ""}
      <button type="button" class="btn btn-ghost btn-sm" data-action="absences" data-id="${esc(c.id)}">${c.absences.length ? `Kayıtlar (${c.absences.length})` : "Geçmiş gün ekle"}</button>
    </div>
  </li>`;
}

/* ------------------------------------------------------------------ */
/* Akış: haftalık not ağırlığı grafiği                                 */
/* ------------------------------------------------------------------ */

const range = (w) => {
  const end = parseISO(w.start);
  end.setDate(end.getDate() + 6);
  return `${fmtShort(w.start)} – ${fmtShort(toISO(end))}`;
};

/** Üstteki tek cümle: bugünden itibaren en ağır hafta. */
function flowSummary(d) {
  if (!d.termTotal) return "Derslerinin not dağılımı girilince her haftanın dönem notundaki payını gösteririm.";
  const h = d.heaviest;
  if (!h || h.share <= 0) return "Önümüzdeki haftalarda ağırlığı bilinen bir değerlendirme yok.";
  const when = d.heaviestIn === 0 ? "bu hafta" : d.heaviestIn === 1 ? "1 hafta kaldı" : `${d.heaviestIn} hafta kaldı`;
  return d.heaviestIn === 0
    ? `Bu hafta (${h.n}. hafta) dönem notunun ${pct(h.share)}'i belirleniyor.`
    : `${h.n}. hafta dönem notunun ${pct(h.share)}'i belirleniyor, ${when}.`;
}

/** Inline SVG sütun grafiği: yükseklik = o hafta belirlenen not payı. */
function flowChart(d, idx) {
  const n = d.weeks.length;
  const W = 340, H = 150, padL = 26, padR = 6, padT = 18, padB = 20;
  const cw = (W - padL - padR) / n;
  const maxShare = Math.max(5, ...d.weeks.map((w) => w.share));
  const top = Math.ceil(maxShare / 5) * 5; // eksen tepe değeri: 5'in katı
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const bars = d.weeks.map((w, i) => {
    const x = padL + i * cw;
    const h = Math.max(w.share > 0 ? 2 : 0, y(0) - y(w.share));
    const cls = ["fl-bar", w.final ? "fin" : w.vize ? "viz" : "", w.past ? "past" : "", i === idx ? "sel" : ""].filter(Boolean).join(" ");
    const tag = w.final ? "F" : w.vize ? "V" : "";
    const showN = n <= 16 || i % 2 === 0;
    return `<g class="fl-col" data-action="pick-week" data-i="${i}" role="button" tabindex="0"
        aria-label="${w.n}. hafta, dönem notunun ${pct(w.share)}'i${w.label ? `, ${w.label}` : ""}, ${w.items.length} teslim">
      <rect class="fl-hit" x="${x}" y="${padT - 14}" width="${cw}" height="${H - padT + 14}"/>
      <rect class="${cls}" x="${x + cw * 0.15}" y="${y(0) - h}" width="${cw * 0.7}" height="${h}" rx="2"/>
      ${tag ? `<text class="fl-tag ${w.final ? "fin" : "viz"}" x="${x + cw / 2}" y="${y(0) - h - 4}" text-anchor="middle">${tag}</text>` : ""}
      ${showN ? `<text class="fl-n" x="${x + cw / 2}" y="${H - 6}" text-anchor="middle">${w.n}</text>` : ""}
    </g>`;
  }).join("");
  const grid = [0, top / 2, top].map((v) => `<line class="fl-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="fl-ax" x="${padL - 4}" y="${y(v) + 3}" text-anchor="end">%${Math.round(v)}</text>`).join("");
  // Bugün çizgisi: haftanın içindeki güne göre
  let today = "";
  if (d.current !== null) {
    const dayFrac = ((new Date().getDay() + 6) % 7) / 7;
    const tx = padL + (d.current + dayFrac) * cw;
    today = `<line class="fl-today" x1="${tx}" x2="${tx}" y1="${padT - 10}" y2="${y(0)}"/><text class="fl-today-t" x="${tx}" y="${padT - 12}" text-anchor="middle">bugün</text>`;
  }
  return `<svg class="flow-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Haftalara göre dönem notunun payı">${grid}${today}${bars}</svg>`;
}

function flowBlock(state) {
  const d = density(state.tasks, state.settings, state.courses);
  const byId = new Map(state.courses.map((c) => [c.id, c]));
  const idx = Math.min(selWeek ?? d.current ?? 0, d.weeks.length - 1);
  const w = d.weeks[idx];
  const list = w.items.length
    ? `<ul class="kv">${[...w.items].sort((a, b) => a.due.localeCompare(b.due)).map((t) => {
        const c = byId.get(t.courseId);
        const wt = t.weight !== null && t.weight !== undefined ? ` · ${pct(t.weight)}` : TASK_TYPES[t.type] && t.type !== "okuma" && t.type !== "kisisel" ? " · ağırlık ?" : "";
        return `<li><b>${esc(t.title)}${t.done ? " ✓" : ""}</b><span>${c ? esc(c.code || c.name) + " · " : ""}${fmtShort(t.due)}${wt}</span></li>`;
      }).join("")}</ul>`
    : '<p class="calc-note">Bu hafta teslim yok.</p>';
  return `<section class="section" id="akis">
    <div class="section-head"><h2>Dönem akışı</h2>${d.current !== null ? `<span class="u-term">${d.current + 1}. hafta / ${d.weeks.length}</span>` : ""}</div>
    <p class="flow-hint">${esc(flowSummary(d))}</p>
    ${flowChart(d, idx)}
    <p class="fine flow-legend-1">Sütun: o hafta belirlenen not payı (tüm derslerin toplamında) · V vize, F final · kesikli çizgi bugün. Ağırlığı bilinmeyen teslim 0 sayılır.</p>
    <div class="flow-week">
      <p class="mini-title">${w.n}. hafta · ${range(w)}${w.share ? ` · ${pct(w.share)}` : ""}${w.label ? ` · ${w.label}` : ""}</p>
      ${list}
    </div>
    <label class="flow-start">Dönem başlangıcı${d.guessed ? ' <small>(tahmini, ilk teslimden)</small>' : ""}
      <input type="date" value="${d.guessed ? "" : state.settings.termStart}" data-change="term-start" aria-label="Dönem başlangıç tarihi"></label>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Ekran                                                               */
/* ------------------------------------------------------------------ */

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
  if (!state.courses.length) {
    return head + emptyState("Önce derslerini ekle", "Dönem ortalaması ve devamsızlık takibi derslerine göre hesaplanır.", "import-syllabus", "Syllabus yükle", ["new-course", "Elle ekle"])
      + `<section class="section" id="ozet">${gnoCard(state, p)}</section>`;
  }
  const weeks = state.settings.termWeeks;
  const risk = riskiest(state.courses, weeks);
  return `${head}
    <nav class="sec-nav" aria-label="Dönem bölümleri">${NAV.map(([id, label]) => `<button type="button" data-action="scroll-to" data-to="${id}">${label}</button>`).join("")}</nav>
    <section class="section" id="ozet">
      <div class="section-head"><h2>Genel ortalama</h2></div>
      ${gnoCard(state, p)}
    </section>
    ${gpaSection(state, p)}
    <section class="section" id="devamsizlik">
      <div class="section-head"><h2>Devamsızlık</h2>${risk && risk.a.level !== "ok" ? `<span class="u-term warn-text">${esc(risk.c.code || risk.c.name)}: ${riskShort(risk.a)}</span>` : ""}</div>
      <ul class="list">${state.courses.map((c) => absenceCard(c, weeks)).join("")}</ul>
      <p class="term-note">Derse gittiğin varsayılır; gitmediğin dersi Bugün'de ders bitince "Gitmedim" ile işaretle. Devam şartını sağlamayan öğrenci NA alır ve finale giremez (BAU Yönetmeliği Md. 19).</p>
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
  absences(el) {
    openAbsences(el.dataset.id);
  },
  "edit-base": () => openBaseForm(),
  "pick-target"() {
    const p = projection(store.get());
    openNumberSheet({
      context: "Hedef GNO (dönem sonunda)",
      value: readTarget(),
      max: 4,
      decimals: 2,
      unit: "/ 4,00",
      clearLabel: "",
      impact: (v) => {
        const need = p.needed(v);
        if (need === null) return "";
        if (need > 4) return "Bu dönem hepsi A olsa da yetmiyor";
        if (need <= 0) return "Bu dönem ne alırsan al tutuyor";
        return `Bu dönem en az ${need.toFixed(2).replace(".", ",")} YNO gerekiyor`;
      },
      onSave: (v) => {
        saveTarget(v);
        store.setSettings({}); // yeniden çiz
      },
    });
  },
  "skip-gno"() {
    store.setSettings({ gnoSkip: true });
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
