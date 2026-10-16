// Ders kartı: "N açık görev" yerine en yakın açık iş (Tasarım İyileştirme, Öncelik 2).
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
const { nextDue } = await import("../courses.js");

let fail = 0, ok = 0;
const check = (cond, msg) => (cond ? ok++ : (fail++, console.log("✗ " + msg)));
const T = "2026-10-16";
const tasks = [
  { id: "a", courseId: "c1", due: "2026-10-10", title: "Geçmiş", done: false },
  { id: "b", courseId: "c1", due: "2026-10-20", time: "10:00", title: "Ödev 2", done: false },
  { id: "c", courseId: "c1", due: "2026-10-18", title: "Bitti", done: true },
  { id: "d", courseId: "c1", due: "2026-10-20", time: "09:00", title: "Quiz", done: false },
  { id: "e", courseId: "c2", due: "2026-10-17", title: "Başka ders", done: false },
  { id: "f", courseId: "c1", due: "", title: "Tarihsiz", done: false },
];
check(nextDue("c1", tasks, T)?.id === "d", "aynı gün: saati erken olan önce, geçmiş/biten/tarihsiz/başka ders atlanır");
check(nextDue("c1", tasks, "2026-10-21") === null, "ileride iş yoksa null");
check(nextDue("c2", tasks, T)?.id === "e", "her ders kendi işini görür");
check(nextDue("c1", [{ id: "g", courseId: "c1", due: T, title: "Bugün", done: false }], T)?.id === "g", "bugünkü iş sayılır");

console.log(`\nders kartı\n\n${ok} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
