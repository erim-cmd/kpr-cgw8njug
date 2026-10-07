/**
 * KPR — Ortalama: BAU kurallarıyla bu dönemin UMIS tablosu (harf, kredi, AKTS, HESAPLA).
 * Dönem'in ikincil sayfası #/ortalama (term.js → ortalama). Hedef GNO kartı Dönem'de.
 * Geçmiş GNO iki sayıdan: gpaBase = { credits, gno } (openBaseForm). v2.11'den beri ders ders
 * geçmiş dönem girişi arayüzde yok; eski kayıtlar migrate.js ile gpaBase'e çevrildi.
 */

import { getLang, t, locale } from "./i18n.js";
import { store } from "./store.js";
import { esc, toast } from "./ui.js";
import { openNumberSheet, openLetterSheet } from "./grade-sheet.js";
import { icon } from "./icons.js";
import { infoNote } from "./components.js";
import { COEF, UMIS_GRADES, UNVERIFIED, fmtGpa, nearestLetter, currentTerm } from "./gpa.js";

// Hedef GNO: hesap projection().needed() ile; kart Dönem'de
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
  const g = `<b>${fmtGpa(target)}</b>`;
  if (need > 4) return t("Bu dönem hepsinden A alsan da GNO {g} olmuyor. Daha düşük bir hedef dene ya da not yükseltmek için ders tekrarını düşün.", { g });
  if (need <= 0) return t("Bu dönem ne alırsan al GNO'n {g} ya da üstünde kalıyor.", { g });
  return t("GNO'n {g} olsun istiyorsan bu dönem en az {need} ortalama gerekiyor (yaklaşık {l} ortalaması).", { g, need: `<b class="need">${fmtGpa(need)}</b>`, l: nearestLetter(need) });
}

let showRetake = false; // "tekrar aldığım ders var" açılınca önceki not seçimi görünür
let showResult = false; // UMIS'teki gibi: HESAPLA'ya basınca sonuç kutusu açılır

