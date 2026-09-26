/**
 * KPR — Syllabus okuma (Cloudflare Pages Function)  POST /api/syllabus
 *
 * İstek:  { data: <base64>, mediaType: "application/pdf" | "image/jpeg", fileName }
 * Cevap:  { result: { course, sessions, items, grading, attendance, warnings } }
 *         (importer.js'teki kontrol ekranının beklediği biçim)
 *
 * Ortam değişkenleri (Cloudflare → Pages → Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY  (zorunlu, "Encrypt" ile gizli)
 *   KPR_MODEL          (isteğe bağlı, varsayılan claude-sonnet-5)
 * Bağlama (isteğe bağlı): KPR_LIMITS  → KV namespace; kişi başı günlük 5 okuma sınırı
 *
 * KVKK: dosya ve içerik hiçbir yerde saklanmaz, loglanmaz. Sadece Anthropic API'ye gönderilir.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_B64 = Math.ceil((4 * 1024 * 1024 * 4) / 3) + 1024; // 4 MB dosya
const DAILY_LIMIT = 5;
const TIMEOUT_MS = 70_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (status, error) => json({ error }, status);

/* ------------------------------------------------------------------ */
/* Çıktı şeması: model tam olarak bu JSON'u döndürür                   */
/* ------------------------------------------------------------------ */

const str = { type: "string" };
const numOrNull = { type: ["number", "null"] };
const intOrNull = { type: ["integer", "null"] };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const SCHEMA = obj({
  course: obj({
    name: str, code: str, instructor: str, email: str, office: str, office_hours: str,
    credit: numOrNull, ects: numOrNull,
  }),
  sessions: { type: "array", items: obj({ day: { type: "integer" }, start: str, end: str, room: str }) },
  items: {
    type: "array",
    items: obj({
      type: { type: "string", enum: ["sinav", "odev", "proje", "diger"] },
      title: str, date: str, time: str, week: intOrNull, source: str,
    }),
  },
  grading: { type: "array", items: obj({ name: str, weight: { type: "number" } }) },
  attendance: obj({ percent: numOrNull, max_absences: intOrNull, source: str }),
  warnings: { type: "array", items: str },
});

function instructions(now) {
  const d = now.toISOString().slice(0, 10);
  return `You are reading a university course syllabus (izlence) for a Turkish student planner app. Today is ${d}.
Extract ONLY what the document states. Never invent. Use "" for unknown text and null for unknown numbers.

course
- name, code (e.g. "MCH 2016"), instructor, email, office, office_hours as written.
- credit: the LOCAL/NATIONAL credit ("Kredi", "Yerel Kredi", "Credit", often T+U=K). NOT ECTS.
- ects: the ECTS / AKTS value.

sessions (weekly class meetings)
- day: 0=Monday(Pazartesi) 1=Tuesday 2=Wednesday 3=Thursday 4=Friday 5=Saturday 6=Sunday.
- start/end: 24h "HH:MM". room: classroom/lab as written. One entry per weekly meeting.

items (every dated or scheduled assessment)
- type: sinav = exam/midterm/vize/ara sınav/final/quiz/sınav; odev = homework/assignment/ödev/report; proje = project/presentation/sunum; diger = anything else with a deadline.
- title: short, in the syllabus language (e.g. "Vize sınavı", "Ödev 2").
- date: "YYYY-MM-DD" only if a calendar date is given. If the year is missing, infer it from the academic term (fall term Sep–Jan, spring Feb–Jun) relative to today. If only a week number is given, date "" and week = that number.
- time: "HH:MM" if given, else "".
- source: the exact short phrase from the syllabus this came from (max ~150 characters).

grading: assessment components and their percentage weights (numbers, e.g. 40 for %40).

attendance
- percent: minimum attendance required in percent (e.g. "%70 devam zorunludur" -> 70, "students may miss at most 30%" -> 70).
- max_absences: only if the syllabus gives a maximum NUMBER of absences (classes or weeks), else null.
- source: the exact phrase.

warnings: short notes IN TURKISH about anything uncertain the student should check (e.g. "Final tarihi yazmıyor", "Yıl belirtilmemiş, 2026 varsayıldı", "Devamsızlık haftayla verilmiş").

If the document is not a syllabus, return empty values and a Turkish warning saying so.`;
}

/* ------------------------------------------------------------------ */
/* Temizleme: modelden gelen her alan doğrulanır                        */
/* ------------------------------------------------------------------ */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const s = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const n = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const hhmm = (v) => {
  const m = s(v, 8).match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return "";
  const t = `${m[1].padStart(2, "0")}:${m[2]}`;
  return TIME.test(t) ? t : "";
};

