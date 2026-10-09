// Büyük harfli ders adı → başlık düzeni (syllabus-local.js → titleCase).
// Romen rakamı ve kısaltma olduğu gibi; bağlaç küçük; Türkçe yerelde "II" → "Iı" olmaz.
import { titleCase } from "../syllabus-local.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const cases = [
  ["PHYSICS II", "Physics II"],
  ["PHYSICS I", "Physics I"],
  ["INTRO TO AI", "Intro to AI"],
  ["TÜRK DİLİ I", "Türk Dili I"],
  ["İNGİLİZCE III", "İngilizce III"],
  ["HERKES İÇİN YAPAY ZEKA", "Herkes İçin Yapay Zeka"],
  ["BİLİM VE TEKNOLOJİ TARİHİ II", "Bilim ve Teknoloji Tarihi II"],
  ["KADIN VE TOPLUM", "Kadın ve Toplum"],
  ["CAD FOR ARCHITECTS", "CAD for Architects"],
  ["RISK MANAGEMENT IN IT", "Risk Management in IT"],
  ["MATHEMATICS IV", "Mathematics IV"],
  ["Physics II", "Physics II"], // karışık yazılmış ad olduğu gibi
  ["Intro to AI", "Intro to AI"],
];
for (const [inp, want] of cases) {
  const got = titleCase(inp);
  ok(got === want, `${JSON.stringify(inp)} → ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
}
console.log(`\nbaşlık düzeni\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
