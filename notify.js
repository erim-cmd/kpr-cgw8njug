/**
 * KPR — Bildirim teslimi
 *
 * Sunucu olmadan neyin mümkün olduğu (Eylül 2026):
 *   - Uygulama açıkken / arka plandayken: service worker üzerinden bildirim. Her yerde.
 *   - Uygulama kapalıyken: Android Chrome'da "periodic background sync" ile
 *     tarayıcının seçtiği aralıklarla (genelde saatler) bir kontrol. Garanti değil.
 *   - Kesin zamanında bildirim için Web Push sunucusu gerekir (sw.js "push" hazır).
 *   - En garanti sunucusuz yol: takvime aktarma (ics.js).
 *
 * Aynı hatırlatma iki kez gelmesin diye gönderilenler cihazda tutulur ve
 * her bildirim hatırlatma kimliğini "tag" olarak taşır (tekrarlanırsa üstüne yazar).
 */

import { store } from "./store.js";
import { buildReminders } from "./alerts.js";
import { isIOS, isStandalone } from "./install.js";

const SENT_KEY = "kpr:notified";
const CATCH_UP_MS = 12 * 60 * 60 * 1000; // uygulama kapalıyken kaçanlar: en fazla 12 saat geriye
const SW_CACHE = "kpr-reminders";
const SW_URL = "./__kpr-reminders.json";

/** "unsupported" | "ios-install" | "default" | "granted" | "denied" */
export function permissionState() {
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

export const isActive = () => permissionState() === "granted" && store.get().settings.notify;

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.getRegistration().then((r) => r || navigator.serviceWorker.ready);
}

async function show(title, options) {
  const reg = await registration();
  if (reg?.showNotification) return reg.showNotification(title, { icon: "icon-192.png", badge: "icon-192.png", lang: "tr", ...options });
  return new Notification(title, options);
}

function readSent() {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY)) || {};
  } catch {
    return {};
  }
}

function writeSent(sent) {
  const cutoff = Date.now() - 30 * 86400000;
  for (const k of Object.keys(sent)) if (sent[k] < cutoff) delete sent[k];
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {}
}

/** Kullanıcı dokunuşuyla çağrılmalı (iOS şartı). true = açıldı. */
export async function enableNotifications() {
  const state = permissionState();
  if (state === "unsupported" || state === "ios-install") return false;
  const result = state === "granted" ? "granted" : await Notification.requestPermission();
  if (result !== "granted") return false;
  store.setSettings({ notify: true });
  // İlk açılışta geçmiş hatırlatmaları topluca göndermemek için şimdiye kadarkileri "gönderildi" say
  const sent = readSent();
  for (const r of buildReminders(store.get())) if (r.fireAt <= new Date()) sent[r.id] = Date.now();
  writeSent(sent);
  await show("Bildirimler açık", { body: "Sınav, teslim ve günlük özetlerini buradan göreceksin.", tag: "kpr-welcome", data: { url: "#/bugun" } });
  await sync();
  return true;
}

export function disableNotifications() {
  store.setSettings({ notify: false });
  sync();
}

export async function testNotification() {
  await show("Deneme bildirimi", { body: "KPR bildirimleri çalışıyor.", tag: "kpr-test", data: { url: "#/ayarlar" } });
}

/** Zamanı gelmiş hatırlatmaları gösterir. Açılışta, görünürlük değişince ve dakikada bir çağrılır. */
export async function checkReminders() {
  if (!isActive()) return;
  const now = Date.now();
  const swSent = "caches" in window
    ? await caches.open(SW_CACHE).then((c) => c.match(SW_URL)).then((r) => r?.json()).then((d) => d?.sent || {}).catch(() => ({}))
    : {};
  const sent = { ...readSent(), ...swSent };
  const due = buildReminders(store.get(), new Date(now - CATCH_UP_MS), 2)
    .filter((r) => r.fireAt.getTime() <= now && now - r.fireAt.getTime() <= CATCH_UP_MS && !sent[r.id]);
  if (!due.length) return;

  // Uzun süre açılmadıysa birikenleri tek bildirimde topla
  if (due.length > 3) {
    await show(`${due.length} hatırlatman var`, {
      body: due.slice(0, 4).map((r) => r.title).join("\n"),
      tag: "kpr-digest",
      data: { url: "#/bugun" },
    });
  } else {
    for (const r of due) await show(r.title, { body: r.body, tag: r.id, data: { url: r.url } });
  }
  for (const r of due) sent[r.id] = now;
  writeSent(sent);
}

/**
 * Service worker'ın uygulama kapalıyken okuyabilmesi için önümüzdeki hatırlatmaları
 * önbelleğe yazar ve (destekleniyorsa) periyodik arka plan kontrolünü kaydeder.
 */
export async function sync() {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(SW_CACHE);
    // Service worker'ın arka planda gösterdiklerini buradaki listeyle birleştir (iki kez gelmesin)
    const prev = await cache.match(SW_URL).then((r) => r?.json()).catch(() => null);
    const sent = { ...readSent(), ...(prev?.sent || {}) };
    writeSent(sent);
    const list = isActive()
      ? buildReminders(store.get()).map((r) => ({ ...r, fireAt: r.fireAt.getTime() }))
      : [];
    await cache.put(SW_URL, new Response(JSON.stringify({ updated: Date.now(), reminders: list, sent }), { headers: { "content-type": "application/json" } }));

    const reg = await registration();
    if (!reg?.periodicSync) return;
    // Periyodik kontrol sadece kurulu uygulamada ve Chromium'da var; olmazsa sessizce geç
    const safe = (p) => p.catch(() => {});
    if (isActive()) {
      const perm = await navigator.permissions?.query({ name: "periodic-background-sync" }).catch(() => null);
      if (!perm || perm.state === "granted") await safe(reg.periodicSync.register("kpr-reminders", { minInterval: 60 * 60 * 1000 }));
    } else {
      await safe(reg.periodicSync.unregister("kpr-reminders"));
    }
  } catch (err) {
    console.warn("[KPR] Hatırlatmalar arka plana aktarılamadı:", err);
  }
}

/** Kullanıcı yeni bir sınav eklediğinde nazikçe sormak için. */
export const canAsk = () => permissionState() === "default" && !store.get().settings.notify;
