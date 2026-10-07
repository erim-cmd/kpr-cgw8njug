/**
 * KPR — Görünüm (açık / koyu tema)
 * Tercih store'da: settings.theme = "sistem" | "acik" | "koyu" (varsayılan "sistem").
 * Uygulanan tema <html data-theme="light|dark"> ile belirlenir; renkler tokens.css'te.
 * Sayfa ilk çizilmeden önce theme-boot.js aynı kararı verir (koyu→açık yanıp sönmesin).
 * Tanıtım sitesi data-theme almaz, koyu kalır.
 */

export const THEMES = { sistem: "Sistem", acik: "Açık", koyu: "Koyu" };

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;

export function resolveTheme(pref, systemLight = media?.matches === true) {
  if (pref === "acik") return "light";
  if (pref === "koyu") return "dark";
  return systemLight ? "light" : "dark";
}

let current = "sistem";

export function applyTheme(pref) {
  current = Object.hasOwn(THEMES, pref) ? pref : "sistem";
  const theme = resolveTheme(current);
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  // Tarayıcı / durum çubuğu rengi = o temanın --bg'si (renk tokens.css'ten okunur)
  const bar = getComputedStyle(root).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bar && meta.content !== bar) meta.content = bar;
}

// "Sistem" seçiliyken telefon açık/koyu değiştirirse anında uy
media?.addEventListener?.("change", () => {
  if (current === "sistem") applyTheme(current);
});
