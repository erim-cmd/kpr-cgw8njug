/**
 * KPR — Tarih yardımcıları
 * Haftanın ilk günü Pazartesi (0) → Pazar (6).
 * Tarihler "YYYY-AA-GG" biçiminde ve YEREL saatle tutulur (UTC değil),
 * böylece gece yarısına yakın saatlerde gün kayması olmaz.
 */

export const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const pad = (n) => String(n).padStart(2, "0");

export const todayIdx = () => (new Date().getDay() + 6) % 7;
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysUntil(iso) {
  return Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
}

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function relLabel(n) {
  if (n < -1) return `${-n} gün gecikti`;
  if (n === -1) return "Dün";
  if (n === 0) return "Bugün";
  if (n === 1) return "Yarın";
  return `${n} gün kaldı`;
}

export const fmtLong = (d) => d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
export const fmtShort = (iso) => parseISO(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export const byDue = (a, b) => a.due.localeCompare(b.due) || (a.time || "99").localeCompare(b.time || "99");
