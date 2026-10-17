// Devamsızlık (attendance.js): hafta bazlı giriş; sınav haftaları (yoklama yok) hak hesabına girmez.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { attendance, examWeeks } = await import("../attendance.js");
const { normalize } = await import("../store.js");
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const course = (over = {}) => normalize({ profile: { name: "x" }, tasks: [], courses: [{ id: "c", name: "Ders", sessions: [{ day: 0, start: "09:00", end: "10:50" }], ...over }] }, true).courses[0];
const plan = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, date: null, topic: i === 5 ? "Midterm Exam" : i === 11 ? "Final Exam Week" : `Konu ${i + 1}`, note: null }));

// 1) Sınav haftaları: plandaki "Midterm Exam" / "Final Exam Week"; "Midterm review" sınav haftası değildir
const c1 = course({ weeks: [...plan.slice(0, 4), { n: 5, date: null, topic: "Midterm review", note: null }, ...plan.slice(5)], attendPct: 70 });
ok(JSON.stringify([...examWeeks(c1, 12)].sort((a, b) => a - b)) === "[6,12]", `sınav haftaları: ${[...examWeeks(c1, 12)]}`);
// 2) 12 haftalık derste 2 sınav haftası → 10 ders haftası; %70 devam → floor(10 × 0,3) = 3 hak
const a1 = attendance(c1, 12);
ok(a1.total === 10 && a1.limit === 3, `toplam ${a1.total}, hak ${a1.limit} (10 / 3 olmalı)`);
// 3) Plan yoksa her hafta sayılır (eski davranış)
const a2 = attendance(course({ attendPct: 70 }), 12);
ok(a2.total === 12 && a2.limit === 3, `plansız: ${a2.total}/${a2.limit}`);
// 4) Hafta bazlı kayıt sayılır; sınav haftasına düşen kayıt sayılmaz; tarihli eski kayıt da sayılır
const c4 = course({ weeks: plan, attendPct: 70, absences: [{ week: 2 }, { week: 3 }, { week: 6 }, { date: "2026-10-01", start: "09:00" }] });
const a4 = attendance(c4, 12);
ok(a4.used === 3 && a4.left === 0 && a4.level === "last", `kullanılan ${a4.used}, kalan ${a4.left}, düzey ${a4.level}`);
// 5) Haftada iki oturum: hafta kaydı oturum başına (start ile ayrılır)
const c5 = course({ sessions: [{ day: 0, start: "09:00", end: "10:50" }, { day: 2, start: "13:00", end: "14:50" }], weeks: plan, attendPct: 80,
  absences: [{ week: 2, start: "09:00" }, { week: 2, start: "13:00" }] });
const a5 = attendance(c5, 12);
ok(a5.total === 20 && a5.limit === 4 && a5.used === 2, `iki oturum: ${a5.total}/${a5.limit}/${a5.used}`);
// 6) Normalize: hafta kaydı korunur, geçersiz hafta atılır
const c6 = course({ absences: [{ week: 3 }, { week: 0 }, { week: 40 }, { date: "bozuk" }] });
ok(c6.absences.length === 1 && c6.absences[0].week === 3, `normalize: ${JSON.stringify(c6.absences)}`);

// 7) Konuda geçen not dağılımı ya da proje sunumu sınav haftası değildir (denetim, 17 Eki)
const topics = (list) => course({ weeks: list.map((topic, i) => ({ n: i + 1, date: null, topic, note: null })) });
const ex7 = topics(["Introduction (midterm 30%, final 40%)", "Final project presentations", "Proje sunumları ve final raporu", "Ara Sınav", "MIDTERM EXAM", "Final", "Vize haftası", "Bütünleme", "Final Exam Week", "Konu: türev"]);
ok(JSON.stringify([...examWeeks(ex7, 10)].sort((a, b) => a - b)) === "[4,5,6,7,8,9]", `sınav haftaları: ${[...examWeeks(ex7, 10)].sort((a, b) => a - b)}`);
// 8) Aynı devamsızlık iki kez sayılmaz: "Gitmedim" (tarihli) + aynı haftanın ızgara işareti = 1;
//    sınav haftasına düşen tarihli kayıt sayılmaz (dönem 21 Eylül Pazartesi; 5 Ekim = 3. hafta, 26 Ekim = 6. hafta)
const c8 = course({ weeks: plan, attendPct: 70, absences: [{ date: "2026-10-05", start: "09:00" }, { week: 3, start: "09:00" }, { date: "2026-10-26", start: "09:00" }] });
const a8 = attendance(c8, 12, "2026-09-21");
ok(a8.used === 1, `aynı hafta iki kayıt + sınav haftası kaydı → 1: ${a8.used}`);
ok(attendance(c8, 12).used === 3, `dönem başı bilinmiyorsa tarihli kayıt haftaya çevrilemez (eski davranış): ${attendance(c8, 12).used}`);
const c9 = course({ sessions: [{ day: 0, start: "09:00", end: "10:50" }, { day: 2, start: "13:00", end: "14:50" }], weeks: plan, attendPct: 70,
  absences: [{ date: "2026-10-05", start: "09:00" }, { week: 3, start: "13:00" }] });
ok(attendance(c9, 12, "2026-09-21").used === 2, "aynı haftanın farklı oturumları ayrı sayılır");

console.log(`\ndevamsızlık\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
