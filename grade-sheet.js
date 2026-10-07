/**
 * KPR — Ortak not girişi: alttan açılan pencere (bottom sheet), kendi sayı tuş takımı.
 * Uygulamadaki her not/puan/GNO girişi bunu kullanır; harf seçimi aynı pencerede ızgara olarak.
 *
 *   openNumberSheet({ context, value, min, max, decimals, unit, quick, impact, clearLabel, onSave })
 *   openLetterSheet({ context, letters, value, impact, clearLabel, onSave })
 *
 * Telefon klavyesi açılmaz (giriş alanı yok, tuşlar düğme). Arkası karartılır; aşağı çekince,
 * arka plana dokununca ya da Esc ile kapanır. <dialog>.showModal() odağı pencerede tutar.
 * Tuş takımı mantığı (press/parse/format) DOM'suz; test/grade-sheet.mjs Node'da dener.
 */

import { esc } from "./ui.js";
import { t, localize } from "./i18n.js";

/* ------------------------------------------------------------------ */
/* Tuş takımı mantığı (saf)                                            */
/* ------------------------------------------------------------------ */

/** "78,5" → 78.5; boş → null. */
export const parseBuffer = (buf) => (buf === "" ? null : Number(buf.replace(",", ".")));

/** 78.5 → "78,5" (en fazla `decimals` ondalık; gereksiz sıfır yok). */
export function formatValue(v, decimals = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return String(r).replace(".", ",");
}

/**
 * Tuşa basınca yeni tampon. Geçersiz basış tamponu değiştirmez:
 * aralık dışı (max'ı aşan), fazla ondalık, ondalıksız alanda virgül, baştaki gereksiz sıfır.
 * key: "0"–"9", ",", "del", "clear".
 */
export function press(buf, key, { max = 100, decimals = 1 } = {}) {
  if (key === "clear") return "";
  if (key === "del") return buf.slice(0, -1);
  if (key === ",") {
    if (!decimals || buf.includes(",")) return buf;
    return (buf || "0") + ",";
  }
  if (!/^\d$/.test(key)) return buf;
  const [, frac = null] = buf.split(",");
  if (frac !== null && frac.length >= decimals) return buf;
  const next = buf === "0" ? key : buf + key;
  return parseBuffer(next) > max ? buf : next;
}

/* ------------------------------------------------------------------ */
/* Pencere                                                             */
/* ------------------------------------------------------------------ */

let dlg = null;
function host() {
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.className = "gsheet";
  document.body.appendChild(dlg);
  // Arka plana dokununca kapan (dialog'un kendisine gelen tık = karartılmış alan)
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  return dlg;
}

