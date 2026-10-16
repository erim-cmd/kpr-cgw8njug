/**
 * KPR — Sunucu fonksiyonlarının ortak parçaları (functions/api/*.js içe aktarır).
 * Cevap biçimi, günlük sınır, aylık harcama tavanı, SHA-256 ve Claude çağrısı burada; her uç kendi sınırını verir.
 * KVKK: içerik loglanmaz; IP açık hâliyle yazılmaz (gün + IP özeti, 26 saatte silinir).
 */

export const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_BUDGET_USD = 20;

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
export const fail = (status, error) => json({ error }, status);
export const arr = (x) => (Array.isArray(x) ? x : []);

export async function sha256hex(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const monthKey = () => `b:${new Date().toISOString().slice(0, 7)}`;
const num = (env, k, d) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);

/** Bu ay harcanan, milyonda bir dolar cinsinden (tam sayı). Tüm uçlar aynı sayacı paylaşır. */
async function spent(env) {
  return env.KPR_LIMITS ? Number(await env.KPR_LIMITS.get(monthKey())) || 0 : 0;
}

export async function overBudget(env) {
  if (!env.KPR_LIMITS) return false;
  return (await spent(env)) >= num(env, "KPR_MONTHLY_BUDGET_USD", DEFAULT_BUDGET_USD) * 1e6;
}

/** price: { in, out } $/milyon token (modelin fiyatı). */
export async function addSpend(env, usage, price) {
  if (!env.KPR_LIMITS || !usage) return;
  const micro = Math.ceil(usage.input * price.in + usage.output * price.out);
  // KV sonunda tutarlıdır: aynı anda gelen istekler sayacı biraz eksik sayabilir; sınır yaklaşık bir tavan.
  await env.KPR_LIMITS.put(monthKey(), String((await spent(env)) + micro), { expirationTtl: 60 * 60 * 24 * 40 });
}
export const priceOf = (env, prefix, def) => ({ in: num(env, `${prefix}_IN`, def.in), out: num(env, `${prefix}_OUT`, def.out) });

/** Kişi başı günlük sınır. scope: "rl" (syllabus), "ask", "el" — her uçun kendi sayacı. */
export async function overLimit(request, env, scope, limit) {
  if (!env.KPR_LIMITS) return false;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  // Not: IPv4 uzayı küçük olduğundan özet deneme yoluyla geri çözülebilir; bu tam anonimleştirme değildir.
  const who = (await sha256hex(`${day}:${ip}`)).slice(0, 32);
  const key = `${scope}:${day}:${who}`;
  const count = Number(await env.KPR_LIMITS.get(key)) || 0;
  if (count >= limit) return true;
  await env.KPR_LIMITS.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

/**
 * Zorunlu araç çağrısıyla Claude: cevap her zaman verilen şemada gelir.
 * Dönüş: { result, usage } ya da { status, error }.
 */
export async function callTool({ env, model, system, content, tool, maxTokens, signal }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
    signal,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { status: res.status, error: out?.error?.message || `HTTP ${res.status}` };
  const usage = { input: Number(out.usage?.input_tokens) || 0, output: Number(out.usage?.output_tokens) || 0 };
  return { result: arr(out.content).find((b) => b.type === "tool_use")?.input || null, usage };
}

/** Claude API hatasını öğrenciye gösterilecek cevaba çevirir (içerik ve anahtar loglanmaz). */
export function apiFail(tag, r) {
  console.error(`[${tag}] Claude API hatası: HTTP ${r.status} · ${String(r.error).slice(0, 300)}`);
  if (r.status === 429 || r.status === 529) return fail(503, "Yapay zekâ şu an yoğun. Birkaç dakika sonra tekrar dene.");
  return fail(502, "Yapay zekâ cevap veremedi. Tekrar dene.");
}

/** Boşlukları tek boşluğa indirip küçük harfe çevirir: alıntının belgede gerçekten geçtiğini denetlemek için. */
export const squash = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
