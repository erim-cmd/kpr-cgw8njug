/**
 * KPR — Veri deposu
 * Tüm veriler cihazda (localStorage) tutulur; sunucu yok, hesap yok.
 * Dışarıdan gelen her veri (yedek dosyası dahil) normalize edilerek
 * doğrulanır, böylece bozuk veri uygulamayı kıramaz.
 */

import { localize } from "./i18n.js";

const KEY = "kpr:data:v1";

export const COLORS = ["#4CC9F0", "#8B5CF6", "#F472B6", "#F5B84C", "#4ADE80", "#F0607A", "#60A5FA", "#2DD4BF"];
// sinav/proje/diger syllabus'tan gelir (eski kayıtlar da bu türlerde); diğerleri öğrencinin elle eklediği işler
export const TASK_TYPES = localize({
  sinav: "Sınav", odev: "Ödev", proje: "Proje", quiz: "Quiz", okuma: "Okuma", lab: "Lab raporu",
  sunum: "Sunum hazırlığı", kisisel: "Kişisel", diger: "Diğer",
}, {
  sinav: "Exam", odev: "Homework", proje: "Project", quiz: "Quiz", okuma: "Reading", lab: "Lab report",
  sunum: "Presentation prep", kisisel: "Personal", diger: "Other",
});
// Elle eklenebilen türler (sıra = formdaki tek satırlık çipler). Sınav/proje/diğer syllabus'tan gelir;
// "okuma" eski kayıtlarda kalır ama formda seçilmez.
export const QUICK_TYPES = ["odev", "quiz", "lab", "sunum", "kisisel"];
export const QUICK_LABEL = localize({ odev: "Ödev", quiz: "Quiz", lab: "Lab", sunum: "Sunum", kisisel: "Kişisel" },
  { odev: "Homework", quiz: "Quiz", lab: "Lab", sunum: "Presentation", kisisel: "Personal" });