/** Tutamaçtan aşağı çekince kapat. */
function bindDrag(d) {
  const panel = d.querySelector(".gs-panel");
  const grip = d.querySelector(".gs-grip");
  let y0 = null;
  grip.addEventListener("pointerdown", (e) => {
    y0 = e.clientY;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
  });
  const end = (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    panel.style.transform = "";
    if (dy > 70) d.close();
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}

function open(html, setup) {
  const d = host();
  d.innerHTML = `<div class="gs-panel" role="document">
      <button type="button" class="gs-grip" aria-label="${t("Kapat (aşağı çek)")}"><i></i></button>
      ${html}
    </div>`;
  bindDrag(d);
  d.querySelector(".gs-grip").addEventListener("click", () => d.close());
  setup(d);
  if (!d.open) d.showModal();
  d.querySelector("[data-autofocus]")?.focus();
  return d;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"];
const KEY_LABEL = localize({ ",": "Virgül", del: "Sil" }, { ",": "Comma", del: "Delete" });

/**
 * Sayı girişi. unit: "/ 100", "/ 4,00", "kredi"… impact(v) → kısa canlı etki metni ya da "".
 * onSave(v): v sayı ya da (Notu temizle ile) null.
 */
export function openNumberSheet({ context, value = null, min = 0, max = 100, decimals = 1, unit = "/ 100", quick = [], impact = null, clearLabel = t("Notu temizle"), saveLabel = t("Kaydet"), onSave }) {
  let buf = value === null || value === undefined ? "" : formatValue(value, decimals);
  const opts = { max, decimals };
  return open(
    `<p class="gs-ctx">${esc(context)}</p>
    <p class="gs-value" aria-live="polite"><b data-v>${esc(buf || "—")}</b>${unit ? ` <span>${esc(unit)}</span>` : ""}</p>
    <p class="gs-impact" data-impact aria-live="polite" hidden></p>
    ${quick.length ? `<div class="gs-quick">${quick.map((q) => `<button type="button" data-quick="${q}">${esc(formatValue(q, decimals))}</button>`).join("")}</div>` : ""}
    <div class="gs-keys" role="group" aria-label="${t("Sayı tuşları")}">
      ${KEYS.map((k) => `<button type="button" data-key="${k}" aria-label="${KEY_LABEL[k] || k}" ${k === "," && !decimals ? "disabled" : ""}>${k === "del" ? "⌫" : k}</button>`).join("")}
    </div>
    <button type="button" class="btn btn-primary gs-save" data-save data-autofocus>${esc(saveLabel)}</button>
    ${clearLabel && value !== null && value !== undefined ? `<button type="button" class="link gs-clear" data-clear>${esc(clearLabel)}</button>` : ""}`,
    (d) => {
      const show = () => {
        d.querySelector("[data-v]").textContent = buf || "—";
        const v = parseBuffer(buf);
        const ok = v !== null && v >= min && v <= max;
        d.querySelector("[data-save]").disabled = !ok;
        const box = d.querySelector("[data-impact]");
        const text = ok && impact ? impact(v) : "";
        box.hidden = !text;
        box.textContent = text || "";
      };
      const key = (k) => {
        buf = press(buf, k, opts);
        show();
      };
      d.querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", () => key(b.dataset.key)));
      // Hızlı çip tek dokunuşta kaydeder (not girişi: kurs → satır → çip = 3 dokunuş)
      d.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
        d.close();
        onSave(Number(b.dataset.quick));
      }));
      d.querySelector("[data-save]").addEventListener("click", () => {
        const v = parseBuffer(buf);
        if (v === null || v < min || v > max) return;
        d.close();
        onSave(Math.round(v * 10 ** decimals) / 10 ** decimals);
      });
      d.querySelector("[data-clear]")?.addEventListener("click", () => {
        d.close();
        onSave(null);
      });
      // Masaüstünde fiziksel klavye de çalışsın
      d.onkeydown = (e) => {
        if (/^\d$/.test(e.key)) key(e.key);
        else if (e.key === "," || e.key === ".") key(",");
        else if (e.key === "Backspace") key("del");
        else if (e.key === "Enter") d.querySelector("[data-save]").click();
        else return;
        e.preventDefault();
      };
      show();
    }
  );
}

/** Harf seçimi: tek dokunuşla kaydeder. letters: ["A", "A-", …]. */
export function openLetterSheet({ context, letters, value = "", impact = null, clearLabel = "", onSave }) {
  return open(
    `<p class="gs-ctx">${esc(context)}</p>
    <p class="gs-impact" data-impact aria-live="polite" hidden></p>
    <div class="gs-letters" role="group" aria-label="${t("Harf seç")}">
      ${letters.map((l, i) => `<button type="button" data-letter="${esc(l)}" aria-pressed="${l === value}" ${l === value || (!value && i === 0) ? "data-autofocus" : ""}>${esc(l)}</button>`).join("")}
    </div>
    ${clearLabel && value ? `<button type="button" class="link gs-clear" data-clear>${esc(clearLabel)}</button>` : ""}`,
    (d) => {
      const box = d.querySelector("[data-impact]");
      const hint = (l) => {
        const text = impact ? impact(l) : "";
        box.hidden = !text;
        box.textContent = text || "";
      };
      if (value) hint(value);
      d.querySelectorAll("[data-letter]").forEach((b) => {
        b.addEventListener("click", () => {
          d.close();
          onSave(b.dataset.letter);
        });
        b.addEventListener("focus", () => hint(b.dataset.letter));
        b.addEventListener("pointerenter", () => hint(b.dataset.letter));
      });
      d.querySelector("[data-clear]")?.addEventListener("click", () => {
        d.close();
        onSave("");
      });
      d.onkeydown = null;
    }
  );
}
