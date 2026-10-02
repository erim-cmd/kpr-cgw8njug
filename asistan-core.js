/**
 * KPR — Asistan (internetsiz): öğrencinin sorusunu cihazdaki veriden cevaplar.
 * Yapay zekâ, ağ isteği, tahmin YOK: anahtar kelimeyle soru türü bulunur, cevap öğrencinin kendi
 * derslerinden (syllabus'tan okunan kurallar, görevler, not hesabı, bilgi kartı) kurulur.
 * Bulamazsa "Bunu derslerinin bilgilerinde bulamadım." der. Okul işlemleri/birimleri kapsam dışı.
 *
 * answer(soru, state, { courseId }) → { text, source, chips? }
 *   text   : düz metin (HTML/markdown işlenmez; arayüz esc() ile basar)
 *   source : "MCH 2016 · syllabus" / "görevlerin" / "hesaplama"
 *   chips  : [{ id, label }] — soru birden çok derse uyuyorsa "Hangi ders?" seçenekleri
 * DOM'a dokunmaz; test/asistan.mjs Node'da çalıştırır.
 */

import { fold } from "./syllabus-local.js";
import { TASK_TYPES } from "./store.js";
import { attendance, attendanceText } from "./attendance.js";
import { targetResult, currentWeekOf } from "./ders-calc.js";
import { groupOf } from "./weights.js";
import { daysUntil, fmtShort, byDue, relLabel } from "./dates.js";

export const NOT_FOUND = "Bunu derslerinin bilgilerinde bulamadım.";

// Kural türleri (syllabus-local.js parsePolicies ile aynı adlar)
const KIND_RE = {
  devam: /yoklama|devam|devamsiz|attendance|\bna\b|kac (derse|ders|kez)|hakkim/,
  gec_teslim: /gec teslim|gec (kabul|gonder|yukle)|\blate\b|teslim(den)? sonra|gecikme|gec kalirsa|gec kalirsam teslim/,
  telafi: /telafi|mazeret|make-?up|kacirirsam|kacirdim|kacirirsan|giremezsem|girmezsem|giremedim|saglik raporu/,
  butunleme: /butunleme|\bresit\b|\bbut\b/,
  baraj: /baraj|final(den|de)? (en az|siniri|alt sinir|minimum)|minimum final|final sarti/,
  not_kurali: /not kural|bagil|curve|en dusuk|bonus|ek puan|harf (nasil|tablosu)|degerlendirme kural|mutlak/,
  durustluk: /kopya|intihal|yapay zeka|chatgpt|\bai\b|\byz\b|durustluk|plagiar|cheat|copilot/,
  diger: /kimlik|sinava gec|derse gec|gec kalirsam/,
};
const KIND_LABEL = { devam: "devam", gec_teslim: "geç teslim", telafi: "mazeret/telafi", butunleme: "bütünleme", baraj: "final barajı", not_kurali: "notlandırma", durustluk: "akademik dürüstlük", diger: "kural" };

const NEED_RE = /(finalden|finalde|kalan(lardan)?|vizeden|sinavdan).{0,25}(kac|ne kadar)|kac (almam|almaliyim|almam lazim|almam gerek|almam gerekiyor|alirsam)|gecmek icin|hedef harf|harf (icin|almak)/;
const DATE_RE = /ne zaman|kac gun|hangi gun|tarih(i|i ne)|kalan gun|gun kaldi|when/;
const WEEK_RE = /bu hafta|neye calis|ne calis|haftaya ne|bu haftaki|ne var/;
const CONTACT_RE = /mail|e-?posta|eposta|ofis|hoca(nin|ya|m)?\b|iletisim|office/;
// "sınav", "vize", "ödev"… → görev grubu
const TASK_WORDS = [
  ["final", /\bfinal/],
  ["vize", /vize|ara ?sinav|midterm/],
  ["quiz", /quiz|kisa sinav/],
  ["proje", /proje|project|sunum/],
  ["odev", /odev|homework|assignment/],
  ["lab", /\blab/],
];

const name = (c) => c.code || c.name;
const src = (c, what) => `${name(c)} · ${what}`;

