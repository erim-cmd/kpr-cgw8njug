// Uyuyan yapay zekâ ile okuma yolu (importer.js) kendiliğinden çalışmaz:
// sunucu yapılandırılmış ve "hazır" olsa bile settings.aiReading açıkça true değilse
//   - sunucu hiç sorulmaz (ağ isteği yok), - dosya gönderilmez, - seçenek görünmez.
// Varsayılan kapalı; eski yedekler ve bozuk değerler kapalı sayılır (store.js normalize).
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

// 1) Varsayılan: kapalı
ok(store.get().settings.aiReading === false, "varsayılan ayar kapalı olmalı");
ok(aiAllowed() === false, "aiAllowed varsayılanda false");
ok(normalize({ settings: {} }).settings.aiReading === false, "eski yedek (alan yok) → kapalı");
for (const bad of ["true", 1, "yes", null]) ok(normalize({ settings: { aiReading: bad } }).settings.aiReading === false, `bozuk değer kapalı sayılmalı: ${JSON.stringify(bad)}`);

// 2) Sunucu hazır olsa bile ayar kapalıyken: sorulmaz, gönderilmez
ok((await aiStatus()) === "off", "ayar kapalıyken durum 'off' olmalı");
const r = await readWithAI(pdf);
ok(!r.result && r.error === "off", `ayar kapalıyken okuma reddedilmeli: ${JSON.stringify(r)}`);
ok(calls.length === 0, `ayar kapalıyken hiç ağ isteği olmamalı: ${JSON.stringify(calls)}`);

// 3) Arayüz ve okuma akışı da aynı kapıdan geçer (kaynakta denetim)
const src = readFileSync(new URL("../importer.js", import.meta.url), "utf8");
ok(/if \(aiAllowed\(\)\) \{\s*aiStatus\(\)\.then/.test(src), "seçenek yalnız aiAllowed() ise sunucuya sorularak gösterilmeli");
ok(/async function run\(file, \{ ai = false \} = \{\}\) \{\s*if \(!file\) return;\s*ai = ai && aiAllowed\(\);/.test(src), "run() ayar kapalıyken yapay zekâyı kullanmamalı");
ok(/<label class="consent" data-ai hidden>/.test(src), "rıza kutusu varsayılan gizli olmalı");

// 4) Açıkça açılınca (yedek dosyası/geliştirici) eski davranış: sunucu sorulur
store.setSettings({ aiReading: true });
ok(aiAllowed() === true, "açıkça açılınca aiAllowed true");
ok((await aiStatus()) === "ready" && calls.length === 1 && calls[0].method === "GET", `açıkken sunucu sorulmalı: ${JSON.stringify(calls)}`);
store.setSettings({ aiReading: false });
ok(aiAllowed() === false, "tekrar kapatılabilmeli");

console.log(`\nyapay zekâ yolu kapalı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
