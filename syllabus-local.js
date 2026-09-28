/**
 * KPR — Cihaz içi syllabus ayrıştırıcı (kural tabanlı, internet gerektirmez).
 *
 * Girdi: doc-text.js'in düz metni (tablo hücreleri "\t" ile ayrık).
 * Çıktı: functions/api/syllabus.js sanitize() ile aynı şekil, böylece kontrol ekranı iki yolda da aynı:
 *   { course, sessions, items, grading, attendance, final_min, policies, warnings }
 *
 * Türkçe ve İngilizce izlenceler; Bologna tablo biçimi, "Etiket: değer" satırları ve düz paragraflar.
 * Emin olunamayan her şey warnings'e yazılır; öğrenci kaydetmeden önce kontrol ekranında düzeltir.
 */

/* ------------------------------------------------------------------ */
/* Metin yardımcıları                                                    */
/* ------------------------------------------------------------------ */

/** Eşleştirme anahtarı: küçük harf, Türkçe harfler ASCII'ye (uzunluk korunur → indeksler asıl metinde geçerli). */
export function fold(s) {
  let out = "";
  for (const ch of s) {
    const map = { İ: "i", I: "i", ı: "i", Ş: "s", ş: "s", Ğ: "g", ğ: "g", Ç: "c", ç: "c", Ö: "o", ö: "o", Ü: "u", ü: "u", Â: "a", â: "a", Î: "i", î: "i", Û: "u", û: "u" };
    let c = map[ch] ?? ch.toLowerCase();
    if (c.length !== ch.length) c = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (c.length !== ch.length) c = ch; // uzunluk değişirse (nadir) olduğu gibi bırak
    out += c;
  }
  return out;
}

const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/^[\s:;,\-–|•·]+|[\s:;,\-–|•·]+$/g, "").trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const pad = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ */
/* Tarih ve saat                                                         */
/* ------------------------------------------------------------------ */

const MONTHS = [
  ["ocak", "oca", "january", "jan"], ["subat", "sub", "february", "feb"], ["mart", "mar", "march"],
  ["nisan", "nis", "april", "apr"], ["mayis", "may"], ["haziran", "haz", "june", "jun"],
  ["temmuz", "tem", "july", "jul"], ["agustos", "agu", "august", "aug"], ["eylul", "eyl", "september", "sept", "sep"],
  ["ekim", "eki", "october", "oct"], ["kasim", "kas", "november", "nov"], ["aralik", "ara", "december", "dec"],
];
const MONTH_RE = MONTHS.flat().sort((a, b) => b.length - a.length).join("|");
const monthOf = (w) => MONTHS.findIndex((l) => l.includes(w)) + 1;

