// İngilizce: syllabus okuyucunun ürettiği uyarı ve kural metinleri (veride Türkçe saklanır) ekranda çevrilir.
// Tüm test syllabus'larını okur; çıkan her uyarı, kural ve sonuç cümlesinin lang/reader-en.js'te karşılığı olmalı.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractText } from "../doc-text.js";
import { parseSyllabus } from "../syllabus-local.js";
import { readerEn, EXACT } from "../lang/reader-en.js";

const dir = fileURLToPath(new URL("./syllabus/", import.meta.url));
let ok = 0, fail = 0;
const check = (c, msg) => (c ? ok++ : (fail++, console.log("  ✗ " + msg)));
const seen = new Set();
for (const f of readdirSync(dir).filter((x) => /\.(pdf|docx|txt)$/.test(x))) {
  const buf = readFileSync(dir + f);
  const { text } = await extractText({ name: f, type: "", arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  const r = parseSyllabus(text, new Date(2026, 8, 26));
  for (const s of [...r.warnings, ...r.policies.flatMap((p) => [p.rule, p.consequence])]) if (s) seen.add(s);
}
for (const s of seen) {
  const en = readerEn(s);
  // Değişken kısım (bileşen adı "Ara Sınav", ders kodu) Türkçe kalabilir; cümlenin kendisi çevrilmiş olmalı
  check(en !== s, `çevrilmemiş: ${s}`);
}
// Kalıplar: değişken kısım korunur
check(readerEn("Derslerin en az %70'ine devam zorunlu.") === "You must attend at least 70% of classes.", "devam yüzdesi");
check(readerEn("En fazla 1 hafta devamsızlık hakkın var.") === "You can miss at most 1 week.", "tekil birim");
check(readerEn("En fazla 4 ders devamsızlık hakkın var.") === "You can miss at most 4 classes.", "çoğul birim");
check(readerEn("Quizlerden en iyi 7/8 tanesi sayılıyor.") === "Only your best 7 of 8 quizzes count.", "en iyi N");
check(readerEn("Yapay zekâyla okunmuş bambaşka bir kural.") === "Yapay zekâyla okunmuş bambaşka bir kural.", "tabloda olmayan metin olduğu gibi");
// Sözlükte boş ya da Türkçe kalmış İngilizce yok
for (const [k, v] of Object.entries(EXACT)) check(v && v !== k && !/[çğışöüİ]/.test(v.replace(/Köprü/g, "")), `sözlük: ${k}`);

console.log(`\nokuyucu metinleri (İngilizce): ${seen.size} farklı metin\n\n${ok} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
