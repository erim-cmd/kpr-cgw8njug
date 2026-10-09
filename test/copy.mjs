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
  "notify.js", "alerts.js", "install.js", "attendance.js", "ics.js", "asistan-core.js", "density.js", "mail.js",
];

const RULES = [
  { re: /\d\.\d{2}(?!\d)/, why: "ondalık virgül kullan (1,80 — fmtGpa)", only: /\b(GNO|YNO|ortalama|not)\b/i },
  { re: /çevrimdışı|offline/i, why: "\"internetsiz\" de" },
  { re: /\bLütfen\b/i, why: "rica kalıbı yok; doğrudan söyle" },
  { re: /\bİptal\b/, why: "kapatma düğmesi \"Vazgeç\"" },
  { re: /\p{L}(sınız|siniz|sunuz|sünüz)(?!\p{L})/iu, why: "\"sen\" diye hitap et" },
  { re: /yapay zeka/i, why: "\"yapay zekâ\" (şapkalı)" },
  { re: /\bKPR\b/, why: "arayüzde ad \"Köprü\"" },
  { re: /\bHata oluştu\b/i, why: "ne olduğunu ve ne yapılacağını söyle" },
  { re: /\}(<\/b>)?'[a-zçğıöşü]/, why: "değişken değere ek getirme (sayının okunuşuna göre değişir); cümleyi eksiz kur" },
  { re: /\p{Extended_Pictographic}/u, why: "emoji yok (tek istisna: Tamamlandı 🎉)", except: /Tamamlandı 🎉/ },
  { re: /\p{L}(ayım|eyim) mı(?!\p{L})|(?<!\p{L})(hesaplarım|bulamadım|bakarım|cevaplarım|hesaplayayım|hatırlatayım|göstereyim|ekleyeyim)(?!\p{L})/u, why: "arayüz \"biz\" diye konuşur (\"ben\" yalnızca Asistan'da)", skip: ["asistan-core.js", "asistan.js"] },
  { re: /\bkatılım zorunlu/i, why: "\"devam zorunluluğu\" (terim sözlüğü)" },
  { re: /\bOrtalama'ya\b|\bOrtalama tablosu/, why: "\"ders harfleri tablosu\" (terim sözlüğü)" },
];

let fail = 0, scanned = 0;
for (const f of FILES) {
  const src = readFileSync(root + f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")) // blok yorum (satır sayısı korunur)
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const texts = []; // [satır, metin]
  const lines = src.split("\n").map((line) =>
    /^\s*\/\//.test(line) || /console\.|new RegExp|:\s*\/.+\/[gimsuy]*,?\s*$|=\s*\/.+\/[gimsuy]*;?\s*$/.test(line)
      ? "" : line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")); // yorum ve regex satırları boşaltılır
  lines.forEach((code, i) => {
    for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) texts.push([i + 1, m[2]]);
  });
  const clean = lines.join("\n");
  for (const m of clean.matchAll(/>([^<>`]*?)</g)) texts.push([clean.slice(0, m.index).split("\n").length, m[1]]);
  for (const [ln, text] of texts) {
    {
      if (!/\p{L}/u.test(text)) continue;
      scanned++;
      for (const r of RULES) {
        if (r.skip?.includes(f) || (r.except && r.except.test(text))) continue;
        if (r.re.test(text) && (!r.only || r.only.test(text))) {
          fail++;
          console.log(`✗ ${f}:${ln} — ${r.why}\n    ${text.slice(0, 120)}`);
        }
      }
    }
  }
}
console.log(`Yazı dili: ${scanned} metin tarandı · ${fail ? fail + " hata" : "sorun yok"}`);
process.exit(fail ? 1 : 0);
