/**
 * KPR — Ortalama: BAU kurallarıyla bu dönemin UMIS tablosu (harf, kredi, AKTS, HESAPLA).
 * Dönem ekranının "Ortalama" bölümü (term.js → section()). GNO kartı Dönem → Özet'te.
 * Geçmiş GNO iki sayıdan: gpaBase = { credits, gno } (openBaseForm). v2.11'den beri ders ders
 * geçmiş dönem girişi arayüzde yok; eski kayıtlar migrate.js ile gpaBase'e çevrildi.
 */

import { store } from "./store.js";
import { esc, openSheet, closeSheet, toast, armDelete } from "./ui.js";
import { icon } from "./icons.js";
import { COEF, UMIS_GRADES, UNVERIFIED, gradeLabel, fmtGpa, nearestLetter, currentTerm } from "./gpa.js";

// Hedef GNO: hesap projection().needed() ile; kart Dönem → Özet'te
const TARGET_KEY = "kpr:target-gno";
export const readTarget = () => {
  try {
    const v = Number(localStorage.getItem(TARGET_KEY));
    return v > 0 && v <= 4 ? v : 3;
  } catch {
    return 3;
  }
};
export const saveTarget = (value) => {
  const v = Math.min(4, Math.max(0, Number(value)));
  try {
    localStorage.setItem(TARGET_KEY, String(v));
  } catch {}
};

/** Hedef GNO için bu dönem gereken ortalamanın açıklaması (HTML). */
export function targetText(p, target) {
  const need = p.needed(target);
  if (need === null) return "";
  if (need > 4) return `Bu dönem hepsinden A alsan da GNO <b>${target.toFixed(2)}</b> olmuyor. Daha düşük bir hedef dene ya da not yükseltmek için ders tekrarını düşün.`;
  if (need <= 0) return `Bu dönem ne alırsan al GNO'n <b>${target.toFixed(2)}</b>'nin üstünde kalıyor.`;
  return `GNO'n <b>${target.toFixed(2)}</b> olsun istiyorsan bu dönem en az <b class="need">${need.toFixed(2)}</b> ortalama gerekiyor (yaklaşık ${nearestLetter(need)} ortalaması).`;
}

/** UMIS'teki harf listesi. short: sadece harf (tablo hücresi için), değilse katsayısıyla. */
const gradeOptions = (selected, { blank = "", short = false, only = null } = {}) =>
  `<option value="">${blank}</option>` +
  (only || UMIS_GRADES).map((g) => `<option value="${g}" ${g === selected ? "selected" : ""}>${short ? g : gradeLabel(g)}</option>`).join("");

let showRetake = false; // "tekrar aldığım ders var" açılınca önceki not seçimi görünür
let showResult = false; // UMIS'teki gibi: HESAPLA'ya basınca sonuç kutusu açılır

