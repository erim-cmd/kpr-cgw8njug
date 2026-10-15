// Önce cihaz, tutmazsa yapay zekâ (15 Eki 2026):
//   1) needsHelp: not toplamı 100 değilse / bileşen yoksa / tarihsiz-haftasız sınav varsa yardım ister.
//   2) Sunucu (functions/api/syllabus.js): metinle okur; aynı metin ikinci kez Claude'a gitmez (ortak önbellek),
//      önbellekte hoca iletişim bilgisi yok, önbellekten dönen okuma günlük hakkı harcamaz;
//      aylık harcama sınırı dolunca Claude çağrılmaz. Gerçek API çağrısı yok (sahte fetch).
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { documentElement: { lang: "tr", dataset: {}, style: { setProperty() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) };
Object.defineProperty(globalThis, "location", { value: { hostname: "kopru.example" }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { onLine: true, userAgent: "node" }, configurable: true });

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

// 1) needsHelp
const { needsHelp } = await import("../importer.js");
const g = (...w) => w.map((weight, i) => ({ name: "B" + i, weight }));
ok(needsHelp({ grading: g(40, 60), items: [{ type: "sinav", date: "2026-11-10" }] }).length === 0, "tutarlı okuma yardım istememeli");
ok(needsHelp({ grading: g(40, 60, 42, 42), items: [] }).includes("weights"), "toplam 184 → weights");
ok(needsHelp({ grading: [], items: [] }).includes("weights"), "bileşen yok → weights");
ok(needsHelp({ grading: [...g(40, 60), { name: "Bonus", weight: 5, bonus: true }], items: [] }).length === 0, "bonus toplamı bozmaz");
ok(needsHelp({ grading: g(40, 60), items: [{ type: "sinav", date: "", week: null }] }).includes("dates"), "tarihsiz sınav → dates");
ok(!needsHelp({ grading: g(40, 60), items: [{ type: "sinav", date: "", week: 8 }] }).includes("dates"), "haftası olan sınav yeterli");
ok(!needsHelp({ grading: g(40, 60), items: [{ type: "odev", date: "" }] }).includes("dates"), "tarihsiz ödev yardım istetmez");

// 2) Sunucu
const api = await import("../functions/api/syllabus.js");
const kv = () => {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } };
};
const modelOut = {
  course: { name: "Veri Yapıları", code: "CENG 213", instructor: "Dr. Örnek", email: "ornek@uni.edu.tr", office: "A-1", office_hours: "Salı 10:00–12:00", credit: 3, ects: 6 },
  sessions: [], items: [{ type: "sinav", title: "Vize", date: "2026-11-20", time: "", week: null, source: "Midterm Nov 20" }],
  weeks: [], grading: [{ name: "Vize", weight: 40, bonus: false }, { name: "Final", weight: 60, bonus: false }],
  attendance: { percent: 70, max_absences: null, source: "" }, final_min: null, policies: [], warnings: [],
};
let calls = 0;
globalThis.fetch = async (url, opts) => {
  calls++;
  const body = JSON.parse(opts.body);
  const sent = body.messages[0].content[0];
  ok(sent.type === "text" && sent.text.includes("Midterm"), "metin yolu: Claude'a metin bloğu gitmeli");
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(modelOut) }], stop_reason: "end_turn", usage: { input_tokens: 4000, output_tokens: 1500 } }) };
};
const req = (payload, ip = "1.2.3.4") => ({ json: async () => payload, headers: { get: (k) => (k === "cf-connecting-ip" ? ip : null) } });
const text = "CENG 213 Data Structures. Midterm Nov 20 (40%). Final (60%). Attendance 70% required. ".repeat(3);
const env = { ANTHROPIC_API_KEY: "test", KPR_LIMITS: kv() };

let res = await api.onRequestPost({ request: req({ text }), env });
let out = await res.json();
ok(res.status === 200 && out.result?.course?.code === "CENG 213", `metinle okuma çalışmalı: ${res.status} ${JSON.stringify(out).slice(0, 120)}`);
ok(out.result.course.instructor === "Dr. Örnek", "ilk okuyan öğrenci hoca bilgisini alır");
ok(calls === 1, "ilk okumada bir çağrı");
const cached = [...env.KPR_LIMITS.m.entries()].find(([k]) => k.startsWith("c:"));
ok(!!cached, "sonuç ortak önbelleğe yazılmalı");
ok(cached && !cached[1].includes("ornek@uni.edu.tr") && !cached[1].includes("Dr. Örnek"), "önbellekte hoca adı/e-postası olmamalı");
ok(cached && !cached[1].includes("Attendance 70% required. CENG"), "önbellekte syllabus metni olmamalı");
const spentKey = [...env.KPR_LIMITS.m.keys()].find((k) => k.startsWith("b:"));
ok(spentKey && Number(env.KPR_LIMITS.m.get(spentKey)) === 4000 * 2 + 1500 * 10, "harcama sayacı token sayısından (milyonda bir $)");
const dayKeys = () => [...env.KPR_LIMITS.m.keys()].filter((k) => k.startsWith("rl:"));
const dayCount = () => Number(env.KPR_LIMITS.m.get(dayKeys()[0]));

res = await api.onRequestPost({ request: req({ text }, "5.6.7.8"), env });
out = await res.json();
ok(res.status === 200 && out.cached === true, "aynı metin önbellekten dönmeli");
ok(calls === 1, "önbellek isabetinde Claude çağrılmamalı");
ok(out.result.course.instructor === "", "önbellekten dönen sonuçta hoca adı boş (cihaz okuması doldurur)");
ok(dayKeys().length === 1 && dayCount() === 1, "önbellek isabeti günlük hakkı harcamamalı");

// Aylık sınır: dolunca Claude'a gitmeden 503
const env2 = { ANTHROPIC_API_KEY: "test", KPR_LIMITS: kv(), KPR_MONTHLY_BUDGET_USD: "1" };
await env2.KPR_LIMITS.put(`b:${new Date().toISOString().slice(0, 7)}`, String(1_000_000));
res = await api.onRequestPost({ request: req({ text: text + " başka" }), env: env2 });
ok(res.status === 503 && calls === 1, `aylık sınır dolunca 503 ve çağrı yok: ${res.status}`);
ok((await api.overBudget({ KPR_LIMITS: kv() })) === false, "boş sayaç sınırı aşmaz");
ok((await api.overBudget({})) === false, "KV yoksa sınır yok (yerel geliştirme)");

// Girdi denetimleri
res = await api.onRequestPost({ request: req({ text: "kısa" }), env: { ANTHROPIC_API_KEY: "test" } });
ok(res.status === 400, "çok kısa metin 400");
res = await api.onRequestPost({ request: req({ text: "x".repeat(300_001) }), env: { ANTHROPIC_API_KEY: "test" } });
ok(res.status === 413, "çok uzun metin 413");
ok(api.shareable(modelOut).course.email === "" && api.shareable(modelOut).course.code === "CENG 213", "shareable yalnız iletişim bilgisini siler");

console.log(`\nönce cihaz, tutmazsa yapay zekâ\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
