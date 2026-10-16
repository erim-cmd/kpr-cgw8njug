/** KPR — Ortak arayüz yardımcıları: HTML kaçışı, alt sayfa (dialog), bildirim. */
import { t } from "./i18n.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const sheet = () => document.getElementById("sheet");

export function openSheet(html, setup) {
  const d = sheet();
  d.innerHTML = html;
  // Arka plana ya da [data-close] öğesine tıklayınca kapat
  d.onclick = (e) => {
    if (e.target === d || e.target.closest("[data-close]")) d.close();
  };
  setup?.(d);
  d.showModal();
  d.querySelector("[autofocus]")?.focus();
  return d;
}

export const closeSheet = () => sheet().close();

/**
 * Dokunuş geri bildirimi: iOS kabuğunda (Capacitor Haptics) hafif titreşim, Android tarayıcıda kısa titreşim,
 * desteklemeyen yerde sessizce hiçbir şey. "success" (iş bitti) bir tık daha belirgin.
 */
export function haptic(kind = "light") {
  try {
    const H = globalThis.Capacitor?.Plugins?.Haptics;
    if (H) {
      if (kind === "success" && H.notification) H.notification({ type: "SUCCESS" });
      else H.impact({ style: kind === "success" ? "MEDIUM" : "LIGHT" });
      return;
    }
    globalThis.navigator?.vibrate?.(kind === "success" ? [8, 40, 8] : 8);
  } catch { /* titreşim yoksa geri bildirim görsel kalır */ }
}

/**
 * Az önce değişen öğe: bir sonraki çizimde küçük bir animasyon alsın diye ("Bitti" işareti, "Gitmedim").
 * Ekran store değişince yeniden çizildiği için düğmenin kendisine sınıf eklemek yetmiyor.
 */
const just = new Map();
export const markJust = (key) => just.set(key, Date.now());
export const isJust = (key) => {
  const at = just.get(key);
  return !!at && Date.now() - at < 1200;
};

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById("toast");
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  el.hidden = false;
  if (action) {
    el.querySelector("button").onclick = () => {
      el.hidden = true;
      action.onClick();
    };
  }
  clearTimeout(toastTimer);
  if (!action?.sticky) toastTimer = setTimeout(() => (el.hidden = true), action ? 5000 : 2600);
}

/** Silme butonu: ilk tıkta "Emin misin?", ikinci tıkta siler. */
export function armDelete(btn, onConfirm) {
  if (!btn) return;
  let timer;
  btn.addEventListener("click", () => {
    if (btn.classList.contains("armed")) return onConfirm();
    btn.classList.add("armed");
    btn.textContent = t("Emin misin?");
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = t("Sil");
    }, 3000);
  });
}
