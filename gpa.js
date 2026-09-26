/**
 * KPR — Not ortalaması (BAU kuralları)
 *
 * Kaynak: Bahçeşehir Üniversitesi Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği
 *   Md. 26  Harf notları ve katsayılar (A 4.00 … F 0.00, NA 0.00)
 *   Md. 28  Ders puanı = ulusal (yerel) kredi × katsayı; YNO/GNO = puanlar ÷ krediler,
 *           virgülden sonra iki hane (üçüncü hane 5 ve üstüyse yukarı yuvarlanır);
 *           tekrarlanan derste SON not geçerlidir.
 *   Md. 28(3) GNO ≥ 2.00 başarılı, 1.80–1.99 koşullu başarılı, < 1.80 sınamalı.
 * S, U, EX, W, I, NI, PR ortalamaya girmez.
 */

import { SEASONS } from "./store.js";

export const COEF = {
  A: 4, "A-": 3.67, "B+": 3.33, B: 3, "B-": 2.67, "C+": 2.33,
  C: 2, "C-": 1.67, "D+": 1.33, D: 1, F: 0, NA: 0,
};
export const LETTERS = Object.keys(COEF);
export const OTHER = {
  S: "Başarılı (kredisiz)", U: "Başarısız (kredisiz)", EX: "Muaf", W: "Dersten çekildi",
  I: "Eksik", NI: "Ortalama dışı", PR: "Devam ediyor",
};

/**
 * UMIS'in listesinde olup yönetmelikte (Md. 26) olmayan notlar.
 * Katsayıları doğrulanana kadar ortalamaya katılmaz ve kullanıcı uyarılır.
 * Doğrulama: UMIS not hesaplama ekranında bir derse bu notu verip HESAPLA'ya bas.
 */
export const UNVERIFIED = { "D-": "katsayısı doğrulanmadı", E: "katsayısı doğrulanmadı", R: "anlamı doğrulanmadı" };

/** UMIS'teki harf listesi, sıralı. */
export const UMIS_GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E", "F", "NA", "S", "U", "EX", "W", "I", "R"];

export function gradeLabel(g) {
  if (g in COEF) return `${g} · ${COEF[g].toFixed(2)}`;
  if (g in UNVERIFIED) return `${g} · ${UNVERIFIED[g]}`;
  if (g in OTHER) return `${g} · ${OTHER[g]}`;
  return g;
}

export const counts = (g) => g in COEF;

/** "gecti" | "kosullu" | "kaldi" | null — Md. 29 */
export function passStatus(g) {
  if (["A", "A-", "B+", "B", "B-", "C+", "C", "S"].includes(g)) return "gecti";
  if (["C-", "D+", "D"].includes(g)) return "kosullu";
  if (["F", "NA", "U"].includes(g)) return "kaldi";
  return null;
}

/** İki hane, yarım yukarı. Kayan nokta hatasına karşı küçük tolerans. */
export const round2 = (x) => Math.round((x + 1e-9) * 100) / 100;
export const fmtGpa = (x) => (x === null || x === undefined ? "—" : x.toFixed(2));

const SEASON_ORDER = Object.keys(SEASONS);
export const termKey = (e) => e.year * 3 + SEASON_ORDER.indexOf(e.season);
export const termLabel = (e) => `${e.year}-${e.year + 1} / ${SEASONS[e.season]}`;

/** Bugünün dönemi, UMIS'teki gibi "2026-2027 / Güz". Eylül–Ocak Güz, Şubat–Haziran Bahar, Temmuz–Ağustos Yaz. */
export function currentTerm(d = new Date()) {
  const m = d.getMonth();
  const start = m >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  const season = m >= 8 || m === 0 ? "guz" : m <= 5 ? "bahar" : "yaz";
  return { year: start, season, label: termLabel({ year: start, season }) };
}

/** Aynı dersin tekrarlarını eşleştirmek için anahtar: kod, yoksa ad. */
export const courseKey = (e) => (e.code || e.name || "").toLocaleUpperCase("tr-TR").replace(/\s+/g, "");

export function sum(entries) {
  let points = 0;
  let credits = 0;
  for (const e of entries) {
    if (!counts(e.grade) || !(e.credit > 0)) continue;
    points += e.credit * COEF[e.grade];
    credits += e.credit;
  }
  return { points, credits };
}

export function average(entries) {
  const { points, credits } = sum(entries);
  return { points, credits, avg: credits ? round2(points / credits) : null };
}

/**
 * Tekrarlanan derslerde son alınan not geçerli (Md. 28/2).
 * Sonraki deneme W/I/PR gibi ortalamaya girmeyen bir notsa önceki not korunur.
 */
export function effective(entries) {
  const sorted = [...entries].sort((a, b) => termKey(a) - termKey(b));
  const last = new Map();
  const loose = [];
  for (const e of sorted) {
    if (!counts(e.grade)) continue;
    const k = courseKey(e);
    if (!k) loose.push(e);
    else last.set(k, e);
  }
  return [...last.values(), ...loose];
}

