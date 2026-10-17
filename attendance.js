/**
 * KPR — Devamsızlık takibi
 *
 * BAU yönetmeliği (Md. 19) devam oranını derse bırakır; oran syllabus'ta yazar.
 * Devam şartını sağlamayan öğrenci NA alır: final ve bütünlemeye giremez,
 * NA ortalamaya 0.00 olarak girer. Sağlık raporu devamsızlığı silmez.
 *
 * Birim "ders oturumu"dur (programdaki bir satır). Hak iki yoldan gelir:
 *   - Elle girilen hak (absLimit): "en fazla 4 derse gelmeyebilirsin"
 *   - Devam zorunluluğu (attendPct): yoklama alınan oturum × (100 − %) ÷ 100, aşağı yuvarlanır
 * Sınav haftaları (haftalık planda konusu vize/final/sınav haftası olan haftalar) yoklama alınmadığı için
 * sayılmaz: 12 haftalık derste 6. hafta vize, 12. hafta final ise 10 ders haftası üzerinden hesaplanır.
 * Kayıt öğrencinin işaretlediği hafta ({ week, start }) ya da Bugün'deki "Gitmedim" ({ date, start }).
 */

import { t } from "./i18n.js";
import { parseISO } from "./dates.js";
import { mondayOf } from "./density.js";

// Yalnız sınavın kendisi: "Midterm review", "Final hazırlık", "Final project presentations" ve konu içinde geçen
// not dağılımı ("Introduction (midterm 30%, final 40%)") sınav haftası değildir. Tek başına "final/vize/midterm"
// konunun başındaysa sayılır; "ara sınav", "final exam" gibi açık sınav ifadeleri her yerde.
const EXAM_PHRASE = /(ara ?s[ıi]nav|mid-?term exam|final exam|final s[ıi]nav|s[ıi]nav haftas[ıi]|exam week|yar[ıi]y[ıi]l sonu s[ıi]nav)/i;
const EXAM_LEAD = /^[\s\d.:\-–—]*(final|vize|mid-?term|b[üu]t[üu]nleme|yar[ıi]y[ıi]l sonu)(?![a-zçğıöşü])/i;
const NOT_EXAM = /review|haz[ıi]rl[ıi]k|preparation|tekrar|revision|recap|project|proje|presentation|sunum|poster|report|rapor|paper/i;
const isExamTopic = (s) => (EXAM_PHRASE.test(s) || EXAM_LEAD.test(s)) && !NOT_EXAM.test(s);

/** Planda sınav haftası olan hafta numaraları (1…weeks). */
export function examWeeks(course, weeks) {
  return new Set((course.weeks || []).filter((w) => w.n >= 1 && w.n <= weeks && isExamTopic(w.topic || "")).map((w) => w.n));
}

/** Tarihli kayıt ("Gitmedim") dönemin kaçıncı haftası? Dönem başı bilinmiyorsa null. */
function weekOfDate(iso, termStart) {
  if (!termStart || !iso) return null;
  const n = Math.floor((parseISO(mondayOf(iso)) - parseISO(mondayOf(termStart))) / 86400000 / 7 + 0.5) + 1;
  return n >= 1 ? n : null;
}

/** termStart (settings.termStart): tarihli kayıtları haftaya çevirip ızgara işaretiyle tekilleştirmek için. */
export function attendance(course, weeks, termStart = "") {
  // Programı olmayan ders (çevrimiçi, saati yazmayan): haftada bir oturum say; yoksa devam oranı
  // girilmiş olsa bile hak hesaplanamaz ve kart yanlışlıkla "Devam şartı girilmedi" der.
  const perWeek = course.sessions.length || 1;
  const exams = examWeeks(course, weeks);
  const classWeeks = Math.max(0, weeks - exams.size);
  const total = perWeek * classWeeks;
  // Sınav haftasına düşen kayıt sayılmaz (o hafta yoklama yok). Aynı hafta + aynı oturum bir kez sayılır:
  // Bugün'deki "Gitmedim" (tarihli) ile Dönem'deki ızgara işareti aynı devamsızlıksa iki kez sayılmasın.
  const seen = new Set();
  let used = 0;
  for (const a of course.absences) {
    const wk = a.week || weekOfDate(a.date, termStart);
    if (wk && exams.has(wk)) continue;
    const key = wk ? `w${wk}|${a.start || ""}` : `d${a.date}|${a.start || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    used++;
  }
  let limit = null;
  let basis = null;
  if (course.absLimit !== null && course.absLimit !== undefined) {
    limit = course.absLimit;
    basis = "elle";
  } else if (course.attendPct !== null && course.attendPct !== undefined && total) {
    limit = Math.floor((total * (100 - course.attendPct)) / 100 + 1e-9);
    basis = "oran";
  }
  const left = limit === null ? null : limit - used;
  let level = "none";
  if (left !== null) level = left < 0 ? "over" : left === 0 ? "last" : left === 1 ? "warn" : "ok";
  return { used, limit, left, total, perWeek, basis, level, classWeeks, exams };
}

export function attendanceText(a) {
  if (a.limit === null) return a.used ? t("{n} devamsızlık", { n: a.used }) : t("Devam şartı girilmedi");
  if (a.level === "over") return t("Sınır aşıldı: {used}/{limit}. NA riski var, hocanla konuş.", { used: a.used, limit: a.limit });
  if (a.level === "last") return t("Hakkın bitti ({used}/{limit}). Bir devamsızlık daha NA demek.", { used: a.used, limit: a.limit });
  return t("{n} devamsızlık hakkın kaldı ({used}/{limit})", { n: a.left, used: a.used, limit: a.limit });
}
