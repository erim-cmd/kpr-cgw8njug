/**
 * KPR — Devamsızlık hesapları.
 *
 * Birim "ders saati": 50 dk ders + 10 dk ara = 1 saat. 09:00–10:50 → 2 saat.
 * Dönemin toplam saati = haftalık ders saati × dönem hafta sayısı (Ayarlar).
 * Sınır = toplamın %X'i (ders bazında değiştirilebilir, varsayılan Ayarlar'dan).
 *
 * Uyarı seviyeleri:
 *   "ok"       sorun yok
 *   "warn"     iki haftalık (ya da daha az) hak kaldı veya hakkın %80'i doldu
 *   "danger"   bir haftalık (ya da daha az) hak kaldı
 *   "over"     sınır aşıldı
 */

import { toMin } from "./dates.js";

export const sessionHours = (s) => Math.max(1, Math.round((toMin(s.end) - toMin(s.start) + 10) / 60));

export const weeklyHours = (course) => course.sessions.reduce((sum, s) => sum + sessionHours(s), 0);

export function attendanceOf(course, settings) {
  const weekly = weeklyHours(course);
  const limitPct = course.absenceLimit ?? settings.absenceLimit;
  const total = weekly * settings.termWeeks;
  const limit = Math.floor((total * limitPct) / 100);
  const used = course.absences.reduce((sum, a) => sum + a.hours, 0);
  const remaining = limit - used;

  let level = "ok";
  if (!weekly) level = "none";
  else if (remaining < 0) level = "over";
  else if (remaining <= weekly) level = "danger";
  // Sarı, kırmızıdan önce gelmeli: son iki haftalık hak ya da %80 (hangisi önce)
  else if (remaining <= 2 * weekly || (limit && used / limit >= 0.8)) level = "warn";

  return { weekly, total, limitPct, limit, used, remaining, level, ratio: limit ? Math.min(1, used / limit) : 0 };
}

const SEVERITY = { over: 3, danger: 2, warn: 1, ok: 0, none: -1 };

/** En riskli ders: önce seviye, sonra kalan hakkın haftalık saate oranı. */
export function riskiest(courses, settings) {
  return courses
    .map((c) => ({ course: c, a: attendanceOf(c, settings) }))
    .filter((x) => x.a.level !== "none")
    .sort((x, y) => SEVERITY[y.a.level] - SEVERITY[x.a.level] || x.a.remaining / x.a.weekly - y.a.remaining / y.a.weekly)[0] ?? null;
}

export function levelText(a) {
  switch (a.level) {
    case "over": return `Sınırı ${a.used - a.limit} saat aştın`;
    case "danger": return a.remaining === 0 ? "Hiç hakkın kalmadı" : `Son ${a.remaining} saat hakkın kaldı`;
    case "warn": return `${a.remaining} saat hakkın kaldı`;
    case "none": return "Ders saati eklenmemiş";
    default: return `${a.remaining} saat hakkın var`;
  }
}
