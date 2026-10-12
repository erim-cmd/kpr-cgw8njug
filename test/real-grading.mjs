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
  // v2.27.3 — tıp kurulu içindeki not tablosu (yalnız tam 100 ederse; Medipol, Muğla, SDÜ):
  // kurul başına sütunlu "Yazılı %90 %75 … / Uygulama %10 %25 … / Toplam %100 …" → ilk kurulun sütunu (uyarıyla)
  real_kurul_sutun: { Yazılı: 90, Uygulama: 10 },
  // "Ders Kurulu Etkinlikleri | Adet | Değer (%)": "Yok 0" satırları bileşen değil; ad üst satırda, açıklama altta
  real_kurul_deger: { "Mesleki Beceri Uygulama Sınavı": 15, "Ders Kurul yazılı sınavı (Çoktan seçmeli)": 85 },
  // Aralık ("8-10", "80-82") ağırlık değil; orta nokta uydurulmaz → hiç getirilmez
  real_kurul_aralik: {},
  // Formül cümlesi "(KBU notu x %10) + (kurul sonu sınavı x %90)"; "Örneğin … (%75) … %15" okunmaz
  real_kurul_formul: { KBU: 10, "Kurul sonu sınavı": 90 },
  // Puanla verilen not: "Total 400 points" satırı toplamı doğruluyorsa yüzdeye çevrilir
  real_puan: { Homework: 12.5, Quizzes: 12.5, "Midterm Exam": 25, "Final Exam": 50 },
  // Çok sütunlu ağırlık tablosunda "Term Grade" sütunu; "Ex." ile başlayan örnek tablolar ve puan satırları okunmaz (Esenyurt)
  real_ornek_tablo: { "Mid-Term": 30, "Final Exam": 70 },
  // İki satıra bölünmüş cümle (arada sol sütun etiketi): "…total of midterm exam / Course / (%35), presentation…" (Toros güz)
  real_cumle_bolunmus: { "Midterm exam": 35, "Presentation and weekly homeworks": 15, "Final exam": 50 },
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
// Tıp ders kurulu rehberi (kurul.js): ızgara/örnek yüzdelerden not uydurma yok; takvim tablosundan kurul
// sınavları; genel adlı sınava kurul başlığı; yıl sonu sınavına kurul etiketi yok (Medipol, Sakarya, Muğla)
{
  const r = parseSyllabus(readFileSync(dir + "real_tip_kurul.txt", "utf8"), new Date(2026, 8, 26));
  const has = (t, d) => r.items.some((x) => x.title === t && x.date === d);
  const ok = !r.grading.length &&
    has("Hekimliğe Giriş kurul sınavı", "2023-11-04") && has("Molekülden Hücreye kurul sınavı", "2023-12-16") &&
    has("I. Kurul · Teorik Sınav", "2023-10-16") && has("II. Kurul · Teorik Sınav", "2023-11-27") &&
    !r.items.some((x) => /kurul ·.*yıl sonu/i.test(x.title)) && r.warnings.some((w) => /ders kurulu rehberi/.test(w));
  ok ? pass++ : (fail++, console.log(`  ✗ real_tip_kurul: not ${JSON.stringify(r.grading.map((g) => g.weight))} · ${r.items.map((x) => `${x.title}@${x.date}`).join(" | ")}`));
}
// Kurul sütun tablosu: hangi kurulun oranı getirildiği söylenir (kurul başına farklı)
{
  const r = parseSyllabus(readFileSync(dir + "real_kurul_sutun.txt", "utf8"), new Date(2026, 8, 26));
  const ok = r.warnings.some((w) => /kurula göre değişiyor/.test(w) && /ilk kurul/.test(w));
  ok ? pass++ : (fail++, console.log(`  ✗ real_kurul_sutun uyarı: ${r.warnings.join(" | ")}`));
}
// Haftalık ızgarada sınav hücresi (Gazi, Demiroğlu): sütunu belli olan hücre o günün tarihiyle sınav;
// boş hücreleri düşmüş satırda gün belli değil → tarih uydurulmaz, tarihsiz öğe + hafta aralığı başlıkta
{
  const r = parseSyllabus(readFileSync(dir + "real_kurul_izgara.txt", "utf8"), new Date(2026, 8, 26));
  const at = (re, d) => r.items.filter((x) => re.test(x.title) && x.date === d).length;
  const undated = (re) => r.items.filter((x) => re.test(x.title) && !x.date && !x.week && /10–14 Kasım/.test(x.title)).length;
  const ok = at(/^Teorik Sınav$/, "2025-11-07") === 1 && at(/^Pratik Sınavı$/, "2025-11-05") === 1 &&
    undated(/^Teorik Sınav/) === 1 && undated(/^Uygulama Sınavı/) === 1 &&
    !r.items.some((x) => x.date >= "2025-11-10" && x.date <= "2025-11-14") && !r.items.some((x) => /tartışma|serbest/i.test(x.title));
  ok ? pass++ : (fail++, console.log(`  ✗ real_kurul_izgara öğeler: ${r.items.map((x) => `${x.title}@${x.date || "?"}`).join(" | ")}`));
}

console.log(`\ngerçek izlence not dağılımı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
