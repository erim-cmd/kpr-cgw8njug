/**
 * KPR — "Ana ekrana ekle" akışı
 * Chrome/Edge/Samsung: beforeinstallprompt olayını yakalayıp kendi butonumuzla gösteriyoruz.
 * iOS Safari: bu olay yok; kullanıcıya Paylaş → Ana Ekrana Ekle adımını anlatıyoruz.
 */

const DISMISS_KEY = "kpr:install-dismissed";
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  notify();
});

window.addEventListener("appinstalled", () => {
  deferred = null;
  notify();
});

export const onInstallChange = (fn) => listeners.add(fn);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** "prompt" | "ios" | null — hangi kurulum yolu mümkün */
export function installMode() {
  if (isStandalone()) return null;
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return null;
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === "accepted";
}

export function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
  notify();
}
