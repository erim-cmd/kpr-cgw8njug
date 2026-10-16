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
import { t, pct, locale, localize, readerText } from "./i18n.js";

// Türkçe sabit (testler karşılaştırır); cevapta notFound() kullanılır, o dile göre çevrilir
export const NOT_FOUND = "Bunu derslerinin bilgilerinde bulamadım."; // i18n-ok
// missing: cihazda cevap yok → arayüz (rızayla) yapay zekâya sormayı önerebilir
const notFound = () => ({ text: t("Bunu derslerinin bilgilerinde bulamadım."), source: "", missing: true });

// Kural türleri (syllabus-local.js parsePolicies ile aynı adlar)
const KIND_RE = {
  devam: /yoklama|devam|devamsiz|attendance|\bna\b|kac (derse|ders|kez)|hakkim|absen|attend|roll call|skip (a |the )?class|miss (a |any )?class|how many (classes|lectures)/, // i18n-ok
  gec_teslim: /gec teslim|gec (kabul|gonder|yukle)|\blate\b(?! (to|for) (the |my |an? )?(exam|class|lecture|midterm|final|quiz))|teslim(den)? sonra|gecikme|gec kalirsa|gec kalirsam teslim|(after|past|miss(ed)?) the deadline|extension/, // i18n-ok
  telafi: /telafi|mazeret|make-?up|kacirirsam|kacirdim|kacirirsan|giremezsem|girmezsem|giremedim|saglik raporu|miss(ed|ing)? (the |an |my )?(exam|midterm|final|quiz)|excuse|medical report|doctor'?s note|\bsick\b/, // i18n-ok
  butunleme: /butunleme|\bresit\b|\bbut\b|re-sit|retake/, // i18n-ok
  baraj: /baraj|final(den|de)? (en az|siniri|alt sinir|minimum)|minimum final|final sarti|final (exam )?(threshold|cutoff)|minimum (score |grade )?(on|for|in) the final/, // i18n-ok
  not_kurali: /not kural|bagil|curve|en dusuk|bonus|ek puan|harf (nasil|tablosu)|degerlendirme kural|mutlak|grading|extra credit|grade cutoffs|graded/, // i18n-ok
  durustluk: /kopya|intihal|yapay zeka|chatgpt|\bai\b|\byz\b|durustluk|plagiar|cheat|copilot|academic (integrity|honesty)|\bgpt\b/, // i18n-ok
  diger: /kimlik|sinava gec|derse gec|gec kalirsam|student id|id card|late (to|for) (the |my |an? )?(exam|class|lecture|midterm|final|quiz)/, // i18n-ok
};
const KIND_LABEL = localize(
  { devam: "devam", gec_teslim: "geç teslim", telafi: "mazeret/telafi", butunleme: "bütünleme", baraj: "final barajı", not_kurali: "notlandırma", durustluk: "akademik dürüstlük", diger: "kural" },
  { devam: "attendance", gec_teslim: "late submission", telafi: "excuses/make-ups", butunleme: "resits", baraj: "the final exam minimum", not_kurali: "grading", durustluk: "academic integrity", diger: "this" }
);

