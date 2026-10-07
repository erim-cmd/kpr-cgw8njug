// Dil desteği denetimi (i18n.js):
//  1) Koddaki her t("…") anahtarının İngilizcesi lang/en*.js'te var; yer tutucular ({n}, {ad}…) aynı.
//  2) Arayüz dosyalarında t() dışında kalmış Türkçe metin yok (çevrilmemiş metin).
//  3) <html lang> dile göre değişiyor; İngilizcede büyük harf "I", Türkçede "İ".
// Bilerek Türkçe kalan satır: satır sonuna  // i18n-ok  (ör. Türkçe anahtar kelime listeleri).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EN from "../lang/en.js";
import { readdirSync } from "node:fs";

const root = fileURLToPath(new URL("../", import.meta.url));
const FILES = [
  "app.js", "today.js", "tasks.js", "courses.js", "settings.js", "term.js", "asistan.js", "secmeli.js",
  "forms.js", "importer.js", "onboarding.js", "components.js", "ders.js", "gpa-view.js", "grade-sheet.js",
  "notify.js", "alerts.js", "install.js", "attendance.js", "ics.js", "asistan-core.js", "density.js", "ui.js",
  "gpa.js", "weights.js", "ders-calc.js", "course-merge.js", "dates.js", "store.js", "schedule.js", "theme.js",
];

/** Basit JS tarayıcı: metin sabitlerini ve şablon parçalarını konumlarıyla döndürür. */
function literals(src) {
  const out = []; // { start, end, text, kind: "str"|"tpl", tplStart, dynamic }
  let i = 0;
  const n = src.length;
  const tplStack = []; // açık şablonların başlangıcı; ${ içindeyken süslü parantez derinliği
  let lastSig = ""; // regex/bölme ayrımı için son anlamlı karakter
  const regexOk = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd());
  function readTemplate(start) {
    // i, açılış ` işaretinden sonra
    let segStart = i;
    const tpl = { start, parts: [], dynamic: false };
    while (i < n) {
      const ch = src[i];
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") { tpl.parts.push({ start: segStart, end: i, text: src.slice(segStart, i) }); i++; break; }
      if (ch === "$" && src[i + 1] === "{") {
        tpl.parts.push({ start: segStart, end: i, text: src.slice(segStart, i) });
        tpl.dynamic = true;
        i += 2;
        scanCode(1); // } gelene kadar
        segStart = i;
        continue;
      }
      i++;
    }
    for (const p of tpl.parts) out.push({ ...p, kind: "tpl", tplStart: start, dynamic: tpl.dynamic });
  }
  function scanCode(depthTarget) {
    let depth = depthTarget ? 1 : 0;
    while (i < n) {
      const ch = src[i];
      if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; continue; }
      if (ch === '"' || ch === "'") {
        const s = i; i++;
        while (i < n && src[i] !== ch) { if (src[i] === "\\") i++; if (src[i] === "\n") break; i++; }
        out.push({ start: s, end: i + 1, text: src.slice(s + 1, i), kind: "str" });
        i++; lastSig = ch; continue;
      }
      if (ch === "`") { const s = i; i++; readTemplate(s); lastSig = "`"; continue; }
      if (ch === "/" && regexOk()) {
        i++; let cls = false;
        while (i < n) { const c = src[i]; if (c === "\\") { i += 2; continue; } if (c === "[") cls = true; else if (c === "]") cls = false; else if (c === "/" && !cls) break; else if (c === "\n") break; i++; }
        i++; while (/[a-z]/i.test(src[i] || "")) i++; lastSig = "/"; continue;
      }
      if (depthTarget) {
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { i++; return; } }
      }
      if (!/\s/.test(ch)) lastSig = ch;
      i++;
    }
  }
  scanCode(0);
  return out;
}

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = /(^|[^\p{L}])(ve|ile|bir|bu|için|yok|var|gün|ders|dersi|dersin|sınav|ödev|kaldı|ekle|sil|kaydet|değil|olarak|gibi|daha|kadar|hafta|haftası|tarih|gir|seç|göster|kapat|yükle|hedef|notu|notun|kredi|şart|hakkın|görev|görevi|başlık|aç|tamam|sonra|önce|yeni|tümü|hepsi|syllabus'ta|syllabus'tan|syllabus'u)(?![\p{L}])/iu;
const looksTurkish = (s) => {
  const text = s.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\$\{[^}]*\}/g, " ");
  if (!/\p{L}{2,}/u.test(text)) return false;
  return TR_LETTERS.test(text) || TR_WORDS.test(text);
};

