// Ortak not girişi (grade-sheet.js): tuş takımı mantığı. Sınır 0–100 (ya da max), en fazla N ondalık.
import { press, parseBuffer, formatValue } from "../grade-sheet.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const type = (keys, opts) => keys.split(" ").reduce((b, k) => press(b, k, opts), "");

console.log("\ngrade-sheet");
const N = { max: 100, decimals: 1 };
ok(type("7 8", N) === "78", "78");
ok(type("7 8 , 5", N) === "78,5", "78,5");
ok(type("7 8 , 5 5", N) === "78,5", "en fazla 1 ondalık");
ok(type("1 0 0", N) === "100", "100");
ok(type("1 0 1", N) === "10", "101 > 100 kabul edilmez");
ok(type("1 0 0 0", N) === "100", "1000 kabul edilmez");
ok(type("0 7", N) === "7", "baştaki sıfır");
ok(type(", 5", N) === "0,5", "virgülle başlayınca 0,");
ok(type("8 , ,", N) === "8,", "ikinci virgül yok");
ok(type("7 8 del", N) === "7", "sil");
ok(type("7 8 clear", N) === "", "temizle");
ok(type("1 0 0 , 5", N) === "100,", "100,5 > 100: ondalık eklenmez");
ok(parseBuffer("78,5") === 78.5 && parseBuffer("") === null, "parseBuffer");
// GNO: 0–4, 2 ondalık
const G = { max: 4, decimals: 2 };
ok(type("3 , 2 5", G) === "3,25", "3,25");
ok(type("3 , 2 5 7", G) === "3,25", "GNO en fazla 2 ondalık");
ok(type("5", G) === "", "GNO 5 > 4");
ok(type("4 , 0 1", G) === "4,0", "4,01 > 4");
// Kredi: tam sayı
const K = { max: 400, decimals: 0 };
ok(type("1 2 0", K) === "120", "kredi 120");
ok(type("1 2 , 5", K) === "125", "kredide virgül yok");
ok(type("4 0 1", K) === "40", "kredi sınırı");
ok(formatValue(78.5) === "78,5" && formatValue(3.256, 2) === "3,26" && formatValue(80) === "80" && formatValue(null) === "", "formatValue");

console.log(`\n${pass} doğru, ${fail} hata`);
if (fail) process.exit(1);
