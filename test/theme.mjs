// Görünüm: theme.js karar mantığı + açık temada yazı renklerinin okunabilirliği (WCAG AA ≥ 4.5:1).
// Açık tema token'ları tokens.css'teki :root[data-theme="light"] bloğundan okunur.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveTheme, THEMES } from "../theme.js";

const root = fileURLToPath(new URL("../", import.meta.url));
let fail = 0, ok = 0;
const check = (cond, msg) => (cond ? ok++ : (fail++, console.log("✗ " + msg)));

// 1) Tercih → tema
check(resolveTheme("acik", false) === "light", "acik → light");
check(resolveTheme("koyu", true) === "dark", "koyu → dark");
check(resolveTheme("sistem", true) === "light", "sistem + telefon açık → light");
check(resolveTheme("sistem", false) === "dark", "sistem + telefon koyu → dark");
check(resolveTheme("bozuk", false) === "dark", "bilinmeyen tercih → sistem gibi");
check(JSON.stringify(Object.keys(THEMES)) === '["sistem","acik","koyu"]', "THEMES anahtarları");

// theme-boot.js aynı veri anahtarını ve değerleri kullanmalı
const boot = readFileSync(root + "theme-boot.js", "utf8");
check(boot.includes('"kpr:data:v1"'), "theme-boot.js store anahtarı (kpr:data:v1)");
check(boot.includes('"acik"') && boot.includes('"koyu"'), "theme-boot.js tercih değerleri");
check(readFileSync(root + "app.html", "utf8").indexOf("theme-boot.js") < readFileSync(root + "app.html", "utf8").indexOf("tokens.css"),
  "app.html: theme-boot.js CSS'ten önce");

// 2) Açık tema kontrastı
const css = readFileSync(root + "tokens.css", "utf8");
const block = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/);
check(!!block, "tokens.css açık tema bloğu");
const tok = Object.fromEntries([...(block?.[1] || "").matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TEXT = ["text", "text-muted", "text-dim", "cyan", "violet", "accent", "danger", "warn", "ok", "danger-text", "warn-soft-text"];
for (const fg of TEXT) {
  for (const bg of ["bg", "surface", "surface-2"]) {
    if (!tok[fg] || !tok[bg]) { check(false, `token eksik: --${fg} / --${bg}`); continue; }
    const r = ratio(tok[fg], tok[bg]);
    check(r >= 4.5, `--${fg} (${tok[fg]}) / --${bg} (${tok[bg]}) = ${r.toFixed(2)} < 4.5`);
  }
}
// Düğme yazıları kendi zeminlerinde
for (const [fg, bg] of [["on-accent", "cyan"], ["on-violet", "violet-solid"], ["on-danger", "danger"]]) {
  const r = ratio(tok[fg], tok[bg]);
  check(r >= 4.5, `--${fg} / --${bg} = ${r.toFixed(2)} < 4.5`);
}

console.log(`Görünüm: ${ok} doğru · ${fail ? fail + " hata" : "sorun yok"}`);
process.exit(fail ? 1 : 0);
