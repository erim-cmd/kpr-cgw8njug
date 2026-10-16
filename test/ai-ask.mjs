// Yapay zekâ: Asistan (functions/api/ask.js + asistan-core buildContext), Seçmeli eşleştirme (functions/api/electives.js),
// iOS için CORS (functions/api/_middleware.js). Gerçek API çağrılmaz; fetch sahte cevap verir (CLAUDE.md).
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const kv = () => {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } };
};
const req = (payload, ip = "1.2.3.4", headers = {}) => ({ method: "POST", json: async () => payload, headers: { get: (k) => (k === "cf-connecting-ip" ? ip : headers[k] ?? null) } });

/* 1) Bağlam: gönderilenler ve gönderilmeyenler */
console.log("\nasistan bağlamı");
const { normalize } = await import("../store.js");
const { buildContext, answer, CONTEXT_MAX } = await import("../asistan-core.js");
const state = normalize({
  profile: { name: "Deniz Gizli" },
  courses: [{
    id: "c1", name: "Devre Analizi", code: "MCH 2016", instructor: "Dr. Örnek", email: "ornek@uni.edu.tr", credit: 3,
    grading: [{ name: "Vize", weight: 40, score: 77 }, { name: "Final", weight: 60, score: null }],
    absences: [{ id: "a1", date: "2026-10-01", start: "09:00" }], prevGrade: "C", targetLetter: "A",
    policies: [{ id: "p1", kind: "telafi", severity: "kritik", rule: "Mazeret sınavı yok.", consequence: "", source: "No make-up exams." }],
    weeks: Array.from({ length: 14 }, (_, i) => ({ n: i + 1, date: null, topic: `Konu ${i + 1} `.repeat(30), note: null })),
    sessions: [{ day: 0, start: "09:00", end: "10:50", room: "D301" }],
  }, { id: "c2", name: "Kalkülüs", code: "MAT 1001", grading: [] }],
  tasks: [{ id: "t1", courseId: "c1", title: "Ödev 2", type: "odev", due: "2026-11-01", time: "", done: false }],
}, true);
const b = buildContext("MCH 2016 laboratuvar raporu kaç sayfa?", state);
ok(b && b.label === "MCH 2016", `ders seçildi: ${b?.label}`);
ok(b.context.length <= CONTEXT_MAX, `bağlam sınırı: ${b.context.length}`);
const ctx = JSON.parse(b.context);
ok(ctx.course.code === "MCH 2016" && ctx.course.rules[0].rule === "Mazeret sınavı yok.", "kurallar gider");
ok(ctx.upcoming[0].title === "Ödev 2", "yaklaşan işler gider");
ok(!b.context.includes("77") && !b.context.includes("Deniz") && !b.context.includes("2026-10-01") && !/"prevGrade"|"targetLetter"|"score"/.test(b.context), "not, ad, devamsızlık, hedef gitmez");
// Syllabus metninden soruyla ilgili paragraf (özette olmayan bilgi: rapor sayfa sınırı)
const filler = Array.from({ length: 60 }, (_, i) => `Hafta ${i + 1}: Thevenin ve Norton eşdeğer devreleri üzerine konu anlatımı ve problem çözümü.`).join("\n");
const withText = normalize({ profile: { name: "x" }, tasks: [], courses: [
  { id: "c1", name: "Devre Analizi", code: "MCH 2016", text: filler + "\nLaboratuvar raporu en fazla 5 sayfa olmalıdır ve deneyden bir hafta sonra teslim edilir.\n" + filler },
  { id: "c2", name: "Kalkülüs", code: "MAT 1001", text: "Ödevler haftalık verilir. Limit ve türev konuları işlenir.\n".repeat(20) },
] }, true);
const ex = buildContext("Laboratuvar raporu kaç sayfa olmalı?", withText);
const exData = JSON.parse(ex.context);
ok(ex.label === "MCH 2016", `ders adı geçmeden de metinden doğru ders bulunur: ${ex.label}`);
ok(exData.syllabusExcerpts.some((x) => x.includes("en fazla 5 sayfa")), "ilgili paragraf bağlamda");
ok(ex.context.length <= CONTEXT_MAX && !exData.syllabusExcerpts.some((x) => x.includes("Limit ve türev")), `sınır içinde ve alakasız ders yok: ${ex.context.length}`);
const en = normalize({ profile: { name: "x" }, tasks: [], courses: [{ id: "g", name: "Critical Thinking", code: "GEP 1615",
  text: filler + "\nLearning Outcomes: Students will be able to evaluate arguments and write evidence-based essays.\n" + filler + "\nThe final report must not exceed 2000 words.\n" + filler }] }, true);
