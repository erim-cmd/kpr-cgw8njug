/**
 * KPR — Cihaz içi belge okuyucu (PDF, DOCX, TXT). Hiçbir veri cihazdan çıkmaz.
 *
 * Dış kütüphane yok: sıkıştırma için tarayıcının DecompressionStream'i kullanılır.
 * Çıktı: satır satır düz metin; tablo sütunları "\t" ile ayrılır.
 *
 * PDF desteği: FlateDecode akışlar, nesne akışları (ObjStm), sayfa ağacı,
 * ToUnicode CMap, WinAnsi + /Differences (Türkçe glifler), CID fontları (/W genişlikleri),
 * Form XObject'ler, cm/Tm matrisleri. Şifreli ve sadece görüntüden oluşan PDF'ler okunamaz.
 */

/* ------------------------------------------------------------------ */
/* Ortak                                                                */
/* ------------------------------------------------------------------ */

export class DocError extends Error {}

async function inflate(bytes, format = "deflate") {
  const ds = new DecompressionStream(format);
  const out = new Blob([bytes]).stream().pipeThrough(ds);
  const chunks = [];
  const reader = out.getReader();
  // Bozuk akışın sonunda hata gelse bile o ana kadar çözülen kısım kullanılır
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    if (!chunks.length) throw new DocError("Sıkıştırılmış veri çözülemedi.");
  }
  let n = 0;
  for (const c of chunks) n += c.length;
  const res = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    res.set(c, o);
    o += c.length;
  }
  return res;
}

const latin1 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
};

/* ------------------------------------------------------------------ */
/* PDF: nesne sözdizimi                                                  */
/* ------------------------------------------------------------------ */

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([...`()<>[]{}/%`].map((c) => c.charCodeAt(0)));

class Ref {
  constructor(num) {
    this.num = num;
  }
}
class Name {
  constructor(v) {
    this.v = v;
  }
}
class Op {
  constructor(v) {
    this.v = v;
  }
}

/** Latin1 dize üzerinde çalışan PDF sözdizimi okuyucusu (nesneler ve içerik akışları). */
class Lexer {
  constructor(s, pos = 0) {
    this.s = s;
    this.p = pos;
  }
  skip() {
    const s = this.s;
    for (;;) {
      while (this.p < s.length && WS.has(s.charCodeAt(this.p))) this.p++;
      if (s[this.p] === "%") {
        while (this.p < s.length && s[this.p] !== "\n" && s[this.p] !== "\r") this.p++;
      } else break;
    }
  }
  /** Bir sonraki nesneyi ya da operatörü okur; dosya sonunda undefined. */
  next() {
    this.skip();
    const s = this.s;
    if (this.p >= s.length) return undefined;
    const c = s[this.p];
    if (c === "/") {
      let e = this.p + 1;
      while (e < s.length && !WS.has(s.charCodeAt(e)) && !DELIM.has(s.charCodeAt(e))) e++;
      const raw = s.slice(this.p + 1, e);
      this.p = e;
      return new Name(raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    }
    if (c === "(") return this.literal();
    if (c === "<") {
      if (s[this.p + 1] === "<") {
        this.p += 2;
        const d = {};
        for (;;) {
          this.skip();
          if (s.startsWith(">>", this.p)) {
            this.p += 2;
            return d;
          }
          const k = this.next();
          if (k === undefined) return d;
          const v = this.next();
          if (k instanceof Name) d[k.v] = v;
        }
      }
      const e = s.indexOf(">", this.p);
      const hex = s.slice(this.p + 1, e < 0 ? s.length : e).replace(/[^0-9a-fA-F]/g, "");
      this.p = e < 0 ? s.length : e + 1;
      let out = "";
      const h = hex.length % 2 ? hex + "0" : hex;
      for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
      return { str: out };
    }
    if (c === "[") {
      this.p++;
      const a = [];
      for (;;) {
        this.skip();
        if (s[this.p] === "]") {
          this.p++;
          return a;
        }
        const v = this.next();
        if (v === undefined) return a;
        a.push(v);
      }
    }
    if (c === "]" || c === ">" || c === ")" || c === "{" || c === "}") {
      this.p++;
      return new Op(c);
    }
    // Sayı, "R" referansı ya da operatör
    let e = this.p;
    while (e < s.length && !WS.has(s.charCodeAt(e)) && !DELIM.has(s.charCodeAt(e))) e++;
    if (e === this.p) e++;
    const tok = s.slice(this.p, e);
    this.p = e;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) {
      // "12 0 R" kalıbı
      const save = this.p;
      const m = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.slice(this.p, this.p + 24));
      if (m && /^\d+$/.test(tok)) {
        this.p = save + m[0].length;
        return new Ref(Number(tok));
      }
      return Number(tok);
    }
    if (tok === "true") return true;
    if (tok === "false") return false;
    if (tok === "null") return null;
    return new Op(tok);
  }
  literal() {
    const s = this.s;
    let depth = 1;
    let out = "";
    this.p++;
    while (this.p < s.length && depth > 0) {
      const c = s[this.p++];
      if (c === "\\") {
        const n = s[this.p++];
        const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
        if (n in map) out += map[n];
        else if (n >= "0" && n <= "7") {
          let oct = n;
          while (oct.length < 3 && s[this.p] >= "0" && s[this.p] <= "7") oct += s[this.p++];
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else if (n === "\r") {
          if (s[this.p] === "\n") this.p++;
        } else if (n !== "\n") out += n;
      } else if (c === "(") {
        depth++;
        out += c;
      } else if (c === ")") {
        depth--;
        if (depth) out += c;
      } else out += c;
    }
    return { str: out };
  }
}