const fmt1 = (n) => (n === null || n === undefined ? "" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function currentBlock(state, p) {
  const { courses } = state;
  const term = currentTerm();
  if (!courses.length) {
    return `<div class="sub-block"><div class="section-head"><h3 class="sub-title">Bu dönem</h3></div>
      <div class="empty">
        <strong>Derslerin burada listelenecek</strong>
        <p>Syllabus'larını yükle; ders kodu, adı, kredisi ve AKTS'si bu tabloya gelsin. Sonra her derse beklediğin harfi seç.</p>
        <div class="empty-actions"><button class="btn btn-primary" type="button" data-action="import-syllabus">${icon.upload}Syllabus yükle</button></div>
      </div></div>`;
  }
  const base = p.source === "base";
  const retake = base && (showRetake || courses.some((c) => c.prevGrade));
  const unverified = courses.filter((c) => c.letter in UNVERIFIED);
  const totalCr = courses.reduce((t, c) => t + (c.credit || 0), 0);
  const totalEcts = courses.reduce((t, c) => t + (c.ects || 0), 0);
  const rows = courses.map((c) => `<tr style="--c:${c.color}">
      <td class="u-code"><b>${esc(c.code || "—")}</b><small class="u-name-sm">${esc(c.name)}</small></td>
      <td class="u-name">${esc(c.name)}</td>
      <td class="u-num"><input type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${c.credit ?? ""}" placeholder="—" data-change="credit" data-id="${esc(c.id)}" aria-label="${esc(c.name)} kredi"></td>
      <td class="u-num"><input type="number" min="0" max="60" step="0.5" inputmode="decimal" value="${c.ects ?? ""}" placeholder="—" data-change="ects" data-id="${esc(c.id)}" aria-label="${esc(c.name)} AKTS"></td>
      <td class="u-grade"><select data-change="letter" data-id="${esc(c.id)}" aria-label="${esc(c.name)} harf notu">${gradeOptions(c.letter, { short: true })}</select></td>
    </tr>
    ${retake ? `<tr class="u-sub"><td colspan="5"><label>Tekrar alıyorsan önceki notun
      <select data-change="prev" data-id="${esc(c.id)}" aria-label="${esc(c.name)} önceki not">${gradeOptions(c.prevGrade, { blank: "İlk kez alıyorum", only: Object.keys(COEF) })}</select></label></td></tr>` : ""}`).join("");

  const result = showResult
    ? `<div class="calc-result u-result" aria-live="polite">
        ${p.term.graded ? `<p>Dönem ortalaması (YNO): <b class="need">${fmtGpa(p.term.avg)}</b> · ${fmt1(p.term.credits)} kredi</p>` : "<p>Önce derslere harf notu seç.</p>"}
        ${p.after !== null && p.term.graded ? `<p>Genel not ortalaması (GNO): <b class="need">${fmtGpa(p.after)}</b></p>` : ""}
        ${p.term.graded && p.term.graded < p.term.total ? `<p class="warn-text">${p.term.total - p.term.graded} ders hesaba katılmadı: harfi seçilmedi ya da seçilen not ortalamaya girmiyor.</p>` : ""}
        ${p.source === "none" ? `<p class="fine">Özet'teki GNO kartına şu anki GNO'nu ve kredini girersen genel ortalama da hesaplanır.</p>` : ""}
      </div>`
    : "";

  return `<div class="sub-block">
    <div class="section-head"><h3 class="sub-title">Bu dönem</h3><span class="u-term">${esc(term.label)}</span></div>
    <div class="u-table-wrap">
      <table class="u-table">
        <colgroup><col><col class="u-name"><col class="u-numc"><col class="u-numc"><col class="u-gradec"></colgroup>
        <thead><tr><th>Ders kodu</th><th class="u-name">Ders adı</th><th class="u-num">Kredi</th><th class="u-num">AKTS</th><th class="u-grade">Harf<span class="u-wide"> notu</span></th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Toplam</td><td class="u-name"></td><td class="u-num">${fmt1(totalCr)}</td><td class="u-num">${fmt1(totalEcts)}</td><td></td></tr></tfoot>
      </table>
    </div>
    ${unverified.length ? `<p class="warn-text fine gap-t">${unverified.map((c) => esc(c.letter)).join(", ")} notunun katsayısı yönetmelikte yok; doğrulanana kadar hesaba katılmıyor.</p>` : ""}
    ${p.missingCredit ? `<p class="fine gap-t">Kredisi girilmeyen ${p.missingCredit} ders hesaba katılmıyor. GNO'da KREDİ sütunu kullanılır, AKTS değil.</p>` : ""}
    ${base && !retake ? '<button class="link gap-t" type="button" data-action="show-retake">Bu dönem tekrar aldığım ders var</button>' : ""}
    <div><button class="btn btn-primary u-calc" type="button" data-action="calc">HESAPLA</button></div>
    ${result}
  </div>`;
}

/** Dönem ekranının "Ortalama" bölümü. */
export function section(state, p) {
  return `<section class="section" id="ortalama">
    <div class="section-head"><h2>Ortalama</h2><span class="u-term">BAU · A–F, 4.00 üzerinden</span></div>
    ${currentBlock(state, p)}
    <p class="footnote">Hesap BAU Eğitim-Öğretim ve Sınav Yönetmeliği'ne göre (Md. 26, 28): ders puanı = ulusal kredi × katsayı, tekrar edilen derste son not geçerli, sonuç iki haneye yuvarlanır. NA ve F ortalamaya 0.00 girer; S, U, EX, W ortalamaya girmez. BAU bağıl değerlendirme kullandığı için harfi sen seçersin. Sonucu UMIS'teki ile karşılaştır.</p>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Formlar                                                             */
/* ------------------------------------------------------------------ */

const head = (title) => `<header class="sheet-head"><h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>`;

export function openBaseForm() {
  const b = store.get().gpaBase || { credits: "", gno: "" };
  openSheet(
    `<form class="sheet-form">
      ${head("UMIS özeti")}
      <div class="sheet-body">
        <p class="lead-text">UMIS'teki transkriptinde en alttaki <b>toplam kredi</b> ve <b>genel not ortalaması</b> değerlerini gir.</p>
        <div class="row2">
          <label class="field"><span>Toplam kredi</span><input name="credits" type="number" min="1" max="1000" step="0.5" inputmode="decimal" value="${b.credits}" required autofocus></label>
          <label class="field"><span>GNO</span><input name="gno" type="number" min="0" max="4" step="0.01" inputmode="decimal" value="${b.gno}" required></label>
        </div>
        <p class="fine">Bu dönem tekrar aldığın bir ders varsa "Bu dönem" listesinde o dersin önceki notunu seç; eski not ortalamadan düşülür.</p>
      </div>
      <footer class="sheet-foot">
        ${store.get().gpaBase ? '<button type="button" class="btn btn-danger" data-delete>Sil</button>' : ""}
        <button type="submit" class="btn btn-primary">Kaydet</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        store.setBase({ credits: Number(fd.get("credits")), gno: Number(fd.get("gno")) });
        closeSheet();
        toast("Kaydedildi");
      });
      armDelete(form.querySelector("[data-delete]"), () => {
        store.setBase(null);
        closeSheet();
        toast("Özet silindi");
      });
    }
  );
}

/* ------------------------------------------------------------------ */
/* Olaylar                                                             */
/* ------------------------------------------------------------------ */

const course = (id) => store.get().courses.find((c) => c.id === id);

export const actions = {
  "edit-base": () => openBaseForm(),
  "show-retake"(_el, { render }) {
    showRetake = true;
    render();
  },
  calc(_el, { render }) {
    showResult = true;
    render();
    document.querySelector(".u-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
};

export const changes = {
  credit(el) {
    const c = course(el.dataset.id);
    if (!c) return;
    const v = el.value === "" ? null : Number(el.value);
    store.saveCourse({ ...c, credit: v });
  },
  ects(el) {
    const c = course(el.dataset.id);
    if (!c) return;
    store.saveCourse({ ...c, ects: el.value === "" ? null : Number(el.value) });
  },
  letter(el) {
    const c = course(el.dataset.id);
    if (c) store.saveCourse({ ...c, letter: el.value });
  },
  prev(el) {
    const c = course(el.dataset.id);
    if (c) store.saveCourse({ ...c, prevGrade: el.value });
  },
  target(el, { render }) {
    saveTarget(el.value);
    render();
  },
};
