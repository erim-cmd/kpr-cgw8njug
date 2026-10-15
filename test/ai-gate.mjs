// Önce cihaz, tutmazsa yapay zekâ (15 Eki 2026): yapay zekâ ile okuma kendiliğinden çalışmaz.
//   - settings.aiReading false (ya da bozuk) ise sunucu hiç sorulmaz, hiçbir şey gönderilmez.
//   - Açıkken bile seçme ekranında rıza kutusu yok; öneri kontrol ekranında, okuma eksikse ve rıza işaretlenince.
// Varsayılan açık (öneri görünsün diye); alan yoksa açık, açıkça false ya da bozuk değer kapalı (store.js normalize).
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { documentElement: { lang: "tr", dataset: {}, style: { setProperty() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) };
Object.defineProperty(globalThis, "location", { value: { hostname: "kopru.example" }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { onLine: true, userAgent: "node" }, configurable: true });
// Sahte sunucu: her istekte "hazır" der, gelen her POST'u sayar
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || "GET" });
  const body = opts.method === "POST" ? { course: { name: "X" } } : { ready: true };
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
};

const { store, normalize } = await import("../store.js");
const { aiAllowed, aiStatus, readWithAI } = await import("../importer.js");
const { readFileSync } = await import("node:fs");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const pdf = { name: "x.pdf", type: "application/pdf", size: 1000, arrayBuffer: async () => new ArrayBuffer(8) };

// 1) Varsayılan: öneri açık; alan yok → açık; açıkça false → kapalı
ok(store.get().settings.aiReading === true, "varsayılan ayar açık olmalı (öneri görünsün)");
ok(normalize({ settings: {} }).settings.aiReading === true, "eski yedek (alan yok) → açık");
ok(normalize({ settings: { aiReading: false } }).settings.aiReading === false, "açıkça kapatılan kapalı kalmalı");
store.setSettings({ aiReading: false });
ok(aiAllowed() === false, "kapatılınca aiAllowed false");
for (const bad of ["true", 1, "yes", null]) ok(normalize({ settings: { aiReading: bad } }).settings.aiReading === false, `bozuk değer kapalı sayılmalı: ${JSON.stringify(bad)}`);

// 2) Sunucu hazır olsa bile ayar kapalıyken: sorulmaz, gönderilmez
ok((await aiStatus()) === "off", "ayar kapalıyken durum 'off' olmalı");
const r = await readWithAI(pdf);
ok(!r.result && r.error === "off", `ayar kapalıyken okuma reddedilmeli: ${JSON.stringify(r)}`);
const r2 = await readWithAI({ text: "x".repeat(200), name: "a.pdf" });
ok(!r2.result && r2.error === "off", `ayar kapalıyken metin de gönderilmemeli: ${JSON.stringify(r2)}`);
ok(calls.length === 0, `ayar kapalıyken hiç ağ isteği olmamalı: ${JSON.stringify(calls)}`);

// 3) Arayüz ve okuma akışı da aynı kapıdan geçer (kaynakta denetim)
const src = readFileSync(new URL("../importer.js", import.meta.url), "utf8");
ok(!/data-ai hidden/.test(src) && !/name="ai"/.test(src), "seçme ekranında yapay zekâ kutusu olmamalı (önce cihaz)");
ok(/async function run\(file, \{ ai = false, local = null, text = "" \} = \{\}\) \{\s*if \(!file\) return;\s*ai = ai && aiAllowed\(\) && !!local && !!text;/.test(src), "run() yapay zekâyı yalnız ayar açık + cihaz okuması + metin varken kullanmalı");
ok(/if \(offer && aiAllowed\(\)\) \{\s*aiStatus\(\)\.then/.test(src), "öneri yalnız aiAllowed() ise sunucuya sorularak gösterilmeli");
ok(/data-ai-offer hidden/.test(src), "öneri varsayılan gizli olmalı");
ok(/if \(!box\.checked\) \{/.test(src), "rıza işaretlenmeden gönderilmemeli");

// 4) Açılınca: sunucu yalnız GET ile sorulur, dosya/metin gönderilmez
store.setSettings({ aiReading: true });
ok(aiAllowed() === true, "açıkça açılınca aiAllowed true");
ok((await aiStatus()) === "ready" && calls.length === 1 && calls[0].method === "GET", `açıkken sunucu sorulmalı: ${JSON.stringify(calls)}`);
store.setSettings({ aiReading: false });
ok(aiAllowed() === false, "tekrar kapatılabilmeli");

console.log(`\nyapay zekâ kapısı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