/* ------------------------------------------------------------------ */
/* PDF: belge                                                            */
/* ------------------------------------------------------------------ */

class PdfDoc {
  constructor(bytes) {
    this.bytes = bytes;
    this.s = latin1(bytes);
    this.objs = new Map(); // num → { dict|value, streamStart, streamEnd }
    this.decoded = new Map();
  }

  async load() {
    const s = this.s;
    if (!s.startsWith("%PDF")) throw new DocError("Bu dosya bir PDF değil.");
    // Tüm "n g obj" başlıklarını tara (xref'e güvenmek yerine; bozuk xref'li dosyalarda da çalışır)
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      const num = Number(m[1]);
      const lx = new Lexer(s, re.lastIndex);
      const value = lx.next();
      const entry = { value };
      lx.skip();
      if (s.startsWith("stream", lx.p)) {
        let start = lx.p + 6;
        if (s[start] === "\r") start++;
        if (s[start] === "\n") start++;
        let len = value && typeof value.Length === "number" ? value.Length : null;
        let end = len !== null ? start + len : -1;
        if (end < 0 || !/^\s*endstream/.test(s.slice(end, end + 20))) {
          end = s.indexOf("endstream", start);
          if (end < 0) end = s.length;
          // Sondaki satır sonunu at
          if (s[end - 1] === "\n") end--;
          if (s[end - 1] === "\r") end--;
        }
        entry.streamStart = start;
        entry.streamEnd = end;
        re.lastIndex = end;
      }
      this.objs.set(num, entry); // aynı numara sonra geldiyse (artımlı güncelleme) sonraki geçerli
    }
    // Uzunluğu dolaylı referans olan akışlar için ikinci geçiş gerekmez: endstream araması yapıldı.

    // Nesne akışları
    for (const [, e] of [...this.objs]) {
      const d = e.value;
      if (d && d.Type instanceof Name && d.Type.v === "ObjStm" && e.streamStart !== undefined) {
        const data = latin1(await this.streamBytes(e));
        const n = d.N;
        const first = d.First;
        const lx = new Lexer(data);
        const pairs = [];
        for (let i = 0; i < n; i++) pairs.push([lx.next(), lx.next()]);
        for (const [num, off] of pairs) {
          if (typeof num !== "number" || this.objs.has(num)) continue;
          const v = new Lexer(data, first + off).next();
          this.objs.set(num, { value: v });
        }
      }
    }

