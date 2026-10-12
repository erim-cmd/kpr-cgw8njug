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

/* ------------------------------------------------------------------ */
/* Kurul içindeki not tablosu (v2.27.3)                                 */
/* ------------------------------------------------------------------ */
// Kural: yalnız belgede yazan ve tam 100 eden ağırlık. Aralık ("80-82"), örnek ("Örneğin … %15") ve
// soru sayısı tabloları ("TOPLAM 94 6 100") okunmaz; bulunamazsa null (öğrenci kendi girer).

const PCT_CELL = /^%\s*(\d{1,3})$|^(\d{1,3})\s*%$/;
const pctOf = (c) => { const m = PCT_CELL.exec(c.trim()); return m ? +(m[1] ?? m[2]) : null; };
const src = (l) => l.replace(/\t/g, " · ").replace(/\s+/g, " ").trim().slice(0, 150);
const sum = (g) => g.reduce((t, x) => t + x.weight, 0);
const tidy = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

/**
 * Kurul başına sütunlu tablo: "Yazılı | %95 | %94 | … / Uygulama | %5 | %6 | … / Toplam | %100 | …" (Medipol).
 * İlk kurulun sütunu alınır; sütunlar farklıysa uyarı ile (öğrenci kendi kurulununkini seçer).
 */
function columnTable(lines, flines) {
  for (let i = 0; i < flines.length; i++) {
    const fc = flines[i].split("\t").map((c) => c.trim());
    if (!/^(yazili|teorik)( sinav\w*)?$/.test(fc[0]) || fc.length < 2 || !fc.slice(1).every((c) => pctOf(c) !== null)) continue;
    const rows = [];
    let total = null;
    for (let j = i; j < Math.min(lines.length, i + 10); j++) {
      const c = lines[j].split("\t").map((x) => x.trim());
      if (c.length < 2 || !c.slice(1).every((x) => pctOf(x) !== null)) continue; // aradaki açıklama satırları
      if (/^(toplam|total)\b/.test(fold1(c[0]))) { total = c.slice(1).map(pctOf); break; }
      rows.push({ name: c[0], vals: c.slice(1).map(pctOf), source: src(lines[j]) });
    }
    if (rows.length < 2 || !total || total[0] !== 100) return null;
    const grading = rows.filter((r) => r.vals[0] > 0).map((r) => ({ name: r.name, weight: r.vals[0], source: r.source }));
    if (sum(grading) !== 100) return null;
    const cols = Math.max(...rows.map((r) => r.vals.length));
    const differs = cols > 1 && rows.some((r) => r.vals.some((v) => v !== r.vals[0]));
    const warning = differs
      ? `Not oranları kurula göre değişiyor (${rows.map((r) => `${r.name} %${r.vals.join(", %")}`).join("; ")}); ilk kurulunki getirildi. Kendi kurulununkini kontrol et.`
      : null;
    return { grading, warning };
  }
  return null;
}

/**
 * "Ders Kurulu Etkinlikleri | Adet | Değer (%)" tablosu (Muğla): satır = [ad] · adet · değer. "Yok 0" bileşen
 * değil; ad üst satıra, "(Çoktan seçmeli)" gibi açıklama alt satıra kayabilir. Toplam satırı 100 olmalı.
 */
function valueTable(lines, flines) {
  for (let i = 0; i < flines.length; i++) {
    const f = flines[i];
    if (!/etkinlik/.test(f) || !/\badet\b/.test(f) || !/(deger|agirlik|katki)[^\t]*%|%/.test(f)) continue;
    const grading = [];
    let pending = [];
    let total = null;
    let last = null;
    for (let j = i + 1; j < Math.min(lines.length, i + 45); j++) {
      const raw = lines[j].trim();
      const c = lines[j].split("\t").map((x) => x.trim()).filter(Boolean);
      if (!raw) { last = null; continue; }
      if (/^(toplam|total)\b/.test(fold1(c[0]))) {
        total = /^\d{1,3}$/.test(c[c.length - 1]) ? +c[c.length - 1] : null;
        break;
      }
      const n = c.length;
      const isRow = n >= 2 && /^\d{1,3}$/.test(c[n - 1]) && /^(\d{1,2}|yok|-)$/i.test(fold1(c[n - 2]));
      if (isRow) {
        const name = tidy(n > 2 ? c.slice(0, n - 2).join(" ") : pending.length > 2 ? pending[pending.length - 1] : pending.join(" "));
        last = { name, weight: +c[n - 1], source: src(lines[j]) };
        if (last.weight > 0 && name) grading.push(last);
        pending = [];
        continue;
      }
      // Değer satırının hemen altındaki parantezli açıklama o satırın adına eklenir
      if (/^\(.*\)$/.test(raw) && last) {
        if (last.weight > 0) last.name = tidy(`${last.name} ${raw}`);
        last = null;
        continue;
      }
      pending.push(raw.replace(/\t/g, " "));
      last = null;
    }
    if (grading.length && total === 100 && sum(grading) === 100) return { grading, warning: null };
    return null;
  }
  return null;
}