export function sanitize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const c = r.course || {};
  const a = r.attendance || {};
  return {
    course: {
      name: s(c.name, 80), code: s(c.code, 20), instructor: s(c.instructor, 60), email: s(c.email, 80),
      office: s(c.office, 60), office_hours: s(c.office_hours, 80),
      credit: n(c.credit, 0, 30), ects: n(c.ects, 0, 60),
    },
    sessions: arr(r.sessions)
      .map((x) => ({ day: Number.isInteger(x?.day) && x.day >= 0 && x.day <= 6 ? x.day : null, start: hhmm(x?.start), end: hhmm(x?.end), room: s(x?.room, 40) }))
      .filter((x) => x.day !== null && x.start && x.end && x.end > x.start)
      .slice(0, 14),
    items: arr(r.items)
      .map((x) => ({
        type: ["sinav", "odev", "proje", "diger"].includes(x?.type) ? x.type : "diger",
        title: s(x?.title, 120), date: DATE.test(x?.date) ? x.date : "", time: hhmm(x?.time),
        week: Number.isInteger(x?.week) && x.week > 0 && x.week < 30 ? x.week : null, source: s(x?.source, 200),
      }))
      .filter((x) => x.title)
      .slice(0, 60),
    grading: arr(r.grading)
      .map((g) => ({ name: s(g?.name, 40), weight: n(g?.weight, 0, 100) }))
      .filter((g) => g.name && g.weight !== null)
      .slice(0, 12),
    attendance: {
      percent: n(a.percent, 0, 100),
      max_absences: Number.isInteger(a.max_absences) && a.max_absences >= 0 && a.max_absences <= 200 ? a.max_absences : null,
      source: s(a.source, 200),
    },
    warnings: arr(r.warnings).map((w) => s(w, 200)).filter(Boolean).slice(0, 8),
  };
}

/* ------------------------------------------------------------------ */
/* Claude çağrısı                                                       */
/* ------------------------------------------------------------------ */

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  }
}

async function callClaude({ env, data, mediaType, mode, signal }) {
  const file = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const body = {
    model: env.KPR_MODEL || DEFAULT_MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: [file, { type: "text", text: instructions(new Date()) }] }],
  };
  // Birincil yol: yapılandırılmış çıktı. Yedek yol: zorunlu araç çağrısı (aynı şema).
  if (mode === "structured") body.output_config = { format: { type: "json_schema", schema: SCHEMA } };
  else {
    body.tools = [{ name: "syllabus_kaydet", description: "Syllabus'tan çıkarılan bilgileri kaydet.", input_schema: SCHEMA }];
    body.tool_choice = { type: "tool", name: "syllabus_kaydet" };
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { status: res.status, error: out?.error?.message || `HTTP ${res.status}` };

  if (mode === "structured") {
    const text = arr(out.content).filter((b) => b.type === "text").map((b) => b.text).join("");
    return { result: parseJSON(text), stop: out.stop_reason };
  }
  const tool = arr(out.content).find((b) => b.type === "tool_use");
  return { result: tool?.input || null, stop: out.stop_reason };
}

/* ------------------------------------------------------------------ */
/* Günlük sınır (KV bağlıysa)                                           */
/* ------------------------------------------------------------------ */

async function overLimit(request, env) {
  if (!env.KPR_LIMITS) return false;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${day}:${ip}`;
  const count = Number(await env.KPR_LIMITS.get(key)) || 0;
  if (count >= DAILY_LIMIT) return true;
  await env.KPR_LIMITS.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

/* ------------------------------------------------------------------ */
/* İstek                                                                */
/* ------------------------------------------------------------------ */

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return fail(503, "Syllabus okuma henüz yapılandırılmadı. Dersi şimdilik elle ekleyebilirsin.");

  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail(400, "İstek okunamadı.");
  }
  const { data, mediaType } = payload || {};
  if (typeof data !== "string" || !data) return fail(400, "Dosya gelmedi.");
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mediaType)) return fail(415, "Sadece PDF veya fotoğraf yükleyebilirsin.");
  if (data.length > MAX_B64) return fail(413, "Dosya en fazla 4 MB olabilir. Sadece ilgili sayfaları yüklemeyi dene.");

  if (await overLimit(request, env)) return fail(429, `Bugünkü ${DAILY_LIMIT} okuma hakkını kullandın. Yarın tekrar dene ya da dersi elle ekle.`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let r = await callClaude({ env, data, mediaType, mode: "structured", signal: ctrl.signal });
    // Yapılandırılmış çıktı reddedilirse (ör. şema desteği) aynı şemayla araç çağrısını dene
    if (r.status === 400) r = await callClaude({ env, data, mediaType, mode: "tool", signal: ctrl.signal });

    if (r.status) {
      if (r.status === 429 || r.status === 529) return fail(503, "Okuma servisi şu an yoğun. Birkaç dakika sonra tekrar dene.");
      if (r.status === 400 && /pdf|document|page/i.test(r.error)) return fail(422, "Bu PDF okunamadı (şifreli ya da bozuk olabilir). Fotoğrafını yüklemeyi dene.");
      return fail(502, "Syllabus okunamadı. Tekrar dene.");
    }
    if (!r.result) return fail(502, r.stop === "max_tokens" ? "Syllabus çok uzun. Sadece takvim ve değerlendirme sayfalarını yükle." : "Syllabus okunamadı. Tekrar dene.");
    return json({ result: sanitize(r.result) });
  } catch (err) {
    if (err.name === "AbortError") return fail(504, "Okuma çok uzun sürdü. Daha kısa bir dosya yükle.");
    return fail(500, "Beklenmeyen bir hata oldu. Tekrar dene.");
  } finally {
    clearTimeout(timer);
  }
}