/** Soruda geçen ders: kod ("MCH 2016", "mch2016", "2016") ya da adın belirgin kelimeleri. */
export function findCourse(q, courses) {
  const f = fold(q);
  const flat = f.replace(/\s+/g, "");
  // Önce kod ("MCH 2016", "mch2016", "2016"); kod geçiyorsa ad kelimelerine bakılmaz
  // ("GEP 1020'de yapay zeka…" sorusu "Yapay Zeka" adlı başka derse de uymasın)
  const byCode = courses.filter((c) => {
    const code = fold(c.code || "").replace(/\s+/g, "");
    if (code && flat.includes(code)) return true;
    const num = (c.code || "").match(/\d{3,4}/)?.[0];
    return !!num && new RegExp(`\\b${num}\\b`).test(f);
  });
  const hits = byCode.length
    ? byCode
    : courses.filter((c) => {
        const words = fold(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
        return words.length && words.some((w) => f.includes(w));
      });
  return hits.length === 1 ? hits[0] : hits.length > 1 ? hits : null;
}

const chipsFor = (list) => ({
  text: "Hangi ders?",
  source: "",
  chips: list.map((c) => ({ id: c.id, label: name(c) })),
});

/** Birden çok aday ders → "Hangi ders?"; tek aday → o ders; hiç yok → null. */
function pick(candidates, chosen) {
  if (chosen) return { course: chosen };
  if (candidates.length === 1) return { course: candidates[0] };
  if (candidates.length > 1) return { ask: chipsFor(candidates) };
  return {};
}

/* ------------------------------------------------------------------ */

function ruleAnswer(kind, c, state) {
  const list = c.policies.filter((p) => p.kind === kind);
  const parts = [];
  if (kind === "devam") {
    const a = attendance(c, state.settings.termWeeks);
    if (c.attendPct !== null || c.absLimit !== null) parts.push(`${name(c)}: ${c.attendPct !== null ? `devam şartı %${c.attendPct}` : `en fazla ${c.absLimit} devamsızlık`}. ${attendanceText(a)}.`);
  }
  for (const p of list) {
    parts.push(`${p.rule}${p.consequence ? ` ${p.consequence}` : ""}${p.source ? `\nSyllabus: “${p.source}”` : ""}`);
  }
  if (!parts.length) return null;
  return { text: parts.join("\n\n"), source: src(c, list.length ? "syllabus" : "hesaplama") };
}

function needAnswer(c) {
  if (!c.grading.length) return { text: `${name(c)} için not dağılımı girilmemiş; hesaplayamıyorum.`, source: src(c, "hesaplama") };
  const r = targetResult(c);
  if (!r) return { text: `${name(c)} için hocanın harf tablosu girilmemiş. Ders ekranında "Hedef harf" bölümünden tabloyu gir; sonra hesaplarım.`, source: src(c, "hesaplama") };
  const head = r.done ? "" : `Hedef harfin ${r.letter}. `;
  return { text: head + r.lines.join(" "), source: src(c, "hesaplama") };
}

function taskGroupOf(t) {
  return groupOf(t.title) || (t.type === "quiz" ? "quiz" : t.type === "odev" ? "odev" : t.type === "proje" ? "proje" : t.type === "lab" ? "lab" : t.type === "sinav" ? "sinav" : null);
}

function dateAnswer(q, state, chosen) {
  const f = fold(q);
  const want = TASK_WORDS.find(([, re]) => re.test(f))?.[0] || (/sinav|exam/.test(f) ? "sinav" : null);
  const fits = (t) => {
    if (t.done || daysUntil(t.due) < 0) return false;
    if (!want) return true;
    const g = taskGroupOf(t);
    return want === "sinav" ? t.type === "sinav" || t.type === "quiz" || g === "vize" || g === "final" : g === want;
  };
  let tasks = state.tasks.filter(fits);
  if (chosen) tasks = tasks.filter((t) => t.courseId === chosen.id);
  else {
    const ids = [...new Set(tasks.map((t) => t.courseId).filter(Boolean))];
    if (ids.length > 1) return chipsFor(state.courses.filter((c) => ids.includes(c.id)));
  }
  const t = tasks.sort(byDue)[0];
  if (!t) return null;
  const c = state.courses.find((x) => x.id === t.courseId);
  const n = daysUntil(t.due);
  const when = n === 0 ? "bugün" : n === 1 ? "yarın" : `${n} gün sonra`;
  const more = tasks.length > 1 ? ` Sonraki: ${tasks.slice(1, 3).map((x) => `${x.title} (${fmtShort(x.due)})`).join(", ")}.` : "";
  return { text: `${c ? `${name(c)} · ` : ""}${t.title}: ${fmtShort(t.due)}${t.time ? ` ${t.time}` : ""}, ${when}.${more}`, source: c ? src(c, "görevlerin") : "görevlerin" };
}

function weekAnswer(state, chosen) {
  const courses = chosen ? [chosen] : state.courses;
  const ids = new Set(courses.map((c) => c.id));
  const due = state.tasks.filter((t) => !t.done && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6 && (!chosen || ids.has(t.courseId))).sort(byDue);
  const lines = due.map((t) => {
    const c = state.courses.find((x) => x.id === t.courseId);
    return `• ${t.title}${c ? ` (${name(c)})` : ""} · ${TASK_TYPES[t.type]} · ${relLabel(daysUntil(t.due)).toLocaleLowerCase("tr-TR")}`;
  });
  const topics = courses
    .map((c) => {
      const n = currentWeekOf(c, state);
      const w = n ? c.weeks.find((x) => x.n === n) : null;
      return w ? `• ${name(c)} H${w.n}: ${w.topic}` : null;
    })
    .filter(Boolean);
  if (!lines.length && !topics.length) return null;
  const parts = [];
  if (lines.length) parts.push(`Önümüzdeki 7 gün:\n${lines.join("\n")}`);
  else parts.push("Önümüzdeki 7 günde teslim yok.");
  if (topics.length) parts.push(`Bu haftanın konuları:\n${topics.join("\n")}`);
  return { text: parts.join("\n\n"), source: topics.length ? "görevlerin + syllabus" : "görevlerin" };
}

function contactAnswer(q, c) {
  const f = fold(q);
  const parts = [];
  const wantMail = /mail|posta|iletisim/.test(f);
  const wantOffice = /ofis|office/.test(f);
  const all = !wantMail && !wantOffice;
  if (c.instructor && all) parts.push(`Hoca: ${c.instructor}`);
  if (c.email && (wantMail || all)) parts.push(`E-posta: ${c.email}`);
  if (c.office && (wantOffice || all)) parts.push(`Ofis: ${c.office}`);
  if (c.officeHours && (wantOffice || all)) parts.push(`Ofis saati: ${c.officeHours}`);
  if (!parts.length) return null;
  return { text: `${name(c)}\n${parts.join("\n")}`, source: src(c, "syllabus") };
}

/* ------------------------------------------------------------------ */

export function answer(question, state, { courseId = null } = {}) {
  const q = String(question || "").trim();
  if (!q) return { text: "Bir soru yaz; derslerinin tarihlerine, kurallarına ve notlarına bakarım.", source: "" };
  if (!state.courses.length) return { text: "Henüz dersin yok. Önce Dersler'den syllabus yükle; sonra sorularını cevaplarım.", source: "" };
  const f = fold(q);
  const found = findCourse(q, state.courses);
  const chosen = state.courses.find((c) => c.id === courseId) || (found && !Array.isArray(found) ? found : null);
  const multi = Array.isArray(found) ? found : null;

  // 1) "Finalden kaç almalıyım" → hedef harf hesabı
  if (NEED_RE.test(f)) {
    const cands = multi || state.courses.filter((c) => c.grading.length);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    return p.course ? needAnswer(p.course) : { text: NOT_FOUND, source: "" };
  }
  // 2) Kural soruları → kırmızı bayrak + syllabus'taki kaynak cümle
  const kind = Object.keys(KIND_RE).find((k) => KIND_RE[k].test(f));
  if (kind && !DATE_RE.test(f)) {
    const has = (c) => c.policies.some((p) => p.kind === kind) || (kind === "devam" && (c.attendPct !== null || c.absLimit !== null));
    const cands = (multi || state.courses).filter(has);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    const res = p.course && ruleAnswer(kind, p.course, state);
    return res || { text: chosen ? `${name(chosen)} syllabus'unda ${KIND_LABEL[kind]} ile ilgili bir kural bulamadım.` : NOT_FOUND, source: "" };
  }
  // 3) "Sınavım ne zaman / kaç gün kaldı" → görevler
  if (DATE_RE.test(f)) {
    if (multi && !chosen) return chipsFor(multi);
    return dateAnswer(q, state, chosen) || { text: NOT_FOUND, source: "" };
  }
  // 4) "Bu hafta ne var / neye çalışmalıyım" → bu haftanın teslimleri + haftalık konular
  if (WEEK_RE.test(f)) return weekAnswer(state, chosen) || { text: "Önümüzdeki 7 günde teslim yok ve bu haftanın konusu syllabus'ta yazmıyor.", source: "görevlerin" };
  // 5) "Hocanın maili / ofis saati" → bilgi kartı
  if (CONTACT_RE.test(f)) {
    const cands = (multi || state.courses).filter((c) => c.email || c.office || c.officeHours || c.instructor);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    return (p.course && contactAnswer(q, p.course)) || { text: NOT_FOUND, source: "" };
  }
  return { text: NOT_FOUND, source: "" };
}

export const EXAMPLES = ["Bu hafta neye çalışmalıyım?", "Finalden kaç almam lazım?", "Yoklama var mı?", "Geç teslim kabul mü?"];
