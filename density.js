/**
 * KPR — Dönem akışı: görevleri dönem haftalarına dağıtır; her haftada dönem notunun ne kadarının
 * belirlendiğini (not ağırlığı payı) hesaplar.
 *
 * Pay = o haftadaki değerlendirmelerin ağırlıkları (her dersin kendi %'si) ÷ tüm derslerin toplamı (ders başına 100).
 * Ağırlığı bilinmeyen teslim (weights.taskWeight → null) paya 0 katılır ama haftanın listesinde görünür.
 * Okuma ve kişisel işler paya ve "yoğun" sayımına katılmaz.
 * Dönem başlangıcı ayarlardan (termStart); girilmediyse en erken görevin haftası tahmin edilir.
 */

import { parseISO, toISO, todayISO } from "./dates.js";
import { isLight } from "./store.js";
import { taskWeight, groupOf } from "./weights.js";
import { t } from "./i18n.js";

const DAY = 86400000;

/** Tarihin haftasının pazartesisi (ISO). */
export function mondayOf(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

const weekIndex = (startMon, iso) => Math.floor((parseISO(mondayOf(iso)) - parseISO(startMon)) / DAY / 7 + 0.5);

/** Vize/final ayrımı: başlıktan (proje "Final Project" final sınavı değildir). */
function examKind(t) {
  if (t.type !== "sinav" && t.type !== "quiz") return null;
  const g = groupOf(t.title);
  if (g === "final") return "final";
  if (g === "vize") return "vize";
  return "sinav";
}

/**
 * tasks: haftalara dağıtılacak görevler. courses verilirse not ağırlığı payı hesaplanır.
 * Dönüş: { start, guessed, weeks[], current, next, nextIn, heaviest }
 */
export function density(tasks, { termStart = "", termWeeks = 14 } = {}, courses = null) {
  const dated = tasks.filter((t) => t.due);
  const guessed = !termStart;
  const start = termStart ? mondayOf(termStart) : dated.length ? mondayOf([...dated].sort((a, b) => a.due.localeCompare(b.due))[0].due) : mondayOf(todayISO());

  const lastIdx = dated.reduce((m, t) => Math.max(m, weekIndex(start, t.due)), 0);
  const count = Math.min(30, Math.max(termWeeks, lastIdx + 1));
  const weeks = Array.from({ length: count }, (_, i) => {
    const mon = parseISO(start);
    mon.setDate(mon.getDate() + i * 7);
    return { n: i + 1, start: toISO(mon), items: [], exams: 0, vize: false, final: false, weight: 0, share: 0, unknown: 0 };
  });

  // Ağırlık: her dersin notu 100 üzerinden; dönemin toplamı = notu tanımlı ders sayısı × 100
  const byId = new Map((courses || []).map((c) => [c.id, c]));
  const graded = (courses || []).filter((c) => c.grading.length).length;
  const termTotal = graded * 100;

  for (const t of dated) {
    const i = weekIndex(start, t.due);
    if (i < 0 || i >= count) continue;
    const w = weeks[i];
    const course = byId.get(t.courseId);
    const wt = course && !isLight(t) ? taskWeight(t, course, tasks) : null;
    w.items.push({ ...t, weight: wt });
    if (wt === null) {
      if (!isLight(t)) w.unknown++;
    } else w.weight += wt;
    const k = examKind(t);
    if (k) w.exams++;
    if (k === "vize") w.vize = true;
    if (k === "final") w.final = true;
  }

  const cur = weekIndex(start, todayISO());
  weeks.forEach((w, i) => {
    w.share = termTotal ? (w.weight / termTotal) * 100 : 0;
    const heavy = w.items.filter((t) => !isLight(t)).length;
    // "Yoğun": dönem notunun en az %10'u o hafta belirleniyor, iki sınav var ya da 3+ teslim
    w.busy = w.share >= 10 || w.exams >= 2 || heavy >= 3;
    w.current = i === cur;
    w.past = i < cur;
    w.label = w.final ? t("Final") : w.vize ? t("Vize") : w.busy ? t("Yoğun") : "";
  });
  const next = weeks.find((w, i) => i > cur && (w.busy || w.vize || w.final));
  // Bugünden itibaren en ağır hafta (özet cümlesi için)
  const ahead = weeks.filter((_, i) => i >= Math.max(0, cur));
  const heaviest = ahead.reduce((m, w) => (w.share > (m?.share ?? 0) ? w : m), null);
  return {
    start, guessed, weeks, termTotal,
    current: cur >= 0 && cur < count ? cur : null,
    next, nextIn: next ? next.n - 1 - cur : null,
    heaviest, heaviestIn: heaviest ? heaviest.n - 1 - cur : null,
  };
}