const enOut = JSON.parse(buildContext("Bu dersi bitince hangi özellikleri kazanırım?", en).context).syllabusExcerpts;
ok(enOut.some((x) => x.includes("Learning Outcomes")), "Türkçe soru → İngilizce 'Learning Outcomes' paragrafı");
const enRep = JSON.parse(buildContext("Bu dersin raporu kaç kelime olmalı?", en).context).syllabusExcerpts;
ok(enRep.some((x) => x.includes("2000 words")), "rapor/kelime → report/words");
const none = JSON.parse(buildContext("zzz qqq", en).context).syllabusExcerpts;
ok(none.length > 0, "eşleşme yoksa syllabus'un başı gider");
const short = normalize({ profile: { name: "x" }, tasks: [], courses: [{ id: "a", name: "Algı Yönetimi", code: "GEP 1615" }, { id: "b", name: "Kalkülüs", code: "MAT 1001" }] }, true);
const sb = buildContext("Algı dersinde ne kazanıyorum", short);
ok(sb.label === "GEP 1615" && sb.noText === true && sb.courseId === "a", `4 harfli ad + metin yok bildirimi: ${sb.label} ${sb.noText}`);
const many = buildContext("bu dönem en zor ders hangisi?", state);
ok(many && Array.isArray(JSON.parse(many.context).courses), "ders belli değilse kısa ders listesi");
ok(answer("laboratuvar raporu kaç sayfa olmalı", state).missing === true, "cihazda cevap yoksa missing");
ok(!answer("MCH 2016 mazeret sınavı var mı", state).missing, "cihazda cevap varsa missing yok");

/* 2) /api/ask */
console.log("\n/api/ask");
const ask = await import("../functions/api/ask.js");
let calls = 0, lastBody = null;
globalThis.fetch = async (_url, opts) => {
  calls++;
  lastBody = JSON.parse(opts.body);
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", name: "cevap", input: { found: true, answer: "Rapor en fazla 5 sayfa.", source: "rules[2]" } }], usage: { input_tokens: 1500, output_tokens: 60 } }) };
};
const env = { ANTHROPIC_API_KEY: "test", KPR_LIMITS: kv() };
let res = await ask.onRequestPost({ request: req({ question: "Rapor kaç sayfa?", context: b.context, lang: "tr" }), env });
let out = await res.json();
ok(res.status === 200 && out.answer === "Rapor en fazla 5 sayfa." && out.found === true, `cevap: ${res.status} ${JSON.stringify(out)}`);
ok(lastBody.model === "claude-haiku-5-5" && lastBody.max_tokens <= 400 && lastBody.tool_choice?.name === "cevap", "Haiku, kısa cevap, zorunlu araç");
ok(lastBody.messages[0].content[0].text.includes("<context>"), "bağlam etiketli gider");
res = await ask.onRequestPost({ request: req({ question: "Rapor kaç sayfa?", context: b.context, lang: "tr" }), env });
out = await res.json();
ok(calls === 1 && out.cached === true, "aynı soru + bağlam önbellekten (token yok)");
ok([...env.KPR_LIMITS.m.keys()].some((k) => k.startsWith("b:")), "aylık harcama sayacı işledi");
for (let i = 0; i < ask.DAILY_LIMIT; i++) await ask.onRequestPost({ request: req({ question: `Soru numarası ${i}`, context: b.context }, "9.9.9.9"), env });
res = await ask.onRequestPost({ request: req({ question: "bir soru daha", context: b.context }, "9.9.9.9"), env });
ok(res.status === 429, `günlük sınır ${ask.DAILY_LIMIT}: ${res.status}`);
res = await ask.onRequestPost({ request: req({ question: "x", context: b.context }), env });
ok(res.status === 400, "çok kısa soru reddedilir");
res = await ask.onRequestPost({ request: req({ question: "Rapor?", context: "" }), env });
ok(res.status === 400, "bağlamsız soru reddedilir");
res = await ask.onRequestPost({ request: req({ question: "Rapor kaç sayfa?", context: b.context }), env: { KPR_LIMITS: kv() } });
ok(res.status === 503, "anahtar yoksa 503");
ok((await (await ask.onRequestGet({ env })).json()).ready === true, "GET ready");

