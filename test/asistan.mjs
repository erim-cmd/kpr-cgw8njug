// Asistan (internetsiz): test syllabus'larından çıkan her kırmızı bayrak için ilgili soruya
// doğru dersi ve syllabus'taki kaynak cümleyi veriyor mu? Bulamadığında uydurmuyor mu?
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { extractText } = await import("../doc-text.js");
const { parseSyllabus } = await import("../syllabus-local.js");
const { normalize } = await import("../store.js");
const { answer, NOT_FOUND } = await import("../asistan-core.js");

const dir = fileURLToPath(new URL("./syllabus/", import.meta.url));
const exp = JSON.parse(readFileSync(dir + "expected.json", "utf8"));
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

// Her örnekten bir ders (önce docx/txt, yoksa pdf): importer.js'in kaydettiği şekle yakın
const raw = [];
for (const name of Object.keys(exp)) {
  const ext = ["docx", "txt", "pdf"].find((e) => existsSync(dir + name + "." + e));
  const buf = readFileSync(dir + name + "." + ext);
  const { text } = await extractText({ name: name + "." + ext, type: "", arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  const r = parseSyllabus(text, new Date(2026, 8, 26));
  raw.push({
    id: name, name: r.course.name || name, code: r.course.code, instructor: r.course.instructor, email: r.course.email,
    office: r.course.office, officeHours: r.course.office_hours, credit: r.course.credit, ects: r.course.ects,
    grading: r.grading, policies: r.policies, attendPct: r.attendance.percent, absLimit: r.attendance.max_absences,
    sessions: r.sessions, weeks: r.weeks, finalMin: r.final_min,
  });
}
const state = normalize({ profile: { name: "Test" }, courses: raw, tasks: [], settings: { termWeeks: 14 } });
const byCode = new Map();
for (const c of state.courses) byCode.set(c.code, (byCode.get(c.code) || 0) + 1);

// Soru kalıpları (öğrencinin soracağı gibi); {d} yerine dersin kodu ya da adı gelir
const Q = {
  devam: "{d} dersinde yoklama var mı?",
  gec_teslim: "{d} geç teslim kabul mü?",
  telafi: "{d} sınavını kaçırırsam ne olur?",
  butunleme: "{d} bütünleme var mı?",
  baraj: "{d} final barajı var mı?",
  not_kurali: "{d} not kuralları neler, bağıl mı?",
  durustluk: "{d} dersinde yapay zeka kullanabilir miyim?",
  diger: "{d} sınava geç kalırsam ne olur?",
};

console.log("\nasistan · kırmızı bayraklar");
let flags = 0;
for (const c of state.courses) {
  const ref = c.code && byCode.get(c.code) === 1 ? c.code : c.name;
  for (const kind of [...new Set(c.policies.map((p) => p.kind))]) {
    const q = Q[kind].replace("{d}", ref);
    const a = answer(q, state);
    const want = c.policies.filter((p) => p.kind === kind);
    flags += want.length;
    ok(!a.chips, `${c.id} · ${kind}: "Hangi ders?" sordu (ders soruda geçiyordu)`);
    ok(a.source.startsWith(c.code || c.name) && a.source.includes("syllabus"), `${c.id} · ${kind}: kaynak "${a.source}"`);
    for (const p of want) ok(!p.source || a.text.includes(p.source), `${c.id} · ${kind}: kaynak cümle yok → ${p.source.slice(0, 60)}`);
  }
}
console.log(`  ${flags} kural, ${state.courses.length} ders`);

console.log("asistan · ders seçimi, bulamama, hesap");
// Ders adı geçmeyen ve birden çok derse uyan soru → "Hangi ders?"
const amb = answer("Yoklama var mı?", state);
ok(amb.chips && amb.chips.length > 1, `belirsiz soruda çip yok: ${amb.text}`);
// Çipten ders seçilince cevap o dersten
if (amb.chips) {
  const pickC = state.courses.find((c) => c.id === amb.chips[0].id);
  const a2 = answer("Yoklama var mı?", state, { courseId: pickC.id });
  ok(a2.source.startsWith(pickC.code || pickC.name), `çip seçiminden sonra yanlış ders: ${a2.source}`);
}
// Kapsam dışı / verisi olmayan soru → uydurma yok
ok(answer("Kayıt dondurma nasıl yapılır?", state).text === NOT_FOUND, "kapsam dışı soruya cevap uydurdu");
ok(answer("Yemekhane menüsü ne?", state).text === NOT_FOUND, "alakasız soruya cevap uydurdu");
// Kuralı olmayan derste o kural sorulursa: bulamadım (başka dersin kuralını vermez)
const noLate = state.courses.find((c) => c.code && byCode.get(c.code) === 1 && !c.policies.some((p) => p.kind === "gec_teslim"));
if (noLate) {
  const a = answer(`${noLate.code} geç teslim kabul mü?`, state);
  ok(/bulamadım/.test(a.text) && !a.source, `kuralı olmayan derste uydurdu: ${a.text.slice(0, 80)}`);
}
// Tarih sorusu görevlerden; hedef harf hesabı
const c0 = state.courses.find((c) => c.code === "MAT 1001") || state.courses[0];
const t = { ...state, tasks: [{ id: "t1", title: "Ara Sınav", type: "sinav", due: "2099-11-18", time: "10:00", courseId: c0.id, done: false }] };
const d = answer(`${c0.code || c0.name} sınavı ne zaman?`, t);
ok(/Ara Sınav/.test(d.text) && d.source.includes("görevlerin"), `tarih cevabı: ${d.text}`);
const graded = { ...state, courses: state.courses.map((c) => (c.id === c0.id ? { ...c, grading: [{ name: "Vize", weight: 40, score: 60 }, { name: "Final", weight: 60, score: null }], scale: [{ letter: "A", min: 90 }, { letter: "B", min: 75 }, { letter: "C", min: 60 }], targetLetter: "B" } : c)) };
const n = answer(`${c0.code || c0.name} finalden kaç almam lazım?`, graded);
ok(/Finalden en az 85/.test(n.text) && n.source.includes("hesaplama"), `hedef harf cevabı: ${n.text}`);
// Cevaplar düz metin: HTML etiketi yok
ok(!/<[a-z]/i.test(amb.text + d.text + n.text), "cevapta HTML var");

console.log(`\n${pass} doğru, ${fail} hata`);
if (fail) process.exit(1);