// Sınav gibi yaklaşan uyarı alanlar; yoğunluğa/not ağırlığına katılmayanlar
export const isExam = (t) => t.type === "sinav" || t.type === "quiz";
export const isLight = (t) => t.type === "okuma" || t.type === "kisisel";
// BAU harf notları (Yönetmelik Md. 26). Katsayılar gpa.js'te.
// UMIS not hesaplama ekranındaki liste + yönetmelikteki NI, PR (eski yedekler için)
export const GRADE_CODES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E", "F", "NA", "S", "U", "EX", "W", "I", "R", "NI", "PR"];
export const SEASONS = localize({ guz: "Güz", bahar: "Bahar", yaz: "Yaz" }, { guz: "Fall", bahar: "Spring", yaz: "Summer" });
// Seçmeli Keşfi: ilgi alanları (anahtar → etiket). Ayarlarda sadece bu anahtarlar saklanır.
export const INTERESTS = localize({
  teknoloji: "Teknoloji",
  finans: "Finans",
  pazarlama: "Pazarlama",
  hukuk: "Hukuk",
  surdurulebilirlik: "Sürdürülebilirlik",
  girisimcilik: "Girişimcilik",
  veri: "Veri/Analitik",
  uluslararasi: "Uluslararası",
}, {
  teknoloji: "Technology", finans: "Finance", pazarlama: "Marketing", hukuk: "Law",
  surdurulebilirlik: "Sustainability", girisimcilik: "Entrepreneurship", veri: "Data/Analytics", uluslararasi: "International",
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v) => (Array.isArray(v) ? v : []);

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// todayView: Bugün ekranındaki [Bugün | Hafta] anahtarının son konumu (arayüz tercihi)
// interests: Seçmeli Keşfi'nde seçilen ilgi alanları (INTERESTS anahtarları)
// theme: görünüm tercihi — "sistem" (telefonu izler) | "acik" | "koyu" (theme.js)
// lang: arayüz dili — "tr" | "en" (i18n.js)
// studentNo: hocaya mail taslağına eklenen öğrenci numarası (mail.js; isteğe bağlı, cihazda)
const defaultSettings = () => ({ termWeeks: 14, termStart: "", notify: false, notifyClasses: false, todayView: "bugun", interests: [], theme: "sistem", lang: "tr", studentNo: "" });
// version: veri şeması sürümü (göçler migrate.js'te; v2 = geçmiş dönemler gpaBase'e çevrildi)
// archive: göçte arayüzden kaldırılan ama silinmeyen veri (geri dönüş için)
const empty = () => ({ version: 1, profile: { name: "" }, courses: [], tasks: [], transcript: [], gpaBase: null, settings: defaultSettings(), archive: { transcript: [] }, electives: [] });

function normSession(s) {
  if (!s || !Number.isInteger(s.day) || s.day < 0 || s.day > 6) return null;
  if (!TIME.test(s.start) || !TIME.test(s.end)) return null;
  return { day: s.day, start: s.start, end: s.end, room: str(s.room, 40) };
}

const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

function normGrade(g) {
  const name = str(g?.name, 40);
  const weight = num(g?.weight, 0, 100);
  if (!name || weight === null) return null;
  // score: öğrencinin bu bileşenden aldığı not (0–100), girilmediyse null
  // bonus: ek puan bileşeni (100'lük dağılıma katılmaz); yalnızca true ise saklanır
  return { name, weight, score: num(g.score, 0, 100), ...(g.bonus === true ? { bonus: true } : {}) };
}

const grade = (g, list = GRADE_CODES) => (list.includes(g) ? g : "");

const SCALE_LETTERS = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D"];
function normScale(list) {
  const seen = new Set();
  return arr(list)
    .map((r) => ({ letter: SCALE_LETTERS.includes(r?.letter) ? r.letter : "", min: num(r?.min, 0, 100) }))
    .filter((r) => r.letter && r.min !== null && !seen.has(r.letter) && seen.add(r.letter))
    .sort((a, b) => b.min - a.min);
}

export const POLICY_KINDS = localize({
  devam: "Devam", gec_teslim: "Geç teslim", telafi: "Mazeret / telafi", butunleme: "Bütünleme",
  baraj: "Baraj", not_kurali: "Not kuralı", durustluk: "Akademik dürüstlük", diger: "Diğer",
}, {
  devam: "Attendance", gec_teslim: "Late work", telafi: "Excuse / make-up", butunleme: "Resit",
  baraj: "Minimum score", not_kurali: "Grading rule", durustluk: "Academic integrity", diger: "Other",
});
const SEVERITIES = ["kritik", "dikkat", "bilgi"];
function normPolicy(p) {
  const rule = str(p?.rule, 200);
  if (!rule) return null;
  return {
    id: str(p.id, 64) || uid(),
    kind: p.kind in POLICY_KINDS ? p.kind : "diger",
    severity: SEVERITIES.includes(p.severity) ? p.severity : "bilgi",
    rule,
    consequence: str(p.consequence, 200),
    source: str(p.source, 200),
    hidden: p.hidden === true,
  };
}

function normAbsence(a) {
  if (!a || !DATE.test(a.date)) return null;
  return { id: str(a.id, 64) || uid(), date: a.date, start: TIME.test(a.start) ? a.start : "" };
}

// Haftalık plan (syllabus'tan): en fazla 20 hafta, konu en fazla 200 karakter
function normWeeks(list) {
  const seen = new Set();
  return arr(list)
    .map((w) => ({
      n: Number.isInteger(w?.n) && w.n > 0 && w.n <= 30 ? w.n : null,
      date: DATE.test(w?.date) ? w.date : null,
      topic: str(w?.topic, 200),
      note: str(w?.note, 200) || null,
    }))
    .filter((w) => w.n !== null && w.topic && !seen.has(w.n) && seen.add(w.n))
    .sort((a, b) => a.n - b.n)
    .slice(0, 20);
}

function normCourse(c) {
  const name = str(c?.name, 80);
  if (!name) return null;
  return {
    id: str(c.id, 64) || uid(),
    name,
    code: str(c.code, 20),
    instructor: str(c.instructor, 60),
    email: str(c.email, 80),
    office: str(c.office, 60),
    officeHours: str(c.officeHours, 80),
    color: HEX.test(c.color) ? c.color : COLORS[0],
    sessions: arr(c.sessions).map(normSession).filter(Boolean),
    grading: arr(c.grading).map(normGrade).filter(Boolean).slice(0, 12),
    target: num(c.target, 0, 100) ?? 50,
    // Hedef harf (ders ekranı): hocanın tablosundaki bir harf; seçilince eşiği target olur
    targetLetter: /^[A-F][+-]?$/.test(c.targetLetter) ? c.targetLetter : "",
    // GNO: ulusal (yerel) kredi, beklenen harf notu, tekrar alınıyorsa önceki not
    credit: num(c.credit, 0, 30),
    ects: num(c.ects, 0, 60),
    letter: grade(c.letter),
    // Hocanın harf tablosu (puan → harf) ve varsa final barajı; ikisi de öğrencinin girdiği değer
    scale: normScale(c.scale),
    finalMin: num(c.finalMin, 0, 100),
    // Syllabus'tan çıkarılan kurallar (kırmızı bayraklar); öğrenci gizleyebilir
    policies: arr(c.policies).map(normPolicy).filter(Boolean).slice(0, 10),
    prevGrade: grade(c.prevGrade),
    // Devamsızlık: devam zorunluluğu (%) ya da elle girilen hak (ders sayısı)
    attendPct: num(c.attendPct, 0, 100),
    absLimit: Number.isInteger(c.absLimit) && c.absLimit >= 0 && c.absLimit <= 200 ? c.absLimit : null,
    absences: arr(c.absences).map(normAbsence).filter(Boolean).slice(0, 300),
    weeks: normWeeks(c.weeks),
  };
}

function normTask(t, courseIds) {
  const title = str(t?.title, 120);
  if (!title || !DATE.test(t.due)) return null;
  return {
    id: str(t.id, 64) || uid(),
    title,
    type: t.type in TASK_TYPES ? t.type : "diger",
    courseId: courseIds.has(t.courseId) ? t.courseId : null,
    due: t.due,
    time: TIME.test(t.time) ? t.time : "",
    note: str(t.note, 500),
    source: str(t.source, 200),
    done: t.done === true,
  };
}

function normEntry(e) {
  const g = grade(e?.grade);
  const year = Number.isInteger(e?.year) && e.year >= 1990 && e.year <= 2100 ? e.year : null;
  const credit = num(e?.credit, 0, 30);
  if (!g || year === null || credit === null || !(e.season in SEASONS)) return null;
  const code = str(e.code, 20);
  const name = str(e.name, 80);
  if (!code && !name) return null;
  return { id: str(e.id, 64) || uid(), year, season: e.season, code, name, credit, ects: num(e.ects, 0, 60), grade: g };
}

function normSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== "object") return d;
  return {
    termStart: DATE.test(s.termStart) ? s.termStart : "",
    termWeeks: Number.isInteger(s.termWeeks) && s.termWeeks >= 1 && s.termWeeks <= 30 ? s.termWeeks : d.termWeeks,
    notify: s.notify === true,
    notifyClasses: s.notifyClasses === true,
    todayView: s.todayView === "hafta" ? "hafta" : "bugun", // i18n-ok
    // Dönem → GNO kartındaki bir kerelik "Şu anki GNO'n?" sorusu atlandı mı
    gnoSkip: s.gnoSkip === true,
    interests: Array.isArray(s.interests) ? [...new Set(s.interests.filter((k) => typeof k === "string" && Object.hasOwn(INTERESTS, k)))] : [],
    theme: s.theme === "acik" || s.theme === "koyu" ? s.theme : "sistem",
    lang: s.lang === "en" ? "en" : "tr",
    studentNo: str(s.studentNo, 20),
  };
}

