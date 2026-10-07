/**
 * KPR — Dil desteği (Türkçe ana dil, İngilizce)
 *
 * Kullanım:
 *   t("Bugün dersin yok.")                       → metin
 *   t("{n} gün kaldı", { n })                    → yer tutucu {ad}
 *   t("Notunun {p} kadarı belli oldu", { p: `<b>${pct(x)}</b>` })  → HTML yer tutucunun değerinde
 * Anahtar = Türkçe metnin kendisi; İngilizcesi lang/en-*.js sözlüklerinde.
 * Sözlükte değer { one, other } olabilir: vars.n === 1 ise "one" kullanılır (İngilizce tekil/çoğul).
 * Çevirisi olmayan metin Türkçe kalır (test/i18n.mjs bunu yakalar).
 *
 * Sabit etiket tabloları (gün adları, görev türleri…) localize() ile kaydedilir; dil değişince
 * aynı nesnenin değerleri yerinde değişir, kullanan kod değişmez.
 */
import EN from "./lang/en.js";

export const LANGS = { tr: "Türkçe", en: "English" };

let lang = "tr";
const registry = [];

export const getLang = () => lang;
/** Tarih ve sayı biçimi için yerel ayar */
export const locale = () => (lang === "en" ? "en-GB" : "tr-TR");

function fill(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function t(s, vars) {
  if (lang === "tr") return fill(s, vars);
  let v = EN[s];
  if (v && typeof v === "object") v = vars && Number(vars.n) === 1 ? v.one : v.other;
  return fill(typeof v === "string" ? v : s, vars);
}

/** Yüzde: Türkçe "%40", İngilizce "40%". Değer olduğu gibi yazılır (biçimlendirme çağıranda). */
export const pct = (x) => (lang === "en" ? `${x}%` : `%${x}`);

/** Ondalık sayı: Türkçe virgül (3,12), İngilizce nokta (3.12). */
export const decimal = (s) => (lang === "en" ? String(s).replace(",", ".") : String(s).replace(".", ","));

/**
 * Sabit tabloyu dile bağla. obj yerinde değişir (dizi ya da nesne).
 * en: aynı biçimde İngilizce karşılık (dizi ya da { anahtar: metin }).
 */
export function localize(obj, en) {
  const tr = Array.isArray(obj) ? [...obj] : { ...obj };
  registry.push({ obj, tr, en });
  if (lang !== "tr") apply(registry[registry.length - 1]);
  return obj;
}

function apply({ obj, tr, en }) {
  const src = lang === "en" ? en : tr;
  if (Array.isArray(obj)) obj.splice(0, obj.length, ...src);
  else for (const k of Object.keys(tr)) obj[k] = src[k] ?? tr[k];
}

export function setLang(l) {
  const next = l === "en" ? "en" : "tr";
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (next === lang) return;
  lang = next;
  registry.forEach(apply);
}