const DATE_PATTERNS = [
  // 12.10.2026 · 12/10/2026 · 12-10-26 · 12.10 (yılsız)
  { re: /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?\b/g, get: (m) => ({ d: +m[1], mo: +m[2], y: m[3] }) },
  // 2026-10-12
  { re: /\b(20\d{2})-(\d{2})-(\d{2})\b/g, get: (m) => ({ d: +m[3], mo: +m[2], y: m[1] }) },
  // 12 Ocak 2027 · 12 October 2026 · 12 Oct
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:,?\\s+(20\\d{2}))?\\b`, "g"), get: (m) => ({ d: +m[1], mo: monthOf(m[2]), y: m[3] }) },
  // October 13, 2026 · Oct 13
  { re: new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "g"), get: (m) => ({ d: +m[2], mo: monthOf(m[1]), y: m[3] }) },
];

/** Katlanmış metinde tüm tarihler, konumlarıyla. Saat aralıkları (09.00-10.50) tarih sanılmaz. */
function findDates(f, termYear) {
  const out = [];
  for (const { re, get } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(f))) {
      const v = get(m);
      if (!(v.mo >= 1 && v.mo <= 12 && v.d >= 1 && v.d <= 31)) continue;
      // "09.00" gibi saatleri ve "3.5" gibi sayıları ele: noktalı iki parça + yıl yok → sadece ay ≥ 1 ve bağlam tarih ise
      if (re === DATE_PATTERNS[0].re && !v.y) {
        const around = f.slice(Math.max(0, m.index - 1), m.index + m[0].length + 1);
        if (/[:]/.test(around) || /\d[.:]\d{2}\s*[-–]\s*\d/.test(f.slice(m.index, m.index + 12))) continue;
        if (!/[./]/.test(m[0]) || m[1].length > 2 || m[2].length !== 2) continue;
      }
      let y = v.y ? (v.y.length === 2 ? 2000 + +v.y : +v.y) : null;
      const assumed = y === null;
      if (assumed) y = inferYear(v.mo, termYear);
      const dt = new Date(y, v.mo - 1, v.d);
      if (dt.getMonth() !== v.mo - 1) continue;
      if (out.some((o) => o.index <= m.index && o.end >= m.index + m[0].length)) continue;
      out.push({ index: m.index, end: m.index + m[0].length, iso: `${y}-${pad(v.mo)}-${pad(v.d)}`, assumed });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Güz: Eylül–Ocak, Bahar: Şubat–Haziran. termYear = akademik yılın ilk yılı. */
function inferYear(month, term) {
  if (term.season === "bahar") return term.year + 1;
  if (term.season === "yaz") return term.year + 1;
  return month >= 8 ? term.year : term.year + 1;
}

const TIME_RE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
const RANGE_RE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|—|to|ile|ila|\/)\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g;
const hm = (h, m) => `${pad(+h)}:${m}`;

/* ------------------------------------------------------------------ */
/* Günler                                                                */
/* ------------------------------------------------------------------ */

const DAYS = [
  ["pazartesi", "pzt", "monday", "mondays", "mon"], ["sali", "sal", "tuesday", "tuesdays", "tue", "tues"],
  ["carsamba", "car", "wednesday", "wednesdays", "wed"], ["persembe", "per", "thursday", "thursdays", "thu", "thurs"],
  ["cuma", "cum", "friday", "fridays", "fri"], ["cumartesi", "cmt", "saturday", "saturdays", "sat"], ["pazar", "paz", "sunday", "sundays", "sun"],
];
const DAY_RE = new RegExp(`\\b(${DAYS.flat().sort((a, b) => b.length - a.length).join("|")})\\b`, "g");
const dayOf = (w) => DAYS.findIndex((l) => l.includes(w));

/* ------------------------------------------------------------------ */
/* Etiketler (katlanmış biçimde)                                          */
/* ------------------------------------------------------------------ */

const LABELS = {
  code: ["ders kodu", "dersin kodu", "course code", "kod", "code"],
  name: ["dersin adi", "ders adi", "course name", "course title", "dersin ismi", "title"],
  instructor: ["ogretim uyesi", "ogretim elemani", "ogretim gorevlisi", "dersin ogretim uyesi", "dersi veren ogretim elemani", "dersi veren", "sorumlu ogretim uyesi", "course instructor", "instructor", "lecturer", "dersin sorumlusu", "koordinator", "coordinator"],
  email: ["e-posta", "eposta", "e-mail", "email", "mail"],
  office: ["ofis", "oda", "office", "office room", "office location"],
  office_hours: ["ofis saatleri", "ofis saati", "gorusme saatleri", "gorusme saati", "office hours", "office hour"],
  credit: ["yerel kredi", "ulusal kredi", "kredi (t+u+k)", "kredisi", "kredi", "local credit", "national credit", "credits", "credit"],
  ects: ["akts", "ects", "akts kredisi", "ects credit"],
  sessions: ["ders saatleri", "ders gunu ve saati", "ders gun ve saatleri", "ders gunleri", "ders saati", "gun/saat", "lectures", "lecture hours", "class hours", "class times", "meeting times", "schedule", "lecture", "class"],
  room: ["derslik", "sinif", "room", "classroom", "location", "yer"],
  contact: ["iletisim", "iletisim bilgileri", "contact", "contact information"],
  course: ["ders", "course"],
};
const ALL_LABELS = Object.entries(LABELS).flatMap(([k, list]) => list.map((l) => ({ k, l }))).sort((a, b) => b.l.length - a.l.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Satır içinde "Etiket:" konumları (etiketten sonra iki nokta şart; tablo hücresinde değil)
const INLINE_LABEL_RE = new RegExp(`(?:^|[\\s(])(${ALL_LABELS.map((x) => esc(x.l)).join("|")})\\s*:`, "g");

/** Satırdan (etiket, değer) çiftleri: tablo hücresi [etiket][değer] ya da "Etiket: değer Etiket2: değer2". */
function labelPairs(line, fline) {
  const pairs = [];
  const cells = line.split("\t");
  if (cells.length >= 2) {
    const fc = fold(cells[0]).replace(/[:*]/g, "").trim();
    // Birleşik "Credits/ ECTS" ya da "Kredi/AKTS" sütunu: değer "4 / 5" gibi ikiye ayrılır
    if (/(credit|kredi)/.test(fc) && /(ects|akts)/.test(fc)) {
      const parts = clean(cells.slice(1).join(" ")).split(/\//).map(clean);
      if (parts[0]) pairs.push({ k: "credit", v: parts[0], label: cells[0] });
      if (parts[1]) pairs.push({ k: "ects", v: parts[1], label: cells[0] });
    } else if (/derslik|\broom\b|classroom|\bsinif\b/.test(fc) && /zaman|saat|\btime\b|\bhour/.test(fc)) {
      // Birleşik "Derslik ve Zaman" / "Classroom & Time" sütunu: değer bir ders saati+gün ifadesidir,
      // salt oda adı değil — ders saatleri adayı olarak işaretle (aksi halde tüm satır yanlışlıkla "oda" sanılır).
      pairs.push({ k: "sessions", v: clean(cells.slice(1).join(" ")), label: cells[0] });
    } else {
      const hit = ALL_LABELS.find((x) => fc === x.l || (x.k !== "course" && fc.includes(x.l) && fc.length - x.l.length <= 14 && x.l.length >= 4));
      if (hit) pairs.push({ k: hit.k, v: clean(cells.slice(1).join(" ")), label: cells[0] });
    }
  }
  INLINE_LABEL_RE.lastIndex = 0;
  const hits = [];
  let m;
  while ((m = INLINE_LABEL_RE.exec(fline))) {
    const start = m.index + m[0].indexOf(m[1]);
    hits.push({ l: m[1], start, valStart: m.index + m[0].length });
  }
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : line.length;
    const k = ALL_LABELS.find((x) => x.l === h.l).k;
    pairs.push({ k, v: clean(line.slice(h.valStart, end).replace(/\t/g, " ")), label: h.l });
  });
  return pairs;
}

/* ------------------------------------------------------------------ */
/* Değerlendirme                                                          */
/* ------------------------------------------------------------------ */

const GRADING_HEAD = /^(olcme ve )?degerlendirme|notlandirma|basari notu|degerlendirme sistemi|grading|assessment|evaluation|course evaluation|grade distribution|basari degerlendirme|degerlendirme olcutleri/;
const SKIP_ROW = /\b(toplam|total|genel toplam|sum)\b|basariya (katkisi|orani)|basari notuna katkisi|yariyil ici calismalari|donem ici calismalar|yil ici|katkisi$/;
const COMPONENT = /(vize|ara sinav|arasinav|midterm|final|yariyil sonu|quiz|kisa sinav|odev|homework|assignment|proje|project|lab|laboratuvar|sunum|presentation|rapor|report|katilim|participation|attendance|devam|uygulama|practice|seminer|seminar|tartisma|discussion|bitirme|portfolyo|portfolio|arazi|atolye|workshop|problem set|case|vaka|exam|sinav|test|sertifika|certificate|mooc)/;

function parseGrading(lines, flines) {
  // 1) Bölüm başlığından sonraki ~25 satır ve 2) belgenin tamamında yüzdeli bileşen satırları
  const found = new Map();
  const shares = { sem: null, fin: null };
  let headerWeightCol = -1;
  let inSection = 0;
  for (let i = 0; i < lines.length; i++) {
    const f = flines[i].trim();
    // Gerçek bölüm başlıkları kısa ve büyük harfle başlar ("Değerlendirme", "6. ..."); uzun bir cümle ya da
    // tablo satırı içinde geçen "değerlendirme" gibi bir sözcük (ör. haftalık planın bir hücresinde) başlık sayılmaz.
    const lineTrim = lines[i].trim();
    if (lineTrim.length <= 90 && /^[0-9A-ZÇĞİÖŞÜ]/.test(lineTrim) && GRADING_HEAD.test(f.replace(/^\d+[.)]\s*/, ""))) {
      inSection = 30;
      headerWeightCol = -1; // yeni bölüm: önceki tablodan kalma sütun indeksini unut
    } else if (inSection) {
      inSection--;
      if (inSection === 0) headerWeightCol = -1; // pencere kapandı: eski sütun indeksi başka bir tabloya sızmasın
    }
    const cells = lines[i].split("\t").map(clean);
    const fcells = cells.map(fold);

    // Farklı bir tablonun başlığına geçildiyse (ör. haftalık planın "Hafta" sütunu), önceki tablodan
    // kalma ağırlık-sütunu indeksini unut — yoksa çok sonraki alakasız bir satıra yanlışlıkla sızabilir.
    if (cells.length >= 2 && fcells.some((c) => /^(hafta|week|wk|hf)\b/.test(c.trim()))) {
      headerWeightCol = -1;
      inSection = 0;
    }

    if (cells.length >= 2) {
      // Başlık satırı: hangi sütun ağırlık?
      // Not: salt "%" bir başlık işareti olabilir ("Ağırlık (%)"), ama "%20" gibi bir veri değeri değil —
      // yalnızca rakam içermeyen "%" hücreleri başlık sayılır.
      // Not: "etki" kelimesi "etkinlik" (activity) içinde de geçtiği için başlık ipucu listesinden çıkarıldı.
      const wc = fcells.findIndex((c) => (/katki|agirlik|weight|oran|yuzde|percent|puan|notuna etkisi/.test(c) || (/%/.test(c) && !/\d/.test(c))) && !COMPONENT.test(c));
      if (wc > 0 && !fcells.some((c) => /^\d/.test(c))) {
        headerWeightCol = wc;
        continue;
      }
      // "CLO No. / Assessment Component / Weight" gibi tablolarda ilk sütun ders çıktısı numarasıdır
      // ("1-5", "2-4, 7-9", "-", "DK1, DK2, DK4" gibi), asıl bileşen adı ikinci sütunda olabilir;
      // adı bazen de sarmadan ötürü satırın hemen üstündeki tek hücreli satır(lar)a düşmüş olabilir.
      // Aralık tireleri PDF'te "-" değil "–"/"—" (en/em dash) olabilir (ör. "1–4").
      const cloLike = /^[-–—]$|^((\d+|dk\d+|clo\d+)([-–—]\d+)?)(\s*,\s*(\d+|dk\d+|clo\d+)([-–—]\d+)?)*$/i;
      let nameIdx = 0;
      let name = cells[0];
      let fname = fcells[0];
      if (!COMPONENT.test(fname) && cloLike.test(fname.replace(/\s+/g, ""))) {
        if (cells[1] && COMPONENT.test(fcells[1])) {
          nameIdx = 1;
          name = cells[1];
          fname = fcells[1];
        } else if (/^(dk|clo)\d/i.test(fname.replace(/\s+/g, "")) || /,/.test(fname)) {
          // Üstteki tek hücreli, kutucuk içermeyen satırları (en fazla 3) birleştirip ad adayı yap.
          // Sadece "DK1, DK2" gibi açıkça bir öğrenme çıktısı listesiyse denenir; yalın "4" gibi bir
          // hafta numarasıyla karışabilecek durumlarda bu adımı atla.
          let cand = "";
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const pcells = lines[j].split("\t");
            if (pcells.length !== 1) break;
            const pt = clean(pcells[0]);
            if (!pt || /[☐☒□■]/.test(pt)) break;
            cand = cand ? `${pt} ${cand}` : pt;
          }
          if (cand && COMPONENT.test(fold(cand))) {
            name = cand;
            fname = fold(cand);
          }
        }
      }
      if (shareRow(fname, cells.slice(nameIdx + 1).join(" "), shares)) continue;
      if (!name || !COMPONENT.test(fname) || SKIP_ROW.test(fname)) continue;
      const vals = cells.slice(nameIdx + 1);
      let w = null;
      // headerWeightCol, başlık satırındaki MUTLAK hücre indeksi; ad CLO sütunundan kaydırıldıysa (nameIdx)
      // vals içindeki karşılığı da aynı miktarda kaymış olur.
      const wIdx = headerWeightCol - nameIdx - 1;
      if (headerWeightCol > 0 && wIdx >= 0 && vals[wIdx] !== undefined) w = numIn(vals[wIdx]);
      if (w === null) {
        const pct = vals.map((v) => (/%/.test(v) ? numIn(v) : null)).filter((x) => x !== null);
        const nums = vals.map(numIn).filter((x) => x !== null);
        w = pct.length ? pct[pct.length - 1] : nums.length ? nums[nums.length - 1] : null;
      }
      // Satırın kendisinde "%30" varsa (ör. "Vize (%30)")
      if (w === null) w = pctIn(name);
      if (w !== null && w > 0 && w <= 100 && (inSection || /%/.test(lines[i]) || headerWeightCol > 0)) {
        add(found, stripPct(name), w, lines[i]);
      }
      continue;
    }

    // Tek hücreli satır: "Vize %35, Proje %25, Final %40" · "Midterm Exam: 30%" · "Quizzes (best 4 of 5): 10%"
    // Not: cümle sınırında da böl ("...Turnitin. The maximum ratio is 30%.") — yoksa alakasız bir cümledeki
    // yüzde, önceki cümledeki "project" gibi bir anahtar kelimeyle yanlışlıkla eşleşip sahte bir not bileşeni üretebilir.
    const line = lines[i];
    const parts = line.split(/[,;]|\s{2,}|(?<!\d)\.\s+(?=[A-ZÇĞİÖŞÜ])|\s+(?:ve|and)\s+(?=[A-ZÇĞİÖŞÜa-zçğıöşü]+\s*[:(%-]?\s*%?\d)/);
    if (shareRow(fold(line), line, shares)) continue;
    for (const part of parts) {
      const fp = fold(part);
      if (!COMPONENT.test(fp) || SKIP_ROW.test(fp)) continue;
      const w = pctIn(part) ?? (inSection ? tailNum(part) : null);
      if (w === null || w <= 0 || w > 100) continue;
      // "%70 devam zorunlu", "devamsızlık %30'u geçemez" gibi kural cümlelerini ele
      if (/zorunlu|required|must|en az|at least|devam etmek|attend at least|minimum|gerekir|gerekmektedir|devamsiz|gecemez|asamaz|exceed|absen|kalir/.test(fp)) continue;
      if (part.length > 70 && !inSection) continue;
      add(found, componentName(part), w, line);
    }
  }
  let out = [...found.values()].map(({ name, weight, source }) => ({ name: cut(name, 40), weight, source })).filter((g) => g.name);
  // Bologna: bileşenler yarıyıl içinin kendi içindeki payları (toplam 100) ve final ayrı bir satırda → ölçekle
  const hasFinal = out.some((g) => /final|yariyil sonu/.test(fold(g.name)));
  const sum = out.reduce((t, g) => t + g.weight, 0);
  if (shares.fin !== null && !hasFinal && Math.abs(sum - 100) < 0.5) {
    const sem = shares.sem ?? 100 - shares.fin;
    out = out.map((g) => ({ ...g, weight: Math.round(g.weight * sem) / 100 }));
    out.push({ name: "Final", weight: shares.fin, source: "" });
  }
  return out;
}

/** "Yarıyıl içinin başarıya oranı 60" / "Percentage of final work %50" gibi özet satırlar. */
function shareRow(fname, rest, shares) {
  if (!/basari|katki|oran|percentage|contribution|agirlig/.test(fname)) return false;
  const n = numIn(rest.replace(/^[^\d%]*?(?=%?\s*\d)/, "")) ?? pctIn(rest);
  if (n === null) return false;
  if (/yariyil ici|yariyil icinin|donem ici|semester (work|studies|requirements)|in-term|midterm work|yil ici/.test(fname)) {
    shares.sem = n;
    return true;
  }
  if (/final|yariyil sonu|end of semester|donem sonu/.test(fname)) {
    shares.fin = n;
    return true;
  }
  return false;
}

/** Tek satırdan bileşen adı: "1. Ara Sınav (%20) – 21 Ekim…" → "1. Ara Sınav". */
function componentName(part) {
  const segs = stripPct(part).split(/\s[–—-]\s|:|\(|\)|;/).map(clean).filter(Boolean);
  return segs.find((x) => COMPONENT.test(fold(x))) || segs[0] || "";
}

function add(map, name, w, source) {
  const key = fold(name).replace(/[^a-z0-9]/g, "");
  if (!key || map.has(key)) return;
  map.set(key, { name: clean(name), weight: w, source });
}
const numIn = (s) => {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s*%?/.exec(s || "");
  const n = m ? parseFloat(m[1].replace(",", ".")) : null;
  return n !== null && n >= 0 && n <= 100 ? n : null;
};
const pctIn = (s) => {
  const m = /%\s*(\d{1,3}(?:[.,]\d+)?)|(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(s || "");
  if (!m) return null;
  const n = parseFloat((m[1] || m[2]).replace(",", "."));
  return n > 0 && n <= 100 ? n : null;
};
const tailNum = (s) => {
  const m = /[:\-–]\s*(\d{1,3})\s*$/.exec(s || "");
  return m ? +m[1] : null;
};
const stripPct = (s) =>
  clean(
    s.replace(/^[^:]{2,40}:\s*(?=\S)/, (m) => (GRADING_HEAD.test(fold(m).trim()) || !COMPONENT.test(fold(m)) ? "" : m)).replace(/\([^()]*%[^()]*\)/g, "")
      .replace(/%\s*\d+[.,]?\d*|\d+[.,]?\d*\s*%/g, "")
      .replace(/[:\-–]\s*\d{1,3}\s*$/, "")
  );

/* ------------------------------------------------------------------ */
/* Sınav / ödev tarihleri                                                */
/* ------------------------------------------------------------------ */

const ITEM_KINDS = [
  { type: "sinav", re: /\b(ara sinav|arasinav|vize|midterm|mid-term)\b/, tr: "Vize sınavı", group: "vize" },
  { type: "sinav", re: /\b(final|yariyil sonu sinavi|yariyil sonu|donem ?sonu sinavi)\b/, tr: "Final sınavı", group: "final" },
  { type: "sinav", re: /\b(butunleme|resit|make-?up exam|mazeret sinavi)\b/, tr: "Bütünleme", group: "butunleme" },
  { type: "sinav", re: /\b(quiz|kisa sinav|pop quiz)\b/, tr: "Quiz", group: "quiz" },
  { type: "proje", re: /\b(proje|project|sunum|presentation|poster)\b/, tr: "Proje", group: "proje" },
  { type: "odev", re: /\b(odev|homework|assignment|hw|problem set|rapor|report|essay|makale|lab raporu)\b/, tr: "Ödev", group: "odev" },
  { type: "sinav", re: /\b(exam|sinav|sinavi)\b/, tr: "Sınav", group: "sinav" },
];
// Bu kelimeler geçen cümleler takvim değil kuraldır (tarih içermedikçe öğe üretmez)
const RULE_WORDS = /\ben az\b|\bat least\b|zorunlu|required|must|kabul edilmez|not accepted|penalty|ceza|kesinti|puan alin|gerekmektedir|gerekir|sevk|disiplin|plagiarism|intihal|kopya|devam sartini|%|revision|revise|review\b|tekrar\b|gozden gecir/;
const SCHEDULE_WORDS = /\bhafta\b|\bweek\b|\btba\b|\btbd\b|ilan edilecek|announced|akademik takvim|academic calendar|tarih|date|final exam week|sinav haftasi|exam week/;

// Ders olmayan gün ("No class Apr 20", "20 Nisan ders yok", "HOLIDAY") hiçbir zaman sınav/teslim tarihi değildir.
// Katlanmış (fold) metinde, tarihin hemen önündeki ~30 karakterde aranır.
const NO_CLASS = /(no class(?:es)?|no lecture|ders yok|ders yapilmayacak|holiday|tatil|break)[^\d]{0,12}$/;
const noClassAt = (ftext, idx) => NO_CLASS.test(ftext.slice(Math.max(0, idx - 30), idx));
// "ders saatinde" yapılacak sınav (katlanmış metin)
const CLASS_TIME_RE = /(during class time|during class|in class|ders saatinde|ders saati icinde|derste)\)?\s*$/;
// Tarihin sonradan ilan edileceğini söyleyen ifadeler
const TBA_RE = /\btba\b|\btbd\b|to be announced|will be announced|ilan edilecek|belirlenecek|duyurulacak/;

function titleFrom(orig, fk, kind, datesInCell) {
  // Tarihleri çıkar, sonra ayırıcılara göre böl ve anahtar kelimeyi içeren parçayı başlık yap
  let t = orig;
  for (const d of [...datesInCell].sort((a, b) => b.index - a.index)) t = t.slice(0, d.index) + " " + t.slice(d.end);
  const segs = t.split(/\s[–—-]\s|:|\(|\)|,|;|\|| · /).map(clean).filter(Boolean);
  let seg = segs.find((x) => kind.re.test(fold(x))) || segs.find((x) => ITEM_KINDS.some((k) => k.re.test(fold(x)))) || "";
  const fseg = fold(seg);
  // "due", "teslim", saat, gün adı ve "8. hafta" gibi ekleri at (katlanmış metinde bul, asıl metinden kes)
  const drop = [
    /\b(teslim tarihi|son teslim|teslimi|teslim|due date|deadline|due|tarihi|date|saat|saati|at|on|tba|tbd|submission)\b/g,
    /\b([01]?\d|2[0-3])[:.][0-5]\d\b/g,
    /\b(pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g,
    /\b\d{1,2}\s*\.?\s*(hafta|haftasi|week)\b|\bweek\s*\d{1,2}\b/g,
  ];
  const mask = [...seg].map(() => true);
  for (const re of drop) for (const m of fseg.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = false;
  seg = clean([...seg].map((c, i) => (mask[i] ? c : " ")).join(""));
  seg = clean(seg.replace(/["“”'‘’\[\]{}]/g, " "));
  if (!seg || seg.length > 60 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(seg)) seg = kind.tr;
  return seg.charAt(0).toLocaleUpperCase("tr-TR") + seg.slice(1);
}

function parseItems(lines, flines, termYear, warnings) {
  const items = [];
  let weekCol = -1;
  let dateCol = -1;

  // Ön tarama: PDF'te bir tablo satırı birkaç fiziksel satıra bölünebilir (sütun kayması).
  // Kendi hafta numarası olmayan bir satırdaki bulgu, en yakın "çapa" (hafta numarası taşıyan) satırın haftasına atanır.
  // Bazı biçimlerde hafta hücresi yalın ("3"), bazılarında tireli ("3 –") verilir; tireli biçimde tarih
  // parçaları da (gün numarası) yalın rakam olarak ayrı satırlara düşebileceğinden ("21", "28" gibi),
  // belgede tireli çapa çoğunluktaysa SADECE tireli biçim güvenilir çapa sayılır.
  let scanWeekCol = -1;
  const dashAnchors = [];
  const bareAnchors = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const fcells = cells.map(fold);
    if (cells.length >= 2) {
      const wc = fcells.findIndex((c) => /^(hafta|week|wk|hf)\b/.test(c.trim()));
      if (wc >= 0 && !fcells.some((c) => COMPONENT.test(c) && /\d/.test(c))) {
        scanWeekCol = wc;
        continue;
      }
    }
    if (scanWeekCol >= 0 && cells.length >= 2) {
      const cellTxt = (cells[scanWeekCol] || "").trim();
      let m = /^(\d{1,2})\s*[-–—]\s*$/.exec(cellTxt);
      if (m) {
        const w = +m[1];
        if (w > 0 && w < 30) dashAnchors.push({ i, week: w });
        continue;
      }
      m = /^(\d{1,2})$/.exec(cellTxt);
      if (m) {
        const w = +m[1];
        if (w > 0 && w < 30) bareAnchors.push({ i, week: w });
      }
    }
  }
  const useDashWeeks = dashAnchors.length >= 2;
  const anchors = useDashWeeks ? dashAnchors : bareAnchors;
  /** Bir hücrenin metninden, belgenin kullandığı biçime göre (yalın/tireli) hafta numarasını çıkarır. */
  const weekCellNum = (cellTxt) => {
    const t = (cellTxt || "").trim();
    const m = useDashWeeks ? /^(\d{1,2})\s*[-–—]\s*$/.exec(t) : /^(\d{1,2})$/.exec(t);
    return m ? +m[1] : NaN;
  };
  const nearestWeek = (i) => {
    let best = null;
    let bestDist = Infinity;
    for (const a of anchors) {
      const dist = Math.abs(a.i - i);
      if (dist < bestDist) {
        bestDist = dist;
        best = a.week;
      }
    }
    return bestDist <= 3 ? best : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const fcells = cells.map(fold);
    // Haftalık plan başlığı
    if (cells.length >= 2) {
      const wc = fcells.findIndex((c) => /^(hafta|week|wk|hf)\b/.test(c.trim()));
      const dc = fcells.findIndex((c) => /^(tarih|date|tarihler|dates)\b/.test(c.trim()));
      if (wc >= 0 && !fcells.some((c) => COMPONENT.test(c) && /\d/.test(c))) {
        weekCol = wc;
        dateCol = dc;
        continue;
      }
    } else if (!lines[i].trim()) {
      // boş satır tabloyu bitirmez (PDF'te sayfa geçişi), ama başlık satırı gelirse sıfırlanır
    }
    const rowWeek = weekCol >= 0 && cells.length >= 2 ? weekCellNum(cells[weekCol]) : NaN;
    const rowDates = dateCol >= 0 && cells[dateCol] ? findDates(fcells[dateCol], termYear) : [];

    // Satırdaki her hücre için: anahtar kelime var mı?
    const rowFound = [];
    cells.forEach((cell, ci) => {
      if (cells.length >= 2 && (ci === weekCol || ci === dateCol)) return;
      const fc = fcells[ci];
      const kind = ITEM_KINDS.find((k) => k.re.test(fc));
      if (!kind) return;
      const dates = findDates(fc, termYear);
      const lineIsRule = RULE_WORDS.test(fc) && !dates.length && !SCHEDULE_WORDS.test(fc);
      if (lineIsRule) return;
      rowFound.push({ ci, kind, dates, cell });
    });
    if (!rowFound.length) continue;

    // Aynı satırda aynı grup birden çok hücrede: kendi tarihi olanı tercih et
    const byGroup = new Map();
    for (const r of rowFound) {
      const prev = byGroup.get(r.kind.group);
      if (
        !prev ||
        (!prev.dates.length && r.dates.length) ||
        (prev.dates.length === r.dates.length && r.dates.length && r.cell.length > prev.cell.length) ||
        (prev.dates.length === r.dates.length && !r.dates.length && r.cell.length < prev.cell.length)
      )
        byGroup.set(r.kind.group, r);
    }
    // Tek hücreli satırda birden fazla tür varsa (ör. "Vize ve final tarihleri") ilkini al
    const picks = cells.length === 1 ? [rowFound[0]] : [...byGroup.values()];

    for (const r of picks) {
      const fc = fcells[r.ci];
      // Tarih: hücrenin kendi tarihi (anahtar kelimeden sonraki ilk), yoksa satırın tarih sütunu, yoksa satırdaki herhangi bir tarih
      const kpos = r.kind.re.exec(fc).index;
      const own = r.dates.filter((x) => !noClassAt(fc, x.index));
      let d = own.find((x) => x.index >= kpos) || own[0];
      let dsrc = fc; // tarihin alındığı hücre (katlanmış)
      if (!d && rowDates.length) {
        d = rowDates.find((x) => !noClassAt(fcells[dateCol], x.index));
        dsrc = fcells[dateCol];
      }
      if (!d && cells.length > 1) {
        const any = cells.flatMap((c, k) => (k === r.ci ? [] : findDates(fcells[k], termYear).filter((x) => !noClassAt(fcells[k], x.index)).map((x) => ({ x, k }))));
        if (any[0]) ({ x: d, k: dsrc } = { x: any[0].x, k: fcells[any[0].k] });
      }
      // "Mid-Term Exam 1 · TBA (Midterms Week) – No class Apr 20": sınavın kendi hücresi ya da tarihin
      // ödünç alındığı hücre tarihin ilan edileceğini söylüyorsa, ödünç tarih uydurma olur → tarihsiz.
      // (Satırın başka bir hücresindeki "final … will be announced" bu öğeyi etkilemez.)
      if (d && !own.includes(d) && (TBA_RE.test(fc) || TBA_RE.test(dsrc))) d = null;
      // "Final exam period: 14–27.12.2026; exact date will be announced." gibi: hemen ardından "ilan
      // edilecek/announced" geçiyorsa bu bir ARALIK bitişi, gerçek sınav tarihi değil — tarihsiz say.
      if (d && /will be announced|to be announced|\btba\b|\btbd\b|ilan edilecek/.test(fc.slice(d.end, d.end + 45))) d = null;
      // Saat: tarihten sonra gelen ilk saat (aralık değil); "09.12.2026" gibi bir tarihin parçası
      // ("09.12") yanlışlıkla saat sanılmasın diye hücrede bulunan HERHANGİ bir tarihin aralığı elenir.
      let time = "";
      const tsrc = fc;
      TIME_RE.lastIndex = 0;
      const ranges = [...tsrc.matchAll(RANGE_RE)];
      const inAnyDate = (idx) => r.dates.some((x) => idx >= x.index && idx < x.end);
      if (!ranges.length) {
        const tm = [...tsrc.matchAll(TIME_RE)].find((t) => !inAnyDate(t.index) && (!d || t.index >= (r.dates.includes(d) ? d.end : 0)));
        if (tm && !(d && tm.index >= d.index && tm.index < d.end)) time = hm(tm[1], tm[2]);
      } else time = hm(ranges[0][1], ranges[0][2]);
      const ap = /\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)/.exec(fc);
      if (ap && ranges.length && ap.index < ranges[0].index + ranges[0][0].length + 1) {
        // "7:00-8:05pm": öğleden sonra eki aralığın tamamı için
        let h = +ranges[0][1] % 12;
        if (ap[3].startsWith("p")) h += 12;
        time = hm(h, ranges[0][2]);
      } else if (ap) {
        let h = +ap[1] % 12;
        if (ap[3].startsWith("p")) h += 12;
        time = hm(h, ap[2] || "00");
      }

      // Hafta: satırın hafta sütunu ya da "7. hafta" / "week 7" / "7th week"
      let week = Number.isFinite(rowWeek) && rowWeek > 0 && rowWeek < 30 ? rowWeek : null;
      if (week === null) {
        const wm = /(\d{1,2})\s*\.?\s*(?:hafta|haftada|haftasi)|\bweek\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+week/.exec(flines[i]);
        if (wm) week = +(wm[1] || wm[2] || wm[3]);
      }
      // Kendi haftası yok ama tablo satırı sarmalıyla bölünmüş olabilir: en yakın çapa haftayı kullan.
      // Çok sütunlu satırlar güvenle kabul edilir; tek hücreli satırlarda ise ancak kısa, cümle
      // noktalamasıyla bitmeyen bir "tablo parçası" görünümündeyse (bir kural/politika cümlesi değilse) kabul edilir.
      const looksLikeSentence = cells.length === 1 && (/[.!?]\s*$/.test(lines[i].trim()) || lines[i].trim().length > 40);
      if (week === null && !Number.isFinite(rowWeek) && !looksLikeSentence && !/oran|percentage|katki|contribution|basari|share/.test(fc)) {
        const nw = nearestWeek(i);
        if (nw !== null) week = nw;
      }

      // Tarihsiz ve haftasız öğe: sadece takvim cümlesiyse (TBA, ilan edilecek…) kabul et
      if (!d && week === null && !SCHEDULE_WORDS.test(flines[i])) continue;
      // Tarihsiz ödev/proje işe yaramaz ("tarihler Moodle'da ilan edilir"); tarihsiz sadece sınav tutulur
      if (!d && week === null && r.kind.type !== "sinav") continue;
      if (!d && RULE_WORDS.test(fc) && !SCHEDULE_WORDS.test(fc)) continue;

      if (d?.assumed) warnings.add(`Bazı tarihlerde yıl yazmıyor; ${d.iso.slice(0, 4)} varsayıldı.`);
      // "Mid Term Exam 2 during class time": başlıktan at, saati ders saatine bağlı olduğunu uyar
      let title = titleFrom(r.cell, fc, r.kind, r.dates);
      if (CLASS_TIME_RE.test(fold(title))) {
        title = title.replace(/\s*[-–,(]?\s*(during class time|during class|in class|ders saatinde|ders saati icinde|derste)\)?\s*$/i, "").trim() || title;
        if (!time) warnings.add(`${title} ders saatinde; saatini kendi şubenin ders saatine göre gir.`);
      }
      items.push({
        type: r.kind.type,
        group: r.kind.group,
        title,
        date: d ? d.iso : "",
        time,
        week: d ? null : week,
        source: cut(clean(lines[i].replace(/\t/g, " · ")), 150),
      });
    }
  }
  return dedupeItems(items, warnings);
}

// Haftalık planın "Ölçme / Assessment" sütunu: "Sınav, katılım", "Sınav, ödev" her haftada tekrar eder.
// Bunlar o haftanın sınavı değil, ölçme yöntemidir. Adı sadece genel kelime olan ("Sınav", "Ödev") tarihsiz
// öğeler 4+ farklı haftaya yayılmışsa hepsi atılır.
const GENERIC_TITLE = /^(sinav|sinavlar|exam|exams|odev|odevler|homework|assignment|assignments|proje|project|sunum|presentation)$/;
function dropMeasureColumn(items) {
  const generic = (it) => !it.date && it.week && GENERIC_TITLE.test(fold(it.title));
  const weeks = new Set(items.filter(generic).map((it) => it.week));
  return weeks.size >= 4 ? items.filter((it) => !generic(it)) : items;
}

function dedupeItems(items, warnings) {
  const out = [];
  items = dropMeasureColumn(items);
  for (const it of items) {
    const dup = out.find((o) => {
      if (o.group !== it.group) return false;
      if (fold(o.title) === fold(it.title) && o.date === it.date && o.week === it.week) return true;
      // Tarihsiz, aynı haftada aynı türden iki proje/ödev satırı: tablo satırı bölünmüş, tek teslim
      if (["proje", "odev"].includes(it.group) && !o.date && !it.date && o.week && o.week === it.week) {
        if (it.title.length < o.title.length) o.title = it.title;
        return true;
      }
      // Vize/final/bütünleme: aynı grup, 10 gün içinde → aynı sınav
      if (["vize", "final", "butunleme"].includes(it.group)) {
        if (o.date && it.date) return Math.abs(new Date(o.date) - new Date(it.date)) <= 10 * 86400000 && fold(o.title).replace(/\d/g, "") === fold(it.title).replace(/\d/g, "") ? true : Math.abs(new Date(o.date) - new Date(it.date)) <= 3 * 86400000;
        if (!o.date && !it.date) return o.week === it.week || o.week === null || it.week === null;
      }
      return false;
    });
    if (!dup) {
      out.push(it);
      continue;
    }
    // Daha bilgili olanı tut: tarihli > haftalı > boş; saatli > saatsiz
    const score = (x) => (x.date ? 4 : x.week ? 2 : 0) + (x.time ? 1 : 0);
    if (score(it) > score(dup)) Object.assign(dup, it);
  }
  // Tarihli bir final varsa tarihsiz "final" kayıtlarını at (aynısı vize için)
  const result = out.filter((x) => x.date || x.week || !out.some((y) => y !== x && y.group === x.group && (y.date || y.week)));
  if (!result.some((x) => x.group === "final")) warnings.add("Final tarihi bulunamadı; akademik takvimden kontrol et.");
  else if (result.some((x) => x.group === "final" && !x.date)) warnings.add("Final tarihi syllabus'ta yazmıyor (akademik takvimde ilan edilecek).");
  if (result.some((x) => !x.date && x.week)) warnings.add("Bazı sınav/ödevler sadece hafta numarasıyla verilmiş; tarihini sen seç.");
  return result.map(({ group, ...x }) => x);
}

/* ------------------------------------------------------------------ */
/* Ders saatleri                                                         */
/* ------------------------------------------------------------------ */

// PDF tablolarında "Office & Office Hours" etiketi hücrenin ortasına düşer; saatler etiketin üstünde/altında
// ayrı satırlarda kalır. Etiketin ±3 satırındaki (araya başka bir etiket girmeden) gün+saat satırları ofis saatidir.
const CLASS_LABEL = /classroom|derslik|class (time|hours|schedule)|ders saat|ders zaman|lecture|zaman\b|\btime\b/;
const DAY_ONE = new RegExp(DAY_RE.source);
const RANGE_ONE = new RegExp(RANGE_RE.source);
function officeLines(lines, flines) {
  const out = new Set();
  flines.forEach((f, i) => {
    if (!/\b(ofis|office)\b/.test(f) || f.length > 45 || CLASS_LABEL.test(f)) return;
    for (const dir of [-1, 1]) {
      for (let j = i + dir, n = 0; j >= 0 && j < flines.length && n < 3; j += dir, n++) {
        const g = flines[j];
        if (!g.trim() || CLASS_LABEL.test(g) || (lines[j].includes("\t") && !/\d{1,2}[:.]\d{2}/.test(g))) break;
        DAY_RE.lastIndex = 0;
        RANGE_RE.lastIndex = 0;
        if (DAY_ONE.test(g) && RANGE_ONE.test(g)) out.add(j);
      }
    }
  });
  return out;
}

function parseSessions(text, flines, lines, pairsBy) {
  const sessions = [];
  const candidates = [];
  const office = officeLines(lines, flines);
  // Önce "Ders saatleri:" gibi etiketli değerler, sonra gün + saat aralığı geçen ama ofis saati olmayan satırlar
  for (const p of pairsBy.sessions || []) candidates.push(p.v);
  if (!candidates.length) {
    flines.forEach((f, i) => {
      if (office.has(i) || /ofis|office|gorusme|consultation|sinav|exam|final|vize|midterm|teslim|due/.test(f)) return;
      DAY_RE.lastIndex = 0;
      RANGE_RE.lastIndex = 0;
      if (DAY_RE.test(f) && RANGE_RE.test(f)) candidates.push(lines[i]);
    });
  }
  const globalRoom = (pairsBy.room || []).map((p) => p.v).find(Boolean) || "";

  for (const c of candidates) {
    const f = fold(c);
    // Her gün adının konumu; bir sonraki saat aralığına kadar olan günler aynı aralığı paylaşır (Mon/Wed 10:00-11:50)
    const days = [...f.matchAll(DAY_RE)].map((m) => ({ i: m.index, day: dayOf(m[1]) }));
    const ranges = [...f.matchAll(RANGE_RE)].map((m) => ({ i: m.index, end: m.index + m[0].length, start: hm(m[1], m[2]), stop: hm(m[3], m[4]) }));
    if (!days.length || !ranges.length) continue;
    // "Classroom & Time" gibi birleşik hücrelerde oda kodu gün adından ÖNCE gelebilir ("D301 / Wednesday 12:30-15:20")
    const leadMatch = /^\s*([A-Z]{1,3}\s?-?\s?\d{2,4}[A-Za-z]?)\s*[\/,]/.exec(c);
    const leadRoom = leadMatch && dayOf(fold(leadMatch[1]).split(/[\s-]/)[0]) < 0 ? leadMatch[1] : "";
    let pending = [];
    for (const r of ranges) {
      const before = days.filter((d) => d.i < r.i && !sessions.some((s) => s._i === d.i && s._c === c));
      const own = before.filter((d) => !pending.includes(d));
      pending = before;
      const use = own.length ? own : before.slice(-1);
      // Sınıf: aralıktan sonraki parantez ya da "Room X" / "Derslik: X"
      let after = c.slice(r.end, r.end + 40);
      let room = "";
      // "(Section#4)" / "(Section 4)" gibi şube işareti oda değildir, atla
      const secPar = /^\s*\(\s*(?:section|sube|şube|grup|group)\s*#?\s*\d+\s*\)/i.exec(after);
      if (secPar) after = after.slice(secPar[0].length).replace(/^[\s,;:\-–—]+/, "");
      const par = /^\s*,?\s*\(([^)]{1,30})\)/.exec(after);
      if (par) {
        const inner = clean(par[1].replace(/^(lab|laboratuvar|room|derslik|sinif|sınıf|classroom)\s*:\s*/i, ""));
        if (/\d/.test(inner) && !/^(section|sube|şube|grup|group)\b/i.test(inner) && dayOf(fold(inner).split(/[\s-]/)[0]) < 0) room = inner;
      }
      if (!room) {
      const pm = /^\s*[,(]?\s*\(?\s*([A-ZÇĞİÖŞÜ][\w-]*\s?-?\s?\d{1,4}[A-Za-z]?|Lab[\w -]*\d*|[A-Z]{1,3}-?\d{2,4})\s*\)?/.exec(after);
      if (pm && dayOf(fold(pm[1]).split(/[\s-]/)[0]) < 0) room = pm[1];
      }
      const seg = c.slice(r.end).split(/[;]|\s\/\s/)[0];
      const rm = /(?:room|derslik|sinif|sınıf|classroom)\s*:?\s*([A-Za-zÇĞİÖŞÜçğıöşü]*-?\s?\d{1,4}[A-Za-z]?)/i.exec(seg);
      if (!room && rm) room = rm[1];
      // "Tuesday B404, 15:30-18:20": oda kodu gün adıyla saat arasında
      if (!room && use.length) {
        const mid = /\b([A-Z]{1,3}\s?-?\d{2,4}[A-Za-z]?)\s*[,/]?\s*$/.exec(c.slice(use[use.length - 1].i, r.i));
        if (mid) room = mid[1];
      }
      for (const d of use) {
        if (d.day < 0) continue;
        if (r.stop <= r.start) continue;
        sessions.push({ day: d.day, start: r.start, end: r.stop, room: clean(room || leadRoom || globalRoom), _i: d.i, _c: c });
      }
    }
  }
  // Tekrarları temizle
  const seen = new Set();
  return sessions
    .filter((s) => {
      const k = `${s.day}-${s.start}-${s.end}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ _i, _c, ...s }) => ({ ...s, room: cut(s.room.replace(/([A-Za-z])-\s+(\d)/, "$1-$2"), 40) }))
    .slice(0, 14);
}

