// Syllabus'u var olan dersin üzerine yükleme (course-merge.js): eksik olanı ekler, öğrencinin girdisini ezmez.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { mergeIntoCourse } = await import("../course-merge.js");
const { normalize } = await import("../store.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

console.log("\nmerge");
// Öğrencinin elindeki ders: notlar, düzeltilmiş ad/kredi, devamsızlık, gizlenmiş kural, harf tablosu var; plan ve e-posta yok
const mine = normalize({
  profile: { name: "x" }, tasks: [],
  courses: [{
    id: "c1", name: "Benim adım", code: "MCH 2016", color: "#F472B6", credit: 4, ects: null, email: "",
    instructor: "Elle yazdığım hoca", attendPct: 80,
    grading: [{ name: "Vize", weight: 40, score: 72 }, { name: "Final", weight: 60, score: null }],
    policies: [{ id: "p1", kind: "devam", severity: "kritik", rule: "Kural", consequence: "", source: "s", hidden: true }],
    absences: [{ id: "a1", date: "2026-10-01", start: "09:00" }],
    scale: [{ letter: "A", min: 90 }], letter: "B", targetLetter: "A", target: 90,
    sessions: [{ day: 0, start: "09:00", end: "10:50", room: "A1" }],
  }],
}).courses[0];

const parsed = {
  course: { name: "Syllabus adı", code: "MCH 9999", instructor: "Syllabus hocası", email: "hoca@example.edu", office: "B201", office_hours: "Pzt 11:00", credit: 3, ects: 6 },
  sessions: [{ day: 2, start: "13:00", end: "15:50", room: "Z9" }],
  grading: [{ name: "Midterm", weight: 50 }, { name: "Final", weight: 50 }],
  attendance: { percent: 70, max_absences: null, source: "" },
  final_min: 35,
  policies: [{ kind: "gec_teslim", severity: "kritik", rule: "Geç teslim yok", consequence: "", source: "x" }],
  weeks: [{ n: 1, date: null, topic: "Giriş", note: null }, { n: 2, date: null, topic: "Döküm", note: null }],
};

const { course: m, added } = mergeIntoCourse(mine, parsed);
ok(m.weeks.length === 2 && m.weeks[1].topic === "Döküm", "haftalık plan eklenmedi");
ok(m.email === "hoca@example.edu" && m.office === "B201" && m.officeHours === "Pzt 11:00" && m.ects === 6 && m.finalMin === 35, "boş alanlar dolmadı");
ok(m.name === "Benim adım" && m.code === "MCH 2016" && m.instructor === "Elle yazdığım hoca" && m.credit === 4 && m.color === "#F472B6", "dolu alan ezildi");
ok(m.grading.length === 2 && m.grading[0].score === 72 && m.grading[0].name === "Vize", "notlar ezildi");
ok(m.attendPct === 80, "devam şartı ezildi");
ok(m.policies.length === 1 && m.policies[0].hidden === true, "kurallar/gizleme ezildi");
ok(m.absences.length === 1 && m.scale.length === 1 && m.letter === "B" && m.targetLetter === "A" && m.target === 90, "devamsızlık/harf/hedef ezildi");
ok(m.sessions.length === 1 && m.sessions[0].room === "A1", "ders saatleri ezildi");
ok(added.join("|") === "haftalık plan (2 hafta)|e-posta|ofis|ofis saati|AKTS|final barajı", `eklenen listesi: ${added.join("|")}`);
// Kaydedilebilir şekil (normalize sonrası alanlar korunuyor)
const saved = normalize({ profile: { name: "x" }, tasks: [], courses: [m] }).courses[0];
ok(saved.weeks.length === 2 && saved.grading[0].score === 72 && saved.absences.length === 1, "normalize sonrası veri kayboldu");
// Boş ders: her şey dolar; plan zaten varsa değişmez; iki kez yüklemek değiştirmez
const blank = normalize({ profile: { name: "x" }, tasks: [], courses: [{ id: "c2", name: "Boş" }] }).courses[0];
const b = mergeIntoCourse(blank, parsed).course;
ok(b.attendPct === 70 && b.grading.length === 2 && b.grading.every((g) => g.score === null) && b.sessions.length === 1 && b.policies.length === 1, "boş derse eklenmedi");
const again = mergeIntoCourse(b, { ...parsed, weeks: [{ n: 1, topic: "Başka", date: null, note: null }] });
ok(again.added.length === 0 && again.course.weeks[0].topic === "Giriş", "ikinci yükleme bir şey değiştirdi");
// max_absences yolu
const c3 = mergeIntoCourse(blank, { ...parsed, attendance: { percent: null, max_absences: 4 } }).course;
ok(c3.absLimit === 4 && c3.attendPct === null, "devamsızlık hakkı eklenmedi");

console.log(`\n${pass} doğru, ${fail} hata`);
if (fail) process.exit(1);