/**
 * Formül cümlesi: "(MİBU notu x %5) + (kurul sonu sınavı x %95)" (SDÜ). Satır sonları birleştirilir;
 * "Örneğin …" ile başlayan cümledeki örnek ağırlıklar okunmaz (bu biçimde zaten değil, yine de denetlenir).
 */
function formula(lines) {
  const text = lines.join(" ").replace(/\s+/g, " ");
  const TERM = /\(\s*([^()%]{2,50}?)\s*[x×*]\s*%\s*(\d{1,3})\s*\)/g;
  const CHAIN = /\(\s*[^()%]{2,50}?\s*[x×*]\s*%\s*\d{1,3}\s*\)(?:\s*\+\s*\(\s*[^()%]{2,50}?\s*[x×*]\s*%\s*\d{1,3}\s*\))+/g;
  for (const m of text.matchAll(CHAIN)) {
    const before = text.slice(Math.max(0, m.index - 120), m.index);
    const sentence = before.split(/[.!?]\s/).pop();
    if (/örne|orne|example|e\.g\./i.test(sentence)) continue;
    const grading = [...m[0].matchAll(TERM)].map((t) => {
      let name = t[1].trim().replace(/\s+(notu|puan[ıi]|score|grade)$/i, "");
      name = name.charAt(0).toLocaleUpperCase("tr-TR") + name.slice(1);
      return { name, weight: +t[2], source: m[0].slice(0, 150) };
    });
    if (grading.length >= 2 && sum(grading) === 100) return { grading, warning: null };
  }
  return null;
}

/** Kurul rehberindeki not ağırlığı: sütunlu tablo → değer tablosu → formül cümlesi; hiçbiri yoksa null. */
export function kurulGrading(lines, flines) {
  return columnTable(lines, flines) || valueTable(lines, flines) || formula(lines);
}

/* ------------------------------------------------------------------ */
/* Haftalık ızgaradaki sınav hücreleri (v2.27.3)                         */
/* ------------------------------------------------------------------ */
// "6. HAFTA | 04.11.2024 | 05.11.2024 | … " başlıklı ızgarada "TEORİK SINAV" hücresi. PDF metninde boş
// hücreler düşer: satırdaki hücre sayısı gün sayısına eşitse sütun (gün) bellidir → o günün tarihi.
// Değilse gün uydurulmaz: tarihsiz sınav, başlıkta hafta aralığı ("Teorik Sınav (4–8 Kasım haftası)").

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const EXAM_CELL = /^(teorik|pratik|uygulama) sinav(i)?$/;
const TIME_CELL = /^\d{1,2}[:.]\d{2}\s*(-\s*(\d{1,2}[:.]\d{2})?)?$/;
const titleCase = (s) => s.toLocaleLowerCase("tr-TR").replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("tr-TR"));
function rangeLabel(a, b) {
  const [, m1, d1] = a.split("-").map(Number);
  const [, m2, d2] = b.split("-").map(Number);
  return m1 === m2 ? `${d1}–${d2} ${AYLAR[m2 - 1]}` : `${d1} ${AYLAR[m1 - 1]} – ${d2} ${AYLAR[m2 - 1]}`;
}

export function kurulGrid(lines, flines) {
  const out = [];
  const heads = [];
  lines.forEach((l, i) => {
    const dates = l.split("\t").map((c) => dmy(c.trim())).filter(Boolean);
    if (dates.length >= 5 && dates.length <= 7) heads.push({ i, dates });
  });
  heads.forEach((h, k) => {
    const end = Math.min(lines.length, k + 1 < heads.length ? heads[k + 1].i : h.i + 80);
    for (let j = h.i + 1; j < end; j++) {
      let cells = lines[j].split("\t").map((c) => c.trim()).filter(Boolean);
      let fcells = flines[j].split("\t").map((c) => c.trim()).filter(Boolean);
      if (fcells.length && TIME_CELL.test(fcells[0])) { cells = cells.slice(1); fcells = fcells.slice(1); }
      fcells.forEach((fc, x) => {
        if (!EXAM_CELL.test(fc)) return;
        const name = titleCase(cells[x]);
        const date = fcells.length === h.dates.length ? h.dates[x] : "";
        const title = date ? name : `${name} (${rangeLabel(h.dates[0], h.dates[h.dates.length - 1])} haftası)`;
        if (out.some((o) => o.title === title && o.date === date)) return; // iki saatlik sınav iki satırda
        out.push({ type: "sinav", title, date, time: "", week: null, source: src(lines[j]) });
      });
    }
  });
  return out;
}

/** Hücre/etiket için hafif fold (kurul.js syllabus-local'i içe aktarmaz). */
function fold1(s) {
  return (s || "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/â/g, "a").replace(/î/g, "i");
}
