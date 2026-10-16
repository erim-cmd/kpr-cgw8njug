/**
 * KPR — Hesap ve bulut eşitleme (istemci). Sunucu: functions/api/account.js.
 *
 * Hesap isteğe bağlıdır: hesapsız kullanım aynen sürer. Giriş yapılınca tüm uygulama verisi (store) hesaba
 * eşitlenir; telefon ve bilgisayar aynı veriyi görür, Asistan da bu veriden cevaplar.
 *  - Bu cihazda: kpr:account = { email, token, rev, at }, kpr:sync-base = son ortak hâl (üç yönlü birleştirme için).
 *  - Her değişiklikten 1,5 sn sonra gönderilir; uygulama öne gelince ve internet dönünce buluttan çekilir.
 *  - Çakışmada (başka cihaz daha yeni) iki taraf birleştirilir (sync-merge.js) ve tekrar gönderilir.
 *  - Oturum geçersizse (silindi/süresi doldu) bu cihazdan çıkılır; veri cihazda kalır.
 */

import { store } from "./store.js";
import { runMigrations } from "./migrate.js";
import { apiUrl, apiHeaders, endpointStatus } from "./api.js";
import { mergeData } from "./sync-merge.js";

const PATH = "api/account";
const ACC_KEY = "kpr:account";
const BASE_KEY = "kpr:sync-base";

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* depolama dolu ya da kapalı: oturumluk */
  }
};

let acc = read(ACC_KEY);
let base = acc ? read(BASE_KEY) : null;
let applying = false;
let timer = null;
let busy = null;
let status = "idle"; // idle | syncing | error | nonet (internetsiz)
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const account = () => (acc ? { email: acc.email, at: acc.at || null, status } : null);
export const onAccountChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const accountReady = () => endpointStatus(PATH);

function save(next) {
  acc = next;
  write(ACC_KEY, acc);
  emit();
}

async function call(action, payload = {}) {
  if (globalThis.navigator?.onLine === false) return { status: 0, body: { error: "nonet" } };
  const headers = apiHeaders();
  if (acc?.token) headers.authorization = `Bearer ${acc.token}`;
  try {
    const res = await fetch(apiUrl(PATH), { method: "POST", headers, body: JSON.stringify({ action, ...payload }), cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return { status: 0, body: { error: "network" } };
  }
}

function apply(data) {
  applying = true;
  try {
    store.replace(data);
    runMigrations();
  } finally {
    applying = false;
  }
}

function signedOut() {
  acc = null;
  base = null;
  write(ACC_KEY, null);
  write(BASE_KEY, null);
  clearTimeout(timer);
  status = "idle";
  emit();
}

function synced(data, rev) {
  base = JSON.parse(JSON.stringify(data));
  write(BASE_KEY, base);
  save({ ...acc, rev, at: Date.now() });
}

/** Bu cihazın verisini gönderir; çakışmada birleştirip yeniden dener. */
async function push() {
  if (!acc) return;
  for (let i = 0; i < 3; i++) {
    const data = store.get();
    const r = await call("push", { data, baseRev: acc.rev || 0 });
    if (r.status === 200) return synced(data, r.body.rev);
    if (r.status === 401) return signedOut();
    if (r.status === 409 && r.body.data) {
      apply(mergeData(base, store.get(), r.body.data));
      acc = { ...acc, rev: r.body.rev };
      // Birleştirilmiş hâlin sunucudaki sürüme göre bir sonraki turda gönderilmesi için base = bulut
      base = r.body.data;
      continue;
    }
    status = r.status === 0 ? "nonet" : "error";
    emit();
    return;
  }
}

/** Buluttan çeker; bu cihazda gönderilmemiş değişiklik varsa birleştirip gönderir. */
async function pull() {
  if (!acc) return;
  const r = await call("pull");
  if (r.status === 401) return signedOut();
  if (r.status !== 200) {
    status = r.status === 0 ? "nonet" : "error";
    return emit();
  }
  const { data, rev } = r.body;
  const dirty = !base || JSON.stringify(store.get()) !== JSON.stringify(base);
  if (!data) return push(); // hesapta henüz veri yok
  if (rev === acc.rev && !dirty) return synced(store.get(), rev);
  if (rev !== acc.rev) {
    apply(dirty ? mergeData(base, store.get(), data) : data);
    acc = { ...acc, rev };
    base = data;
    if (!dirty) return synced(data, rev);
  }
  return push();
}

/** Aynı anda tek eşitleme; bitince bekleyen varsa bir tur daha. */
function run(fn) {
  if (busy) return busy.then(() => run(fn));
  status = "syncing";
  emit();
  busy = fn()
    .catch(() => {
      status = "error";
    })
    .finally(() => {
      busy = null;
      if (status === "syncing") status = "idle";
      emit();
    });
  return busy;
}

export const syncNow = () => run(pull);

/** Kayıt ya da giriş. Dönüş: null (başarılı) ya da hata kodu. */
export async function signIn(mode, { email, password, consent }) {
  const r = await call(mode === "register" ? "register" : "login", { email, password, consent });
  if (r.status !== 200) return r.body?.error || (r.status === 0 ? "network" : "server");
  base = null; // bu cihazda ilk eşitleme: listeler birleşir, hiçbir şey silinmez
  write(BASE_KEY, null);
  save({ email: r.body.email, token: r.body.token, rev: 0, at: null });
  await run(async () => {
    const p = await call("pull");
    if (p.status !== 200) throw new Error("pull");
    if (p.body.data) {
      apply(mergeData(null, store.get(), p.body.data));
      acc = { ...acc, rev: p.body.rev };
      base = p.body.data;
    }
    await push();
  });
  return null;
}

export async function signOut() {
  await call("logout");
  signedOut();
}

/** Hesabı ve buluttaki veriyi siler (şifre yeniden istenir). Bu cihazdaki veri kalır. */
export async function deleteAccount(password) {
  const r = await call("delete", { password });
  if (r.status !== 200) return r.body?.error || (r.status === 0 ? "network" : "server");
  signedOut();
  return null;
}

/** app.js açılışta çağırır. */
export function startSync() {
  store.subscribe(() => {
    if (!acc || applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => run(push), 1500);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && acc) syncNow();
  });
  addEventListener("online", () => acc && syncNow());
  if (acc) syncNow();
}
