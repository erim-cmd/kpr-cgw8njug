// GNO tahmini (gpa.js projection): "önceki not / ilk kez alıyorum" mantığı yok (Erim, 16 Eki 2026 geri bildirimi):
// UMIS'teki HESAPLA gibi şu anki GNO + kredi üzerine bu dönemin harfleri eklenir; eski kayıtlarda kalmış
// prevGrade hesabı değiştirmez.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { projection } = await import("../gpa.js");
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const base = { credits: 60, gno: 2.5 };
const courses = [{ id: "a", credit: 3, letter: "C+" }, { id: "b", credit: 4, letter: "B" }];
const p1 = projection({ transcript: [], courses, gpaBase: base });
const p2 = projection({ transcript: [], courses: courses.map((c) => (c.id === "a" ? { ...c, prevGrade: "F" } : c)), gpaBase: base });
ok(p1.after === p2.after, `önceki not hesabı değiştirmemeli: ${p1.after} ≠ ${p2.after}`);
// Elle: (2,5 × 60 + 2,33 × 3 + 3,0 × 4) / 67
const want = Math.round(((2.5 * 60 + 2.33 * 3 + 3.0 * 4) / 67) * 100) / 100;
ok(p1.after === want, `GNO ${p1.after} ≠ ${want}`);
console.log(`\nGNO (tekrar mantığı yok)\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