// Seçmeli adayı (Seçmeli Keşfi): Add/Drop'ta karşılaştırmak için yüklenen syllabus'un özeti. Ders değildir,
// takvime ve GNO'ya girmez; en fazla 8 aday.
function normElective(e) {
  const name = str(e?.name, 80);
  const code = str(e?.code, 20);
  if (!name && !code) return null;
  return {
    id: str(e.id, 64) || uid(),
    name,
    code,
    instructor: str(e.instructor, 60),
    credit: num(e.credit, 0, 30),
    ects: num(e.ects, 0, 60),
    grading: arr(e.grading).map(normGrade).filter(Boolean).slice(0, 12),
    attendPct: num(e.attendPct, 0, 100),
    absLimit: Number.isInteger(e.absLimit) && e.absLimit >= 0 && e.absLimit <= 200 ? e.absLimit : null,
    absUnit: ["saat", "hafta"].includes(e.absUnit) ? e.absUnit : "", // i18n-ok
    finalMin: num(e.finalMin, 0, 100),
    exams: Number.isInteger(e.exams) && e.exams >= 0 && e.exams <= 60 ? e.exams : 0,
    deadlines: Number.isInteger(e.deadlines) && e.deadlines >= 0 && e.deadlines <= 60 ? e.deadlines : 0,
    rules: arr(e.rules).map((r) => str(r, 160)).filter(Boolean).slice(0, 4),
  };
}

function normBase(b) {
  const credits = num(b?.credits, 1, 1000);
  const gno = num(b?.gno, 0, 4);
  return credits === null || gno === null ? null : { credits, gno };
}

