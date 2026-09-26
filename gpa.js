/**
 * KPR — Not ortalaması hesapları (tamamen cihazda).
 *
 * Tanımlar
 *   ağırlık (w): dersin AKTS'si ya da ulusal kredisi (Ayarlar → "Ortalama neye göre")
 *   katsayı (p): harf notunun karşılığı (Ayarlar → harf ölçeği)
 *   Dönem ortalaması (DNO) = Σ w·p / Σ w   (sadece harfi girilmiş dersler)
 *   GNO = (önceki puan toplamı + bu dönemin puanı) / (önceki ağırlık + bu dönemin ağırlığı)
 *   Tekrar alınan derste eski not GNO'dan çıkarılır, yenisi eklenir.
 */

export const weightOf = (course, settings) => (settings.weightBy === "kredi" ? course.kredi : course.akts);

export function pointOf(letter, settings) {
  const hit = settings.scale.find((s) => s.letter === letter);
  return hit ? hit.point : null;
}

/** Önceki dönemler: tekrar alınan derslerin eski notları çıkarılmış hâli. */
function pastTotals(state) {
  const { past, courses, settings } = state;
  // Geçmiş ancak ikisi de girildiyse kullanılır; yarım veri ortalamayı bozmasın
  if (!past.credits || past.gpa === null) return { credits: 0, points: 0 };
  let credits = past.credits;
  let points = past.credits * past.gpa;
  for (const c of courses) {
    const w = weightOf(c, settings);
    const p = pointOf(c.retakeOld, settings);
    if (!w || p === null) continue;
    credits -= w;
    points -= w * p;
  }
  return { credits: Math.max(0, credits), points: Math.max(0, points) };
}

export function computeGpa(state, overrides = {}) {
  const { courses, settings } = state;
  let termW = 0, termP = 0, missing = 0, noWeight = 0, allW = 0;
  for (const c of courses) {
    const w = weightOf(c, settings);
    if (!w) { noWeight++; continue; }
    allW += w;
    const p = pointOf(overrides[c.id] ?? c.letter, settings);
    if (p === null) { missing++; continue; }
    termW += w;
    termP += w * p;
  }
  const past = pastTotals(state);
  const hasPast = past.credits > 0;
  const termAvg = termW ? termP / termW : null;
  const gpa = termW || hasPast ? (past.points + termP) / (past.credits + termW) || 0 : null;
  return { termAvg, gpa, termW, allW, missing, noWeight, hasPast, pastCredits: past.credits, pastPoints: past.points };
}

/**
 * Ters hesap: GNO'yu `target`'a çıkarmak için bu dönemin tüm derslerinden
 * (ağırlığı girilmiş olanlar) ortalama kaç alınmalı?
 */
export function requiredTermAvg(state, target) {
  const { allW, pastCredits, pastPoints, hasPast } = computeGpa(state);
  if (!allW || target === null) return null;
  if (!hasPast) return { value: target, maxPoint: maxPoint(state.settings) };
  return { value: (target * (pastCredits + allW) - pastPoints) / allW, maxPoint: maxPoint(state.settings) };
}

export const maxPoint = (settings) => Math.max(...settings.scale.map((s) => s.point));

/** Not hesaplayıcıdaki puandan harf tahmini (mutlak tabloya göre). */
export function estimateLetter(score, settings) {
  if (score === null || score === undefined) return null;
  const table = [...settings.scoreTable].sort((a, b) => b.min - a.min);
  return table.find((r) => score >= r.min)?.letter ?? null;
}

export const fmt2 = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(2).replace(".", ","));
