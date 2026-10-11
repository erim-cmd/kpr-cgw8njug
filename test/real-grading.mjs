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
  // Cümle içinde: "…the total of midterm exam (30%), projects (10%) and final exam (60%)" (Toros)
  real_cumle_agirlik: { "Midterm exam": 30, Projects: 10, "Final exam": 60 },
  // Tablo hücresinde cümle: "taking 40% of the midterm exam and 60% of the final exam" (Toros)
  real_of_the: { "Midterm exam": 40, "Final exam": 60 },
  // Yatay tablo: adlar bir satırda, yüzdeler altında (İTÜ)
  real_yatay: { "Midterm Exam I": 25, "Midterm Exam II": 25, "Final Exam": 50 },
  // Önce değer: "40% Midterm exam (April 5)" / "60% | Final exam (…)" (Boğaziçi)
  real_once_deger: { "Midterm exam": 40, "Final exam": 60 },
  // Boş şablon: "Etkinlik | Adet | Ağırlık (%)" altında "Vize | 1" — adet ağırlık değil (Ardahan)
  real_bos_sablon: {},
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
// Sınav öğeleri: telafi tarihi finale yazılmaz; cümle parçaları ("Your exam dates", "You must take…") öğe değil (İTÜ)
{
  const r = parseSyllabus(readFileSync(dir + "real_telafi.txt", "utf8"), new Date(2026, 8, 26));
  const bad = r.items.filter((x) => (/^final(?![- ]*make)/i.test(x.title) && x.date === "2027-01-20") || /^(your|you|exam$)/i.test(x.title));
  const ok = !bad.length && r.items.some((x) => /^final/i.test(x.title));
  ok ? pass++ : (fail++, console.log(`  ✗ real_telafi öğeler: ${r.items.map((x) => `${x.title}@${x.date || "?"}`).join(" | ")}`));
}
// Haftalık planda "8. | Ara Sınav": tarihsiz vize o haftaya bağlanır; "Final sınavına hazırlık" finalin haftası değil (ALKÜ)
{
  const r = parseSyllabus(readFileSync(dir + "real_hafta_sinav.txt", "utf8"), new Date(2026, 8, 26));
  const vize = r.items.find((x) => /ara sınav/i.test(x.title));
  const fin = r.items.find((x) => /final/i.test(x.title));
  const ok = vize?.week === 8 && !fin?.week;
  ok ? pass++ : (fail++, console.log(`  ✗ real_hafta_sinav öğeler: ${r.items.map((x) => `${x.title}@${x.date || "h" + x.week}`).join(" | ")}`));
}
console.log(`\ngerçek izlence not dağılımı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
