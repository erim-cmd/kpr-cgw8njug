/**
 * KPR — Veri deposu
 * Tüm veriler cihazda (localStorage) tutulur; sunucu yok, hesap yok.
 * Dışarıdan gelen her veri (yedek dosyası dahil) normalize edilerek
 * doğrulanır, böylece bozuk veri uygulamayı kıramaz.
 */

const KEY = "kpr:data:v1";

export const COLORS = ["#4CC9F0", "#8B5CF6", "#F472B6", "#F5B84C", "#4ADE80", "#F0607A", "#60A5FA", "#2DD4BF"];
export const TASK_TYPES = { sinav: "Sınav", odev: "Ödev", proje: "Proje", diger: "Diğer" };
// BAU harf notları (Yönetmelik Md. 26). Katsayılar gpa.js'te.
// UMIS not hesaplama ekranındaki liste + yönetmelikteki NI, PR (eski yedekler için)
export const GRADE_CODES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E", "F", "NA", "S", "U", "EX", "W", "I", "R", "NI", "PR"];
export const SEASONS = { guz: "Güz", bahar: "Bahar", yaz: "Yaz" };
// Seçmeli Keşfi: ilgi alanları (anahtar → etiket). Ayarlarda sadece bu anahtarlar saklanır.
export const INTERESTS = {
  teknoloji: "Teknoloji",
  finans: "Finans",
  pazarlama: "Pazarlama",
  hukuk: "Hukuk",
  surdurulebilirlik: "Sürdürülebilirlik",
  girisimcilik: "Girişimcilik",
  veri: "Veri/Analitik",
  uluslararasi: "Uluslararası",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v) => (Array.isArray(v) ? v : []);

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// todayView: Bugün ekranındaki [Bugün | Hafta] anahtarının son konumu (arayüz tercihi)
// interests: Seçmeli Keşfi'nde seçilen ilgi alanları (INTERESTS anahtarları)
const defaultSettings = () => ({ termWeeks: 14, termStart: "", notify: false, notifyClasses: false, todayView: "bugun", interests: [] });
const empty = () => ({ version: 1, profile: { name: "" }, courses: [], tasks: [], transcript: [], gpaBase: null, settings: defaultSettings() });

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
  return { name, weight, score: num(g.score, 0, 100) };
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

export const POLICY_KINDS = {
  devam: "Devam", gec_teslim: "Geç teslim", telafi: "Mazeret / telafi", butunleme: "Bütünleme",
  baraj: "Baraj", not_kurali: "Not kuralı", durustluk: "Akademik dürüstlük", diger: "Diğer",
};
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
    // GNO: ulusal (yerel) kredi, beklenen harf notu, tekrar alınıyorsa önceki not
    credit: num(c.credit, 0, 30),
    ects: num(c.ects, 0, 60),
    letter: grade(c.letter),
    // Hocanın harf tablosu (puan → harf) ve varsa final barajı; ikisi de öğrencinin girdiği değer
    scale: normScale(c.scale),
    finalMin: num(c.finalMin, 0, 100),
    // Syllabus'tan çıkarılan kurallar (kırmızı bayraklar); öğrenci gizleyebilir
    policies: arr(c.policies).map(normPolicy).filter(Boolean).slice(0, 8),
    prevGrade: grade(c.prevGrade),
    // Devamsızlık: devam zorunluluğu (%) ya da elle girilen hak (ders sayısı)
    attendPct: num(c.attendPct, 0, 100),
    absLimit: Number.isInteger(c.absLimit) && c.absLimit >= 0 && c.absLimit <= 200 ? c.absLimit : null,
    absences: arr(c.absences).map(normAbsence).filter(Boolean).slice(0, 300),
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
    todayView: s.todayView === "hafta" ? "hafta" : "bugun",
    interests: Array.isArray(s.interests) ? [...new Set(s.interests.filter((k) => typeof k === "string" && Object.hasOwn(INTERESTS, k)))] : [],
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
    const tasks = taskInputs.map((t) => normTask({ ...t, courseId: course.id }, ids)).filter(Boolean);
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
