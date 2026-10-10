// Depoda sır yok: git'in takip ettiği dosyalarda API anahtarı, özel anahtar, şifre ataması bulunmamalı;
// .dev.vars takip edilmemeli ve .gitignore'da olmalı (CLAUDE.md "Sırlar"). Teslim (Volitek) öncesi ve her PR'da.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
ok(files.length > 50, `git dosya listesi okunmalı: ${files.length}`);
ok(!files.some((f) => /(^|\/)\.dev\.vars$|(^|\/)\.env(\.|$)|\.pem$|\.p12$|\.key$|\.mobileprovision$/.test(f)), "sır dosyası takip edilmemeli (.dev.vars, .env, .pem, .p12, .key)");
const ignore = readFileSync(root + ".gitignore", "utf8");
ok(/^\.dev\.vars$/m.test(ignore), ".dev.vars .gitignore'da olmalı");
ok(/^test-syllabus\/?$/m.test(ignore), "test-syllabus/ (gerçek syllabus'lar) .gitignore'da olmalı");

const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{16,}/, "Anthropic API anahtarı"],
  [/AKIA[0-9A-Z]{16}/, "AWS erişim anahtarı"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "GitHub jetonu"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API anahtarı"],
  [/xox[bpars]-[A-Za-z0-9-]{10,}/, "Slack jetonu"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "özel anahtar"],
  [/\b(api[_-]?key|password|passwd|secret|token)\s*[:=]\s*["'][^"'\s]{12,}["']/i, "şifre/anahtar ataması"],
];
const TEXT = /\.(js|mjs|cjs|json|html|css|md|txt|yml|yaml|toml|svg|webmanifest|example|py|ps1|sh)$|^[^.]+$/i;
let scanned = 0;
for (const f of files.filter((x) => TEXT.test(x))) {
  let s;
  try { s = readFileSync(root + f, "utf8"); } catch { continue; }
  scanned++;
  for (const [re, what] of PATTERNS) {
    const m = re.exec(s);
    ok(!m, `${f}: ${what} gibi görünen değer → ${m ? m[0].slice(0, 12) + "…" : ""}`);
  }
}
ok(scanned > 50, `metin dosyaları tarandı: ${scanned}`);
// Örnek dosya boş anahtarla gelir
const ex = files.find((f) => f === ".dev.vars.example");
if (ex) ok(/^ANTHROPIC_API_KEY=\s*$/m.test(readFileSync(root + ex, "utf8")), ".dev.vars.example'da anahtar boş olmalı");

console.log(`\nsırlar (${scanned} dosya)\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
