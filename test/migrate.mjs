// Veri göçü (migrate.js → toV2): eski kayıtlı veri bozulmadan yeni biçime geçiyor mu?
// Ölçü: GNO, dönem sonu GNO ve hedef hesabı göçten önce ve sonra aynı; hiçbir veri silinmiyor; iki kez çalışmıyor.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { normalize } = await import("../store.js");
const { toV2 } = await import("../migrate.js");
const { projection } = await import("../gpa.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const near = (a, b) => (a === null && b === null) || Math.abs(a - b) < 0.006;

// v2.10 öncesi bir profil: iki geçmiş dönem, bir ders tekrar alınıyor (MAT 101: önce D, şimdi tekrar)
const old = normalize({
  version: 1,
  profile: { name: "Eski" },
  courses: [
    { id: "c1", name: "Kalkülüs", code: "MAT 101", credit: 4, letter: "B" },
    { id: "c2", name: "Fizik", code: "FIZ 101", credit: 3, letter: "A-" },
  ],
  tasks: [{ id: "t1", title: "Vize", type: "sinav", due: "2026-11-10", courseId: "c1" }],
  transcript: [
    { year: 2025, season: "guz", code: "MAT 101", name: "Kalkülüs", credit: 4, grade: "D" },
    { year: 2025, season: "guz", code: "TUR 101", name: "Türkçe", credit: 2, grade: "A" },
    { year: 2025, season: "bahar", code: "ECO 101", name: "Ekonomi", credit: 3, grade: "B+" },
    { year: 2025, season: "bahar", code: "HIS 101", name: "Tarih", credit: 2, grade: "C" },
  ],
  settings: { termWeeks: 14 },
});

console.log("\nmigrate");
const before = projection(old);
const v2 = toV2(old);
const after = projection(v2);
ok(v2.version === 2, `version ${v2.version} ≠ 2`);
ok(v2.gpaBase && v2.gpaBase.credits === before.prev.credits && near(v2.gpaBase.gno, before.prev.avg), `gpaBase ${JSON.stringify(v2.gpaBase)} ≠ ${before.prev.credits}/${before.prev.avg}`);
ok(near(after.after, before.after), `dönem sonu GNO ${after.after} ≠ ${before.after}`);
ok(near(after.term.avg, before.term.avg), `YNO ${after.term.avg} ≠ ${before.term.avg}`);
ok(near(after.needed(3), before.needed(3)), `hedef 3.00 için ${after.needed(3)} ≠ ${before.needed(3)}`);
ok(v2.transcript.length === 0 && v2.archive.transcript.length === 4, `transkript arşivde değil: ${v2.transcript.length}/${v2.archive.transcript.length}`);
ok(v2.courses.find((c) => c.id === "c1").prevGrade === "D", "tekrar alınan dersin önceki notu yazılmadı");
ok(v2.tasks.length === 1 && v2.courses.length === 2 && v2.profile.name === "Eski", "göçte başka veri kayboldu");
// Kayıt → yeniden yükleme (normalize) sonrası sürüm ve arşiv korunuyor, ikinci göç bir şey değiştirmiyor
const reloaded = normalize(JSON.parse(JSON.stringify(v2)));
ok(reloaded.version === 2 && reloaded.archive.transcript.length === 4, "normalize sürümü/arşivi korumadı");
ok(JSON.stringify(toV2(reloaded)) === JSON.stringify(reloaded), "göç iki kez çalıştı");
// gpaBase zaten varsa ezilmez
const both = toV2(normalize({ ...JSON.parse(JSON.stringify(old)), gpaBase: { credits: 50, gno: 2.5 } }));
ok(both.gpaBase.credits === 50 && both.gpaBase.gno === 2.5, "var olan gpaBase ezildi");
// Transkripti olmayan profil: sadece sürüm artar
const plain = toV2(normalize({ profile: { name: "Yeni" }, courses: [], tasks: [] }));
ok(plain.version === 2 && plain.gpaBase === null && plain.archive.transcript.length === 0, "boş profilde göç bir şey üretti");

console.log(`\n${pass} doğru, ${fail} hata`);
if (fail) process.exit(1);
