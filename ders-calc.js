/**
 * KPR — Ders hesapları (DOM yok): not ortalaması, hedef harf, içinde bulunulan hafta.
 * Ders ekranı (ders.js), uyarılar (alerts.js) ve Asistan (asistan-core.js) aynı hesabı kullanır;
 * tarayıcıya dokunmadığı için Node testlerinde de çalışır.
 */

import { t, locale, decimal } from "./i18n.js";
import { letterFor, neededByLetter, COEF } from "./gpa.js";
import { groupOf } from "./weights.js";
import { density } from "./density.js";
import { todayISO, parseISO } from "./dates.js";

export const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString(locale());

/** Girilen notlara göre ağırlıklı ortalama ve hedef için gereken ortalama. */
export function calcGrades(grading, target) {
  // Bonus (ek puan) bileşenleri 100'lük dağılımın parçası değil: toplamda ve "kalan"da sayılmaz,
  // notu girildiyse kazanılan puana eklenir. Girilmediyse gereken ortalama bonussuz (temkinli) hesaplanır.
  const base = grading.filter((g) => !g.bonus);
  const total = base.reduce((s, g) => s + g.weight, 0);
  const done = base.filter((g) => g.score !== null);
  const doneWeight = done.reduce((s, g) => s + g.weight, 0);
  const bonusEarned = grading.filter((g) => g.bonus && g.score !== null).reduce((s, g) => s + (g.score * g.weight) / 100, 0);
  const earned = done.reduce((s, g) => s + (g.score * g.weight) / 100, 0) + bonusEarned;
  const remaining = total - doneWeight;
  return {
    total,
    doneWeight,
    average: doneWeight ? ((earned - bonusEarned) / doneWeight) * 100 : null,
    bonusEarned,
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
  // status: "done" (hepsi girildi) | "ok" (garanti) | "need" | "no" (artık mümkün değil)
  const out = { lines: [], letter: null, done: false, need: null, status: null, onlyFinal: false, best: null, earned: r.earned };
  if (r.remaining <= 0.01 && r.doneWeight > 0) {
    out.done = true;
    out.status = "done";
    out.letter = underBar ? "F" : letterFor(r.earned, c.scale);
    out.lines.push(
      out.letter in COEF
        ? t("Ders puanın {score} → tahmini harfin {letter} ({coef}).", { score: fmtNum(r.earned), letter: out.letter, coef: decimal(COEF[out.letter].toFixed(2)) })
        : t("Ders puanın {score} → tahmini harfin {letter}.", { score: fmtNum(r.earned), letter: out.letter }),
    );
  } else {
    const rows = neededByLetter(c.scale, r.earned, r.remaining);
    const tl = rows.find((x) => x.letter === c.targetLetter) || rows.find((x) => x.letter === "B") || rows[Math.floor(rows.length / 2)];
    out.letter = tl.letter;
    // Kalan bileşenlerin hepsi final mi? → "Finalden en az X"
    const left = c.grading.filter((g) => g.score === null && !g.bonus);
    const onlyFinal = left.length > 0 && left.every((g) => groupOf(g.name) === "final");
    out.onlyFinal = onlyFinal;
    out.status = tl.status;
    out.best = rows.find((x) => x.status !== "no")?.letter ?? null;
    if (tl.status === "ok") out.lines.push(t("Bu harfi garantiledin."));
    else if (tl.status === "no") {
      const best = rows.find((x) => x.status !== "no");
      out.lines.push(best ? t("Bu harf artık mümkün değil, en yüksek ulaşabileceğin: {letter}.", { letter: best.letter }) : t("Kalanlardan 100 alsan da tablodaki en düşük harfe ulaşmak zor görünüyor."));
    } else {
      const need = Math.max(0, tl.need);
      out.need = need;
      out.lines.push(onlyFinal ? t("Finalden en az {n} alman gerekiyor.", { n: fmtNum(need) }) : t("Kalan değerlendirmelerden ortalama en az {n} alman gerekiyor.", { n: fmtNum(need) }));
    }
    if (c.finalMin !== null && fin && fin.score === null) out.lines.push(t("Finalden en az {n} alman şart; altında kalırsan diğer notlardan bağımsız F olabilir.", { n: fmtNum(c.finalMin) }));
  }
  if (underBar) out.lines.push(t("Final notun ({score}) barajın ({min}) altında. Bütünlemeye girersen final satırına bütünleme notunu yaz.", { score: fmtNum(fin.score), min: fmtNum(c.finalMin) }));
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

/**
 * Not girişi penceresindeki canlı etki satırı: bileşen i'ye v girilirse hedef harf ne olur?
 * Hedef harf seçili değilse ya da harf tablosu yoksa "" (satır gizlenir).
 */
export function impactLine(c, i, v) {
  if (!c.targetLetter || !c.scale.length) return "";
  const grading = c.grading.map((g, k) => (k === i ? { ...g, score: v } : g));
  const r = targetResult({ ...c, grading });
  if (!r) return "";
  const L = c.targetLetter;
  if (r.status === "done") return t("Bu notla ders puanın {score} → {letter}", { score: fmtNum(r.earned), letter: r.letter });
  if (r.letter !== L) return "";
  if (r.status === "ok") return t("Bu notla {L} garanti", { L });
  if (r.status === "no") return r.best ? t("Bu notla {L} artık mümkün değil (en yüksek {best})", { L, best: r.best }) : t("Bu notla {L} artık mümkün değil", { L });
  return r.onlyFinal ? t("Hedef {L} için finalden {n} yeter", { L, n: fmtNum(r.need) }) : t("Hedef {L} için kalanlardan ortalama {n} yeter", { L, n: fmtNum(r.need) });
}

/** Harf seçerken: o harf için ne gerekiyor (tek satır). */
export function letterNeedLine(c, L) {
  if (!c.scale.length || !c.grading.length) return "";
  const r = targetResult({ ...c, targetLetter: L });
  if (!r || r.done) return "";
  if (r.status === "ok") return t("{L} garanti", { L });
  if (r.status === "no") return t("{L} artık mümkün değil", { L });
  return r.onlyFinal ? t("{L} için finalden en az {n}", { L, n: fmtNum(r.need) }) : t("{L} için kalanlardan ortalama en az {n}", { L, n: fmtNum(r.need) });
}