const OUTCOME_RE = /kazan|ogrenme cikti|cikti|ne ogren|neler ogren|bitince|hedefi ne|amaci ne|outcome|objective|what will i learn|learn in this|skills? (will|do) i/; // i18n-ok
const NEED_RE = /(finalden|finalde|kalan(lardan)?|vizeden|sinavdan).{0,25}(kac|ne kadar)|kac (almam|almaliyim|almam lazim|almam gerek|almam gerekiyor|alirsam)|gecmek icin|hedef harf|harf (icin|almak)|(what|how much) (do|should|must) i (need|get|score)|what (score|grade) do i need|need (to get |to score )?on the (final|midterm|rest)|to pass\b|target grade/; // i18n-ok
const DATE_RE = /ne zaman|kac gun|hangi gun|tarih(i|i ne)|kalan gun|gun kaldi|when|how many days|what day|which day|what date|days (left|until)|how long until/; // i18n-ok
const WEEK_RE = /bu hafta|neye calis|ne calis|haftaya ne|bu haftaki|ne var|this week|next week|what should i study|coming up|upcoming|next 7 days/; // i18n-ok
const CONTACT_RE = /mail|e-?posta|eposta|ofis|hoca(nin|ya|m)?\b|iletisim|office|instructor|professor|\bprof\b|teacher|lecturer|contact/; // i18n-ok
// "sınav", "vize", "ödev"… → görev grubu
const TASK_WORDS = [
  ["final", /\bfinal/],
  ["vize", /vize|ara ?sinav|midterm/], // i18n-ok
  ["quiz", /quiz|kisa sinav/], // i18n-ok
  ["proje", /proje|project|sunum|presentation/], // i18n-ok
  ["odev", /odev|homework|assignment/], // i18n-ok
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
  // Tam kod ("BIL 101") geçiyorsa yalnız numarası tutan diğer ders ("ENG 101") aday olmaz
  const exact = courses.filter((c) => {
    const code = fold(c.code || "").replace(/\s+/g, "");
    return code && flat.includes(code);
  });
  const byCode = exact.length
    ? exact
    : courses.filter((c) => {
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
  text: t("Hangi ders?"),
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
    if (c.attendPct !== null || c.absLimit !== null) parts.push(`${name(c)}: ${c.attendPct !== null ? t("devam şartı {p}", { p: pct(c.attendPct) }) : t("en fazla {n} devamsızlık", { n: c.absLimit })}. ${attendanceText(a)}.`);
  }
  for (const p of list) {
    parts.push(`${readerText(p.rule)}${p.consequence ? ` ${readerText(p.consequence)}` : ""}${p.source ? `\nSyllabus: “${p.source}”` : ""}`);
  }
  if (!parts.length) return null;
  return { text: parts.join("\n\n"), source: src(c, list.length ? "syllabus" : t("hesaplama")) };
}

function needAnswer(c) {
  if (!c.grading.length) return { text: t("{ders} için not dağılımı girilmemiş; hesaplayamıyorum.", { ders: name(c) }), source: src(c, t("hesaplama")) };
  const r = targetResult(c);
  if (!r) return { text: t('{ders} için hocanın harf tablosu girilmemiş. Ders ekranında "Hedef harf" bölümünden tabloyu gir; sonra hesaplarım.', { ders: name(c) }), source: src(c, t("hesaplama")) };
  const head = r.done ? "" : t("Hedef harfin {harf}.", { harf: r.letter }) + " ";
  return { text: head + r.lines.join(" "), source: src(c, t("hesaplama")) };
}

function taskGroupOf(t) {
  return groupOf(t.title) || (t.type === "quiz" ? "quiz" : t.type === "odev" ? "odev" : t.type === "proje" ? "proje" : t.type === "lab" ? "lab" : t.type === "sinav" ? "sinav" : null);
}

function dateAnswer(q, state, chosen) {
  const f = fold(q);
  const want = TASK_WORDS.find(([, re]) => re.test(f))?.[0] || (/sinav|exam/.test(f) ? "sinav" : null); // i18n-ok
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
  const next = tasks.sort(byDue)[0];
  if (!next) return null;
  const c = state.courses.find((x) => x.id === next.courseId);
  const n = daysUntil(next.due);
  const when = n === 0 ? t("bugün") : n === 1 ? t("yarın") : t("{n} gün sonra", { n });
  const more = tasks.length > 1 ? " " + t("Sonraki: {liste}.", { liste: tasks.slice(1, 3).map((x) => `${x.title} (${fmtShort(x.due)})`).join(", ") }) : "";
  return { text: `${c ? `${name(c)} · ` : ""}${next.title}: ${fmtShort(next.due)}${next.time ? ` ${next.time}` : ""}, ${when}.${more}`, source: c ? src(c, t("görevlerin")) : t("görevlerin") };
}

function weekAnswer(state, chosen) {
  const courses = chosen ? [chosen] : state.courses;
  const ids = new Set(courses.map((c) => c.id));
  const due = state.tasks.filter((x) => !x.done && daysUntil(x.due) >= 0 && daysUntil(x.due) <= 6 && (!chosen || ids.has(x.courseId))).sort(byDue);
  const lines = due.map((x) => {
    const c = state.courses.find((y) => y.id === x.courseId);
    return `• ${x.title}${c ? ` (${name(c)})` : ""} · ${TASK_TYPES[x.type]} · ${relLabel(daysUntil(x.due)).toLocaleLowerCase(locale())}`;
  });
  const topics = courses
    .map((c) => {
      const n = currentWeekOf(c, state);
      const w = n ? c.weeks.find((x) => x.n === n) : null;
      return w ? `• ${name(c)} ${t("H{n}", { n: w.n })}: ${w.topic}` : null;
    })
    .filter(Boolean);
  if (!lines.length && !topics.length) return null;
  const parts = [];
  if (lines.length) parts.push(`${t("Önümüzdeki 7 gün:")}\n${lines.join("\n")}`);
  else parts.push(t("Önümüzdeki 7 günde teslim yok."));
  if (topics.length) parts.push(`${t("Bu haftanın konuları:")}\n${topics.join("\n")}`);
  return { text: parts.join("\n\n"), source: topics.length ? t("görevlerin + syllabus") : t("görevlerin") };
}

function outcomesAnswer(c) {
  return {
    text: `${t("{ders} dersini bitirince:", { ders: name(c) })}\n${c.outcomes.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
    source: src(c, t("syllabus · öğrenme çıktıları")),
  };
}

/** findCourse + 4 harfli ad kelimeleri ("Algı Yönetimi" → "algı"); tek eşleşme yoksa null. */
export function courseByName(q, courses) {
  const f = findCourse(q, courses);
  if (f && !Array.isArray(f)) return f;
  const qw = fold(q).split(/[^a-z0-9]+/);
  const hits = courses.filter((c) => fold(c.name).split(/[^a-z0-9]+/).some((w) => w.length >= 4 && !STOP.has(w) && qw.some((x) => x.startsWith(w))));
  return hits.length === 1 ? hits[0] : null;
}

function contactAnswer(q, c) {
  const f = fold(q);
  const parts = [];
  const wantMail = /mail|posta|iletisim|contact/.test(f); // i18n-ok
  const wantOffice = /ofis|office/.test(f);
  const all = !wantMail && !wantOffice;
  if (c.instructor && all) parts.push(t("Hoca: {ad}", { ad: c.instructor }));
  if (c.email && (wantMail || all)) parts.push(t("E-posta: {ad}", { ad: c.email }));
  if (c.office && (wantOffice || all)) parts.push(t("Ofis: {ad}", { ad: c.office }));
  if (c.officeHours && (wantOffice || all)) parts.push(t("Ofis saati: {ad}", { ad: c.officeHours }));
  if (!parts.length) return null;
  return { text: `${name(c)}\n${parts.join("\n")}`, source: src(c, "syllabus") };
}

/* ------------------------------------------------------------------ */

export function answer(question, state, { courseId = null } = {}) {
  const q = String(question || "").trim();
  if (!q) return { text: t("Bir soru yaz; derslerinin tarihlerine, kurallarına ve notlarına bakarım."), source: "" };
  if (!state.courses.length) return { text: t("Henüz dersin yok. Önce Dersler'den syllabus yükle; sonra sorularını cevaplarım."), source: "" };
  const f = fold(q);
  const found = findCourse(q, state.courses);
  const chosen = state.courses.find((c) => c.id === courseId) || (found && !Array.isArray(found) ? found : null);
  const multi = Array.isArray(found) ? found : null;

  // 0) "Bu derste ne kazanırım" → syllabus'taki öğrenme çıktıları (0 token)
  if (OUTCOME_RE.test(f) && !NEED_RE.test(f)) {
    const course = chosen || (multi ? null : courseByName(q, state.courses)) || (state.courses.length === 1 ? state.courses[0] : null);
    if (!course && multi) return chipsFor(multi);
    if (!course) {
      const withOut = state.courses.filter((c) => c.outcomes?.length);
      const p = pick(withOut, null);
      if (p.ask) return p.ask;
      if (p.course) return outcomesAnswer(p.course);
      return notFound();
    }
    return course.outcomes?.length ? outcomesAnswer(course) : { ...notFound(), text: t("{ders} syllabus'unda kazanımlar bulunamadı.", { ders: name(course) }) };
  }
  // 1) "Finalden kaç almalıyım" → hedef harf hesabı
  if (NEED_RE.test(f)) {
    const cands = multi || state.courses.filter((c) => c.grading.length);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    return p.course ? needAnswer(p.course) : notFound();
  }
  // 2) Kural soruları → kırmızı bayrak + syllabus'taki kaynak cümle
  const kind = Object.keys(KIND_RE).find((k) => KIND_RE[k].test(f));
  if (kind && !DATE_RE.test(f)) {
    const has = (c) => c.policies.some((p) => p.kind === kind) || (kind === "devam" && (c.attendPct !== null || c.absLimit !== null));
    const cands = (multi || state.courses).filter(has);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    const res = p.course && ruleAnswer(kind, p.course, state);
    return res || (chosen ? { text: t("{ders} syllabus'unda {kural} ile ilgili bir kural bulamadım.", { ders: name(chosen), kural: KIND_LABEL[kind] }), source: "", missing: true } : notFound());
  }
  // 3) "Sınavım ne zaman / kaç gün kaldı" → görevler
  if (DATE_RE.test(f)) {
    if (multi && !chosen) return chipsFor(multi);
    return dateAnswer(q, state, chosen) || notFound();
  }
  // 4) "Bu hafta ne var / neye çalışmalıyım" → bu haftanın teslimleri + haftalık konular
  if (WEEK_RE.test(f)) return weekAnswer(state, chosen) || { text: t("Önümüzdeki 7 günde teslim yok ve bu haftanın konusu syllabus'ta yazmıyor."), source: t("görevlerin") };
  // 5) "Hocanın maili / ofis saati" → bilgi kartı
  if (CONTACT_RE.test(f)) {
    const cands = (multi || state.courses).filter((c) => c.email || c.office || c.officeHours || c.instructor);
    const p = pick(cands, chosen);
    if (p.ask) return p.ask;
    return (p.course && contactAnswer(q, p.course)) || notFound();
  }
  return notFound();
}

/* ------------------------------------------------------------------ */
/* Yapay zekâ bağlamı (functions/api/ask.js)                            */
/* ------------------------------------------------------------------ */

export const CONTEXT_MAX = 8000; // karakter (~2.000 token; docs/asistan-yapay-zeka.md)
const EXCERPT_BUDGET = 4200; // bağlamın syllabus metninden seçilen paragraflara ayrılan kısmı

// Soru kelimelerinden atılanlar (her soruda geçer, paragraf seçmeye yardım etmez)
const STOP = new Set("bir bu su ve ile icin mi mu mi mı ne nasil kac hangi var yok olmali olur olarak gibi daha cok en de da ki ben benim bana dersin dersi ders syllabus the a an of to in on for is are be do does what how many which when can should course class".split(" ")); // i18n-ok

// Türkçe soru, İngilizce syllabus (ve tersi): sık kavramların karşılıkları (ilk 5 harf, katlanmış)
const SYN = [
  ["kazan", "cikti", "outco", "objec", "learn", "goal", "yeter", "compe", "hedef", "ozell", "skill", "becer"], // i18n-ok
  ["rapor", "repor"], ["sayfa", "page", "kelim", "word", "uzunl", "lengt"], // i18n-ok
  ["odev", "assig", "homew"], ["sinav", "exam", "vize", "midte", "final", "quiz"], // i18n-ok
  ["devam", "atten", "yokla", "absen"], ["kitap", "kayna", "textb", "readi", "refer", "okuma"], // i18n-ok
  ["proje", "proje", "proj"], ["sunum", "prese"], ["gec", "late", "gecik"], ["not", "grade", "puan", "score", "degerl", "asses"], // i18n-ok
  ["teslim", "submi", "deadl", "due"], ["konu", "topic", "icer", "conte", "hafta", "week", "sched"], // i18n-ok
  ["lab", "labor", "deney", "exper"], ["kopya", "intih", "plagi", "cheat", "yapay", "ai"], // i18n-ok
]; // i18n-ok
const synOf = (w) => SYN.find((g) => g.some((x) => w.startsWith(x) || x.startsWith(w))) || [w];

/** Metni ~500 karakterlik paragraflara böler (satır sınırında). */
function chunks(text) {
  const out = [];
  let buf = "";
  for (const line of String(text || "").split(/\n+/)) {
    const l = line.replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (buf && buf.length + l.length > 500) { out.push(buf); buf = ""; }
    buf += (buf ? " " : "") + l;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Sorunun kelimelerine en çok uyan syllabus paragrafları (cihazda; ağ yok). Türkçe ekleri tolere etmek için
 * kelimelerin ilk 5 harfi aranır ("raporu" → "rapor"). Dönüş: [{ course, text, score }] metindeki sırasıyla.
 */
export function excerpts(question, courses, budget = EXCERPT_BUDGET) {
  const base = [...new Set(fold(question).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))].map((w) => (w.length > 5 ? w.slice(0, 5) : w));
  // Her soru kelimesi bir kavram grubudur: grubun herhangi bir karşılığı geçen paragraf puan alır
  const groups = base.map((w) => [...new Set([w, ...synOf(w)])]);
  if (!groups.length) return [];
  const scored = [];
  for (const c of courses) {
    chunks(c.text).forEach((txt, i) => {
      const f = fold(txt);
      const score = groups.reduce((n, g) => n + (g.some((w) => f.includes(w)) ? (g.some((w) => /\d/.test(w)) ? 2 : 1) : 0), 0);
      if (score) scored.push({ course: c, text: txt, score, i });
    });
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const picked = [];
  let used = 0;
  for (const x of scored) {
    if (used + x.text.length > budget) continue;
    picked.push(x);
    used += x.text.length;
    if (picked.length >= 8) break;
  }
  return picked.sort((a, b) => (a.course.id === b.course.id ? a.i - b.i : 0));
}

/**
 * Sorunun geçtiği dersin syllabus bilgisi, kısa JSON metni. Gönderilmeyenler: notlar, devamsızlıklar, önceki not,
 * hedef harf, öğrencinin adı. Ders belli değilse ve tek ders varsa o; birden çoksa her dersin kısa özeti.
 * Dönüş: { context, label } ya da null (ders yok).
 */
export function buildContext(question, state, { courseId = null } = {}) {
  if (!state.courses.length) return null;
  const found = findCourse(question, state.courses);
  // Ad eşleşmesi: findCourse 5+ harfli kelimeye bakar; burada 4 harfli ad kelimeleri de ("Algı Yönetimi" → "algı")
  const byShort = () => {
    const qw = fold(question).split(/[^a-z0-9]+/);
    const hits = state.courses.filter((c) => fold(c.name).split(/[^a-z0-9]+/).some((w) => w.length >= 4 && !STOP.has(w) && qw.some((q) => q.startsWith(w))));
    return hits.length === 1 ? hits[0] : null;
  };
  let course = state.courses.find((c) => c.id === courseId) || (found && !Array.isArray(found) ? found : null) || byShort() || (state.courses.length === 1 ? state.courses[0] : null);
  // Ders belli değilse: sorunun kelimeleri hangi dersin syllabus'unda geçiyorsa o ders (açık ara öndeyse)
  const pool = course ? [course] : Array.isArray(found) ? found : state.courses;
  const ex = excerpts(question, pool);
  if (!course && ex.length) {
    const by = new Map();
    for (const x of ex) by.set(x.course.id, (by.get(x.course.id) || 0) + x.score);
    const ranked = [...by.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] >= 2 * ranked[1][1]) course = state.courses.find((c) => c.id === ranked[0][0]);
  }
  let quotes = (course ? ex.filter((x) => x.course.id === course.id) : ex).map((x) => (course ? x.text : `[${name(x.course)}] ${x.text}`));
  // Hiç paragraf eşleşmediyse: dersin syllabus'unun başı (tanım, kazanımlar genelde oradadır)
  if (course && !quotes.length && course.text) quotes = chunks(course.text).reduce((acc, c) => (acc.join("").length + c.length <= EXCERPT_BUDGET ? [...acc, c] : acc), []);
  const today = new Date().toISOString().slice(0, 10);
  const tasksOf = (c, max) => state.tasks.filter((x) => x.courseId === c.id && !x.done).sort(byDue).slice(0, max).map((x) => ({ title: x.title, type: x.type, due: x.due || null, time: x.time || null }));
  const brief = (c) => ({ code: c.code, name: c.name, grading: c.grading.map((g) => ({ name: g.name, weight: g.weight })), upcoming: tasksOf(c, 3) });
  let data;
  if (course) {
    const week = currentWeekOf(course, state);
    data = {
      today,
      course: {
        code: course.code, name: course.name, credit: course.credit, ects: course.ects, instructor: course.instructor,
        office: course.office, officeHours: course.officeHours, email: course.email,
        sessions: course.sessions.map((s) => ({ day: s.day, start: s.start, end: s.end, room: s.room })),
        grading: course.grading.map((g) => ({ name: g.name, weight: g.weight, ...(g.bonus ? { bonus: true } : {}) })),
        attendance: { minPercent: course.attendPct, maxAbsences: course.absLimit }, finalMin: course.finalMin,
        letterScale: course.scale, currentWeek: week ?? null, learningOutcomes: course.outcomes || [],
        rules: course.policies.filter((p) => !p.hidden).map((p) => ({ kind: p.kind, rule: p.rule, consequence: p.consequence, source: p.source })),
        weeks: course.weeks.map((w) => ({ n: w.n, date: w.date, topic: w.topic, note: w.note })),
      },
      upcoming: tasksOf(course, 8),
      syllabusExcerpts: quotes,
    };
  } else data = { today, courses: state.courses.map(brief), syllabusExcerpts: quotes };
  let text = JSON.stringify(data);
  // Sınır: önce haftalık plan, sonra kuralların kaynak cümleleri kısalır
  if (text.length > CONTEXT_MAX && data.course) {
    data.course.weeks = data.course.weeks.slice(0, 16).map((w) => ({ ...w, topic: String(w.topic || "").slice(0, 80) }));
    text = JSON.stringify(data);
  }
  if (text.length > CONTEXT_MAX && data.course) {
    data.course.rules = data.course.rules.map((r) => ({ ...r, source: String(r.source || "").slice(0, 100) }));
    text = JSON.stringify(data);
  }
  if (text.length > CONTEXT_MAX && data.course) {
    data.course.weeks = [];
    text = JSON.stringify(data);
  }
  while (text.length > CONTEXT_MAX && data.syllabusExcerpts.length > 1) {
    data.syllabusExcerpts.pop();
    text = JSON.stringify(data);
  }
  // Metni olmayan ders (metin özelliğinden önce eklenmiş): arayüz syllabus'u yeniden yüklemeyi önerir
  const noText = course ? !course.text : !pool.some((c) => c.text);
  return { context: text.slice(0, CONTEXT_MAX), label: course ? name(course) : t("derslerin"), courseId: course?.id || null, noText };
}

// Örnek sorular: dile göre değişir (İngilizce sorular da aşağıdaki İngilizce anahtar kelimelerle anlaşılır)
export const EXAMPLES = localize(
  ["Bu hafta neye çalışmalıyım?", "Finalden kaç almam lazım?", "Yoklama var mı?", "Geç teslim kabul mü?"],
  ["What should I study this week?", "What do I need on the final?", "Is attendance taken?", "Is late submission accepted?"]
);
