// sw.js'teki SHELL listesi: her dosya depoda var mı, ve uygulamanın yüklediği her modül listede mi?
// Eksik dosya → service worker kurulamaz, uygulama internetsiz açılmaz.
// Listede olmayan modül → internetsizken o ekran açılmaz.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sw = readFileSync(root + "sw.js", "utf8");
const block = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!block) {
  console.log("✗ sw.js içinde SHELL listesi bulunamadı");
  process.exit(1);
}
const shell = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));
let fail = 0;

for (const p of shell) {
  if (!p || p.endsWith("/")) continue; // "./" = kök sayfa
  if (!existsSync(root + p)) {
    console.log(`✗ SHELL'de var ama depoda yok: ${p}`);
    fail++;
  }
}

// Uygulamanın ES modülleri (kökteki .js dosyaları) SHELL'de olmalı
const listed = new Set(shell);
for (const f of readdirSync(root).filter((f) => f.endsWith(".js") && f !== "sw.js")) {
  if (!listed.has(f)) {
    console.log(`✗ ${f} depoda var ama SHELL listesinde yok (internetsizken yüklenemez)`);
    fail++;
  }
}

console.log(`${shell.length} SHELL girdisi · ${fail ? fail + " hata" : "sorun yok"}`);
process.exit(fail ? 1 : 0);
