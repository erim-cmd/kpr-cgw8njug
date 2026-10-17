/**
 * KPR — /api/* için CORS. iOS uygulaması (Capacitor) sayfaları kendi içinden sunar; kökeni
 * "capacitor://localhost" olur ve sunucuya başka kökenden gelir. Yalnız uygulamanın kendi kökenlerine izin verilir;
 * web sitesi aynı kökenden geldiği için başlığa ihtiyaç duymaz.
 */
const ALLOWED = new Set(["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"]);

const plain = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const selfOrigin = (request) => {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
};

export async function onRequest({ request, next }) {
  const origin = request.headers.get("origin") || "";
  const allow = ALLOWED.has(origin);
  // Yapay zekâ çağıran uçlar (POST) yalnız uygulamanın kendisinden: başka bir site ziyaretçilerinin tarayıcısıyla
  // istek attırıp (CORS cevabı okumayı engeller, isteği değil) aylık bütçeyi harcatamasın.
  if (request.method === "POST") {
    if (origin && !allow && origin !== selfOrigin(request)) return plain(403, "Bu istek kabul edilmedi.");
    // text/plain gövdeli "basit" istekler ön kontrole girmez; uygulama hep JSON yollar
    if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return plain(415, "İstek biçimi desteklenmiyor.");
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: allow ? 204 : 403,
      headers: allow
        ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, x-kpr-device", "access-control-max-age": "86400", vary: "origin" }
        : {},
    });
  }
  const res = await next();
  if (!allow) return res;
  const out = new Response(res.body, res);
  out.headers.set("access-control-allow-origin", origin);
  out.headers.append("vary", "origin");
  return out;
}
