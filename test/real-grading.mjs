// Gerçek izlence ölçümünden (11 Eki 2026, reports/izlence-gercek-olcum.md) çıkan not dağılımı hataları.
// Örnekler gerçek belgelerin yapısını taklit eden sentetik metinler; yalnız not dağılımı denetlenir.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSyllabus } from "../syllabus-local.js";

const dir = fileURLToPath(new URL("./syllabus/", import.meta.url));
const cases = {
  // Not tablosu + sonraki hafta/konu tablosu ("5 · Methods for Project Evaluation") + "minimal requirement is 60% attendance"
  real_hafta_konu: { Assignments: 20, Case: 15, Midterm: 30, "Final Exam": 35 },
  // Not tablosundan sonra AKTS iş yükü tablosu: saat/adet sayıları ağırlık değil
  real_akts_tablo: { "Midterm Exam": 40, Homework: 10, Final: 50 },
  // Değerlendirme tablosunda "Attendance | 70% attendance requirement": devam şartı, bileşen değil
  real_devam_satiri: { Midterm: 40, Final: 60 },
  // Belgenin kendisi %130 (ÇOMÜ): yakın satırlardaki fazlalık atılmaz, uyarı verilir
  web_toplam_130: { Vize: 40, Final: 60, "Derse devam": 10, "Ödevler ve sunumlar": 10, "Derse aktif katılım": 10 },
};
let pass = 0, fail = 0;
for (const [name, want] of Object.entries(cases)) {
  const r = parseSyllabus(readFileSync(dir + name + ".txt", "utf8"), new Date(2026, 8, 26));
  const got = Object.fromEntries(r.grading.filter((g) => !g.bonus).map((g) => [g.name, g.weight]));
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`));
}
console.log(`\ngerçek izlence not dağılımı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