    // Şifreleme: trailer ya da XRef akışında /Encrypt
    const trailerHasEncrypt = /\/Encrypt\s+\d+\s+\d+\s+R/.test(s.slice(-4096)) ||
      [...this.objs.values()].some((e) => e.value && e.value.Type instanceof Name && e.value.Type.v === "XRef" && e.value.Encrypt);
    if (trailerHasEncrypt) throw new DocError("PDF şifreli. Şifresiz bir kopyasını yükle ya da Word dosyasını gönder.");
  }

  get(v) {
    let guard = 0;
    while (v instanceof Ref && guard++ < 32) v = this.objs.get(v.num)?.value;
    return v;
  }
  entryOf(v) {
    return v instanceof Ref ? this.objs.get(v.num) : null;
  }

  async streamBytes(entry) {
    if (!entry || entry.streamStart === undefined) return new Uint8Array();
    if (this.decoded.has(entry)) return this.decoded.get(entry);
    let data = this.bytes.subarray(entry.streamStart, entry.streamEnd);
    const d = entry.value || {};
    let filters = this.get(d.Filter);
    if (!filters) filters = [];
    if (!Array.isArray(filters)) filters = [filters];
    const parms = this.get(d.DecodeParms);
    for (const f of filters.map((x) => this.get(x))) {
      const name = f instanceof Name ? f.v : "";
      if (name === "FlateDecode" || name === "Fl") {
        data = await inflate(data);
        const p = Array.isArray(parms) ? this.get(parms[0]) : parms;
        const pred = p && this.get(p.Predictor);
        if (pred >= 10) data = pngUnpredict(data, this.get(p.Columns) || 1, this.get(p.Colors) || 1, this.get(p.BitsPerComponent) || 8);
      } else if (name === "ASCIIHexDecode" || name === "AHx") {
        const hex = latin1(data).replace(/[^0-9a-fA-F]/g, "");
        const out = new Uint8Array(hex.length >> 1);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        data = out;
      } else if (name === "ASCII85Decode" || name === "A85") {
        data = ascii85(latin1(data));
      } else if (name) {
        // DCT/JBIG2 vb. görüntü filtreleri metin içermez
        data = new Uint8Array();
        break;
      }
    }
    this.decoded.set(entry, data);
    return data;
  }

  pages() {
    const root = this.findRoot();
    const out = [];
    const walk = (node, inherited, depth) => {
      const n = this.get(node);
      if (!n || depth > 50) return;
      const res = n.Resources !== undefined ? n.Resources : inherited;
      const type = this.get(n.Type);
      if (type instanceof Name && type.v === "Page") out.push({ node: n, resources: this.get(res) });
      else if (Array.isArray(this.get(n.Kids))) for (const k of this.get(n.Kids)) walk(k, res, depth + 1);
    };
    if (root) walk(root.Pages, undefined, 0);
    if (!out.length) {
      // Sayfa ağacı yoksa /Type /Page olan her nesne
      for (const e of this.objs.values()) {
        const t = e.value && this.get(e.value.Type);
        if (t instanceof Name && t.v === "Page") out.push({ node: e.value, resources: this.get(e.value.Resources) });
      }
    }
    return out;
  }

  findRoot() {
    const m = /\/Root\s+(\d+)\s+\d+\s+R/g;
    let last = null;
    let x;
    while ((x = m.exec(this.s))) last = Number(x[1]);
    if (last !== null) return this.get(new Ref(last));
    for (const e of this.objs.values()) {
      const t = e.value && this.get(e.value.Type);
      if (t instanceof Name && t.v === "Catalog") return e.value;
    }
    return null;
  }
}

function pngUnpredict(data, columns, colors, bpc) {
  const bpp = Math.max(1, (colors * bpc) >> 3);
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

function ascii85(s) {
  s = s.replace(/\s/g, "").replace(/^<~/, "").replace(/~>.*$/, "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "z") {
      out.push(0, 0, 0, 0);
      i++;
      continue;
    }
    const chunk = s.slice(i, i + 5);
    i += 5;
    const pad = 5 - chunk.length;
    let v = 0;
    for (const ch of chunk.padEnd(5, "u")) v = v * 85 + (ch.charCodeAt(0) - 33);
    const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...b.slice(0, 4 - pad));
  }
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ */
/* PDF: fontlar ve kodlama                                               */
/* ------------------------------------------------------------------ */

// WinAnsi (cp1252) 128–159 aralığı; geri kalanı Latin-1 ile aynı
const CP1252 = {
  128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡", 136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ",
  142: "Ž", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 152: "˜", 153: "™", 154: "š", 155: "›",
  156: "œ", 158: "ž", 159: "Ÿ",
};

