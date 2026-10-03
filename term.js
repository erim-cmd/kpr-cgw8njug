/**
 * KPR — "Dönem" ekranı: tek sayfada üç bölüm.
 *   Hedef GNO   — hedef → bu dönem gereken YNO; tahmini YNO/GNO küçük satırda
 *   Devamsızlık — ders başına kalan hak; derse dokununca kayıtlar (ders.js → openAbsences)
 *   Dönem akışı — hafta hafta sınav/teslimler, yoğun haftalar belirgin (density.js)
 * UMIS tablosu (harf, kredi, HESAPLA) ikincil sayfa: #/ortalama (gpa-view.js → section()).
 *
 * Kendi hesabı yok: GNO/YNO ve hedef gpa.js → projection() / needed(),
 * devamsızlık attendance.js → attendance(), akış density.js. Okulun verisine erişim yok:
 * geçmiş GNO öğrencinin girdiği iki sayıdan (gpaBase = { credits, gno }).
 */

import { store } from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { projection, standing, fmtGpa } from "./gpa.js";
import { attendance } from "./attendance.js";
import { readTarget, saveTarget, targetText, openBaseForm, section as gpaSection, actions as gpaActions, changes as gpaChanges } from "./gpa-view.js";
import { startCard, infoNote } from "./components.js";
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
/* Hedef GNO                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hedef GNO kartı: hedef → bu dönem gereken YNO (gpa.js projection().needed()).
 * Tahmini YNO / yeni GNO küçük satırda; harf ve kredi girişi ikincil sayfada (#/ortalama).
 */
