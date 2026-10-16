/**
 * KPR — Hesap ve bulut eşitleme: sunucu mantığı (functions/api/account.js ince bir sarmalayıcı).
 * Depolama `repo` arayüzünden geçer: canlıda Cloudflare D1 (d1Repo), testte bellek (test/account.mjs).
 *
 * Güvenlik:
 *  - Şifre PBKDF2-SHA256 (100.000 tur, 16 bayt rastgele tuz) ile tek yönlü özetlenir; açık hâli hiçbir yere yazılmaz.
 *  - Oturum anahtarı 32 rastgele bayt; veritabanına yalnız SHA-256 özeti yazılır (sızıntıda oturum çalınamaz). 180 gün.
 *  - Hata cevapları kod döner (uygulama kendi dilinde gösterir); e-posta, şifre ve veri loglanmaz.
 *  - Veri eşitlemesi sürüm numarasıyla: eski sürüm üstüne yazamaz (409 + sunucudaki hâl), istemci birleştirir.
 */

export const PBKDF2_ITER = 100_000; // Workers'taki üst sınır
export const SESSION_DAYS = 180;
export const MAX_BLOB = 1_500_000; // karakter; 10 dersin syllabus metniyle bile fazlasıyla yeter (D1 satır sınırı 2 MB)
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export const normEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
export const validEmail = (e) => e.length <= 254 && EMAIL.test(e);
export const validPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 200;