/* ------------------------------------------------------------------ */
/* Devam, baraj, kurallar                                                */
/* ------------------------------------------------------------------ */

function sentences(text) {
  // Satırları paragraflara topla: satır noktalama ile bitiyorsa, kısa bir başlıksa ya da tablo satırıysa paragraf biter.
  // (PDF'te cümle ortasında kırılan satırlar birleşir; Word'de her paragraf ayrı kalır.)
  const paras = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) paras.push(buf.trim());
    buf = "";
  };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l || l.includes("\t")) {
      flush();
      if (l) paras.push(l.replace(/\t/g, " · "));
      continue;
    }
    buf += (buf ? " " : "") + l;
    if (/[.!?;]$/.test(l) || (l.length < 45 && !/[,(]$/.test(l) && !/^[a-zçğıöşü]/.test(l))) flush();
  }
  flush();
  return paras.flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(])/)).map(clean).filter((s) => s.length > 8);
}

function parseAttendance(sents) {
  let percent = null;
  let max = null;
  let unit = "";
  let source = "";
  for (const s of sents) {
    const f = fold(s);
    if (!/devam|katil|attend|absen|devamsiz|yoklama/.test(f)) continue;
    if (/katilim\s*(notu|puani)|participation grade/.test(f) && !/zorunlu|required|en az|at least/.test(f)) continue;
    let m;
    if (percent === null && (m = /(?:%\s*(\d{2,3})|(\d{2,3})\s*%)/.exec(f))) {
      let n = +(m[1] || m[2]);
      // "derslerin %30'undan fazlasına girmeyen" / "miss more than 30%" → devam şartı 70
      const around = f.slice(Math.max(0, m.index - 40), m.index + 60);
      if (/devamsiz|absen|miss|fazla|more than|exceed|asan|girmeyen|katilmayan/.test(around) && n <= 50) n = 100 - n;
      if (n >= 40 && n <= 100) {
        percent = n;
        source = s;
      }
    }
    if (max === null && (m = /(?:devamsizlik hakki|devamsizlik siniri|en fazla|at most|maximum of|more than|up to|max\.?)\D{0,25}(\d{1,2})\s*(ders|saat|hafta|lectures?|classes|sessions|hours|weeks|absences|defa|kez)?/.exec(f))) {
      if (/devamsiz|absen|miss|devam/.test(f)) {
        max = +m[1];
        unit = m[2] || "";
        source = source || s;
      }
    }
  }
  return { percent, max_absences: max, unit, source: cut(source, 200) };
}

