/**
 * KPR — /api/* için CORS. iOS uygulaması (Capacitor) sayfaları kendi içinden sunar; kökeni
 * "capacitor://localhost" olur ve sunucuya başka kökenden gelir. Yalnız uygulamanın kendi kökenlerine izin verilir;
 * web sitesi aynı kökenden geldiği için başlığa ihtiyaç duymaz.
 */
const ALLOWED = new Set(["capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost"]);

export async function onRequest({ request, next }) {
  const origin = request.headers.get("origin") || "";
  const allow = ALLOWED.has(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: allow ? 204 : 403,
      headers: allow
        ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type, x-kpr-device, authorization", "access-control-max-age": "86400", vary: "origin" }
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
