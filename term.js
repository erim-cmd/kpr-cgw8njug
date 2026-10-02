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
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { projection, standing, fmtGpa } from "./gpa.js";
import { attendance, attendanceText } from "./attendance.js";
import { readTarget, saveTarget, targetText, openBaseForm, section as gpaSection, actions as gpaActions, changes as gpaChanges } from "./gpa-view.js";
import { emptyState } from "./components.js";
import { openNumberSheet } from "./grade-sheet.js";
import { density } from "./density.js";
import { fmtShort, parseISO, toISO, todayISO } from "./dates.js";
import { isLight } from "./store.js";
import { labelOf } from "./weights.js";
import { openAbsences } from "./ders.js";
import { TASK_TYPES } from "./store.js";


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
      ${a.limit === null ? `<button type="button" class="btn btn-ghost btn-sm" data-action="attend-rule" data-id="${esc(c.id)}">Devam şartını gir</button>` : ""}
      <button type="button" class="btn btn-ghost btn-sm" data-action="absences" data-id="${esc(c.id)}">${c.absences.length ? `Kayıtlar (${c.absences.length})` : "Geçmiş gün ekle"}</button>
    </div>
  </li>`;
}

/* ------------------------------------------------------------------ */
/* Akış: haftalık not ağırlığı grafiği                                 */
/* ------------------------------------------------------------------ */

const MONTH = (iso) => parseISO(iso).toLocaleDateString("tr-TR", { month: "long" });
/** Haftanın iş günleri: "10–14 Kasım" (ay değişiyorsa "28 Eki – 1 Kas"). */
const range = (w) => {
  const a = parseISO(w.start);
  const b = parseISO(w.start);
  b.setDate(b.getDate() + 4);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTH(w.start)}` : `${fmtShort(w.start)} – ${fmtShort(toISO(b))}`;
};
const ahead = (k) => (k === 0 ? "bu hafta" : k === 1 ? "gelecek hafta" : `${k} hafta sonra`);

/** Bir hafta "önemli": içinde ağırlığı olan ya da sınav/teslim türünde (okuma/kişisel değil) bir iş var. */
const important = (w) => w.items.some((t) => !isLight(t));

/** Kartın maddesi: "MCH 2016 · Ara sınav · %40" (o dersin içindeki ağırlık; bilinmiyorsa %?). */
function itemLine(t, byId) {
  const c = byId.get(t.courseId);
  const kind = labelOf(t) || TASK_TYPES[t.type];
  const w = t.weight !== null && t.weight !== undefined ? pct(t.weight) : "%?";
  return `<li><button type="button" class="fw-item" ${c ? `data-action="course-detail" data-id="${esc(c.id)}"` : `data-action="edit-task" data-id="${esc(t.id)}"`}>
      <span>${c ? `<b>${esc(c.code || c.name)}</b> · ` : ""}${esc(kind)}${t.done ? " ✓" : ""}<small>${esc(t.title)} · ${fmtShort(t.due)}</small></span>
      <em>${w}</em></button></li>`;
}

function weekCard(w, cur, byId, hot) {
  const tag = w.final ? " · Final" : w.vize ? " · Vize" : "";
  const share = w.share > 0 ? `notunun ${pct(w.share)}'i` : "notunun %?'i";
  const k = cur === null ? null : w.n - 1 - cur;
  return `<li class="fw-card ${hot ? "hot" : ""}">
    <div class="fw-head">
      <div><b>${w.n}. hafta${tag}</b><small>${range(w)}${k !== null && k >= 0 ? ` · ${ahead(k)}` : ""}</small></div>
      <span class="fw-badge">${share}</span>
    </div>
    <ul class="fw-items">${[...w.items].filter((t) => !isLight(t)).sort((a, b) => a.due.localeCompare(b.due)).map((t) => itemLine(t, byId)).join("")}</ul>
  </li>`;
}

let pastOpen = false; // "Geçen haftalar" varsayılan kapalı

/**
 * Dönem akışı: 6. hafta / 14 → "Notunun %18'i belli oldu" + ince çubuk → "%82'si önünde · sonraki 2 hafta sakin"
 * → önündeki önemli haftalar (sadece değerlendirme olan; payı en büyük olan vurgulu) → geçen haftalar (kapalı).
 * Pay: weights.taskWeight / tüm derslerin toplamı (density.js). Ağırlığı bilinmeyen "%?" ve paya katılmaz.
 */
