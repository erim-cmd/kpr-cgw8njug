// GNO tahmini (gpa.js projection) — tekrar alınan ders.
// Yönetmelik: tekrarlanan derste, önceki not ne olursa olsun, SON not geçerli; GNO'ya yalnız son not girer
// (BAU Ön Lisans ve Lisans Eğitim-Öğretim Yönetmeliği; 2008 metni Md. 16/1 ve 19/2, gpa.js başlığı Md. 28).
// UMIS'teki GNO + kredi eski notu zaten içerir: tekrar alınan dersin eski puanı ve kredisi çıkarılıp yenisi eklenir.
// Arayüz (17 Eki 2026): önceki not yalnız öğrenci "Bu dersi tekrar alıyorum" derse sorulur (harf penceresinde);
// varsayılan ilk kez alma, hesap eskisiyle aynı.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { projection, COEF } = await import("../gpa.js");
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const r2 = (x) => Math.round(x * 100) / 100;
const base = { credits: 60, gno: 2.5 };
const courses = [{ id: "a", credit: 3, letter: "C+" }, { id: "b", credit: 4, letter: "B" }];
const P = (cs, gpaBase = base, transcript = []) => projection({ transcript, courses: cs, gpaBase });
const withPrev = (prev, letter = "C+") => courses.map((c) => (c.id === "a" ? { ...c, prevGrade: prev, letter } : c));

// 1) Tekrar yoksa: GNO + kredi üzerine bu dönem (eski davranış aynı)
const p1 = P(courses);
ok(p1.after === r2((2.5 * 60 + 2.33 * 3 + 3.0 * 4) / 67), `ilk kez: ${p1.after}`);

// 2) F'den tekrar: eski F (3 kredi × 0) çıkar, yeni C+ girer; kredi iki kez sayılmaz (60 + 4 = 64, 67 değil)
const p2 = P(withPrev("F"));
const want2 = r2((2.5 * 60 - 3 * COEF.F + 2.33 * 3 + 3.0 * 4) / (60 - 3 + 3 + 4));
ok(p2.after === want2, `F → C+: ${p2.after} ≠ ${want2}`);
ok(p2.after > p1.after, "F'den tekrar GNO'yu ilk kez almaktan daha çok yükseltir (kredi iki kez sayılmaz)");
ok(p2.retakes === 1, `tekrar sayısı: ${p2.retakes}`);

// 3) Not yükseltme: eski D (1,00) → yeni C+; eski puan düşülür
const p3 = P(withPrev("D"));
ok(p3.after === r2((2.5 * 60 - 3 * 1 + 2.33 * 3 + 12) / 64), `D → C+: ${p3.after}`);

// 4) Son not daha düşük olsa da geçerli (önceki not ne olursa olsun): C → D
const p4 = P(withPrev("C", "D"));
ok(p4.after === r2((2.5 * 60 - 3 * 2 + 3 * 1 + 12) / 64), `C → D (son not geçerli): ${p4.after}`);

// 5) Yeni harf henüz seçilmediyse eski not GNO'da kalır; hedef hesabı ise yeni notun yerine geçeceğini varsayar
const p5 = P(withPrev("F", ""));
ok(p5.after === r2((2.5 * 60 + 12) / 64), `yeni harf yok → eski not yerinde: ${p5.after}`);
const need5 = p5.needed(3);
ok(Math.abs(need5 - (3 * (60 - 3 + 7) - (2.5 * 60 - 0)) / 7) < 1e-9, `hedef: eski kredi düşülür: ${need5}`);

// 6) Yeni not ortalamaya girmiyorsa (W) eski not korunur
const p6 = P(withPrev("D", "W"));
ok(p6.after === r2((2.5 * 60 + 12) / 64) && p6.retakes === 0, `W → eski not kalır: ${p6.after}`);

// 7) Önceki not ortalamaya girmeyen bir notsa (W, S) düşülecek bir şey yok
ok(P(withPrev("W")).after === p1.after, "önceki not W: ilk kez gibi");

// 8) Bozuk giriş: eski kredi tabandan büyük olamaz (eksi krediye düşmez)
const p8 = P(withPrev("F"), { credits: 2, gno: 0 });
ok(p8.after !== null && p8.after >= 0 && p8.after <= 4, `taban kredisi küçük: ${p8.after}`);

// 9) GNO girilmemişse (taban yok) önceki not hesabı etkilemez
ok(P(withPrev("F"), null).after === P(courses, null).after, "taban yokken önceki not etkisiz");

// 10) Ders ders transkript varken eşleşme koddan yapılır; prevGrade ikinci kez düşülmez
const tr = [{ year: 2025, season: "guz", code: "MAT 1001", credit: 3, grade: "F" }, { year: 2025, season: "guz", code: "FIZ 1001", credit: 4, grade: "B" }];
const tc = [{ id: "a", code: "MAT 1001", credit: 3, letter: "C+", prevGrade: "F" }];
const p10 = P(tc, null, tr);
ok(p10.after === r2((4 * 3 + 3 * 2.33) / 7), `transkript: ${p10.after}`);

console.log(`\nGNO (tekrar alınan ders: son not geçerli)\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
