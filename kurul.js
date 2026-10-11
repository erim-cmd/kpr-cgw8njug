/**
 * Köprü — Tıp fakültesi ders kurulu rehberleri (syllabus-local.js çağırır).
 *
 * Tıp rehberi tek bir dersin izlencesi değildir: bir dönemin bütün kurullarını, haftalık ızgaraları,
 * sınav takvimini ve yönetmelik maddelerini içerir. Gerçek izlence ölçümünde (11 Eki 2026, 9 rehber)
 * okuyucu bu belgelerde ızgara sayılarını not ağırlığı sanıyor, sınavları hangi kurula ait olduğu
 * belli olmadan "Teorik Sınav" diye listeliyordu. Bu modül:
 *   - belgenin bir kurul rehberi olduğunu tanır,
 *   - "Kurul | Tarih | Hafta | Sınav Tarihi" takvim tablosundan kurul sınavlarını çıkarır,
 *   - genel adlı sınavlara ("Teorik Sınav") üstteki kurul başlığını ekler ("II. Kurul · Teorik Sınav").
 * Hangi kurulun sınavlarının kalacağını öğrenci kontrol ekranında işaretleyerek seçer.
 */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const ROMAN_OUT = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Belge bir tıp ders kurulu rehberi mi? (fold edilmiş satırlar) */
export function isKurulDoc(flines) {
  const text = flines.join("\n");
  const kurul = (text.match(/\bkurul/g) || []).length;
  return kurul >= 4 && /ders kurulu|kurul sinav|kurul sonu|kurul teorik|kurul pratik|committee exam/.test(text);
}

/** Satırdaki kurul başlığı: "II. DERS KURULU (…)", "Kurul 7", "6. Ders Kurulu" → 2 / 7 / 6; yoksa null. */
export function kurulNo(fline) {
  const f = fline.trim();
  if (f.length > 90) return null;
  let m = /^(?:[a-z]{2,4}\s?\d{3,4}\s+)?([ivx]{1,4}|\d{1,2})\s*\.?\s*(?:ders\s+)?kurul(?:u)?\b/.exec(f);
  if (!m) m = /^(?:ders\s+)?kurul(?:u)?\s*[-:]?\s*([ivx]{1,4}|\d{1,2})\b/.exec(f);
  if (!m) return null;
  const n = ROMAN[m[1]] ?? +m[1];
  return n >= 1 && n <= 12 ? n : null;
}

/** i. satırın üstündeki en yakın kurul başlığı (en fazla 120 satır geri). */
export function kurulAbove(flines, i) {
  for (let j = i; j >= Math.max(0, i - 120); j--) {
    const n = kurulNo(flines[j]);
    if (n) return n;
  }
  return null;
}

export const kurulLabel = (n) => `${ROMAN_OUT[n] || n}. Kurul`;

const dmy = (s) => {
  const m = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s || "");
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * Takvim tablosu: başlıkta "kurul" ve "sınav tarihi" geçen satırın altındaki satırlar
 * ("MOLEKÜLDEN HÜCREYE | 6.11.2023 | 6 | 16.12.2023"). Son tarih sınav tarihidir.
 */
export function kurulCalendar(lines, flines) {
  const out = [];
  for (let i = 0; i < flines.length; i++) {
    const h = flines[i].split("\t");
    if (h.length < 2 || !h.some((c) => /\bkurul/.test(c)) || !h.some((c) => /sinav tarihi|exam date/.test(c))) continue;
    // Tablo satırları arasında boş satır, dikey yazılmış dönem harfleri ("G", "Ü", "Z") ve tatil satırları olabilir;
    // yalnız en az iki hücreli ve son hücresi tarih olan satırlar okunur
    for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
      const cells = lines[j].split("\t").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      if (/sinav tarihi|exam date/.test(flines[j])) break; // sonraki tablo
      const iso = dmy(cells[cells.length - 1]);
      const names = cells.slice(0, -1).filter((c) => c.length > 2 && !/^\d+$/.test(c) && !/\d{1,2}[./]\d{1,2}[./]\d{4}/.test(c));
      const name = names.find((c) => /kurul/i.test(c)) || names[0];
      if (!iso || !name || name.length > 60 || /^(guz|bahar|donem)/.test(name.toLocaleLowerCase("tr-TR").replace(/ü/g, "u").replace(/ö/g, "o"))) continue;
      const nice = name.toLocaleLowerCase("tr-TR").replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("tr-TR"));
      out.push({ type: "sinav", title: /sınav/i.test(nice) ? nice : /kurul/i.test(nice) ? `${nice} sınavı` : `${nice} kurul sınavı`, date: iso, time: "", week: null, source: lines[j].replace(/\t/g, " · ").slice(0, 150) });
    }
  }
  return out;
}