function parseFinalMin(sents) {
  for (const s of sents) {
    const f = fold(s);
    if (!/final|yariyil sonu/.test(f)) continue;
    const m =
      /(?:final|yariyil sonu)[^.]{0,70}?(?:en az|minimum|at least|asgari|en dusuk|barajı|baraji|alt sinir)\D{0,15}(\d{2,3})/.exec(f) ||
      /(?:baraj|threshold|minimum grade)[^.]{0,40}?(\d{2,3})[^.]{0,40}final/.exec(f) ||
      /final[^.]{0,40}(\d{2,3})\s*(?:puan|points?)?[^.]{0,20}(?:altinda|below|under|less than)/.exec(f) ||
      /(?:en az|at least|minimum|asgari)\s*(\d{2,3})\s*(?:puan|points?|%)?[^.]{0,30}(?:final|yariyil sonu)/.exec(f);
    if (m) {
      const n = +m[1];
      if (n >= 20 && n <= 70) return { value: n, source: s };
    }
  }
  return null;
}

/** Kural cümleleri → Türkçe, kısa, sonuçlu bayraklar. */
function parsePolicies(sents, att, finalMin) {
  const out = [];
  const push = (p) => {
    if (out.some((x) => x.kind === p.kind && x.rule === p.rule)) return;
    out.push({ ...p, source: cut(p.source, 200) });
  };
  if (att.percent !== null || att.max_absences !== null) {
    const src = att.source;
    // Sonuç çoğu zaman bir sonraki cümlede: "…%70'ine devam zorunludur. Sağlamayan öğrenci NA alır."
    const k = sents.indexOf(src);
    const f = fold(
      src +
        " " +
        (k >= 0 && sents[k + 1] ? sents[k + 1] : "") +
        " " +
        (k >= 0 && sents[k + 2] ? sents[k + 2] : "") +
        " " +
        (k >= 0 && sents[k + 3] ? sents[k + 3] : "")
    );
    // BAU Yönetmeliği Md. 19: devam şartını sağlamayan NA alır ve finale giremez — syllabus yazmasa da geçerli
    // (Dönem paneli de aynı kuralı gösterir), bu yüzden devam şartı her zaman kritik.
    push({
      kind: "devam",
      severity: "kritik",
      rule: att.percent !== null ? `Derslerin en az %${att.percent}'ine devam zorunlu.` : `En fazla ${att.max_absences} ${unitTr(att.unit)} devamsızlık hakkın var.`,
      consequence: "Sınırı aşarsan NA alırsın ve finale giremezsin.",
      source: src,
    });
  } else {
    // Oran yazmayan zorunlu devam: "Attendance is mandatory", "Derslere devam zorunludur"
    const s = sents.find((x) => /(attendance|devam)[^.]{0,30}(mandatory|compulsory|required|zorunlu|will be taken)|yoklama alin/.test(fold(x)));
    if (s) push({ kind: "devam", severity: "dikkat", rule: "Yoklama alınıyor; devam oranı syllabus'ta yazmıyor.", consequence: "Oranı hocana sor ve Dönem panelinde gir.", source: s });
  }
  // Geç gelen / erken çıkan devamsız sayılır
  const late = sents.find((x) => {
    const f = fold(x);
    return /gec (katilan|gelen|kalan)|erken (ayrilan|cikan)|arriving late|leaving early|late arrival|full session|tamaminda/.test(f) && /devam|attend|yoklama|katilmamis|not being recorded|not recorded|absent/.test(f);
  });
  if (late) push({ kind: "devam", severity: "dikkat", rule: "Geç gelir ya da erken çıkarsan o ders devamsız sayılabilir.", consequence: "Devamsızlık hakkından düşer.", source: late });
  if (finalMin) {
    push({ kind: "baraj", severity: "kritik", rule: `Finalden en az ${finalMin.value} alman gerekiyor.`, consequence: "Altında kalırsan diğer notlarından bağımsız F alabilirsin.", source: finalMin.source });
  }
  for (const s of sents) {
    if (/[☐☒□■✓✔]/.test(s)) continue; // form kutucuğu satırı, kural cümlesi değil
    if ((s.match(/ · /g) || []).length >= 2) continue; // haftalık plan / tablo satırı ("Make-up for 28.10 · …")
    const f = fold(s);
    // Başlık ("CLO, Assessment and AI Use"): noktalama yok, kısa, yüklem yok → kural değil
    if (!/[.!?]$/.test(s.trim()) && s.length < 90 && !/\b(not|no|yasak|edilmez|verilmez|yapilmaz|will|must|shall|zorunlu|olur|alir|sayilir|is|are|gerekir|gerekmektedir|cannot|may)\b/.test(f)) continue;
    // Kaçırılan sınav/quiz 0: "Absence from the quizzes/exams will result in a grade of 0"
    if (/(absence from|absent from|miss(ing|es)?|kacir\w*|girmeyen|girmezse)[^.]{0,40}(quiz|exam|sinav)[^.]{0,60}(\b0\b|zero|sifir)/.test(f)) {
      push({ kind: "telafi", severity: "kritik", rule: "Sınava/quize girmezsen o not 0 olur.", consequence: "Mazeret sınavı yok; o günü boş tut.", source: s });
      continue;
    }
    // Bütünleme / resit (make-up kelimesi geçse de): "Resit exam serves as the make-up for the final exam."
    if (/butunleme|resit (exam|sinav)|resit exams?\b/.test(f)) {
      push({
        kind: "butunleme",
        severity: "bilgi",
        rule: /make-?up|telafi|mazeret/.test(f) ? "Finali kaçırırsan telafisi bütünleme sınavı." : /yerine gecer|replaces|instead of the final/.test(f) ? "Bütünleme notu final notunun yerine geçer." : "Bütünleme sınavı var.",
        consequence: "",
        source: s,
      });
      continue;
    }
    // Geç teslim
    if (/gec teslim|gec gelen|gec gonderilen|late (submission|work|homework|assignment)|submitted late|after the deadline|teslim tarihinden sonra|son teslim tarihinden sonra/.test(f)) {
      const pen = /(\d{1,2})\s*%[^.]{0,30}(per day|her gun|gunluk|gun basina|daily)|%\s*(\d{1,2})[^.]{0,30}(per day|her gun|gunluk|gun basina)/.exec(f);
      if (/kabul edilmez|kabul edilmeyecek|not be accepted|not accepted|will not be graded|sifir|zero|\b0\b|degerlendirilmez|degerlendirmeye alinmaz/.test(f))
        push({ kind: "gec_teslim", severity: "kritik", rule: "Geç teslim kabul edilmiyor.", consequence: "Geç teslim edilen iş 0 alır.", source: s });
      else if (pen) push({ kind: "gec_teslim", severity: "dikkat", rule: `Geç teslimde her gün için %${pen[1] || pen[3]} kesinti var.`, consequence: "", source: s });
      else push({ kind: "gec_teslim", severity: "dikkat", rule: "Geç teslim için puan kesintisi var.", consequence: "", source: s });
      continue;
    }
    // Mazeret / telafi
    if (/mazeret|make-?up|makeup|excused absence|telafi/.test(f) && !/butunleme/.test(f)) {
      const doc = /rapor|report|belge|document|official/.test(f);
      const none = /verilmez|yapilmaz|no make-?up|will not be given|not offered/.test(f);
      // "Mazeret yok ama final notu o sınavın yerine sayılır" → kaçırmak 0 demek değil
      const replaced = /yerine (sayilir|gecer|kullanilir)|replace[sd]? (the|that|it)|final[^.]{0,40}(counts?|used) (for|instead)/.test(f);
      // "No make-ups are granted for connectivity, hardware, or power failures": sınav değil, teknik arıza kuralı
      if (/connectivity|internet|hardware|power (cut|failure)|battery|teknik (ariza|sorun)|baglanti|elektrik/.test(f)) {
        push({ kind: "telafi", severity: "dikkat", rule: "İnternet, bilgisayar ya da elektrik arızası mazeret sayılmıyor.", consequence: "Teslimleri son dakikaya bırakma, yedek cihaz/yer planla.", source: s });
        continue;
      }
      if (none && replaced) {
        push({ kind: "telafi", severity: "dikkat", rule: "Ara sınav için mazeret sınavı yok; giremezsen final notun o sınavın yerine sayılır.", consequence: "Finalin ağırlığı artar; ikisini birden kaçırma.", source: s });
        continue;
      }
      push({
        kind: "telafi",
        severity: none ? "kritik" : "dikkat",
        rule: none ? "Mazeret/telafi sınavı yapılmıyor." : doc ? "Mazeret sınavı sadece belgeli mazeretle (ör. sağlık raporu) veriliyor." : "Mazeret/telafi sınavı için kurallar var.",
        consequence: none ? "Sınavı kaçırırsan o not 0 olur." : doc ? "Belge yoksa kaçırdığın sınav 0 sayılır." : "",
        source: s,
      });
      continue;
    }
    // Not kuralları
    let m;
    const what = /quiz|kisa sinav/.test(f) ? "quiz" : /odev|homework|assignment/.test(f) ? "ödev" : /lab/.test(f) ? "lab" : "";
    if ((m = /best (\d+) (?:of|out of) (\d+)|(\d+)\s*(?:\S+\s+)?en iyi (\d+)|en iyi (\d+)/.exec(f))) {
      const [a, b] = m[1] ? [m[1], m[2]] : m[3] ? [m[4], m[3]] : [m[5], null];
      push({ kind: "not_kurali", severity: "bilgi", rule: `${what ? what.charAt(0).toLocaleUpperCase("tr-TR") + what.slice(1) + "lerden e" : "E"}n iyi ${a}${b ? `/${b}` : ""} tanesi sayılıyor.`, consequence: "Biri kötü geçse de telafi şansın var.", source: s });
      continue;
    }
    if (/lowest[^.]{0,30}(dropped|not count|excluded)|en dusuk[^.]{0,30}(silinir|sayilmaz|dikkate alinmaz|atilir|hesaba katilmaz|ortalamaya katilmaz|hesaplamaya katilmaz)/.test(f)) {
      push({ kind: "not_kurali", severity: "bilgi", rule: `En düşük ${what ? what + " " : ""}notun hesaba katılmıyor.`, consequence: "", source: s });
      continue;
    }
    if (/extra credit|bonus|ek puan|ekstra puan/.test(f)) {
      push({ kind: "not_kurali", severity: "bilgi", rule: "Ek puan (bonus) imkânı var.", consequence: "", source: s });
      continue;
    }
    if (/bagil|curve|curved|relative grading|mutlak degerlendirme|absolute grading/.test(f)) {
      push({ kind: "not_kurali", severity: "bilgi", rule: /bagil|curve|relative/.test(f) ? "Harf notları bağıl (sınıfa göre) veriliyor." : "Harf notları mutlak sistemle veriliyor.", consequence: "", source: s });
      continue;
    }
    if (/habersiz|unannounced|pop quiz/.test(f)) {
      push({ kind: "not_kurali", severity: "dikkat", rule: "Habersiz quiz yapılabiliyor.", consequence: "Derse hazırlıksız gelirsen puan kaybedebilirsin.", source: s });
      continue;
    }
    // Akademik dürüstlük
    if (/kopya|intihal|plagiar|cheat|academic (dishonesty|integrity|misconduct)|yapay zeka|artificial intelligence|\bai\b|chatgpt|generative/.test(f)) {
      const ai = /yapay zeka|artificial intelligence|\bai\b|chatgpt|generative/.test(f);
      const hard = /\bf\b|\bff\b|disiplin|disciplinary|fail|sifir|zero|0 puan/.test(f);
      push({
        kind: "durustluk",
        severity: hard || (ai && /yasak|not allowed|prohibited|plagiar|intihal|kopya/.test(f)) ? "kritik" : "dikkat",
        rule: ai ? (/yasak|not allowed|prohibited|plagiar|intihal|kopya/.test(f) ? "Yapay zekâ ile ödev yazmak intihal sayılıyor." : "Yapay zekâ kullanımı için kurallar var.") : "Kopya ve intihal kesinlikle yasak.",
        consequence: hard ? "Tespit edilirse F ve disiplin cezası alabilirsin." : "",
        source: s,
      });
      continue;
    }
    // Sınava giriş
    if (/kimlik|student id|id card/.test(f) && /sinav|exam/.test(f)) {
      push({ kind: "diger", severity: "dikkat", rule: "Sınava öğrenci kimliğinle gelmen gerekiyor.", consequence: "Kimliksiz sınava alınmayabilirsin.", source: s });
      continue;
    }
    if ((m = /(\d{1,2})\s*(dakika|dk|minutes?)[^.]{0,40}(gec|late)|(gec|late)[^.]{0,40}(\d{1,2})\s*(dakika|dk|minutes?)/.exec(f)) && /sinav|exam|ders|class/.test(f)) {
      push({ kind: "diger", severity: "dikkat", rule: `Sınava/derse ${m[1] || m[5]} dakikadan fazla geç gelen alınmıyor.`, consequence: "", source: s });
    }
  }
  const rank = { kritik: 0, dikkat: 1, bilgi: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}
const unitTr = (u) => (/saat|hour/.test(u) ? "saat" : /hafta|week/.test(u) ? "hafta" : "ders");

/* ------------------------------------------------------------------ */
/* Ders bilgileri                                                         */
/* ------------------------------------------------------------------ */

// İlk harf büyük, geri kalanı büyük/küçük karışık olabilir ("MAT 2045" · "Mat2045" · "CmpE-251").
const CODE_RE = /\b([A-ZÇĞİÖŞÜ][A-Za-zçğıöşü]{1,4})\s?-?\s?(\d{3,4}[A-Z]?)\b/;
// Ders koduna benzeyen ama olmayan yaygın kelimeler (mevsim adı + yıl, "Week 12" gibi yanlış eşleşmeleri ele)
const CODE_STOP = new Set([
  "fall", "spring", "summer", "guz", "bahar", "yaz", "week", "hafta", "section", "secim", "room", "derslik",
  "note", "lecture", "page", "sayfa", "isbn", "credit", "kredi", "ects", "akts", "student", "course", "syllabus",
  "semester", "donem", "yariyil", "exam", "sinav", "quiz", "chapter", "unit", "part", "group", "grup", "class",
  "sinif", "team", "teams", "version", "edition", "code", "kod", "ders",
]);
/** CODE_RE'nin tüm eşleşmelerini tarar, yaygın-kelime yanlış pozitiflerini atlar. */
function findCode(s) {
  const re = new RegExp(CODE_RE.source, "g");
  let m;
  while ((m = re.exec(s))) {
    if (!CODE_STOP.has(fold(m[1]))) return m;
  }
  return null;
}

function creditFrom(v) {
  const f = fold(v || "");
  // "3+0+3" · "3-0-3" · "(3+0) 3" · "3 (T+U=3+0)" · "3"
  let m = /(\d+)\s*[+\-]\s*(\d+)\s*[+\-=]\s*(\d+(?:[.,]5)?)/.exec(f);
  if (m) return +m[3].replace(",", ".");
  m = /\(\s*\d+\s*[+\-]\s*\d+\s*\)\s*(\d+(?:[.,]5)?)/.exec(f);
  if (m) return +m[1].replace(",", ".");
  m = /(\d+(?:[.,]5)?)/.exec(f);
  const n = m ? +m[1].replace(",", ".") : null;
  return n !== null && n >= 0 && n <= 30 ? n : null;
}

function parseCourse(lines, flines, pairsBy, text) {
  const first = (k) => (pairsBy[k] || []).map((p) => p.v).find(Boolean) || "";
  const course = { name: "", code: "", instructor: "", email: "", office: "", office_hours: "", credit: null, ects: null };

  // Kod
  const codeVal = first("code");
  let cm = findCode(codeVal);
  if (!cm) {
    for (const l of lines.slice(0, 25)) if ((cm = findCode(l))) break;
  }
  if (cm) course.code = `${cm[1].toUpperCase()} ${cm[2]}`;

  // Ad: etiketli değer → "Ders: KOD Ad" → başlıkta "KOD – Ad"
  let name = first("name");
  if (!name) {
    const c = first("course");
    if (c) name = c;
  }
  let nameLineIdx = -1;
  if (!name && cm) {
    nameLineIdx = lines.slice(0, 25).findIndex((x) => CODE_RE.test(x) && x.replace(CODE_RE, "").replace(/[-–:|\s]/g, "").length > 3 && !/@/.test(x));
    if (nameLineIdx >= 0) name = lines[nameLineIdx];
  }
  if (name) {
    name = name.replace(CODE_RE, "").replace(/^[\s:–\-|,]+/, "");
    name = clean(name.split(/\t|\s{2,}| \| /)[0]);
    // Başlık iki satıra bölünmüş olabilir: "Mat2045 - Numerical\nMethods for Engineers"
    if (nameLineIdx >= 0 && nameLineIdx + 1 < lines.length && name && name.length < 60 && !/[.!?]$/.test(name)) {
      const rawNxt = lines[nameLineIdx + 1];
      const nxt = clean(rawNxt);
      const fnxt = fold(nxt);
      const looksLikeOther =
        !nxt ||
        nxt.length > 60 ||
        /[@\t]/.test(rawNxt) ||
        /^\d+[.)]\s/.test(nxt) ||
        CODE_RE.test(nxt) ||
        ALL_LABELS.some((x) => fnxt === x.l) ||
        /20\d{2}/.test(nxt) ||
        /guz|bahar|yaz|fall|spring|summer|donem|yariyil|semester/.test(fnxt);
      if (!looksLikeOther) name = clean(`${name} ${nxt}`);
    }
    if (/@|\d{2}[:.]\d{2}/.test(name) || name.length > 80) name = "";
  }
  course.name = cut(name, 80);

  // Hoca: etiket; yoksa "Instructor Information" gibi bölüm başlığından sonraki isim satırı
  let ins = first("instructor");
  if (!ins) {
    const hdrRe = /instructor information|ogretim (uyesi|elemani|gorevlisi) bilgileri|instructor info\b/;
    const idx = flines.findIndex((f) => hdrRe.test(f.replace(/^\d+[.)]\s*/, "")));
    if (idx >= 0) {
      for (let j = idx + 1; j < Math.min(idx + 5, lines.length); j++) {
        const l = clean(lines[j]);
        if (!l) continue;
        const fl = fold(l).replace(/[:*]/g, "").trim();
        if (!/@/.test(l) && !/\d/.test(l) && l.length <= 50 && l.split(" ").length <= 5 && !ALL_LABELS.some((x) => fl === x.l) && /^[A-ZÇĞİÖŞÜ]/.test(l)) {
          ins = l;
        }
        break;
      }
    }
  }
  const emailRe = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const em = emailRe.exec(ins);
  if (em && !first("email")) course.email = em[0];
  ins = clean(ins.replace(emailRe, "").replace(/\(\s*\)/g, "").replace(/(e-?posta|e-?mail|email)\s*:?/gi, ""));
  course.instructor = cut(ins.split(/\t|\s{2,}|,\s*(?=[A-Z][a-z]+:)/)[0] || "", 60);

  const emailVal = first("email");
  const e2 = emailRe.exec(emailVal);
  if (e2) course.email = e2[0];
  if (!course.email) {
    const all = text.match(new RegExp(emailRe.source, "g")) || [];
    course.email = all.find((x) => /bau\.edu\.tr|edu/.test(x)) || all[0] || "";
  }
  const contact = first("contact");
  if (!course.email) {
    const ce = emailRe.exec(contact);
    if (ce) course.email = ce[0];
  }
  let office = first("office");
  if (!office && contact) {
    const om = /(?:room|oda|ofis|office)\s*:?\s*([A-Za-zÇĞİÖŞÜçğıöşü]{0,4}-?\s?\d{1,4}[A-Za-z]?)/i.exec(contact);
    if (om) office = om[1];
  }
  let officeHours = first("office_hours");
  if (!office && officeHours) {
    // "Ad Soyad: D310; Pazartesi: 12:30-14:30" gibi birleşik hücreden oda kodu
    const om2 = /\b([A-Za-zÇĞİÖŞÜçğıöşü]{1,3}\d{2,4})\b/.exec(officeHours);
    if (om2) office = om2[1];
  }
  // "B Blok 1. Kat No: 9 - Pazartesi 13:00-1500": yer + saat tek hücrede → ayır
  const fh = fold(officeHours);
  DAY_RE.lastIndex = 0;
  const dm = DAY_ONE.exec(fh);
  DAY_RE.lastIndex = 0;
  if (dm && dm.index > 3 && !office) {
    office = clean(officeHours.slice(0, dm.index).replace(/[\s,;:\-–]+$/, ""));
    officeHours = officeHours.slice(dm.index);
  } else if (!dm && !/\d{1,2}[:.]\d{2}/.test(fh) && /\b(ofis|office|oda|room|blok|building|floor|kat)\b/.test(fh)) {
    // "…, 3rd Floor, Office D434": saat değil, yer
    if (!office) office = officeHours;
    officeHours = "";
  }
  officeHours = officeHours.replace(/\b(\d{1,2})[:.](\d{2})\s*([-–])\s*(\d{2})(\d{2})\b/g, "$1:$2$3$4:$5");
  // Etiketi ortada kalmış tablo hücresi: saatler ve yer komşu satırlarda
  if (!office && !officeHours) {
    const offs = [...officeLines(lines, flines)].sort((a, b) => a - b);
    if (offs.length) {
      officeHours = offs.map((j) => clean(lines[j])).join("; ");
      for (let j = offs[0] - 2; j < offs[0]; j++) {
        const rm = j >= 0 && /(?:room|oda|ofis|office)\s*:?\s*([A-Za-zÇĞİÖŞÜçğıöşü]{0,4}-?\s?\d{1,4}[A-Za-z]?)/i.exec(lines[j]);
        if (rm) office = rm[1];
      }
    }
  }
  if (ins && officeHours.startsWith(ins)) officeHours = clean(officeHours.slice(ins.length).replace(/^[\s:,-]+/, ""));
  if (office && officeHours.startsWith(office)) officeHours = clean(officeHours.slice(office.length).replace(/^[\s:;,-]+/, ""));
  course.office = cut(clean(office.replace(emailRe, "")), 60);
  course.office_hours = cut(officeHours, 80);
  course.credit = creditFrom(first("credit"));
  const ects = creditFrom(first("ects"));
  course.ects = ects !== null && ects <= 60 ? ects : null;
  return course;
}

