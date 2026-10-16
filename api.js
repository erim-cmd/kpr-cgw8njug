/**
 * KPR — Sunucu adresi ve yapay zekâ istekleri (syllabus okuma, Asistan, Seçmeli Keşfi).
 *
 * Web sitesinde istekler göreli gider ("api/ask"): site ve sunucu aynı yerde (Cloudflare Pages).
 * iOS uygulamasında (Capacitor) sayfalar telefondan sunulur; sunucuya tam adresle gidilir (SERVER) ve
 * sunucu bu kökene CORS izni verir (functions/api/_middleware.js).
 * SERVER: Türk Telekom pages.dev'i engellediği için mağaza sürümünden önce kendi alan adıyla değiştirilmeli.
 */

export const SERVER = "https://kpr-onizleme.pages.dev";

const native = () => globalThis.window?.Capacitor?.isNativePlatform?.() === true;

/** "api/ask" → web'de göreli, uygulamada tam adres. */
export const apiUrl = (path) => (native() ? `${SERVER}/${path.replace(/^\/+/, "")}` : path);

/** GitHub Pages yalnız statik dosya sunar; orada sunucu yok (sormak konsola kırmızı hata düşürür). */
export const noServer = () => !native() && /\.github\.io$/i.test(globalThis.location?.hostname || "");

const ready = new Map(); // path → "ready" | "off" | "none" (oturum boyunca)

/** Uç hazır mı? GET her zaman 200 + { ready } döner; Claude çağrılmaz, sayaç artmaz. */
export async function endpointStatus(path) {
  if (ready.has(path)) return ready.get(path);
  if (noServer() || globalThis.navigator?.onLine === false) return "none";
  let st = "none";
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    const body = (res.headers.get("content-type") || "").includes("json") ? await res.json().catch(() => null) : null;
    st = !body || typeof body.ready !== "boolean" ? "none" : body.ready ? "ready" : "off";
  } catch {
    st = "none";
  }
  ready.set(path, st);
  return st;
}

/** JSON POST; { body } ya da { error } döner (hata metni öğrenciye gösterilebilir). */
export async function postJSON(path, payload, { timeout = 60_000, errors = {} } = {}) {
  if (globalThis.navigator?.onLine === false) return { error: errors.offline || "internet bağlantısı yok" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(apiUrl(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { body };
    return { error: body.error || `HTTP ${res.status}` };
  } catch (err) {
    return { error: err.name === "AbortError" ? errors.timeout || "çok uzun sürdü" : errors.network || "sunucuya ulaşılamadı" };
  } finally {
    clearTimeout(timer);
  }
}
