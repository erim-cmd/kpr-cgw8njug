/**
 * KPR — Veri deposu
 * Tüm veriler cihazda (localStorage) tutulur; sunucu yok, hesap yok.
 * Dışarıdan gelen her veri (yedek dosyası dahil) normalize edilerek
 * doğrulanır, böylece bozuk veri uygulamayı kıramaz.
 */

const KEY = "kpr:data:v1";

export const COLORS = ["#4CC9F0", "#8B5CF6", "#F472B6", "#F5B84C", "#4ADE80", "#F0607A", "#60A5FA", "#2DD4BF"];
export const TASK_TYPES = { sinav: "Sınav", odev: "Ödev", proje: "Proje", diger: "Diğer" };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v) => (Array.isArray(v) ? v : []);

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * Not sistemi varsayılanları. Üniversiteden üniversiteye değiştiği için
 * hepsi Ayarlar'dan düzenlenebilir; burası sadece ilk değerler.
 */
export const DEFAULT_SCALE = [
  { letter: "AA", point: 4.0 }, { letter: "BA", point: 3.5 }, { letter: "BB", point: 3.0 },
  { letter: "CB", point: 2.5 }, { letter: "CC", point: 2.0 }, { letter: "DC", point: 1.5 },
  { letter: "DD", point: 1.0 }, { letter: "FD", point: 0.5 }, { letter: "FF", point: 0.0 },
];
// Puan → harf tahmini (mutlak sistem). Bağıl sistemde gerçek harf farklı olabilir.
export const DEFAULT_SCORE_TABLE = [
  { letter: "AA", min: 90 }, { letter: "BA", min: 85 }, { letter: "BB", min: 80 },
  { letter: "CB", min: 75 }, { letter: "CC", min: 70 }, { letter: "DC", min: 65 },
  { letter: "DD", min: 60 }, { letter: "FD", min: 50 }, { letter: "FF", min: 0 },
];
const defaultSettings = () => ({
  weightBy: "akts", // "akts" | "kredi"
  scale: DEFAULT_SCALE.map((s) => ({ ...s })),
  scoreTable: DEFAULT_SCORE_TABLE.map((s) => ({ ...s })),
  termWeeks: 14,
  absenceLimit: 30, // yüzde
});

const empty = () => ({
  version: 1,
  profile: { name: "" },
  settings: defaultSettings(),
  past: { credits: null, gpa: null }, // önceki dönemlerin toplam AKTS/kredisi ve GNO'su
  targetGpa: null,
  courses: [],
  tasks: [],
});

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
    // GNO
    akts: num(c.akts, 0, 60),
    kredi: num(c.kredi, 0, 60),
    letter: str(c.letter, 4), // öğrencinin bu dersten beklediği/aldığı harf ("" = girilmedi)
    retakeOld: str(c.retakeOld, 4), // tekrar alınan dersse eski harf notu ("" = tekrar değil)
    // Devamsızlık
    absenceLimit: num(c.absenceLimit, 0, 100), // null = Ayarlar'daki varsayılan
    absences: arr(c.absences).map(normAbsence).filter(Boolean).slice(0, 200),
  };
}

function normAbsence(a) {
  if (!a || !DATE.test(a.date)) return null;
  const hours = num(a.hours, 0.5, 12);
  if (hours === null) return null;
  return { id: str(a.id, 64) || uid(), date: a.date, hours };
}

function normSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== "object") return d;
  const scale = arr(s.scale)
    .map((x) => ({ letter: str(x?.letter, 4), point: num(x?.point, 0, 10) }))
    .filter((x) => x.letter && x.point !== null);
  const scoreTable = arr(s.scoreTable)
    .map((x) => ({ letter: str(x?.letter, 4), min: num(x?.min, 0, 100) }))
    .filter((x) => x.letter && x.min !== null);
  return {
    weightBy: s.weightBy === "kredi" ? "kredi" : "akts",
    scale: scale.length ? scale.slice(0, 20) : d.scale,
    scoreTable: scoreTable.length ? scoreTable.slice(0, 20) : d.scoreTable,
    termWeeks: num(s.termWeeks, 1, 30) ?? d.termWeeks,
    absenceLimit: num(s.absenceLimit, 0, 100) ?? d.absenceLimit,
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

export function normalize(data) {
  const out = empty();
  if (!data || typeof data !== "object") return out;
  out.profile.name = str(data.profile?.name, 40);
  out.settings = normSettings(data.settings);
  out.past = { credits: num(data.past?.credits, 0, 1000), gpa: num(data.past?.gpa, 0, 10) };
  out.targetGpa = num(data.targetGpa, 0, 10);
  out.courses = arr(data.courses).map(normCourse).filter(Boolean);
  const ids = new Set(out.courses.map((c) => c.id));
  out.tasks = arr(data.tasks).map((t) => normTask(t, ids)).filter(Boolean);
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

  /* --- Dönem: GNO ve devamsızlık --- */

  setSettings(patch) {
    commit({ ...state, settings: normSettings({ ...state.settings, ...patch }) });
  },

  setPast(patch) {
    const past = { ...state.past, ...patch };
    commit({ ...state, past: { credits: num(past.credits, 0, 1000), gpa: num(past.gpa, 0, 10) } });
  },

  setTargetGpa(value) {
    commit({ ...state, targetGpa: num(value, 0, 10) });
  },

  addAbsence(courseId, { date, hours }) {
    const course = state.courses.find((c) => c.id === courseId);
    const entry = normAbsence({ date, hours });
    if (!course || !entry) return null;
    this.saveCourse({ ...course, absences: [...course.absences, entry] });
    return entry;
  },

  removeAbsence(courseId, absenceId) {
    const course = state.courses.find((c) => c.id === courseId);
    if (course) this.saveCourse({ ...course, absences: course.absences.filter((a) => a.id !== absenceId) });
  },

  replace(data) {
    commit(normalize(data));
  },

  reset() {
    commit(empty());
  },
};