/** Geçmiş dönemler, dönem ortalamasıyla (YNO), yeniden eskiye. */
export function terms(transcript) {
  const groups = new Map();
  for (const e of transcript) {
    const k = termKey(e);
    if (!groups.has(k)) groups.set(k, { key: k, label: termLabel(e), year: e.year, season: e.season, entries: [] });
    groups.get(k).entries.push(e);
  }
  return [...groups.values()]
    .sort((a, b) => b.key - a.key)
    .map((g) => ({ ...g, yno: average(g.entries).avg }));
}

export function standing(gno) {
  if (gno === null) return null;
  if (gno >= 2) return { level: "ok", label: "Başarılı" };
  if (gno >= 1.8) return { level: "warn", label: "Koşullu başarılı" };
  return { level: "danger", label: "Sınamalı riski" };
}

/** Bir dönem ortalamasına en yakın harf (sadece yorum için). */
export function nearestLetter(avg) {
  if (avg === null) return "";
  let best = "F";
  for (const l of LETTERS.filter((x) => x !== "NA")) if (Math.abs(COEF[l] - avg) < Math.abs(COEF[best] - avg)) best = l;
  return best;
}

/**
 * Bu dönemin derslerini geçmişle birleştirir.
 * Geçmiş iki yoldan gelebilir: ders ders girilmiş transkript ya da
 * UMIS'teki "toplam kredi + GNO" özeti (gpaBase).
 */
export function projection({ transcript, courses, gpaBase }) {
  const current = courses.filter((c) => c.credit > 0);
  const graded = current.filter((c) => counts(c.letter));

  let prev = { avg: null, credits: 0 };
  let restP = 0;
  let restC = 0;
  let source = "none";

  if (transcript.length) {
    source = "transcript";
    const eff = effective(transcript);
    prev = average(eff);
    const curKeys = new Set(current.map(courseKey).filter(Boolean));
    ({ points: restP, credits: restC } = sum(eff.filter((e) => !curKeys.has(courseKey(e)))));
  } else if (gpaBase) {
    source = "base";
    prev = { avg: round2(gpaBase.gno), credits: gpaBase.credits };
    restP = gpaBase.gno * gpaBase.credits;
    restC = gpaBase.credits;
    for (const c of current) {
      if (!counts(c.prevGrade)) continue;
      restP -= c.credit * COEF[c.prevGrade];
      restC -= c.credit;
    }
    restP = Math.max(0, restP);
    restC = Math.max(0, restC);
  }

  const term = average(graded.map((c) => ({ credit: c.credit, grade: c.letter })));
  const totalC = restC + term.credits;
  const after = totalC ? round2((restP + term.points) / totalC) : null;
  const curCredits = current.reduce((s, c) => s + c.credit, 0);

  return {
    source,
    unverified: transcript.filter((e) => e.grade in UNVERIFIED).length,
    prev,
    term: { ...term, graded: graded.length, total: current.length },
    after,
    complete: graded.length === current.length && current.length > 0,
    missingCredit: courses.filter((c) => c.credit === null || c.credit === undefined).length,
    /** Hedef GNO için bu dönem gereken ortalama (4.00 üzerinden). */
    needed(target) {
      if (!curCredits) return null;
      return (target * (restC + curCredits) - restP) / curCredits;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ders puanı → harf                                                    */
/* BAU bağıl değerlendirme kullanır: eşikler hocadan hocaya değişir.   */
/* Bu yüzden tablo öğrencinin girdiği değerdir; örnek tablo sadece      */
/* başlangıç noktasıdır ve arayüzde "doğrula" diye işaretlenir.         */
/* ------------------------------------------------------------------ */

export const SAMPLE_SCALE = [
  { letter: "A", min: 90 }, { letter: "A-", min: 85 }, { letter: "B+", min: 80 }, { letter: "B", min: 75 },
  { letter: "B-", min: 70 }, { letter: "C+", min: 65 }, { letter: "C", min: 60 }, { letter: "C-", min: 55 },
  { letter: "D+", min: 50 }, { letter: "D", min: 45 },
];

/** Puanın tablodaki harfi; en alt eşiğin altı F. */
export function letterFor(score, scale) {
  if (score === null || !scale.length) return null;
  const hit = [...scale].sort((a, b) => b.min - a.min).find((r) => score + 1e-9 >= r.min);
  return hit ? hit.letter : "F";
}

/**
 * Her harf için kalan bileşenlerden gereken ortalama (0–100).
 * earned/remaining: forms.calcGrades çıktısı (ağırlık puanı cinsinden).
 * status: "ok" (şimdiden garanti), "need", "no" (100 alsan da olmuyor).
 */
export function neededByLetter(scale, earned, remaining) {
  return [...scale].sort((a, b) => b.min - a.min).map((r) => {
    if (earned + 1e-9 >= r.min) return { ...r, status: "ok", need: 0 };
    if (!(remaining > 0)) return { ...r, status: "no", need: null };
    const need = ((r.min - earned) / remaining) * 100;
    return { ...r, status: need > 100 ? "no" : "need", need };
  });
}
