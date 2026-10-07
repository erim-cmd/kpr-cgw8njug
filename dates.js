/**
 * KPR — Tarih yardımcıları
 * Haftanın ilk günü Pazartesi (0) → Pazar (6).
 * Tarihler "YYYY-AA-GG" biçiminde ve YEREL saatle tutulur (UTC değil),
 * böylece gece yarısına yakın saatlerde gün kayması olmaz.
 */

import { t, locale, localize } from "./i18n.js";

export const DAYS = localize(["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
export const DAYS_SHORT = localize(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

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
  if (n < -1) return t("{n} gün gecikti", { n: -n });
  if (n === -1) return t("Dün");
  if (n === 0) return t("Bugün");
  if (n === 1) return t("Yarın");
  return t("{n} gün kaldı", { n });
}

export const fmtLong = (d) => d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
// "3 Ekim": Türkçede "3 Eki" kısaltması ek gibi okunuyor, ay adı tam yazılır
export const fmtShort = (iso) => parseISO(iso).toLocaleDateString(locale(), { day: "numeric", month: "long" });

/**
 * Göreli gün adı: "Bugün", "Yarın", bu hafta içindeyse gün adı ("Cuma"), daha ileriyse "12 Kasım".
 * Geçmişte kalmışsa relLabel ("Dün", "3 gün gecikti").
 */
export function dayLabel(iso) {
  const n = daysUntil(iso);
  if (n <= 1) return relLabel(n);
  if (n <= 6) return DAYS[(parseISO(iso).getDay() + 6) % 7];
  return fmtShort(iso);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return t("İyi geceler");
  if (h < 12) return t("Günaydın");
  if (h < 18) return t("İyi günler");
  return t("İyi akşamlar");
}

export const byDue = (a, b) => a.due.localeCompare(b.due) || (a.time || "99").localeCompare(b.time || "99");