/** Konumu s olan sabit, bir t( çağrısının ilk bağımsız değişkeni mi? */
const isTArg = (src, s) => /(^|[^\w.$])t\(\s*$/.test(src.slice(Math.max(0, s - 12), s));
/** localize(...) çağrısının içindeki konumlar (Türkçe tablo zaten kayıtlı) */
function localizeSpans(src) {
  const spans = [];
  for (const m of src.matchAll(/localize\(/g)) {
    let d = 0, j = m.index + "localize".length;
    for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
    spans.push([m.index, j]);
  }
  return spans;
}

let fail = 0, keys = 0;
const missing = [], untranslated = [], bad = [];
const used = new Set();
for (const f of FILES) {
  const src = readFileSync(root + f, "utf8");
  const lineOf = (pos) => src.slice(0, pos).split("\n").length;
  // // i18n-ok ile işaretli satırlar ve console satırları (geliştirici mesajı) atlanır
  const okLines = new Set(src.split("\n").map((l, k) => (/i18n-ok|console\./.test(l) ? k + 1 : 0)).filter(Boolean));
  const spans = localizeSpans(src);
  const inLocalize = (p) => spans.some(([a, b]) => p > a && p < b);
  const lits = literals(src);
  const tArgTpl = new Set();
  for (const L of lits) {
    const s = L.kind === "str" ? L.start : L.tplStart;
    if (isTArg(src, s)) {
      if (L.kind === "tpl" && L.dynamic) { bad.push(`${f}:${lineOf(s)} — t() anahtarı \${} içeremez`); tArgTpl.add(L.tplStart); continue; }
      if (L.kind === "tpl") tArgTpl.add(L.tplStart);
      const key = L.text.replace(/\\(["'`\\])/g, "$1");
      keys++; used.add(key);
      const v = EN[key];
      if (v === undefined) missing.push(`${f}:${lineOf(s)} — "${key}"`);
      else {
        const ph = (x) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
        const vals = typeof v === "object" ? [v.one, v.other] : [v];
        for (const val of vals) if (typeof val !== "string" || ph(val) !== ph(key)) bad.push(`${f}:${lineOf(s)} — yer tutucular uyuşmuyor: "${key}"`);
      }
      continue;
    }
    if (okLines.has(lineOf(L.start)) || inLocalize(L.start)) continue;
    if (L.kind === "tpl" && tArgTpl.has(L.tplStart)) continue;
    // import yolları, seçiciler, data- değerleri
    if (/^\.\/|^#\/|^\[data-|^data-/.test(L.text)) continue;
    if (looksTurkish(L.text)) untranslated.push(`${f}:${lineOf(L.start)} — ${L.text.replace(/\s+/g, " ").trim().slice(0, 90)}`);
  }
}

// Aynı Türkçe anahtar iki sözlük dosyasında farklı çevrilmesin (birleştirmede biri sessizce kaybolur)
const dictDir = fileURLToPath(new URL("../lang/", import.meta.url));
const seenKeys = {};
for (const f of readdirSync(dictDir).filter((x) => /^en-.+\.js$/.test(x))) {
  const m = (await import("../lang/" + f)).default;
  for (const [k, v] of Object.entries(m)) (seenKeys[k] ||= []).push([f, JSON.stringify(v)]);
}
for (const [k, list] of Object.entries(seenKeys))
  if (new Set(list.map((x) => x[1])).size > 1) bad.push(`sözlükler çelişiyor: "${k}" → ${list.map((x) => x[0]).join(", ")}`);

// <html lang> ve büyük harf
import("../i18n.js").then(async ({ setLang, t, pct, decimal }) => {
  globalThis.document = { documentElement: { lang: "tr" } };
  setLang("en");
  const langOk = document.documentElement.lang === "en" && t("Bugün") === "Today" && pct(40) === "40%" && decimal("3,12") === "3.12";
  setLang("tr");
  const trOk = document.documentElement.lang === "tr" && t("Bugün") === "Bugün" && pct(40) === "%40" && decimal("3.12") === "3,12";
  if (!langOk || !trOk) bad.push("setLang / t / pct / decimal beklenen sonucu vermiyor");

  for (const m of missing) console.log("✗ İngilizcesi yok: " + m);
  for (const u of untranslated) console.log("✗ Çevrilmemiş: " + u);
  for (const b of bad) console.log("✗ " + b);
  fail = missing.length + untranslated.length + bad.length;
  const unused = Object.keys(EN).filter((k) => !used.has(k));
  if (unused.length && process.argv.includes("--unused")) unused.forEach((k) => console.log("· kullanılmayan: " + k));
  console.log(`Dil: ${keys} çeviri anahtarı · ${Object.keys(EN).length} sözlük girdisi · ${fail ? fail + " hata" : "sorun yok"}${unused.length ? ` · ${unused.length} kullanılmayan girdi (--unused)` : ""}`);
  process.exit(fail ? 1 : 0);
});
