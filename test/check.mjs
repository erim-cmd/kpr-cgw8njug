// Her test syllabus'unu (PDF ve DOCX) ayrıştırır, expected.json ile alan alan karşılaştırır.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractText } from "../doc-text.js";
import { parseSyllabus, fold } from "../syllabus-local.js";
// fileURLToPath: Windows'ta URL.pathname "/C:/..." verir ve yol bozulur
const dir = fileURLToPath(new URL("./syllabus/", import.meta.url));
const exp = JSON.parse(readFileSync(dir + "expected.json", "utf8"));
const now = new Date(2026, 8, 26);
const verbose = process.argv.includes("-v");
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
for (const [name, e] of Object.entries(exp)) {
  for (const ext of ["pdf", "docx", "txt"]) {
    const f = dir + name + "." + ext;
    if (!existsSync(f)) continue;
    const buf = readFileSync(f);
    const file = { name: f, type: "", arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    const { text } = await extractText(file);
    const r = parseSyllabus(text, now);
    console.log(`\n${name}.${ext}`);
    if (verbose) console.log(JSON.stringify(r, null, 1));
    const c = r.course;
    for (const k of ["code", "name", "instructor", "email", "office", "credit", "ects"]) ok(c[k] === e[k] || (e[k] === "" && !c[k]), `${k}: ${JSON.stringify(c[k])} ≠ ${JSON.stringify(e[k])}`);
    const ses = r.sessions.map((s) => [s.day, s.start, s.end, s.room]);
    ok(JSON.stringify(ses) === JSON.stringify(e.sessions), `sessions: ${JSON.stringify(ses)} ≠ ${JSON.stringify(e.sessions)}`);
    const g = Object.fromEntries(r.grading.map((x) => [x.name, x.weight]));
    ok(JSON.stringify(g) === JSON.stringify(e.grading), `grading: ${JSON.stringify(g)} ≠ ${JSON.stringify(e.grading)}`);
    // Bonus bileşenler (ek puan): 100'lük dağılıma katılmaz; listede olmayan hiçbir bileşen bonus sayılmamalı
    const gb = r.grading.filter((x) => x.bonus).map((x) => x.name);
    ok(JSON.stringify(gb) === JSON.stringify(e.grading_bonus || []), `bonus: ${JSON.stringify(gb)} ≠ ${JSON.stringify(e.grading_bonus || [])}`);
    ok(r.attendance.percent === e.attendance, `attendance %: ${r.attendance.percent} ≠ ${e.attendance}`);
    if ("max_absences" in e) ok(r.attendance.max_absences === e.max_absences, `max_absences: ${r.attendance.max_absences} ≠ ${e.max_absences}`);
    ok(r.final_min === e.final_min, `final_min: ${r.final_min} ≠ ${e.final_min}`);
    // Öğeler: beklenen her öğe için başlığı anahtar kelimeyi içeren, tarihi/saati/haftası eşleşen bir kayıt
    for (const [t, date, time, week] of e.items) {
      const hit = r.items.find((x) => fold(x.title).includes(fold(t)) && x.date === date && (time ? x.time === time : true) && (week ? x.week === week : true));
      ok(hit, `item ${t} ${date} ${time || ""} ${week || ""} yok`);
    }
    ok(r.items.length === e.items.length, `item sayısı ${r.items.length} ≠ ${e.items.length}: ${r.items.map((x) => `${x.title}@${x.date || "w" + x.week}${x.time ? " " + x.time : ""}`).join(" | ")}`);
    // Uyarılar (isteğe bağlı): olması gerekenler ve kesinlikle olmaması gerekenler
    for (const w of e.warnings_include || []) ok(r.warnings.some((x) => fold(x).includes(fold(w))), `uyarı yok: "${w}" · var olanlar: ${r.warnings.join(" / ")}`);
    for (const w of e.warnings_exclude || []) ok(!r.warnings.some((x) => fold(x).includes(fold(w))), `olmaması gereken uyarı var: "${w}"`);
    if ("warnings_count" in e) ok(r.warnings.length === e.warnings_count, `uyarı sayısı ${r.warnings.length} ≠ ${e.warnings_count}: ${r.warnings.join(" / ")}`);
    // Öğenin kaynak cümlesi (isteğe bağlı): [başlıktaki kelime, kaynakta geçmesi gereken metin]
    for (const [t, src] of e.items_source || []) {
      const it = r.items.find((x) => fold(x.title).includes(fold(t)));
      ok(it && fold(it.source).includes(fold(src)), `kaynak: ${t} → ${JSON.stringify(it?.source)} içinde "${src}" yok`);
    }
    if ("office_hours" in e) ok(c.office_hours === e.office_hours, `office_hours: ${JSON.stringify(c.office_hours)} ≠ ${JSON.stringify(e.office_hours)}`);
    // Kırmızı (kritik) kural türleri (isteğe bağlı): yanlış alarm olmasın
    if (e.policies_kritik) {
      const kr = [...new Set(r.policies.filter((p) => p.severity === "kritik").map((p) => p.kind))].sort();
      ok(JSON.stringify(kr) === JSON.stringify([...e.policies_kritik].sort()), `kritik kurallar: ${kr} ≠ ${[...e.policies_kritik].sort()}`);
    }
    // Haftalık konular: [hafta, tarih|null, konu]; yanlış konu göstermektense boş olmalı
    if ("weeks" in e) {
      const wk = r.weeks.map((w) => [w.n, w.date, w.topic]);
      ok(JSON.stringify(wk) === JSON.stringify(e.weeks), `weeks: ${JSON.stringify(wk)} ≠ ${JSON.stringify(e.weeks)}`);
    }
    const kinds = [...new Set(r.policies.map((p) => p.kind))].sort();
    ok(JSON.stringify(kinds) === JSON.stringify([...e.policies].sort()), `policies: ${kinds} ≠ ${[...e.policies].sort()}`);
  }
}
console.log(`\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
