/** KPR — Ortak arayüz yardımcıları: HTML kaçışı, alt sayfa (dialog), bildirim. */

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
    btn.textContent = "Emin misin?";
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = "Sil";
    }, 3000);
  });
}