/** Akademik dönem: "2026-2027 Güz", "Fall 2026", "Spring 2027", yoksa bugünden. */
function detectTerm(text, now) {
  const f = fold(text.slice(0, 3000));
  let m = /(20\d{2})\s*[-/–]\s*(20\d{2})[^a-z]{0,6}(guz|bahar|yaz|fall|spring|summer)?/.exec(f);
  const season = (w) => (/guz|fall|autumn/.test(w) ? "guz" : /bahar|spring/.test(w) ? "bahar" : /yaz|summer/.test(w) ? "yaz" : null);
  if (m) {
    const s = season(m[3] || "") || season((/(guz|bahar|yaz|fall|spring|summer)/.exec(f) || [""])[0]) || "guz";
    return { year: +m[1], season: s };
  }
  m = /(guz|bahar|yaz|fall|spring|summer)\s*(?:donemi|yariyili|semester|term)?\s*(20\d{2})|(20\d{2})\s*(guz|bahar|yaz|fall|spring|summer)/.exec(f);
  if (m) {
    const s = season(m[1] || m[4]);
    const y = +(m[2] || m[3]);
    return { year: s === "guz" ? y : y - 1, season: s };
  }
  const mo = now.getMonth();
  const start = mo >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { year: start, season: mo >= 8 || mo === 0 ? "guz" : mo <= 5 ? "bahar" : "yaz" };
}

