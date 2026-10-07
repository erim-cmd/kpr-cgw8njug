// Yazı dili (docs/yazi-dili.md): arayüz metinlerinde yasak kalıplar.
// Sadece metin sabitleri ("…", '…', `…`) taranır; yorumlar, console satırları ve regex'ler atlanır.
// Yeni bir kural docs/yazi-dili.md'ye girince buraya da eklenir.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Arayüz metni taşıyan dosyalar (ayrıştırıcı ve hesap çekirdekleri hariç: onların metni syllabus'tan gelir)
const FILES = [
  "app.html", "app.js", "today.js", "tasks.js", "courses.js", "settings.js", "term.js", "asistan.js", "secmeli.js",
  "forms.js", "importer.js", "onboarding.js", "components.js", "ders.js", "gpa-view.js", "grade-sheet.js",
  "notify.js", "alerts.js", "install.js", "attendance.js", "ics.js", "asistan-core.js", "density.js",
];

const RULES = [
  { re: /\d\.\d{2}(?!\d)/, why: "ondalık virgül kullan (1,80 — fmtGpa)", only: /\b(GNO|YNO|ortalama|not)\b/i },
  { re: /çevrimdışı|offline/i, why: "\"internetsiz\" de" },
  { re: /\bLütfen\b/i, why: "rica kalıbı yok; doğrudan söyle" },
  { re: /\bİptal\b/, why: "kapatma düğmesi \"Vazgeç\"" },
  { re: /\b\w+(sınız|siniz|sunuz|sünüz)\b/i, why: "\"sen\" diye hitap et" },
  { re: /yapay zeka/i, why: "\"yapay zekâ\" (şapkalı)" },
  { re: /\bKPR\b/, why: "arayüzde ad \"Köprü\"" },
  { re: /\bHata oluştu\b/i, why: "ne olduğunu ve ne yapılacağını söyle" },
];

let fail = 0, scanned = 0;
for (const f of FILES) {
  const src = readFileSync(root + f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")) // blok yorum (satır sayısı korunur)
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  src.split("\n").forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /console\.|new RegExp|:\s*\/.+\/[gimsuy]*,?\s*$|=\s*\/.+\/[gimsuy]*;?\s*$/.test(line)) return;
    const code = line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"); // satır sonu yorumu
    for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      const text = m[2];
      if (!/\p{L}/u.test(text)) continue;
      scanned++;
      for (const r of RULES) {
        if (r.re.test(text) && (!r.only || r.only.test(text))) {
          fail++;
          console.log(`✗ ${f}:${i + 1} — ${r.why}\n    ${text.slice(0, 120)}`);
        }
      }
    }
  });
}
console.log(`Yazı dili: ${scanned} metin tarandı · ${fail ? fail + " hata" : "sorun yok"}`);
process.exit(fail ? 1 : 0);