async function pbkdf2(password, saltHex, iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = hex(randomBytes(16));
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${await pbkdf2(password, salt)}`;
}

/** Sabit süreli karşılaştırma (zamanlamadan şifre tahmini yapılamasın). */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function checkPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !salt || !hash) return false;
  return same(await pbkdf2(password, salt, Number(iter) || PBKDF2_ITER), hash);
}

// Var olmayan e-postada da aynı süre harcansın (hangi e-postanın kayıtlı olduğu zamanlamadan anlaşılmasın)
const DUMMY = `pbkdf2$${PBKDF2_ITER}$${"00".repeat(16)}$${"00".repeat(32)}`;

async function newSession(repo, userId, now) {
  const token = b64u(randomBytes(32));
  await repo.createSession(await sha(token), userId, now + SESSION_DAYS * 864e5);
  return token;
}

/** "Bearer <anahtar>" → kullanıcı kimliği ya da null. */
export async function userFromAuth(repo, header, now = Date.now()) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header || "");
  if (!m) return null;
  const tokenHash = await sha(m[1]);
  const s = await repo.getSession(tokenHash);
  if (!s) return null;
  if (s.expires < now) {
    await repo.deleteSession(tokenHash);
    return null;
  }
  return { userId: s.user_id, tokenHash };
}

const err = (status, code) => ({ status, body: { error: code } });
const ok = (body) => ({ status: 200, body });

/**
 * Tek giriş noktası. p = istek gövdesi, auth = Authorization başlığı.
 * Dönüş: { status, body }. Kodlar: bad_request, bad_email, weak_password, consent, exists, wrong, unauthorized,
 * too_big, conflict.
 */
export async function handle(repo, p, auth, now = Date.now()) {
  const action = p?.action;

  if (action === "register") {
    const email = normEmail(p.email);
    if (!validEmail(email)) return err(400, "bad_email");
    if (!validPassword(p.password)) return err(400, "weak_password");
    if (p.consent !== true) return err(400, "consent");
    if (await repo.findUser(email)) return err(409, "exists");
    const id = crypto.randomUUID();
    await repo.createUser({ id, email, hash: await hashPassword(p.password), created: now });
    return ok({ token: await newSession(repo, id, now), email, rev: 0 });
  }

  if (action === "login") {
    const email = normEmail(p.email);
    const user = validEmail(email) ? await repo.findUser(email) : null;
    const good = await checkPassword(typeof p.password === "string" ? p.password : "", user?.hash || DUMMY);
    if (!user || !good) return err(401, "wrong");
    const d = await repo.getData(user.id);
    return ok({ token: await newSession(repo, user.id, now), email, rev: d?.rev || 0 });
  }

  const who = await userFromAuth(repo, auth, now);
  if (!who) return err(401, "unauthorized");

  if (action === "logout") {
    await repo.deleteSession(who.tokenHash);
    return ok({ ok: true });
  }

  if (action === "delete") {
    const user = await repo.getUser(who.userId);
    if (!user || !(await checkPassword(typeof p.password === "string" ? p.password : "", user.hash))) return err(401, "wrong");
    await repo.deleteUser(who.userId); // oturumlar ve veri de silinir
    return ok({ ok: true });
  }

  if (action === "pull") {
    const d = await repo.getData(who.userId);
    return ok({ data: d ? JSON.parse(d.blob) : null, rev: d?.rev || 0, updated: d?.updated || null });
  }

  if (action === "push") {
    if (!p.data || typeof p.data !== "object" || Array.isArray(p.data)) return err(400, "bad_request");
    const blob = JSON.stringify(p.data);
    if (blob.length > MAX_BLOB) return err(413, "too_big");
    const baseRev = Number.isInteger(p.baseRev) && p.baseRev >= 0 ? p.baseRev : -1;
    const rev = await repo.putData(who.userId, blob, baseRev, now);
    if (rev === null) {
      const d = await repo.getData(who.userId);
      return { status: 409, body: { error: "conflict", data: d ? JSON.parse(d.blob) : null, rev: d?.rev || 0 } };
    }
    return ok({ rev, updated: now });
  }

  return err(400, "bad_request");
}

/* ------------------------------------------------------------------ */
/* Cloudflare D1                                                        */
/* ------------------------------------------------------------------ */

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)",
  "CREATE TABLE IF NOT EXISTS data (user_id TEXT PRIMARY KEY, blob TEXT NOT NULL, rev INTEGER NOT NULL, updated INTEGER NOT NULL)",
];
let schemaReady = false;

export async function d1Repo(db) {
  if (!schemaReady) {
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    schemaReady = true;
  }
  return {
    findUser: (email) => db.prepare("SELECT id, hash FROM users WHERE email = ?").bind(email).first(),
    getUser: (id) => db.prepare("SELECT id, hash FROM users WHERE id = ?").bind(id).first(),
    createUser: (u) => db.prepare("INSERT INTO users (id, email, hash, created) VALUES (?, ?, ?, ?)").bind(u.id, u.email, u.hash, u.created).run(),
    deleteUser: (id) =>
      db.batch([
        db.prepare("DELETE FROM data WHERE user_id = ?").bind(id),
        db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
        db.prepare("DELETE FROM users WHERE id = ?").bind(id),
      ]),
    createSession: (token, userId, expires) => db.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(token, userId, expires).run(),
    getSession: (token) => db.prepare("SELECT user_id, expires FROM sessions WHERE token = ?").bind(token).first(),
    deleteSession: (token) => db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run(),
    getData: (userId) => db.prepare("SELECT blob, rev, updated FROM data WHERE user_id = ?").bind(userId).first(),
    /** Yalnız sunucudaki sürüm baseRev ise yazar; yeni sürümü ya da (çakışmada) null döner. */
    async putData(userId, blob, baseRev, now) {
      if (baseRev === 0) {
        const r = await db.prepare("INSERT OR IGNORE INTO data (user_id, blob, rev, updated) VALUES (?, ?, 1, ?)").bind(userId, blob, now).run();
        return r.meta?.changes ? 1 : null;
      }
      const r = await db.prepare("UPDATE data SET blob = ?, rev = rev + 1, updated = ? WHERE user_id = ? AND rev = ?").bind(blob, now, userId, baseRev).run();
      return r.meta?.changes ? baseRev + 1 : null;
    },
  };
}

/** Bellekte depo (testler için). */
export function memoryRepo() {
  const users = new Map(), sessions = new Map(), data = new Map();
  return {
    _sizes: () => ({ users: users.size, sessions: sessions.size, data: data.size }),
    findUser: async (email) => [...users.values()].find((u) => u.email === email) || null,
    getUser: async (id) => users.get(id) || null,
    createUser: async (u) => void users.set(u.id, u),
    deleteUser: async (id) => {
      users.delete(id);
      data.delete(id);
      for (const [k, s] of sessions) if (s.user_id === id) sessions.delete(k);
    },
    createSession: async (token, user_id, expires) => void sessions.set(token, { user_id, expires }),
    getSession: async (token) => sessions.get(token) || null,
    deleteSession: async (token) => void sessions.delete(token),
    getData: async (id) => data.get(id) || null,
    async putData(id, blob, baseRev, now) {
      const cur = data.get(id);
      if ((cur?.rev || 0) !== baseRev) return null;
      const rev = baseRev + 1;
      data.set(id, { blob, rev, updated: now });
      return rev;
    },
  };
}