const fmt1 = (n) => (n === null || n === undefined ? "" : Number(n).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function currentBlock(state, p) {
  const { courses } = state;
  const term = currentTerm();
  if (!courses.length) {
    return `<div class="sub-block"><div class="section-head"><h3 class="sub-title">${t("Bu dönem")}</h3></div>
      <div class="empty">
        <strong>${t("Derslerin burada listelenecek")}</strong>
        <p>${t("Syllabus'larını yükle; ders kodu, adı, kredisi ve AKTS'si bu tabloya gelsin. Sonra her derse beklediğin harfi seç.")}</p>
        <div class="empty-actions"><button class="btn btn-primary" type="button" data-action="import-syllabus">${icon.upload}${t("Syllabus ekle")}</button></div>
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
      <td class="u-num"><input type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${c.credit ?? ""}" placeholder="—" data-change="credit" data-id="${esc(c.id)}" aria-label="${t("{ders} kredi", { ders: esc(c.name) })}"></td>
      <td class="u-num"><input type="number" min="0" max="60" step="0.5" inputmode="decimal" value="${c.ects ?? ""}" placeholder="—" data-change="ects" data-id="${esc(c.id)}" aria-label="${t("{ders} AKTS", { ders: esc(c.name) })}"></td>
      <td class="u-grade"><button type="button" class="u-pick" data-action="pick-letter" data-id="${esc(c.id)}" aria-label="${t("{ders} harf notu: {l}", { ders: esc(c.name), l: esc(c.letter || t("seçilmedi")) })}">${esc(c.letter || "—")}</button></td>
    </tr>
    ${retake ? `<tr class="u-sub"><td colspan="5"><label>${t("Tekrar alıyorsan önceki notun")}
      <button type="button" class="u-pick" data-action="pick-prev" data-id="${esc(c.id)}" aria-label="${t("{ders} önceki not", { ders: esc(c.name) })}">${esc(c.prevGrade || t("İlk kez alıyorum"))}</button></label></td></tr>` : ""}`).join("");

  const result = showResult
    ? `<div class="calc-result u-result" aria-live="polite">
        ${p.term.graded ? `<p>${t("Dönem ortalaması (YNO): {avg} · {cr} kredi", { avg: `<b class="need">${fmtGpa(p.term.avg)}</b>`, cr: fmt1(p.term.credits) })}</p>` : `<p>${t("Önce derslere harf notu seç.")}</p>`}
        ${p.after !== null && p.term.graded ? `<p>${t("Genel not ortalaması (GNO): {g}", { g: `<b class="need">${fmtGpa(p.after)}</b>` })}</p>` : ""}
        ${p.term.graded && p.term.graded < p.term.total ? `<p class="warn-text">${t("{n} ders hesaba katılmadı: harfi seçilmedi ya da seçilen not ortalamaya girmiyor.", { n: p.term.total - p.term.graded })}</p>` : ""}
        ${p.source === "none" ? `<p class="fine">${t("Dönem'deki Hedef GNO kartına şu anki GNO'nu ve kredini girersen genel ortalama da hesaplanır.")}</p>` : ""}
      </div>`
    : "";

  return `<div class="sub-block">
    <div class="section-head"><h3 class="sub-title">${t("Bu dönem")}</h3><span class="u-term">${esc(term.label)}</span></div>
    <div class="u-table-wrap">
      <table class="u-table">
        <colgroup><col><col class="u-name"><col class="u-numc"><col class="u-numc"><col class="u-gradec"></colgroup>
        <thead><tr><th>${t("Ders kodu")}</th><th class="u-name">${t("Ders adı")}</th><th class="u-num" title="${t("Kredi")}">${getLang() === "en" ? "Cr." : t("Kredi")}</th><th class="u-num">${t("AKTS")}</th><th class="u-grade">${t("Harf")}<span class="u-wide">${t(" notu")}</span></th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>${t("Toplam")}</td><td class="u-name"></td><td class="u-num">${fmt1(totalCr)}</td><td class="u-num">${fmt1(totalEcts)}</td><td></td></tr></tfoot>
      </table>
    </div>
    ${unverified.length ? `<p class="warn-text fine gap-t">${t("{l} notunun katsayısı yönetmelikte yok; doğrulanana kadar hesaba katılmıyor.", { l: unverified.map((c) => esc(c.letter)).join(", ") })}</p>` : ""}
    ${p.missingCredit ? `<p class="fine gap-t">${t("Kredisi girilmeyen {n} ders hesaba katılmıyor. GNO'da KREDİ sütunu kullanılır, AKTS değil.", { n: p.missingCredit })}</p>` : ""}
    ${base && !retake ? `<button class="link gap-t" type="button" data-action="show-retake">${t("Bu dönem tekrar aldığım ders var")}</button>` : ""}
    <div><button class="btn btn-primary u-calc" type="button" data-action="calc">${t("Hesapla")}</button></div>
    ${result}
  </div>`;
}

/** Ortalama sayfasının içeriği (#/ortalama; başlık term.js → ortalama.view()). */
export function section(state, p) {
  return `<section class="section" id="ortalama">
    ${currentBlock(state, p)}
    ${infoNote(t("Bu hesap nasıl yapılıyor?"), t("Hesap BAU Eğitim-Öğretim ve Sınav Yönetmeliği'ne göre (Md. 26, 28): ders puanı = ulusal kredi × katsayı, tekrar edilen derste son not geçerli, sonuç iki haneye yuvarlanır. NA ve F ortalamaya 0,00 girer; S, U, EX, W ortalamaya girmez. BAU bağıl değerlendirme kullandığı için harfi sen seçersin. Sonucu UMIS'teki ile karşılaştır."))}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Formlar                                                             */
/* ------------------------------------------------------------------ */

const head = (title) => `<header class="sheet-head"><h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button></header>`;

/**
 * Geçmiş GNO iki sayıdan (UMIS transkriptinin en altında yazar): önce GNO, sonra tamamlanan kredi.
 * Ortak not girişi penceresi; "GNO'yu temizle" gpaBase'i siler.
 */
export function openBaseForm() {
  const b = store.get().gpaBase;
  openNumberSheet({
    context: t("Şu anki GNO'n (UMIS transkripti)"),
    value: b?.gno ?? null,
    max: 4,
    decimals: 2,
    unit: `/ ${fmtGpa(4)}`,
    clearLabel: b ? t("GNO'yu temizle") : "",
    saveLabel: t("Devam"),
    onSave: (gno) => {
      if (gno === null) {
        store.setBase(null);
        return toast(t("GNO silindi"));
      }
      openNumberSheet({
        context: t("Tamamladığın kredi (ulusal kredi toplamı)"),
        value: b?.credits ?? null,
        min: 1,
        max: 400,
        decimals: 0,
        unit: t("kredi"),
        clearLabel: "",
        onSave: (credits) => {
          store.setBase({ credits, gno });
          toast(t("Kaydedildi"));
        },
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Olaylar                                                             */
/* ------------------------------------------------------------------ */

const course = (id) => store.get().courses.find((c) => c.id === id);
const LETTERS_UMIS = UMIS_GRADES;

export const actions = {
  // UMIS tablosunda harf: ızgaradan tek dokunuş
  "pick-letter"(el) {
    const c = course(el.dataset.id);
    if (!c) return;
    openLetterSheet({
      context: t("{ders} · Harf notu", { ders: c.code || c.name }),
      letters: LETTERS_UMIS,
      value: c.letter,
      impact: (l) => (l in UNVERIFIED ? t("{l}: katsayısı doğrulanmadı, hesaba katılmaz", { l }) : l in COEF ? `${l} = ${fmtGpa(COEF[l])}` : t("ortalamaya girmez")),
      clearLabel: t("Harfi temizle"),
      onSave: (l) => store.saveCourse({ ...course(c.id), letter: l }),
    });
  },
  "pick-prev"(el) {
    const c = course(el.dataset.id);
    if (!c) return;
    openLetterSheet({
      context: t("{ders} · Önceki notun (tekrar alıyorsan)", { ders: c.code || c.name }),
      letters: Object.keys(COEF),
      value: c.prevGrade,
      clearLabel: t("İlk kez alıyorum"),
      onSave: (l) => store.saveCourse({ ...course(c.id), prevGrade: l }),
    });
  },
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
  target(el, { render }) {
    saveTarget(el.value);
    render();
  },
};
