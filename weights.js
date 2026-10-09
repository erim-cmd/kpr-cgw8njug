/**
 * KPR — Görev ↔ not bileşeni eşleştirme: bir teslimin dersin notundaki ağırlığı (%).
 *
 * Syllabus görevleri not bileşenine bağlı gelmez; ad ve türden eşleştirilir:
 *   "Midterm Exam" görevi ↔ "Midterm Exam %20" bileşeni, "Ödev 2" ↔ "Ödevler (4) %20" (4'e bölünür).
 * Eşleşmeyen görevin ağırlığı bilinmez (null): grafikte 0 sayılır, listede yine görünür.
 * Uydurma yok: emin olunamayan eşleşme null döner.
 */

import { fold } from "./syllabus-local.js";
import { localize } from "./i18n.js";

// Sıra önemli: "Final Project" bir projedir, final sınavı değil
const GROUPS = [
  ["proje", /\b(proje|project|sunum|presentation|poster)/],
  ["final", /\b(final|yariyil sonu|yil sonu|genel sinav|donem ?sonu|butunleme)\b/],
  ["vize", /\b(vize|ara ?sinav|midterm|mid-term|mid term)\b/],
  ["quiz", /\b(quiz|quizler|quizzes|kisa sinav)/],
  ["lab", /\b(lab|laboratuvar|deney)/],
  ["odev", /\b(odev|homework|assignment|hw|rapor|report|essay|paper|makale|problem set)/],
  ["katilim", /\b(katilim|participation|attendance|devam)/],
];
// Görev türünden grup (başlık bir şey söylemiyorsa)
const TYPE_GROUP = { quiz: "quiz", odev: "odev", proje: "proje", sunum: "proje", lab: "lab" };

export function groupOf(name) {
  const f = fold(name || "");
  return GROUPS.find(([, re]) => re.test(f))?.[0] ?? null;
}

const taskGroup = (t) => groupOf(t.title) ?? TYPE_GROUP[t.type] ?? (t.type === "sinav" ? "vize" : null);

/** "Homework (2)", "Quizzes (4)", "2 ödev" → 2; yoksa null. */
function countIn(name) {
  const m = /\((\d{1,2})\)|\b(\d{1,2})\s*(?:adet|tane|x\b)|^(\d{1,2})\s/.exec(name || "");
  const n = m ? +(m[1] || m[2] || m[3]) : null;
  return n && n > 1 && n <= 20 ? n : null;
}

/** Başlıktaki son küçük sayı ("Midterm Exam 2" → 2). */
const numIn = (s) => {
  const m = (s || "").match(/\b\d{1,2}\b/g);
  return m ? +m[m.length - 1] : null;
};

/**
 * Görevin ağırlığı (% olarak, dersin toplamı içinde) ya da null.
 * tasks: o dersin tüm görevleri (bitmiş olanlar dahil; paylaştırma için).
 */
export function taskWeight(task, course, tasks) {
  if (!course?.grading?.length) return null;
  const g = taskGroup(task);
  if (!g || g === "katilim") return null;
  const comps = course.grading.filter((c) => groupOf(c.name) === g && !c.bonus);
  if (!comps.length) return null;
  const same = tasks.filter((t) => t.courseId === course.id && taskGroup(t) === g).sort((a, b) => a.due.localeCompare(b.due));
  const idx = same.findIndex((t) => t.id === task.id);
  if (comps.length === 1) {
    const c = comps[0];
    // Tek görev → bileşenin tamamı; sayısı adında yazıyorsa ("Homework (2)") eşit paylaşım.
    // Sayı yazmıyorsa ve birden çok görev varsa paylaşım tahmin olur → bilinmiyor.
    const n = countIn(c.name);
    if (n) return c.weight / n;
    return same.length <= 1 ? c.weight : null;
  }
  // Birden çok bileşen ("Midterm 1", "Midterm 2"): önce başlıktaki numara, sonra tarih sırası
  const no = numIn(task.title);
  const byNo = no ? comps.find((c) => numIn(c.name) === no) : null;
  if (byNo) return byNo.weight;
  if (same.length === comps.length && idx >= 0) return comps[idx].weight;
  return null;
}

/** Bileşen grubunun Türkçe adı (sıradaki değerlendirme kartı için). */
export const GROUP_LABEL = localize(
  { final: "Final", vize: "Ara sınav", quiz: "Quiz", proje: "Proje", lab: "Lab", odev: "Ödev" },
  { final: "Final", vize: "Midterm", quiz: "Quiz", proje: "Project", lab: "Lab", odev: "Homework" },
);
export const labelOf = (t) => GROUP_LABEL[taskGroup(t)] ?? null;
