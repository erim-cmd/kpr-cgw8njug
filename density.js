/**
 * KPR — Dönem yoğunluğu: görevleri dönem haftalarına dağıtır, yoğun ve sınav haftalarını işaretler.
 * Dönem başlangıcı ayarlardan (termStart) gelir; girilmediyse en erken görevin haftası tahmin edilir.
 */

import { parseISO, toISO, todayISO } from "./dates.js";

const DAY = 86400000;

/** Tarihin haftasının pazartesisi (ISO). */
export function mondayOf(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

const weekIndex = (startMon, iso) => Math.floor((parseISO(mondayOf(iso)) - parseISO(startMon)) / DAY / 7 + 0.5);

/** Vize/final ayrımı: başlıktan. */
function examKind(t) {
  if (t.type !== "sinav") return null;
  if (/final|yarıyıl sonu|bütünleme/i.test(t.title)) return "final";
  if (/vize|ara sınav|midterm|(^|\s)ara(\s|$)/i.test(t.title)) return "vize";
  return "sinav";
}

export function density(tasks, { termStart = "", termWeeks = 14 } = {}) {
  const dated = tasks.filter((t) => t.due);
  const guessed = !termStart;
  const start = termStart ? mondayOf(termStart) : dated.length ? mondayOf([...dated].sort((a, b) => a.due.localeCompare(b.due))[0].due) : mondayOf(todayISO());

  const lastIdx = dated.reduce((m, t) => Math.max(m, weekIndex(start, t.due)), 0);
  const count = Math.min(30, Math.max(termWeeks, lastIdx + 1));
  const weeks = Array.from({ length: count }, (_, i) => {
    const mon = parseISO(start);
    mon.setDate(mon.getDate() + i * 7);
    return { n: i + 1, start: toISO(mon), items: [], exams: 0, vize: false, final: false };
  });
  for (const t of dated) {
    const i = weekIndex(start, t.due);
    if (i < 0 || i >= count) continue;
    const w = weeks[i];
    w.items.push(t);
    const k = examKind(t);
    if (k) w.exams++;
    if (k === "vize") w.vize = true;
    if (k === "final") w.final = true;
  }
  // Yoğunluk puanı: sınav 2, proje 1.5, diğer 1
  const score = (w) => w.items.reduce((s, t) => s + (t.type === "sinav" ? 2 : t.type === "proje" ? 1.5 : 1), 0);
  const scores = weeks.map(score);
  const nonzero = scores.filter((x) => x > 0).sort((a, b) => a - b);
  const busyLine = nonzero.length ? Math.max(3, nonzero[Math.floor(nonzero.length * 0.75)]) : Infinity;
  const max = Math.max(1, ...scores);
  const cur = weekIndex(start, todayISO());
  weeks.forEach((w, i) => {
    w.score = scores[i];
    w.level = w.score === 0 ? 0 : Math.max(1, Math.ceil((w.score / max) * 4));
    w.busy = w.score >= busyLine;
    w.current = i === cur;
    w.past = i < cur;
    w.label = w.final ? "Final" : w.vize ? "Vize" : w.busy ? "Yoğun" : "";
  });
  const next = weeks.find((w, i) => i > cur && (w.busy || w.vize || w.final));
  return { start, guessed, weeks, current: cur >= 0 && cur < count ? cur : null, next, nextIn: next ? next.n - 1 - cur : null };
}