// MacRomanEncoding 128–255 (Mac'te üretilmiş PDF'ler: "Ð" → "–", "…zge" → "Özge", "¥" → "•")
const MACROMAN = [..."ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ"];

// /Differences için glif adları (Türkçe ve sık görülen işaretler)
const GLYPHS = {
  space: " ", Gbreve: "Ğ", gbreve: "ğ", Scedilla: "Ş", scedilla: "ş", Idotaccent: "İ", Idot: "İ", dotlessi: "ı",
  Ccedilla: "Ç", ccedilla: "ç", Odieresis: "Ö", odieresis: "ö", Udieresis: "Ü", udieresis: "ü", Acircumflex: "Â",
  acircumflex: "â", Icircumflex: "Î", icircumflex: "î", Ucircumflex: "Û", ucircumflex: "û", endash: "–", emdash: "—",
  quoteleft: "‘", quoteright: "’", quotedblleft: "“", quotedblright: "”", bullet: "•", ellipsis: "…", percent: "%",
  hyphen: "-", minus: "−", period: ".", comma: ",", colon: ":", semicolon: ";", parenleft: "(", parenright: ")",
  slash: "/", at: "@", ampersand: "&", plus: "+", equal: "=", underscore: "_", numbersign: "#", quotesingle: "'",
  quotedbl: '"', question: "?", exclam: "!", bracketleft: "[", bracketright: "]", asterisk: "*", degree: "°",
  fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl", Euro: "€", sterling: "£", section: "§", periodcentered: "·",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const glyphChar = (name) => {
  if (name in GLYPHS) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const u = /^uni([0-9A-Fa-f]{4})/.exec(name) || /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (u) return String.fromCodePoint(parseInt(u[1], 16));
  return "";
};

function utf16be(str) {
  let out = "";
  for (let i = 0; i + 1 < str.length; i += 2) out += String.fromCharCode((str.charCodeAt(i) << 8) | str.charCodeAt(i + 1));
  return out;
}

/** ToUnicode CMap: kod → metin. Kod uzunluğu codespace'ten okunur. */
function parseCMap(text) {
  const map = new Map();
  let bytes = 1;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
  if (cs) {
    const h = /<([0-9a-fA-F]+)>/.exec(cs[1]);
    if (h) bytes = Math.max(1, h[1].length >> 1);
  }
  const hexToStr = (h) => {
    let s = "";
    const hh = h.length % 4 ? h.padStart(Math.ceil(h.length / 4) * 4, "0") : h;
    for (let i = 0; i < hh.length; i += 4) s += String.fromCharCode(parseInt(hh.slice(i, i + 4), 16));
    return s;
  };
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), hexToStr(m[2]));
  }
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[4] !== undefined) {
        const base = hexToStr(m[4]);
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo)));
      } else {
        const list = [...m[5].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexToStr(x[1]));
        for (let c = lo; c <= hi && c - lo < list.length; c++) map.set(c, list[c - lo]);
      }
    }
  }
  return { map, bytes };
}

async function loadFont(doc, ref) {
  const f = doc.get(ref) || {};
  const subtype = doc.get(f.Subtype);
  const composite = subtype instanceof Name && subtype.v === "Type0";
  const font = { composite, bytes: composite ? 2 : 1, uni: null, diff: {}, widths: null, first: 0, cidW: new Map(), dw: 1000 };

  const tu = doc.entryOf(f.ToUnicode);
  if (tu) {
    const cm = parseCMap(latin1(await doc.streamBytes(tu)));
    if (cm.map.size) {
      font.uni = cm.map;
      if (!composite) font.bytes = 1;
    }
  }
  if (composite) {
    const desc = doc.get((doc.get(f.DescendantFonts) || [])[0]) || {};
    font.dw = doc.get(desc.DW) ?? 1000;
    const w = doc.get(desc.W) || [];
    for (let i = 0; i < w.length; ) {
      const a = doc.get(w[i]);
      const b = doc.get(w[i + 1]);
      if (Array.isArray(b)) {
        b.forEach((x, k) => font.cidW.set(a + k, doc.get(x)));
        i += 2;
      } else {
        const v = doc.get(w[i + 2]);
        for (let c = a; c <= b && c - a < 65536; c++) font.cidW.set(c, v);
        i += 3;
      }
    }
    // Identity-H dışı kodlamalarda da 2 bayt varsayılır (Türk üniversitelerinin Word çıktılarında yaygın olan)
  } else {
    font.first = doc.get(f.FirstChar) ?? 0;
    const w = doc.get(f.Widths);
    font.widths = Array.isArray(w) ? w.map((x) => doc.get(x)) : null;
    const enc = doc.get(f.Encoding);
    const base = enc instanceof Name ? enc.v : enc && typeof enc === "object" ? doc.get(enc.BaseEncoding)?.v : "";
    font.mac = base === "MacRomanEncoding";
    if (enc && typeof enc === "object" && !(enc instanceof Name)) {
      const diffs = doc.get(enc.Differences) || [];
      let code = 0;
      for (const d of diffs) {
        const v = doc.get(d);
        if (typeof v === "number") code = v;
        else if (v instanceof Name) font.diff[code++] = glyphChar(v.v);
      }
    }
  }
  return font;
}