function targetCard(state, p) {
  const base = state.gpaBase;
  const head = `<div class="section-head"><h2>Hedef GNO</h2></div>`;
  // Hedef hesabı geçmiş GNO'ya bağlı: önce o sorulur (UMIS transkriptinde yazar). İsteğe bağlı, "Atla" var.
  if (!base) {
    return `<section class="section" id="hedef">${head}<div class="card-box tgt-card">
      ${state.settings.gnoSkip
        ? `<p class="calc-note">Hedefine ulaşmak için bu dönem ne gerektiğini görmek istersen şu anki GNO'nu gir.</p>
          <div><button type="button" class="btn btn-ghost btn-sm" data-action="edit-base">GNO'nu gir</button></div>`
        : `<p class="tgt-ask"><b>Şu anki GNO'n ve tamamladığın kredi?</b><small>UMIS transkriptinin en altında yazar. Girersen hedefin için bu dönem ne gerektiğini hesaplarım.</small></p>
          <div class="empty-actions"><button type="button" class="btn btn-primary btn-sm" data-action="edit-base">Gir</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="skip-gno">Atla</button></div>`}
      ${p.term.graded ? `<p class="tgt-stats">Bu dönem tahmini YNO <b>${fmtGpa(p.term.avg)}</b></p>` : ""}
      <p class="gno-foot"><a class="link" href="#/ortalama">Ders harfleri ve kredi</a></p>
    </div></section>`;
  }
  const t = readTarget();
  const text = p.term.total ? targetText(p, t) : "";
  const st = standing(p.after ?? base.gno);
  const hints = [];
  if (p.missingCredit) hints.push(`${p.missingCredit} dersin kredisi girilmemiş`);
  if (p.term.total && p.term.graded < p.term.total) hints.push(`${p.term.total - p.term.graded} dersin harfi seçilmemiş`);
  return `<section class="section" id="hedef">${head}<div class="card-box tgt-card">
      <div class="tgt-row"><span>Dönem sonunda</span>
        <button type="button" class="u-pick tgt-pick" data-action="pick-target" aria-label="Hedef GNO ${t.toFixed(2)}">${t.toFixed(2).replace(".", ",")}</button></div>
      ${text ? `<p class="target-res">${text.replace("ortalama gerekiyor", "YNO gerekiyor")}</p>` : `<p class="calc-note">Hesap için derslerine kredi gir.</p>`}
      <p class="tgt-stats">Şu an <b>${fmtGpa(base.gno)}</b> · ${base.credits.toLocaleString("tr-TR")} kredi${st ? ` · <em class="standing ${st.level}">${st.label}</em>` : ""}
        ${p.term.graded ? `<br>Seçtiğin harflerle: YNO <b>${fmtGpa(p.term.avg)}</b> → GNO <b>${fmtGpa(p.after ?? base.gno)}</b>` : ""}</p>
      <p class="gno-foot">${hints.length ? `${hints.join(", ")} · ` : ""}<a class="link" href="#/ortalama">${hints.length ? "Tamamla" : "Ders harfleri ve kredi"}</a> · <button type="button" class="link" data-action="edit-base">GNO'nu düzenle</button></p>
    </div></section>`;
}

/* ------------------------------------------------------------------ */
/* Devamsızlık                                                         */
/* ------------------------------------------------------------------ */

/** Ders başına tek satır: ad, kalan hak, çubuk. Dokununca kayıtlar (geçmiş gün ekle/sil) açılır. */
function absenceRow(c, weeks) {
  const a = attendance(c, weeks);
  const fill = a.limit ? Math.min(100, (a.used / a.limit) * 100) : 0;
  const basis = a.basis === "oran" ? `devam şartı %${c.attendPct}` : a.basis === "elle" ? "elle girilen hak" : "";
  return `<li><button type="button" class="att-row" data-action="absences" data-id="${esc(c.id)}" style="--c:${c.color}">
    <span class="att-top"><span class="att-name"><i></i>${esc(c.code || c.name)}</span>
      <span class="abs-text ${a.limit === null ? "none" : a.level}">${a.limit === null ? `${a.used} kayıt · şart girilmedi` : riskShort(a)}</span></span>
    ${a.limit !== null ? `<span class="bar ${a.level}" role="img" aria-label="${a.used} / ${a.limit} devamsızlık"><i style="width:${fill}%"></i></span>
    <small class="abs-meta">${a.used}/${a.limit} kullanıldı${basis ? ` · ${basis}` : ""}</small>` : ""}
  </button></li>`;
}

/** Devamsızlık: şartı girilmemiş dersler tek satırda toplanır. */
function devamBlock(state, weeks) {
  const risk = riskiest(state.courses, weeks);
  const set = state.courses.filter((c) => attendance(c, weeks).limit !== null || c.absences.length);
  const unset = state.courses.filter((c) => attendance(c, weeks).limit === null);
  return `<section class="section" id="devamsizlik">
      <div class="section-head"><h2>Devamsızlık</h2>${risk && risk.a.level !== "ok" ? `<span class="u-term warn-text">${esc(risk.c.code || risk.c.name)}: ${riskShort(risk.a)}</span>` : ""}</div>
      ${set.length ? `<ul class="list att-list">${set.map((c) => absenceRow(c, weeks)).join("")}</ul>` : ""}
      ${unset.length ? `<div class="att-unset">
        <p><b>Devam şartı girilmemiş</b><small>Kalan hakkını hesaplamak için şartı gir.</small></p>
        <div class="att-unset-list">${unset.map((c) => `<button type="button" class="chip-btn" data-action="attend-rule" data-id="${esc(c.id)}"><i style="--c:${c.color}"></i>${esc(c.code || c.name)}</button>`).join("")}</div>
      </div>` : ""}
      ${infoNote("Devamsızlık nasıl sayılır?", "Derse gittiğin varsayılır; gitmediğin dersi Bugün'de ders bitince \"Gitmedim\" ile işaretle. Geçmiş bir günü eklemek için derse dokun. Devam şartını sağlamayan öğrenci NA alır ve finale giremez (BAU Yönetmeliği Md. 19).")}
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Dönem akışı: haftalar, her haftanın sınav/teslimleri                */
/* ------------------------------------------------------------------ */

const MONTH = (iso) => parseISO(iso).toLocaleDateString("tr-TR", { month: "long" });
/** Haftanın iş günleri: "10–14 Kasım" (ay değişiyorsa "28 Eylül – 2 Ekim"). */
const range = (w) => {
  const a = parseISO(w.start);
  const b = parseISO(w.start);
  b.setDate(b.getDate() + 4);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTH(w.start)}` : `${fmtShort(w.start)} – ${fmtShort(toISO(b))}`;
};
const ahead = (k) => (k === 0 ? "bu hafta" : k === 1 ? "gelecek hafta" : `${k} hafta sonra`);

/** Bir hafta "önemli": içinde sınav/teslim türünde (okuma/kişisel değil) bir iş var. */
const important = (w) => w.items.some((t) => !isLight(t));

/** Haftanın maddesi: "MCH 2016 · Ara sınav · 16 Kasım   %40" (o dersin içindeki ağırlık; bilinmiyorsa %?). */
function itemLine(t, byId) {
  const c = byId.get(t.courseId);
  const kind = labelOf(t) || TASK_TYPES[t.type];
  const w = t.weight !== null && t.weight !== undefined ? pct(t.weight) : "%?";
  return `<li><button type="button" class="fw-item" ${c ? `data-action="course-detail" data-id="${esc(c.id)}"` : `data-action="edit-task" data-id="${esc(t.id)}"`}>
      <span>${c ? `<i style="--c:${c.color}"></i><b>${esc(c.code || c.name)}</b> · ` : ""}${esc(kind)}${t.done ? " ✓" : ""}<small>${esc(t.title)} · ${fmtShort(t.due)}</small></span>
      <em>${w}</em></button></li>`;
}

/** Hafta satırı. Yoğun hafta (density.js → busy: notun ≥%10'u, 2 sınav ya da 3+ teslim) çerçeveli ve etiketli. */
function weekRow(w, cur, byId) {
  const k = cur === null ? null : w.n - 1 - cur;
  const tag = w.label ? `<span class="tl-tag ${w.vize || w.final ? "exam" : "busy"}">${w.label}</span>` : "";
  return `<li class="tl-week${w.busy ? " busy" : ""}${w.current ? " now" : ""}">
    <div class="tl-head">
      <div><b>${w.n}. hafta</b>${tag}<small>${range(w)}${k !== null && k >= 0 ? ` · ${ahead(k)}` : ""}</small></div>
      ${w.share > 0 ? `<span class="tl-share" title="Dönem notunun bu haftada belirlenen kısmı">${pct(w.share)}</span>` : ""}
    </div>
    <ul class="fw-items">${[...w.items].filter((t) => !isLight(t)).sort((a, b) => a.due.localeCompare(b.due)).map((t) => itemLine(t, byId)).join("")}</ul>
  </li>`;
}

/** Ardışık boş haftalar tek satır: "4–6. hafta · sakin". */
const calmRow = (run) => `<li class="tl-calm">${run.length > 1 ? `${run[0].n}–${run[run.length - 1].n}` : run[0].n}. hafta · sakin</li>`;

let pastOpen = false; // "Geçen haftalar" varsayılan kapalı

/**
 * Dönem akışı: bu haftadan dönem sonuna her hafta; değerlendirmesi olan hafta maddeleriyle,
 * boş haftalar birleşik "sakin" satırı. Geçen haftalar katlı. Üstte "Notunun %X'i belli oldu".
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
  if (!d.weeks.some(important)) {
    return `<section class="section" id="akis">${head}
      <p class="calc-note">Henüz değerlendirme tarihi yok. Syllabus yükleyince haftaların burada sıralanır.</p>${start}</section>`;
  }
  // Belli olan: tarihi geçmiş değerlendirmelerin payı
  const doneShare = d.termTotal
    ? (d.weeks.flatMap((w) => w.items).filter((t) => t.due < today && t.weight !== null).reduce((s, t) => s + t.weight, 0) / d.termTotal) * 100
    : 0;
  // Dönem başlamadıysa hepsi önde, bittiyse hepsi geride
  const from = cur !== null ? cur : d.weeks[0].start > today ? 0 : d.weeks.length;
  const past = d.weeks.slice(0, from).filter(important);
  const rows = [];
  let run = [];
  for (const w of d.weeks.slice(from)) {
    if (important(w)) {
      if (run.length) rows.push(calmRow(run));
      run = [];
      rows.push(weekRow(w, cur, byId));
    } else run.push(w);
  }
  if (run.length) rows.push(calmRow(run));
  return `<section class="section" id="akis">${head}
    <p class="fw-sub">${doneShare < 0.5 ? "Notunun henüz hiçbir kısmı belli değil" : `Notunun <b>${pct(doneShare)}</b>'i belli oldu`}</p>
    <div class="fw-bar" role="img" aria-label="Dönem notunun yüzde ${Math.round(doneShare)}'i belli oldu"><i style="width:${Math.min(100, doneShare)}%"></i></div>
    ${past.length ? `<button type="button" class="fw-past-btn" data-action="toggle-past" aria-expanded="${pastOpen}">Geçen haftalar (${past.length}) ${pastOpen ? "▴" : "▾"}</button>
      ${pastOpen ? `<ol class="tl past">${past.map((w) => weekRow(w, null, byId)).join("")}</ol>` : ""}` : ""}
    ${rows.length ? `<ol class="tl">${rows.join("")}</ol>` : '<p class="calc-note gap-t">Önünde değerlendirme kalmadı.</p>'}
    ${infoNote("Yüzdeler ne demek?", "Haftanın yanındaki yüzde: o haftadaki değerlendirmelerin ağırlığı ÷ tüm derslerinin toplamı, yani dönem notunun o hafta belirlenen kısmı. Maddelerdeki yüzde, o dersin notu içindeki ağırlık. Ağırlığı bilinmeyen teslim \"%?\" ile görünür, hesaba katılmaz. Yoğun hafta: dönem notunun en az %10'u, iki sınav ya da üç teslim.")}
    ${start}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Ekran                                                               */
/* ------------------------------------------------------------------ */

/** Dönem: üç bölüm, tek sayfa — hedef GNO, devamsızlık, dönem akışı. UMIS tablosu ikincil sayfada (#/ortalama). */
export function view() {
  const state = store.get();
  const head = `<header class="page-head">
    <h1 class="page-title">Dönem</h1>
    <p class="page-sub">Hedefin, devamsızlığın ve dönemin akışı</p>
  </header>`;
  if (!state.courses.length) {
    return head + startCard("Hedef GNO hesabı, devamsızlık hakların ve dönemin hafta hafta akışı derslerinden çıkar.");
  }
  return `${head}
    ${targetCard(state, projection(state))}
    ${devamBlock(state, state.settings.termWeeks)}
    ${flowBlock(state)}`;
}

/** Ortalama (UMIS tablosu): Dönem'in ikincil sayfası; alt menüde Dönem seçili kalır (app.js TAB_OF). */
export const ortalama = {
  view() {
    const state = store.get();
    return `<header class="page-head">
        <a class="link back-link" href="#/donem">← Dönem</a>
        <h1 class="page-title">Ortalama</h1>
        <p class="page-sub">Ders harfleri ve kredi · BAU, A–F, 4,00 üzerinden</p>
      </header>
      ${gpaSection(state, projection(state))}`;
  },
  actions: gpaActions,
  changes: gpaChanges,
};

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

/**
 * Eski adresler (?bolum=ozet|devamsizlik|akis) ve bildirimler için: Dönem'de o bölüme kaydır.
 * "ortalama" artık ayrı sayfa (#/ortalama); app.js yönlendirir.
 */
const SECTION_OF = { ozet: "hedef", hedef: "hedef", devamsizlik: "devamsizlik", akis: "akis" };
export function scrollToSection(id) {
  document.getElementById(SECTION_OF[id] || "")?.scrollIntoView({ block: "start" });
}

export const actions = {
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
  "term-start"(el, { render }) {
    store.setSettings({ termStart: el.value });
    render();
  },
};
