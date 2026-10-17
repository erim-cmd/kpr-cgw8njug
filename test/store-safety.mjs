// Cihazdaki veri kaybolmasın (denetim, 17 Eki 2026):
//  1) iki sekme: biri ders ekler, eski durumdaki öteki kaydedince o ders silinmemeli
//  2) depo dolu (quota): hata sessizce yutulmamalı, uygulamaya haber verilmeli
//  3) bozuk kayıt: ilk yazışta silinmeden önce ham hâli ayrı anahtara kopyalanmalı
const mem = {};
let full = false;
globalThis.localStorage = {
  getItem: (k) => mem[k] ?? null,
  setItem: (k, v) => {
    if (full && k === "kpr:data:v1") throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    mem[k] = String(v);
  },
  removeItem: (k) => { delete mem[k]; },
};
const listeners = [];
globalThis.addEventListener = (type, fn) => listeners.push({ type, fn });

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const KEY = "kpr:data:v1";

// --- 3) bozuk kayıt (modül yüklenirken okunur, o yüzden önce)
mem[KEY] = '{"version":3,"courses":[{"id":"c1","name":"Kalkülüs"'; // yarım JSON
const n0 = listeners.length;
const A = (await import("../store.js?a")).store;
const listenA = listeners.slice(n0).find((l) => l.type === "storage")?.fn;
const corrupt = Object.keys(mem).filter((k) => k.startsWith("kpr:data:corrupt"));
ok(corrupt.length === 1 && mem[corrupt[0]].includes("Kalkülüs"), "bozuk kayıt ayrı anahtara kopyalanmalı");
A.setName("Elif");
ok(mem[corrupt[0]]?.includes("Kalkülüs"), "ilk yazıştan sonra da bozuk kaydın kopyası durmalı");

// --- 1) iki sekme
const n1 = listeners.length;
const B = (await import("../store.js?b")).store;
const listenB = listeners.slice(n1).find((l) => l.type === "storage")?.fn;
ok(typeof listenA === "function" && typeof listenB === "function", "her sekme storage olayını dinlemeli");
const course = (id, name) => ({ id, name, code: id.toUpperCase(), color: "#4CC9F0", sessions: [], grading: [] });
A.saveCourse(course("c1", "Fizik"));
listenB?.({ key: KEY, newValue: mem[KEY] }); // tarayıcı öteki sekmeye haber verir
A.saveCourse(course("c2", "Kimya"));
listenB?.({ key: KEY, newValue: mem[KEY] });
B.saveTask({ id: "t1", courseId: "c1", title: "Ödev", type: "odev", due: "2026-10-20", done: false });
const saved = JSON.parse(mem[KEY]);
ok(saved.courses.map((c) => c.name).join(",") === "Fizik,Kimya", `öteki sekmenin eklediği ders silinmemeli: ${saved.courses.map((c) => c.name)}`);
ok(saved.tasks.length === 1, "yeni görev de kaydedilmeli");
let drew = 0;
const off = B.subscribe(() => drew++);
listenB?.({ key: "baska-anahtar", newValue: "x" });
ok(drew === 0, "başka anahtarın olayı yeniden çizmemeli");
listenB?.({ key: KEY, newValue: null }); // öteki sekmede "Her şeyi sil"
ok(drew === 1 && B.get().courses.length === 0, "öteki sekmede silinince bu sekme de boşalmalı");
listenB?.({ key: KEY, newValue: "{bozuk" });
ok(B.get().courses.length === 0 && drew === 1, "okunamayan olay durumu bozmamalı");
off();

// --- 2) depo dolu
let err = null;
A.onSaveError((e) => (err = e));
full = true;
A.saveCourse(course("c3", "Biyoloji"));
ok(err && err.name === "QuotaExceededError", "kaydedilemeyince uygulamaya haber verilmeli");
full = false;
err = null;
A.saveCourse(course("c4", "Tarih"));
ok(err === null && JSON.parse(mem[KEY]).courses.some((c) => c.name === "Biyoloji"), "yer açılınca bekleyen veri de yazılmalı");

console.log(`\ncihazdaki veri (sekmeler, dolu depo, bozuk kayıt)\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
