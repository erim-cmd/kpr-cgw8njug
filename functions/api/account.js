/**
 * KPR — /api/account: hesap (kayıt, giriş, çıkış, silme) ve bulut eşitleme (pull/push).
 * Mantık server/account-core.js'te. KPR_DB (Cloudflare D1) bağlı değilse uç kapalıdır ({ ready: false });
 * uygulama da hesap seçeneğini göstermez.
 * Kötüye kullanım: kayıt ve giriş denemesi cihaz başına günde 30 (aynı IP'ye × 30 tavan; overLimit).
 */

import { json, fail, overLimit } from "../../server/ai-shared.js";
import { handle, d1Repo } from "../../server/account-core.js";

const AUTH_LIMIT = 30;

export async function onRequestGet({ env }) {
  return json({ ready: Boolean(env.KPR_DB) });
}

export async function onRequestPost({ request, env }) {
  if (!env.KPR_DB) return fail(503, "off");
  if (Number(request.headers.get("content-length")) > 2_000_000) return fail(413, "too_big");
  let p;
  try {
    p = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  if ((p?.action === "register" || p?.action === "login") && (await overLimit(request, env, "acc", AUTH_LIMIT))) return fail(429, "limit");
  try {
    const r = await handle(await d1Repo(env.KPR_DB), p, request.headers.get("authorization"));
    return json(r.body, r.status);
  } catch (e) {
    console.error(`[account] ${p?.action}: ${String(e?.message || e).slice(0, 200)}`);
    return fail(500, "server");
  }
}
