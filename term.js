/**
 * KPR — Dönem paneli: GNO simülasyonu, hedef (ters hesap) ve devamsızlık takibi.
 * Her şey cihazda hesaplanır.
 */

import { store } from "./store.js";
import { esc, openSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { todayIdx, todayISO, fmtShort } from "./dates.js";
import { computeGpa, requiredTermAvg, weightOf, estimateLetter, maxPoint, fmt2 } from "./gpa.js";
import { attendanceOf, riskiest, levelText, sessionHours } from "./attendance.js";
import { calcGrades } from "./forms.js";
import { emptyState } from "./components.js";

const LEVEL_CLASS = { over: "lv-over", danger: "lv-danger", warn: "lv-warn", ok: "lv-ok", none: "lv-none" };

/** Not hesaplayıcıdaki puanlardan tahmini harf (hiç puan yoksa null). */
export function estimateForCourse(course, settings) {
  if (!course.grading.length) return null;
  const r = calcGrades(course.grading, course.target);
  if (r.average === null) return null;
  const complete = r.remaining <= 0;
  return { letter: estimateLetter(complete ? r.earned : r.average, settings), complete };
}

function summary(state) {
  const { courses, settings } = state;
  const g = computeGpa(state);
  const risk = riskiest(courses, settings);
  return `<div class="stats term-stats">
    <div class="stat stat-main"><b>${fmt2(g.gpa)}</b><span>genel ortalama (GNO)</span></div>
    <div class="stat"><b>${fmt2(g.termAvg)}</b><span>bu dönem ortalaması</span></div>
    <button type="button" class="stat stat-risk ${risk ? LEVEL_CLASS[risk.a.level] : ""}" data-action="scroll-absence">
      <b>${risk ? esc(risk.course.code || risk.course.name) : "—"}</b>
      <span>${risk ? levelText(risk.a) : "devamsızlıkta risk yok"}</span>
    </button>
  </div>
  ${g.missing || g.noWeight || !g.hasPast ? `<p class="term-hint">${[
    g.noWeight && `${g.noWeight} dersin ${settings.weightBy === "kredi" ? "kredisi" : "AKTS'si"} girilmemiş, ortalamaya katılmıyor.`,
    g.missing && `${g.missing} dersin harf notu seçilmemiş.`,
    !g.hasPast && "GNO için aşağıdan geçmiş dönemlerini gir. İlk dönemindeysen gerek yok.",
  ].filter(Boolean).join(" ")}</p>` : ""}`;
}

function targetBlock(state) {
  const t = state.targetGpa;
  const req = requiredTermAvg(state, t);
  let result = "";
  if (t !== null && req) {
    const v = req.value;
    const unit = state.settings.weightBy === "kredi" ? "kredi" : "AKTS";
    if (v > req.maxPoint) result = `<p class="target-res bad">Bu dönemin tüm derslerinden ${fmt2(req.maxPoint)} alsan bile GNO'n ${fmt2(t)}'e çıkmıyor. Hedefe birkaç dönemde ulaşabilirsin.</p>`;
    else if (v <= 0) result = `<p class="target-res good">Bu dönem hangi notları alırsan al GNO'n ${fmt2(t)}'in üstünde kalır.</p>`;
    else result = `<p class="target-res">GNO'nu <b>${fmt2(t)}</b>'e çıkarmak için bu dönem en az <b class="need">${fmt2(v)}</b> ortalama almalısın <span class="hint">(bu dönemin ${state.courses.reduce((s, c) => s + (weightOf(c, state.settings) || 0), 0)} ${unit}'si üzerinden)</span>.</p>`;
  } else if (t !== null) {
    result = `<p class="target-res">Hesap için derslerinin ${state.settings.weightBy === "kredi" ? "kredilerini" : "AKTS'lerini"} gir.</p>`;
  }
  return `<div class="card-box">
    <label class="target-row"><span>Hedef GNO</span>
      <input type="number" inputmode="decimal" step="0.01" min="0" max="${maxPoint(state.settings)}" placeholder="ör. 3,00" value="${t ?? ""}" data-change="set-target" aria-label="Hedef GNO">
    </label>
    ${result || '<p class="target-res hint">Bir hedef yaz; bu dönem kaç ortalama alman gerektiğini hesaplayalım.</p>'}
  </div>`;
}

function gradeRows(state) {
  const { courses, settings } = state;
  const unit = settings.weightBy === "kredi" ? "Kredi" : "AKTS";
  const rows = courses.map((c) => {
    const est = estimateForCourse(c, settings);
    const w = weightOf(c, settings);
    return `<li class="grade-row" style="--c:${c.color}">
      <div class="gr-info">
        <span class="gr-name">${esc(c.code || c.name)}</span>
        <span class="gr-meta">${[
          est?.letter && `<span class="est" title="Not hesaplayıcıdaki puanına göre">tahmini ${esc(est.letter)}</span>`,
          c.retakeOld && `<span class="retake">tekrar · eski ${esc(c.retakeOld)}</span>`,
        ].filter(Boolean).join("") || `<span class="gr-sub">${esc(c.code ? c.name : "")}</span>`}</span>
      </div>
      <label class="gr-w"><input type="number" inputmode="decimal" min="0" max="60" step="0.5" value="${w ?? ""}" placeholder="—" data-change="set-weight" data-id="${esc(c.id)}" aria-label="${esc(c.name)} ${unit}"><span>${unit}</span></label>
      <select data-change="set-letter" data-id="${esc(c.id)}" aria-label="${esc(c.name)} harf notu" class="${c.letter ? "has" : ""}">
        <option value="">Harf</option>
        ${settings.scale.map((s) => `<option value="${esc(s.letter)}" ${s.letter === c.letter ? "selected" : ""}>${esc(s.letter)}</option>`).join("")}
      </select>
    </li>`;
  }).join("");
  const anyEst = courses.some((c) => estimateForCourse(c, settings)?.letter);
  return `<ul class="list grade-list">${rows}</ul>
    <p class="term-note">Harf seçtikçe ortalamalar hemen güncellenir. "Bu dersten BA alırsam?" diye deneyebilirsin.${anyEst ? ' <b>Tahmini</b> harfler not hesaplayıcıdaki puanına göre hesaplanır. Bağıl sistemde (çan eğrisi) gerçek harfin farklı olabilir.' : ""}</p>`;
}

function attendanceRows(state) {
  const { courses, settings } = state;
  const today = todayIdx();
  const todayStr = todayISO();
  return `<ul class="list">${courses.map((c) => {
    const a = attendanceOf(c, settings);
    const todays = c.sessions.filter((s) => s.day === today);
    const todayHours = todays.reduce((s, x) => s + sessionHours(x), 0);
    const markedToday = c.absences.some((x) => x.date === todayStr);
    return `<li class="abs-card ${LEVEL_CLASS[a.level]}" style="--c:${c.color}">
      <div class="abs-top">
        <span class="gr-name">${esc(c.code || c.name)}</span>
        <span class="abs-level">${levelText(a)}</span>
      </div>
      ${a.level === "none" ? "" : `<div class="bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="${a.limit}" aria-valuenow="${a.used}" aria-label="${esc(c.name)} devamsızlık"><span style="width:${Math.round(a.ratio * 100)}%"></span></div>
      <p class="abs-meta">${a.used} / ${a.limit} saat kullanıldı · sınır %${a.limitPct} · haftada ${a.weekly} saat</p>`}
      <div class="abs-actions">
        ${todayHours && !markedToday ? `<button class="btn btn-ghost btn-sm" type="button" data-action="absent-today" data-id="${esc(c.id)}" data-hours="${todayHours}">Bugün yoktum (${todayHours} saat)</button>` : ""}
        ${markedToday ? '<span class="abs-marked">Bugün işaretlendi</span>' : ""}
        <button class="btn btn-ghost btn-sm" type="button" data-action="manage-absence" data-id="${esc(c.id)}">${c.absences.length ? `Kayıtlar (${c.absences.length})` : "Devamsızlık ekle"}</button>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

function pastBlock(state) {
  const { past, settings } = state;
  const unit = settings.weightBy === "kredi" ? "kredi" : "AKTS";
  return `<div class="card-box past-box">
    <label class="field"><span>Önceki dönemlerin toplam ${unit}'si</span>
      <input type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${past.credits ?? ""}" placeholder="ör. 120" data-change="set-past" data-f="credits">
    </label>
    <label class="field"><span>Şu anki GNO'n</span>
      <input type="number" inputmode="decimal" min="0" max="${maxPoint(settings)}" step="0.01" value="${past.gpa ?? ""}" placeholder="ör. 2,85" data-change="set-past" data-f="gpa">
    </label>
    <p class="term-note">İlk dönemindeysen boş bırak. Tekrar aldığın bir ders varsa eski notunu dersin <b>Düzenle</b> ekranından gir; GNO'dan otomatik düşülür.</p>
  </div>`;
}

export function view() {
  const state = store.get();
  const head = `<header class="page-head">
    <h1 class="page-title">Dönem</h1>
    <p class="page-sub">Ortalaman ve devamsızlığın</p>
  </header>`;
  if (!state.courses.length) {
    return head + emptyState("Önce derslerini ekle", "Dönem ortalaması ve devamsızlık takibi derslerine göre hesaplanır.", "import-syllabus", "Syllabus yükle", ["new-course", "Elle ekle"]);
  }
  return `${head}
    ${summary(state)}
    <section class="section">
      <div class="section-head"><h2>Hedef</h2></div>
      ${targetBlock(state)}
    </section>
    <section class="section">
      <div class="section-head"><h2>Notlar ve senaryo</h2><a class="link" href="#/ayarlar">Not ölçeği</a></div>
      ${gradeRows(state)}
    </section>
    <section class="section" id="devamsizlik">
      <div class="section-head"><h2>Devamsızlık</h2></div>
      ${attendanceRows(state)}
    </section>
    <section class="section">
      <div class="section-head"><h2>Geçmiş dönemler</h2></div>
      ${pastBlock(state)}
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Etkileşimler                                                        */
/* ------------------------------------------------------------------ */

const numOrNull = (v) => (v === "" || v === null ? null : Number(v));
const findCourse = (id) => store.get().courses.find((c) => c.id === id);

/** Devamsızlık eklendikten sonra seviye kötüleştiyse uygulama içinde uyar. */
function warnAfter(courseId) {
  const c = findCourse(courseId);
  const a = attendanceOf(c, store.get().settings);
  const name = c.code || c.name;
  if (a.level === "over") toast(`⚠️ ${name}: devamsızlık sınırını aştın`);
  else if (a.level === "danger") toast(`⚠️ ${name}: ${levelText(a).toLowerCase()}`);
  else if (a.level === "warn") toast(`${name}: sınıra yaklaşıyorsun, ${a.remaining} saat hakkın kaldı`);
  else toast("Devamsızlık kaydedildi");
}

export const changes = {
  "set-target"(el) {
    store.setTargetGpa(numOrNull(el.value));
  },
  "set-weight"(el) {
    const c = findCourse(el.dataset.id);
    const key = store.get().settings.weightBy === "kredi" ? "kredi" : "akts";
    store.saveCourse({ ...c, [key]: numOrNull(el.value) });
  },
  "set-letter"(el) {
    store.saveCourse({ ...findCourse(el.dataset.id), letter: el.value });
  },
  "set-past"(el) {
    store.setPast({ [el.dataset.f]: numOrNull(el.value) });
  },
};

export const actions = {
  "absent-today"(el) {
    store.addAbsence(el.dataset.id, { date: todayISO(), hours: Number(el.dataset.hours) });
    warnAfter(el.dataset.id);
  },
  "manage-absence"(el) {
    openAbsenceSheet(el.dataset.id);
  },
  // Adres çubuğundaki # yönlendirme için kullanıldığından bağlantı yerine kaydırma
  "scroll-absence"() {
    document.getElementById("devamsizlik")?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
};

function openAbsenceSheet(courseId) {
  const draw = () => {
    const c = findCourse(courseId);
    const hourOptions = [...new Set([...c.sessions.map(sessionHours), 1, 2, 3, 4])].sort((a, b) => a - b);
    const list = [...c.absences].sort((a, b) => b.date.localeCompare(a.date));
    return `<form class="sheet-form">
      <header class="sheet-head"><h2>${esc(c.code || c.name)} · Devamsızlık</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>
      <div class="sheet-body">
        <div class="row2">
          <label class="field"><span>Tarih</span><input type="date" name="date" value="${todayISO()}" max="${todayISO()}" required></label>
          <label class="field"><span>Kaç ders saati?</span>
            <select name="hours">${hourOptions.map((h) => `<option value="${h}" ${h === (c.sessions[0] ? sessionHours(c.sessions[0]) : 1) ? "selected" : ""}>${h} saat</option>`).join("")}</select>
          </label>
        </div>
        <button type="submit" class="btn btn-primary">${icon.plus}Ekle</button>
        <h3 class="mini-title">Kayıtlar</h3>
        ${list.length ? `<ul class="kv abs-list">${list.map((a) => `<li><b>${fmtShort(a.date)}</b><span>${a.hours} saat <button type="button" class="link" data-remove="${esc(a.id)}">Sil</button></span></li>`).join("")}</ul>` : '<p class="calc-note">Henüz devamsızlık yok.</p>'}
      </div>
    </form>`;
  };

  const bind = (d) => {
    const form = d.querySelector("form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      store.addAbsence(courseId, { date: fd.get("date"), hours: Number(fd.get("hours")) });
      warnAfter(courseId);
      d.innerHTML = draw();
      bind(d);
    });
    form.addEventListener("click", (e) => {
      const id = e.target.closest("[data-remove]")?.dataset.remove;
      if (!id) return;
      store.removeAbsence(courseId, id);
      toast("Kayıt silindi");
      d.innerHTML = draw();
      bind(d);
    });
  };

  openSheet(draw(), bind);
}
