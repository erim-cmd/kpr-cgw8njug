/**
 * KPR — Ders hesapları (DOM yok): not ortalaması, hedef harf, içinde bulunulan hafta.
 * Ders ekranı (ders.js), uyarılar (alerts.js) ve Asistan (asistan-core.js) aynı hesabı kullanır;
 * tarayıcıya dokunmadığı için Node testlerinde de çalışır.
 */

import { letterFor, neededByLetter, COEF } from "./gpa.js";
import { groupOf } from "./weights.js";
import { density } from "./density.js";
import { todayISO, parseISO } from "./dates.js";

export const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString("tr-TR");

/** Girilen notlara göre ağırlıklı ortalama ve hedef için gereken ortalama. */
export function calcGrades(grading, target) {
  const total = grading.reduce((s, g) => s + g.weight, 0);
  const done = grading.filter((g) => g.score !== null);
  const doneWeight = done.reduce((s, g) => s + g.weight, 0);
  const earned = done.reduce((s, g) => s + (g.score * g.weight) / 100, 0);
  const remaining = total - doneWeight;
  return {
    total,
    doneWeight,
    average: doneWeight ? (earned / doneWeight) * 100 : null,
    earned,
    remaining,
    needed: remaining > 0 ? ((target - earned) / remaining) * 100 : null,
  };
}

/** Final bileşeni: adında final/bütünleme geçen ilk bileşen (proje değil). */
const finalIndex = (grading) => grading.findIndex((g) => groupOf(g.name) === "final");

/**
 * Hedef harf için sonuç: { lines: [düz metin], letter, done, need }.
 * Hocanın harf tablosu (scale) ya da not dağılımı yoksa null.
 */
export function targetResult(c) {
  if (!c.grading.length || !c.scale.length) return null;
  const r = calcGrades(c.grading, c.target);
  const fi = finalIndex(c.grading);
  const fin = fi >= 0 ? c.grading[fi] : null;
  const underBar = c.finalMin !== null && fin && fin.score !== null && fin.score < c.finalMin;
  const out = { lines: [], letter: null, done: false, need: null };
  if (r.remaining <= 0.01 && r.doneWeight > 0) {
    out.done = true;
    out.letter = underBar ? "F" : letterFor(r.earned, c.scale);
    out.lines.push(`Ders puanın ${fmtNum(r.earned)} → tahmini harfin ${out.letter}${out.letter in COEF ? ` (${COEF[out.letter].toFixed(2)})` : ""}.`);
  } else {
    const rows = neededByLetter(c.scale, r.earned, r.remaining);
    const tl = rows.find((x) => x.letter === c.targetLetter) || rows.find((x) => x.letter === "B") || rows[Math.floor(rows.length / 2)];
    out.letter = tl.letter;
    // Kalan bileşenlerin hepsi final mi? → "Finalden en az X"
    const left = c.grading.filter((g) => g.score === null);
    const onlyFinal = left.length && left.every((g) => groupOf(g.name) === "final");
    if (tl.status === "ok") out.lines.push("Bu harfi garantiledin.");
    else if (tl.status === "no") {
      const best = rows.find((x) => x.status !== "no");
      out.lines.push(best ? `Bu harf artık mümkün değil, en yüksek ulaşabileceğin: ${best.letter}.` : "Kalanlardan 100 alsan da tablodaki en düşük harfe ulaşmak zor görünüyor.");
    } else {
      const need = Math.max(0, tl.need);
      out.need = need;
      out.lines.push(onlyFinal ? `Finalden en az ${fmtNum(need)} alman gerekiyor.` : `Kalan değerlendirmelerden ortalama en az ${fmtNum(need)} alman gerekiyor.`);
    }
    if (c.finalMin !== null && fin && fin.score === null) out.lines.push(`Finalden en az ${fmtNum(c.finalMin)} alman şart; altında kalırsan diğer notlardan bağımsız F olabilir.`);
  }
  if (underBar) out.lines.push(`Final notun (${fmtNum(fin.score)}) barajın (${fmtNum(c.finalMin)}) altında. Bütünlemeye girersen final satırına bütünleme notunu yaz.`);
  return out;
}

/** İçinde bulunulan hafta: tarihli haftalık plandan, yoksa dönem takviminden. */
export function currentWeekOf(c, state) {
  const today = todayISO();
  const dated = c.weeks.filter((w) => w.date);
  if (dated.length) {
    const past = dated.filter((w) => w.date <= today);
    if (!past.length) return null;
    const last = past[past.length - 1];
    // Son tarihli haftadan sonra 7 günden fazla geçtiyse plan bitti
    return (parseISO(today) - parseISO(last.date)) / 86400000 < 7 ? last.n : null;
  }
  const d = density(state.tasks, state.settings);
  return d.current === null ? null : d.current + 1;
}