function flowBlock(state) {
  const d = density(state.tasks, state.settings, state.courses);
  const byId = new Map(state.courses.map((c) => [c.id, c]));
  const cur = d.current;
  const today = todayISO();
  const head = `<div class="section-head"><h2>Dönem akışı</h2>${cur !== null ? `<span class="u-term">${cur + 1}. hafta / ${d.weeks.length}</span>` : ""}</div>`;
  const start = `<label class="flow-start">Dönem başlangıcı${d.guessed ? ' <small>(tahmini, ilk teslimden)</small>' : ""}
      <input type="date" value="${d.guessed ? "" : state.settings.termStart}" data-change="term-start" aria-label="Dönem başlangıç tarihi"></label>`;
  const withItems = d.weeks.filter(important);
  if (!withItems.length) {
    return `<section class="section" id="akis">${head}
      <p class="calc-note">Henüz değerlendirme tarihi yok. Syllabus yükleyince haftaların burada sıralanır.</p>${start}</section>`;
  }
  // Belli olan: tarihi geçmiş değerlendirmelerin payı
  const doneShare = d.termTotal
    ? (d.weeks.flatMap((w) => w.items).filter((t) => t.due < today && t.weight !== null).reduce((s, t) => s + t.weight, 0) / d.termTotal) * 100
    : 0;
  const nowIdx = cur ?? -1;
  const upcoming = withItems.filter((w) => w.n - 1 >= Math.max(0, nowIdx) && w.items.some((t) => t.due >= today && !isLight(t)));
  const past = withItems.filter((w) => !upcoming.includes(w));
  const hot = upcoming.reduce((m, w) => (w.share > (m?.share ?? 0) ? w : m), null);
  // Bir sonraki önemli haftaya kadar kaç sakin hafta var
  const next = upcoming[0];
  const calm = next && cur !== null ? Math.max(0, next.n - 1 - cur - 1) : null;
  const calmText = !next ? "önünde değerlendirme kalmadı"
    : cur === null ? `ilk değerlendirme ${next.n}. hafta`
    : next.n - 1 === cur ? "bu hafta değerlendirme var"
    : calm === 0 ? "gelecek hafta değerlendirme var"
    : `sonraki ${calm} hafta sakin`;
  return `<section class="section" id="akis">${head}
    <p class="fw-title">Notunun <b>${pct(doneShare)}</b>'i belli oldu</p>
    <div class="fw-bar" role="img" aria-label="Dönem notunun yüzde ${Math.round(doneShare)}'i belli oldu"><i style="width:${Math.min(100, doneShare)}%"></i></div>
    <p class="fw-sub">${pct(Math.max(0, 100 - doneShare))}'si önünde · ${calmText}</p>
    ${upcoming.length ? `<h3 class="mini-title fw-h">Önündeki önemli haftalar</h3>
      <ul class="fw-list">${upcoming.map((w) => weekCard(w, cur, byId, w === hot && w.share > 0)).join("")}</ul>` : ""}
    ${past.length ? `<button type="button" class="fw-past-btn" data-action="toggle-past" aria-expanded="${pastOpen}">Geçen haftalar (${past.length}) ${pastOpen ? "▴" : "▾"}</button>
      ${pastOpen ? `<ul class="fw-list past">${[...past].reverse().map((w) => weekCard(w, null, byId, false)).join("")}</ul>` : ""}` : ""}
    <p class="fine">Pay: o haftadaki değerlendirmelerin ağırlığı ÷ tüm derslerin toplamı. Ağırlığı bilinmeyen teslim "%?" ile görünür, paya katılmaz.</p>
    ${start}
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

/**
 * Devam şartı: "Derslerin %X'ine katılım zorunlu" ya da "En fazla N devamsızlık hakkı".
 * Seçilen alan kaydedilir, diğeri boşaltılır (attendance.js elle girilen hakkı önceler).
 */
function openAttendRule(c) {
  const name = esc(c.code || c.name);
  openSheet(`<div class="sheet-form">
      <header class="sheet-head"><h2>${name} için devam şartı</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>
      <div class="sheet-body">
        <p class="fine">Syllabus'ta yazmıyorsa hocana sor; BAU'da sağlamayan öğrenci NA alır.</p>
        <button type="button" class="att-opt" data-att="pct"><b>Derslerin %X'ine katılım zorunlu</b><small>ör. %70</small></button>
        <button type="button" class="att-opt" data-att="max"><b>En fazla N devamsızlık hakkı</b><small>ör. 4 ders</small></button>
      </div>
    </div>`, (d) => {
    d.querySelectorAll("[data-att]").forEach((b) => b.addEventListener("click", () => {
      const pct = b.dataset.att === "pct";
      closeSheet();
      openNumberSheet({
        context: pct ? `${c.code || c.name} · Katılım zorunluluğu` : `${c.code || c.name} · En fazla devamsızlık`,
        value: pct ? c.attendPct : c.absLimit,
        min: pct ? 1 : 0,
        max: pct ? 100 : 60,
        decimals: 0,
        unit: pct ? "%" : "ders",
        quick: pct ? [60, 70, 80] : [],
        clearLabel: "",
        onSave: (v) => {
          const now = store.get().courses.find((x) => x.id === c.id);
          store.saveCourse(pct ? { ...now, attendPct: v, absLimit: null } : { ...now, absLimit: v });
          toast("Devam şartı kaydedildi");
        },
      });
    }));
  });
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
  "toggle-past"(_el, { render }) {
    pastOpen = !pastOpen;
    render();
  },
  absences(el) {
    openAbsences(el.dataset.id);
  },
  "edit-base": () => openBaseForm(),
  // Sadece devam şartını soran küçük pencere (ders düzenleme formu açılmaz)
  "attend-rule"(el) {
    const c = store.get().courses.find((x) => x.id === el.dataset.id);
    if (c) openAttendRule(c);
  },
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
    render();
  },
  target(el, { render }) {
    saveTarget(el.value);
    render();
  },
};