export function normalize(data) {
  const out = empty();
  if (!data || typeof data !== "object") return out;
  out.profile.name = str(data.profile?.name, 40);
  out.courses = arr(data.courses).map(normCourse).filter(Boolean);
  const ids = new Set(out.courses.map((c) => c.id));
  out.tasks = arr(data.tasks).map((t) => normTask(t, ids)).filter(Boolean);
  out.transcript = arr(data.transcript).map(normEntry).filter(Boolean).slice(0, 400);
  out.gpaBase = normBase(data.gpaBase);
  out.settings = normSettings(data.settings);
  out.version = Number.isInteger(data.version) && data.version >= 1 && data.version <= 99 ? data.version : 1;
  out.archive = { transcript: arr(data.archive?.transcript).map(normEntry).filter(Boolean).slice(0, 400) };
  out.electives = arr(data.electives).map(normElective).filter(Boolean).slice(0, 8);
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn("[KPR] Veri okunamadı:", err);
  }
  return empty();
}

let state = load();
const subscribers = new Set();

function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[KPR] Veri kaydedilemedi:", err);
  }
  subscribers.forEach((fn) => fn(state));
}

const upsert = (list, item) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export const store = {
  get: () => state,

  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  setName(name) {
    commit({ ...state, profile: { ...state.profile, name: str(name, 40) } });
  },

  saveCourse(input) {
    const course = normCourse(input);
    if (course) commit({ ...state, courses: upsert(state.courses, course) });
    return course;
  },

  // Dersi silince ona bağlı görevler silinmez, sadece dersten ayrılır.
  deleteCourse(id) {
    commit({
      ...state,
      courses: state.courses.filter((c) => c.id !== id),
      tasks: state.tasks.map((t) => (t.courseId === id ? { ...t, courseId: null } : t)),
    });
  },

  saveTask(input) {
    const task = normTask(input, new Set(state.courses.map((c) => c.id)));
    if (task) commit({ ...state, tasks: upsert(state.tasks, task) });
    return task;
  },

  /** Syllabus içe aktarımı: bir ders + görevleri tek seferde kaydeder (tek yeniden çizim). */
  importCourse(courseInput, taskInputs) {
    const course = normCourse(courseInput);
    if (!course) return null;
    const ids = new Set([...state.courses.map((c) => c.id), course.id]);
    // Aynı syllabus'u tekrar yüklemek aynı tarihleri ikinci kez eklemesin (ders + başlık + tarih aynıysa atla)
    const key = (t) => `${t.courseId}|${t.title.toLocaleLowerCase("tr-TR")}|${t.due}`;
    const have = new Set(state.tasks.map(key));
    const tasks = taskInputs
      .map((t) => normTask({ ...t, courseId: course.id }, ids))
      .filter(Boolean)
      .filter((t) => !have.has(key(t)) && have.add(key(t)));
    commit({ ...state, courses: upsert(state.courses, course), tasks: [...state.tasks, ...tasks] });
    return { course, count: tasks.length };
  },

  toggleTask(id) {
    let toggled = null;
    const tasks = state.tasks.map((t) => (t.id === id ? (toggled = { ...t, done: !t.done }) : t));
    if (toggled) commit({ ...state, tasks });
    return toggled;
  },

  deleteTask(id) {
    commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
  },

  /** Devamsızlık: aynı gün + aynı saat ikinci kez eklenmez. */
  addAbsence(courseId, date, start = "") {
    const c = state.courses.find((x) => x.id === courseId);
    if (!c || c.absences.some((a) => a.date === date && a.start === start)) return null;
    return this.saveCourse({ ...c, absences: [...c.absences, { date, start }] });
  },

  removeAbsence(courseId, absenceId) {
    const c = state.courses.find((x) => x.id === courseId);
    if (c) this.saveCourse({ ...c, absences: c.absences.filter((a) => a.id !== absenceId) });
  },

  saveElective(input) {
    const e = normElective(input);
    if (e) commit({ ...state, electives: upsert(state.electives, e).slice(-8) });
    return e;
  },

  deleteElective(id) {
    commit({ ...state, electives: state.electives.filter((e) => e.id !== id) });
  },

  saveEntry(input) {
    const entry = normEntry(input);
    if (entry) commit({ ...state, transcript: upsert(state.transcript, entry) });
    return entry;
  },

  deleteEntry(id) {
    commit({ ...state, transcript: state.transcript.filter((e) => e.id !== id) });
  },

  setBase(base) {
    commit({ ...state, gpaBase: base ? normBase(base) : null });
  },

  setSettings(patch) {
    commit({ ...state, settings: normSettings({ ...state.settings, ...patch }) });
  },

  replace(data) {
    commit(normalize(data));
  },

  reset() {
    commit(empty());
  },
};
