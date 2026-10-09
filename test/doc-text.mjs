// PDF metin okuyucusu (doc-text.js): yazı tipi kodlamaları ve LaTeX aksanları.
//  1) /MacRomanEncoding: Mac'te üretilmiş PDF'te 0x85 = "Ö", 0xD0 = "–", 0xA5 = "•", 0x9F = "ü" (WinAnsi değil)
//  2) LaTeX PDF'inde harf + ayrı aksan: "I˙STANBUL", "Yes¸im O¨ ztu¨rk" → "İSTANBUL", "Yeşim Öztürk"
import { pdfText, joinAccents } from "../doc-text.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

/** En küçük geçerli PDF: tek sayfa, tek Type1 yazı tipi (verilen /Encoding), içerik akışı sıkıştırmasız. */
function tinyPdf(encoding, content) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /${encoding} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

// Metin yeterince uzun olmalı (40+ harf yoksa "taranmış PDF" sayılır)
const line = "(Instructor: Yelda \\205zge Deneme \\320 Kurulu\\237 \\245 Course Room and Studio Hours) Tj";
const mac = await pdfText(tinyPdf("MacRomanEncoding", `BT /F1 12 Tf 72 720 Td ${line} ET`));
ok(mac.text.includes("Özge"), `MacRoman Ö: ${JSON.stringify(mac.text)}`);
ok(mac.text.includes("–") && mac.text.includes("•") && mac.text.includes("Kuruluü"), `MacRoman – • ü: ${JSON.stringify(mac.text)}`);
const win = await pdfText(tinyPdf("WinAnsiEncoding", `BT /F1 12 Tf 72 720 Td ${line} ET`));
ok(win.text.includes("…zge"), `WinAnsi değişmemeli: ${JSON.stringify(win.text)}`);

ok(joinAccents("I˙STANBUL TEKNI˙K U¨ NI˙VERSI˙TESI˙") === "İSTANBUL TEKNİK ÜNİVERSİTESİ", joinAccents("I˙STANBUL TEKNI˙K U¨ NI˙VERSI˙TESI˙"));
ok(joinAccents("lecturer Yes¸im O¨ ztu¨rk (lab)") === "lecturer Yeşim Öztürk (lab)", joinAccents("lecturer Yes¸im O¨ ztu¨rk (lab)"));
ok(joinAccents("Mazeretlerin Kabulu¨ ve Yapılıs¸ Esasları") === "Mazeretlerin Kabulü ve Yapılış Esasları", joinAccents("Mazeretlerin Kabulu¨ ve Yapılıs¸ Esasları"));
ok(joinAccents("Normal metin: Öztürk, İstanbul") === "Normal metin: Öztürk, İstanbul", "aksansız metin değişmemeli");

console.log(`\ndoc-text\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