/* 3) /api/electives */
console.log("\n/api/electives");
const el = await import("../functions/api/electives.js");
const list = "SEÇMELİ DERSLER\nENT 3101 Girişimcilik ve İnovasyon — Yeni ürün fikirlerini iş modeline dönüştürme.\nDAT 2201 Veri Görselleştirme — Veriyle hikâye anlatma, grafik tasarımı.\nHIS 1101 Sanat Tarihi — Rönesans'tan modern sanata.\n".repeat(2);
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", input: { courses: [
  { code: "ENT 3101", name: "Girişimcilik ve İnovasyon", fit: 92, reason: "Girişimcilik ilgine uyuyor.", quote: "Yeni ürün fikirlerini iş modeline dönüştürme" },
  { code: "DAT 2201", name: "Veri Görselleştirme", fit: 81, reason: "Veriyle çalışmayı seviyorsun.", quote: "uydurulmuş bir alıntı" },
  { code: "XYZ 9999", name: "Hayali Ders", fit: 99, reason: "Uydurma.", quote: "" },
  { code: "HIS 1101", name: "Sanat Tarihi", fit: 20, reason: "Zayıf.", quote: "" },
] } }], usage: { input_tokens: 900, output_tokens: 200 } }) });
const env2 = { ANTHROPIC_API_KEY: "test", KPR_LIMITS: kv() };
res = await el.onRequestPost({ request: req({ text: list, interests: ["Girişimcilik", "Veri/Analitik"] }), env: env2 });
out = await res.json();
ok(res.status === 200 && out.courses.length === 2, `2 öneri kalmalı: ${JSON.stringify(out).slice(0, 200)}`);
ok(out.courses[0].code === "ENT 3101" && out.courses[0].quote, "belgede geçen alıntı kalır");
ok(out.courses[1].code === "DAT 2201" && out.courses[1].quote === "", "belgede geçmeyen alıntı boşaltılır");
ok(!out.courses.some((c) => c.code === "XYZ 9999"), "belgede olmayan ders atılır");
ok(!out.courses.some((c) => c.code === "HIS 1101"), "uyumu 40'ın altındaki atılır");
res = await el.onRequestPost({ request: req({ text: list, interests: [] }), env: env2 });
ok(res.status === 400, "ilgi alanı yoksa 400");

/* 4) CORS (iOS uygulaması) */
console.log("\nCORS");
const mw = await import("../functions/api/_middleware.js");
const next = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
const r1 = await mw.onRequest({ request: { method: "OPTIONS", headers: new Headers({ origin: "capacitor://localhost" }) }, next });
ok(r1.status === 204 && r1.headers.get("access-control-allow-origin") === "capacitor://localhost", "uygulama kökenine ön istek izni");
const r2 = await mw.onRequest({ request: { method: "POST", headers: new Headers({ origin: "https://kotu.example" }) }, next });
ok(!r2.headers.get("access-control-allow-origin"), "başka köken izin almaz");
const r3 = await mw.onRequest({ request: { method: "POST", headers: new Headers({ origin: "capacitor://localhost" }) }, next });
ok(r3.headers.get("access-control-allow-origin") === "capacitor://localhost", "uygulama cevabı okuyabilir");

/* 5) İstemci adresi */
const api = await import("../api.js");
ok(api.apiUrl("api/ask") === "api/ask", "web: göreli adres");
globalThis.Capacitor = { isNativePlatform: () => true };
ok(api.apiUrl("api/ask") === `${api.SERVER}/api/ask`, "iOS: tam adres");
delete globalThis.Capacitor;

/* 5b) Günlük sınır cihaz başına; aynı IP (kampüs) için üst tavan */
const shared = await import("../server/ai-shared.js");
const env3 = { KPR_LIMITS: kv() };
const dreq = (dev, ip = "10.0.0.1") => ({ headers: { get: (k) => (k === "cf-connecting-ip" ? ip : k === "x-kpr-device" ? dev : null) } });
let blocked = false;
for (let i = 0; i < 5; i++) blocked ||= await shared.overLimit(dreq("aaaaaaaa-1111-2222-3333-444444444444"), env3, "rl", 5);
ok(!blocked && (await shared.overLimit(dreq("aaaaaaaa-1111-2222-3333-444444444444"), env3, "rl", 5)) === true, "cihaz kendi 5 hakkını kullanınca durur");
ok((await shared.overLimit(dreq("bbbbbbbb-1111-2222-3333-444444444444"), env3, "rl", 5)) === false, "aynı IP'deki başka cihazın hakkı ayrı");
let capHit = false;
for (let i = 0; i < 200 && !capHit; i++) capHit = await shared.overLimit(dreq(`cccccccc-0000-0000-0000-${String(i).padStart(12, "0")}`), env3, "rl", 5);
ok(capHit, "kimlik değiştirerek sınırsız kullanım yok: IP üst tavanı (5 × 30)");
ok(![...env3.KPR_LIMITS.m.keys()].some((k) => k.includes("10.0.0.1") || k.includes("aaaaaaaa")), "IP ve cihaz kimliği açık yazılmaz");
ok((await shared.overLimit(dreq("kisa"), { KPR_LIMITS: kv() }, "rl", 5)) === false, "geçersiz kimlik: IP'ye göre sayılır");

/* 6) Seçmeli: sınav çakışması */
const { examClashes } = await import("../secmeli.js");
const cand = { examDates: [{ date: "2026-11-18", title: "Midterm" }, { date: "2026-12-01", title: "Quiz" }] };
const mineTasks = [{ courseId: "c1", type: "sinav", title: "Vize", due: "2026-11-18", done: false }, { courseId: "c1", type: "odev", title: "Ödev", due: "2026-12-01", done: false }];
const cl = examClashes(cand, mineTasks, [{ id: "c1", code: "MCH 2016" }]);
ok(cl.length === 1 && cl[0].with === "MCH 2016 Vize", `aynı gün sınav çakışması: ${JSON.stringify(cl)}`);
ok(examClashes({ examDates: [] }, mineTasks, []).length === 0, "tarihsiz adayda çakışma yok");

console.log(`\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