/* ------------------------------------------------------------------ */
/* Giriş noktası                                                          */
/* ------------------------------------------------------------------ */

export function parseSyllabus(text, now = new Date()) {
  const norm = text.normalize("NFC").replace(/\r/g, "").replace(/[   ]/g, " ").replace(/[‐‑‒]/g, "-");
  const lines = norm.split("\n").map((l) => l.replace(/[ ]+/g, " ").trimEnd());
  const flines = lines.map(fold);
  const warnings = new Set();

  const pairsBy = {};
  lines.forEach((l, i) => {
    for (const p of labelPairs(l, flines[i])) (pairsBy[p.k] ||= []).push(p);
  });
  // Yatay tablo: üst satırda en az iki etiket, alt satırda aynı sayıda değer
  for (let i = 0; i + 1 < lines.length; i++) {
    const head = lines[i].split("\t");
    if (head.length < 3) continue;
    const keys = head.map((h) => {
      const fh = fold(h).replace(/[:*]/g, "").trim();
      return ALL_LABELS.find((x) => fh === x.l || (x.k !== "course" && fh.includes(x.l) && fh.length - x.l.length <= 8 && x.l.length >= 4))?.k || null;
    });
    if (keys.filter(Boolean).length < 2) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const vals = (lines[j] || "").split("\t");
    if (Math.abs(vals.length - head.length) > 1 || keys.some((k, x) => k && fold(vals[x] || "") === fold(head[x]))) continue;
    keys.forEach((k, x) => {
      if (k && vals[x] && clean(vals[x])) (pairsBy[k] ||= []).unshift({ k, v: clean(vals[x]), label: head[x] });
    });
  }

  const term = detectTerm(norm, now);
  const course = parseCourse(lines, flines, pairsBy, norm);
  const sessions = parseSessions(norm, flines, lines, pairsBy);
  const items = parseItems(lines, flines, term, warnings);
  const grading = parseGrading(lines, flines);
  // Not tablosunda olan ama takvimde hiç geçmeyen vize/final: tarihsiz sınav olarak ekle (öğrenci tarihini girer,
  // geri sayım ve GNO simülasyonu o sınavı bilir). Uydurma tarih yok.
  const groupOf = (t) => ITEM_KINDS.find((k) => k.re.test(fold(t)))?.group;
  for (const g of grading) {
    const fg = fold(g.name);
    const grp = groupOf(g.name);
    if (!["vize", "final"].includes(grp) || /proje|project|rapor|report|paper|essay|odev|sunum|presentation|portfol/.test(fg)) continue;
    if (items.some((it) => groupOf(it.title) === grp)) continue;
    items.push({ type: "sinav", title: g.name, date: "", time: "", week: null, source: cut(`Not dağılımı: ${g.name} %${g.weight}`, 150) });
    if (grp === "final") {
      warnings.delete("Final tarihi bulunamadı; akademik takvimden kontrol et.");
      warnings.add("Final tarihi syllabus'ta yazmıyor (akademik takvimde ilan edilecek).");
    } else warnings.add(`${g.name} tarihi syllabus'ta yazmıyor; ilan edilince gir.`);
  }
  const sents = sentences(norm);
  const att = parseAttendance(sents);
  const finalMin = parseFinalMin(sents);
  const policies = parsePolicies(sents, att, finalMin);

  // Uyarılar
  if (!course.code && !grading.length && !sessions.length) warnings.add("Bu belge bir syllabus'a benzemiyor; bulunanları dikkatle kontrol et.");
  if (!course.name) warnings.add("Dersin adı bulunamadı.");
  if (!course.code) warnings.add("Ders kodu bulunamadı.");
  if (course.credit === null) warnings.add("Kredi bulunamadı; GNO için UMIS'teki kredisini gir.");
  // "Derslik ve Zaman: Çevrimiçi" → saati olmaması normal
  const online = flines.some((l) => /(derslik|classroom|zaman|time|delivery|verilis)[^\t]*\t\s*(cevrimici|online|uzaktan)/.test(l));
  if (!sessions.length) warnings.add(online ? "Ders çevrimiçi, saati yazmıyor; UMIS'teki saatini gir." : "Ders saatleri bulunamadı.");
  // "Section · Day · Time · Room" tablosunda birden çok şube: öğrenci yalnız birine gider
  if (sessions.length > 1 && flines.some((l) => /(^|\t)(section|sections|sube|subeler|grup|group)(\t|$)/.test(l.trim())))
    warnings.add("Birden fazla şube listelenmiş; sadece kendi şubenin ders saatini bırak, diğerlerini sil.");
  // Finali olmayan derste (ör. vize + vize + final projesi) "final tarihi bulunamadı" yanıltıcı
  const hasFinalExam =
    /final (exam|sinav)|yariyil sonu|donem sonu sinav/.test(flines.join("\n")) ||
    grading.some((g) => /final|yariyil sonu/.test(fold(g.name)) && !/proje|project|rapor|report|paper|essay|odev|sunum|presentation|portfol/.test(fold(g.name)));
  if (!hasFinalExam) warnings.delete("Final tarihi bulunamadı; akademik takvimden kontrol et.");
  const total = grading.reduce((s, g) => s + g.weight, 0);
  if (!grading.length) warnings.add("Not dağılımı bulunamadı.");
  else if (Math.abs(total - 100) > 0.5) warnings.add(`Not ağırlıklarının toplamı %${Math.round(total * 10) / 10}, 100 değil; kontrol et.`);
  if (att.percent === null && att.max_absences === null)
    warnings.add(policies.some((p) => p.kind === "devam" && /orani syllabus.ta yazmiyor/.test(fold(p.rule))) ? "Yoklama alınıyor ama devam oranı yazmıyor; hocana sorup gir." : "Devam şartı bulunamadı.");
  if (att.unit && /saat|hour/.test(att.unit)) warnings.add("Devamsızlık saat olarak verilmiş; KPR ders sayısıyla sayar, kontrol et.");
  if (att.unit && /hafta|week/.test(att.unit)) warnings.add("Devamsızlık hafta olarak verilmiş; haftada birden çok ders varsa sayıyı ona göre düzelt.");
  if (!items.length) warnings.add("Sınav veya ödev tarihi bulunamadı.");

  return {
    course,
    sessions,
    items: items.slice(0, 60),
    grading: grading.map(({ name, weight }) => ({ name, weight })).slice(0, 12),
    attendance: { percent: att.percent, max_absences: att.max_absences, source: att.source },
    final_min: finalMin ? finalMin.value : null,
    policies,
    warnings: [...warnings].slice(0, 8),
    term,
  };
}
