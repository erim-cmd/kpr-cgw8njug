// Yedek al / yedekten yükle (settings.js "export" + "import" ile aynı yol):
//   yedek = JSON.stringify(store.get()) → dosya → JSON.parse → store.replace + runMigrations
// Tüm veri (dersler, görevler, devamsızlık, notlar, GNO, seçmeli adayları, ayarlar) kayıpsız geri gelmeli;
// eski sürümün yedeği yeni biçime geçmeli; bozuk dosya mevcut veriyi bozmamalı.
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const { store } = await import("../store.js");
const { runMigrations } = await import("../migrate.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

/** settings.js changes.import ile aynı adımlar (DOM'suz). */
function restore(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.courses) || !Array.isArray(data?.tasks)) throw new Error("biçim");
  const keepName = store.get().profile.name;
  store.replace(data);
  runMigrations();
  if (!store.get().profile.name) store.setName(keepName);
}

// Dolu bir hesap kur (uygulama açılışındaki gibi önce göç: app.js runMigrations)
runMigrations();
store.setName("Elif");
store.saveCourse({
  id: "c1", name: "Kalkülüs I", code: "MAT 1001", instructor: "Dr. Deneme Kişi", email: "deneme@ornek.edu.tr", office: "A 210",
  officeHours: "Salı 13:00–14:00", color: "#4CC9F0", credit: 4, ects: 6, letter: "B+", attendPct: 70, target: 75,
  sessions: [{ day: 0, start: "09:00", end: "10:50", room: "A-110" }],
  grading: [{ name: "Ara sınav", weight: 40, score: 72 }, { name: "Final", weight: 60, score: null }],
  policies: [{ kind: "devam", severity: "kritik", rule: "Derslerin en az %70'ine devam zorunlu.", consequence: "", source: "x" }],
});
store.addAbsence("c1", "2026-10-05", "09:00");
store.saveTask({ id: "t1", courseId: "c1", title: "Ödev 1", type: "odev", due: "2026-10-20", time: "23:59", note: "Moodle'a yükle", done: false });
store.saveTask({ id: "t2", courseId: "c1", title: "Ara sınav", type: "sinav", due: "2026-11-16", time: "10:00", done: true });
store.setBase({ credits: 64, gno: 3.05 });
store.setSettings({ termStart: "2026-09-21", termWeeks: 14, notifyClasses: true, interests: ["finans", "teknoloji"] });
store.saveElective({ name: "Türev Piyasaları", code: "FIN 4100", ects: 6, grading: [{ name: "Final", weight: 60 }], attendPct: null, absLimit: 8, absUnit: "saat", exams: 2, deadlines: 1, rules: [] });

const before = store.get();
const file = JSON.stringify(before, null, 2); // "İndir" ile inen dosya
ok(before.courses.length === 1 && before.tasks.length === 2 && before.electives.length === 1, "kurulum");

// 1) Hepsini sil, yedekten geri yükle: birebir aynı
store.reset();
ok(store.get().courses.length === 0 && !store.get().profile.name, "silindi");
restore(file);
ok(JSON.stringify(store.get()) === JSON.stringify(before), "yedekten yükleyince veri birebir aynı olmalı");
ok(store.get().courses[0].absences.length === 1 && store.get().courses[0].grading[0].score === 72, "devamsızlık ve not geri gelmeli");
ok(store.get().electives[0].absUnit === "saat" && store.get().settings.interests.length === 2, "seçmeli adayı ve ilgi alanları geri gelmeli");
// Kalıcı: localStorage'a da yazıldı (uygulama yeniden açılınca aynı veri)
ok(JSON.parse(mem["kpr:data:v1"]).tasks.length === 2, "geri yüklenen veri cihaza kaydedilmeli");

// 2) Eski sürümün yedeği (sürüm 1, ders ders geçmiş dönem): yeni biçime geçer, dersler kalır
const old = { version: 1, profile: { name: "" }, courses: [{ id: "c9", name: "Eski Ders", code: "OLD 101", sessions: [], color: "#4CC9F0" }], tasks: [], settings: {}, transcript: [{ id: "x", term: "2025-güz", courses: [{ code: "AAA 1", credit: 3, letter: "A" }] }] };
restore(JSON.stringify(old));
ok(store.get().version >= 2, `eski yedek yeni biçime geçmeli: sürüm ${store.get().version}`);
ok(store.get().courses[0]?.code === "OLD 101", "eski yedeğin dersleri gelmeli");
ok(store.get().profile.name === "Elif", "yedekte ad yoksa mevcut ad korunur");

// 3) Bozuk dosya: hata verir, mevcut veriye dokunmaz
restore(file);
const snap = JSON.stringify(store.get());
for (const bad of ["{bozuk", JSON.stringify({ foo: 1 }), JSON.stringify({ courses: "x", tasks: [] })]) {
  let threw = false;
  try { restore(bad); } catch { threw = true; }
  ok(threw && JSON.stringify(store.get()) === snap, `bozuk yedek reddedilmeli, veri değişmemeli: ${bad.slice(0, 20)}`);
}
// 4) Zararlı/aşırı alanlar normalize edilir (dışarıdan gelen veri doğrulanır)
restore(JSON.stringify({ ...JSON.parse(file), courses: [{ ...before.courses[0], name: "x".repeat(5000), credit: 999 }] }));
ok(store.get().courses[0].name.length <= 120 && store.get().courses[0].credit === null, `aşırı değerler kırpılmalı: ${store.get().courses[0].name.length} / ${store.get().courses[0].credit}`);

console.log(`\nyedek\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