function decodeText(font, str) {
  const out = [];
  const step = font.bytes;
  for (let i = 0; i < str.length; i += step) {
    const code = step === 2 ? (str.charCodeAt(i) << 8) | (str.charCodeAt(i + 1) || 0) : str.charCodeAt(i);
    let ch;
    if (font.uni && font.uni.has(code)) ch = font.uni.get(code);
    else if (!font.composite && code in font.diff) ch = font.diff[code];
    else if (!font.composite && font.mac && code >= 128) ch = MACROMAN[code - 128] || "";
    else if (!font.composite) ch = CP1252[code] || String.fromCharCode(code);
    else ch = "";
    let w;
    if (font.composite) w = font.cidW.get(code) ?? font.dw;
    else w = font.widths ? font.widths[code - font.first] ?? 500 : 500;
    out.push({ ch, w: (w || 0) / 1000, space: step === 1 && code === 32 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* PDF: içerik akışı → konumlu metin parçaları                           */
/* ------------------------------------------------------------------ */

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

async function runContent(doc, content, resources, ctm0, runs, depth = 0, rules = runs.rules || (runs.rules = [])) {
  if (depth > 8) return;
  const fonts = {};
  const fontDict = doc.get(resources?.Font) || {};
  const xobjs = doc.get(resources?.XObject) || {};
  const lx = new Lexer(content);
  const stack = [];
  let ctm = ctm0;
  let saved = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let font = null;
  let size = 12;
  let tc = 0, tw = 0, th = 1, tl = 0, rise = 0;
  // Yol: tablo kenarlıkları (ince dikdörtgen ya da yatay çizgi) satır sınırını belirler
  let path = [];
  let cur = null;
  const pt = (x, y) => {
    const m = mul([1, 0, 0, 1, x, y], ctm);
    return [m[4], m[5]];
  };
  const commit = () => {
    for (const seg of path) {
      const [a, b] = seg;
      if (Math.abs(a[1] - b[1]) < 1.5 && Math.abs(a[0] - b[0]) > 20) rules.push({ y: (a[1] + b[1]) / 2, x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]) });
    }
    path = [];
  };

  const show = (items) => {
    if (!font) return;
    for (const it of items) {
      if (typeof it === "number") {
        tm = mul([1, 0, 0, 1, (-it / 1000) * size * th, 0], tm);
        continue;
      }
      if (!it || it.str === undefined) continue;
      const glyphs = decodeText(font, it.str);
      for (const g of glyphs) {
        const m = mul(tm, ctm);
        const scale = Math.hypot(m[2], m[3]) || 1;
        const adv = (g.w * size + tc + (g.space ? tw : 0)) * th;
        const x = m[4];
        const y = m[5] + rise;
        const endX = mul([1, 0, 0, 1, adv, 0], mul(tm, ctm))[4];
        if (g.ch) runs.push({ x, y, x2: endX, ch: g.ch, size: size * scale });
        tm = mul([1, 0, 0, 1, adv, 0], tm);
      }
    }
  };

  for (;;) {
    const t = lx.next();
    if (t === undefined) break;
    if (!(t instanceof Op)) {
      stack.push(t);
      continue;
    }
    const op = t.v;
    const a = stack;
    switch (op) {
      case "q": saved.push(ctm); break;
      case "Q": ctm = saved.pop() || ctm0; break;
      case "cm": if (a.length >= 6) ctm = mul(a.slice(-6), ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case "Tf": {
        const name = a[a.length - 2];
        size = a[a.length - 1] ?? size;
        const key = name instanceof Name ? name.v : "";
        if (!(key in fonts)) fonts[key] = await loadFont(doc, fontDict[key]);
        font = fonts[key];
        break;
      }
      case "Tc": tc = a[a.length - 1] ?? 0; break;
      case "Tw": tw = a[a.length - 1] ?? 0; break;
      case "Tz": th = (a[a.length - 1] ?? 100) / 100; break;
      case "TL": tl = a[a.length - 1] ?? 0; break;
      case "Ts": rise = a[a.length - 1] ?? 0; break;
      case "Td": tlm = mul([1, 0, 0, 1, a[a.length - 2] || 0, a[a.length - 1] || 0], tlm); tm = tlm; break;
      case "TD": tl = -(a[a.length - 1] || 0); tlm = mul([1, 0, 0, 1, a[a.length - 2] || 0, a[a.length - 1] || 0], tlm); tm = tlm; break;
      case "Tm": if (a.length >= 6) { tlm = a.slice(-6); tm = tlm; } break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
      case "Tj": show([a[a.length - 1]]); break;
      case "TJ": show(Array.isArray(a[a.length - 1]) ? a[a.length - 1] : []); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; show([a[a.length - 1]]); break;
      case '"': tw = a[a.length - 3] ?? tw; tc = a[a.length - 2] ?? tc; tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; show([a[a.length - 1]]); break;
      case "Do": {
        const nm = a[a.length - 1];
        const ref = nm instanceof Name ? xobjs[nm.v] : null;
        const e = doc.entryOf(ref);
        const xo = doc.get(ref);
        const st = xo && doc.get(xo.Subtype);
        if (e && st instanceof Name && st.v === "Form") {
          const mtx = doc.get(xo.Matrix);
          const inner = latin1(await doc.streamBytes(e));
          await runContent(doc, inner, doc.get(xo.Resources) || resources, Array.isArray(mtx) ? mul(mtx, ctm) : ctm, runs, depth + 1);
        }
        break;
      }
      case "m": cur = pt(a[a.length - 2], a[a.length - 1]); break;
      case "l": { const p2 = pt(a[a.length - 2], a[a.length - 1]); if (cur) path.push([cur, p2]); cur = p2; break; }
      case "re": {
        const [x, y, w, h] = a.slice(-4);
        const p1 = pt(x, y), p2 = pt(x + w, y + h);
        if (Math.abs(p2[1] - p1[1]) < 2.5) path.push([[p1[0], (p1[1] + p2[1]) / 2], [p2[0], (p1[1] + p2[1]) / 2]]);
        else { path.push([p1, [p2[0], p1[1]]]); path.push([[p1[0], p2[1]], p2]); }
        break;
      }
      case "S": case "s": case "f": case "F": case "f*": case "B": case "B*": case "b": case "b*": commit(); break;
      case "n": path = []; break;
      case "BI": {
        // Satır içi görüntü: ID ... EI arasını atla
        const e = lx.s.indexOf("EI", lx.p);
        lx.p = e < 0 ? lx.s.length : e + 2;
        break;
      }
    }
    stack.length = 0;
  }
}

/** Konumlu karakterleri satırlara ve sütunlara (tab) dönüştürür. */
function layout(runs, rules = []) {
  const ruleBetween = (upper, lower, x1, x2) =>
    rules.some((r) => r.y < upper.y - upper.size * 0.1 && r.y > lower.y + lower.size * 0.5 && r.x1 < x2 && r.x2 > x1);
  if (!runs.length) return "";
  // Satırları y'ye göre grupla (yukarıdan aşağı)
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const r of sorted) {
    const tol = Math.max(2, r.size * 0.45);
    const line = lines.find((l) => Math.abs(l.y - r.y) <= tol);
    if (line) line.items.push(r);
    else lines.push({ y: r.y, items: [r] });
  }
  lines.sort((a, b) => b.y - a.y);

  // Her satırı hücrelere böl: büyük boşluk = yeni hücre
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.cells = [];
    let cur = null;
    let lastEnd = null;
    for (const r of l.items) {
      const gap = lastEnd === null ? Infinity : r.x - lastEnd;
      if (!cur || gap > r.size * 0.8) {
        cur = { x: r.x, text: "" };
        l.cells.push(cur);
      } else if (gap > r.size * 0.18 && !cur.text.endsWith(" ") && r.ch !== " ") cur.text += " ";
      cur.text += r.ch;
      lastEnd = Math.max(r.x2, r.x);
    }
    for (const c of l.cells) c.text = c.text.replace(/[ \u00a0]+/g, " ").trim();
    l.cells = l.cells.filter((c) => c.text);
    l.size = l.items[0].size || 12;
  }

  const out = [];
  let prev = null;
  for (const l of lines) {
    if (!l.cells.length) continue;
    const gapY = prev ? prev.y - l.y : 0;
    // Tablo hücresinde alt satıra kayan metin: önceki satır çok hücreli, bu satır
    // yakın aralıkla geliyor ve her hücresi önceki satırın bir sütununun hizasında (ilk sütun hariç)
    const lx1 = l.cells[0]?.x ?? 0;
    const lx2 = l.items[l.items.length - 1]?.x2 ?? lx1;
    if (prev && prev.cells.length > 1 && gapY < l.size * 1.6 && !ruleBetween(prev, l, lx1, lx2)) {
      const cols = prev.cells.map((c) => c.x);
      const col = (x) => {
        let k = -1;
        for (let i = 0; i < cols.length; i++) if (x >= cols[i] - l.size * 0.6) k = i;
        return k;
      };
      const targets = l.cells.map((c) => col(c.x));
      const aligned = targets.every((k, i) => k >= 0 && Math.abs(l.cells[i].x - cols[k]) < l.size * 0.6) && new Set(targets).size === targets.length;
      // Tek hücreli devam satırı ilk sütunda olamaz (yeni tablo satırı olabilir); çok hücreli olabilir
      const wrapCol0 = targets[0] === 0 && targets.length >= 2 && targets.length * 2 < prev.cells.length && gapY < l.size * 1.35;
      if (aligned && (targets[0] > 0 || wrapCol0)) {
        l.cells.forEach((c, i) => (prev.cells[targets[i]].text += " " + c.text));
        prev.y = l.y;
        out[out.length - 1] = prev.cells.map((c) => c.text).join("\t");
        continue;
      }
    }
    if (prev && gapY > (prev.size || 12) * 1.9) out.push("");
    out.push(l.cells.map((c) => c.text).join("\t"));
    prev = l;
  }
  return out.join("\n");
}

/**
 * LaTeX PDF'lerinde Türkçe harf, harf + ayrı aksan işareti olarak gelir: "I˙STANBUL", "Yes¸im", "U¨ NI˙VERSI˙TESI˙".
 * Aksan harfle birleştirilir; büyük harften sonra araya giren boşluk (LaTeX aralığı) atılır ("O¨ ztu¨rk" → "Öztürk").
 * Küçük harften sonraki boşluk kelime sınırıdır, kalır ("Kabulu¨ ve" → "Kabulü ve").
 */
const SPACING_ACCENT = { "˙": "̇", "¨": "̈", "¸": "̧", "˘": "̆", "ˆ": "̂" };
export function joinAccents(text) {
  if (!/[A-Za-z][˙¨¸˘ˆ]/.test(text)) return text;
  return text
    .replace(/([A-Z])([˙¨¸˘ˆ]) (?=[A-Za-z])/g, "$1$2")
    .replace(/([A-Za-z])([˙¨¸˘ˆ])/g, (_, c, a) => (c + SPACING_ACCENT[a]).normalize("NFC"));
}

export async function pdfText(bytes) {
  const doc = new PdfDoc(bytes);
  await doc.load();
  const pages = doc.pages();
  if (!pages.length) throw new DocError("PDF'te sayfa bulunamadı.");
  const texts = [];
  for (const pg of pages) {
    let contents = doc.get(pg.node.Contents);
    if (!Array.isArray(contents)) contents = [pg.node.Contents];
    let content = "";
    for (const c of contents) {
      const e = doc.entryOf(c);
      if (e) content += latin1(await doc.streamBytes(e)) + "\n";
    }
    const runs = [];
    await runContent(doc, content, pg.resources, [1, 0, 0, 1, 0, 0], runs);
    texts.push(layout(runs, runs.rules || []));
  }
  const text = joinAccents(texts.join("\n\n"));
  if (text.replace(/\s/g, "").length < 40) {
    throw new DocError("Bu PDF'te okunabilir metin yok (taranmış ya da fotoğraf olabilir). Word dosyasını ya da metin seçilebilen bir PDF'i yükle.");
  }
  return { text, pages: pages.length };
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                  */
/* ------------------------------------------------------------------ */

/** ZIP içinden tek bir dosyayı çıkarır (merkezi dizin üzerinden). */
async function unzipEntry(bytes, wanted) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocError("Word dosyası bozuk görünüyor.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    if (name === wanted) {
      const lnlen = dv.getUint16(local + 26, true);
      const lxlen = dv.getUint16(local + 28, true);
      const start = local + 30 + lnlen + lxlen;
      const data = bytes.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflate(data, "deflate-raw");
      throw new DocError("Word dosyası desteklenmeyen biçimde sıkıştırılmış.");
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

const xmlUnescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** Word XML → metin. Paragraflar satır, tablo hücreleri tab, satırlar yeni satır. */
function docxXmlToText(xml) {
  const body = xml.replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "");
  const out = [];
  let depth = 0;
  let cells = [];
  let cell = [];
  let para = "";
  const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr)\b[^>]*?(\/?)>|([^<]+)/g;
  let m;
  let inText = false;
  while ((m = re.exec(body))) {
    const [, close, tag, selfClose, text] = m;
    if (text !== undefined) {
      if (inText) para += xmlUnescape(text);
      continue;
    }
    if (tag === "t") {
      inText = !close && !selfClose;
      continue;
    }
    if (tag === "tab" && !close) para += "\t";
    else if ((tag === "br" || tag === "cr") && !close) para += "\n";
    else if (tag === "p" && (close || selfClose)) {
      if (depth > 0) cell.push(para.trim());
      else out.push(para);
      para = "";
    } else if (tag === "tbl") {
      depth += close ? -1 : 1;
      if (!close && depth === 1) out.push("");
      if (close && depth === 0) out.push("");
    } else if (tag === "tc" && close && depth === 1) {
      cells.push(cell.filter(Boolean).join(" "));
      cell = [];
    } else if (tag === "tr" && close && depth === 1) {
      out.push(cells.join("\t"));
      cells = [];
    }
  }
  return out.join("\n");
}

export async function docxText(bytes) {
  const xml = await unzipEntry(bytes, "word/document.xml");
  if (!xml) throw new DocError("Bu bir Word (.docx) dosyası değil.");
  const text = docxXmlToText(new TextDecoder().decode(xml));
  if (text.replace(/\s/g, "").length < 20) throw new DocError("Word dosyası boş görünüyor.");
  return { text, pages: null };
}

/* ------------------------------------------------------------------ */
/* Giriş noktası                                                         */
/* ------------------------------------------------------------------ */

export async function extractText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = (file.name || "").toLowerCase();
  const head = latin1(bytes.subarray(0, 8));
  if (head.startsWith("%PDF")) return { ...(await pdfText(bytes)), kind: "pdf" };
  if (head.startsWith("PK")) return { ...(await docxText(bytes)), kind: "docx" };
  if (/\.(txt|md)$/.test(name) || file.type.startsWith("text/")) return { text: new TextDecoder().decode(bytes), pages: null, kind: "txt" };
  if (/\.doc$/.test(name)) throw new DocError("Eski Word biçimi (.doc) okunamıyor. Word'de \"Farklı kaydet → .docx\" ya da PDF olarak kaydedip yükle.");
  if (file.type.startsWith("image/")) throw new DocError("Fotoğraftan okuma henüz yok. Syllabus'un PDF ya da Word halini yükle.");
  throw new DocError("Bu dosya türü okunamıyor. PDF, Word (.docx) ya da metin dosyası yükle.");
}
