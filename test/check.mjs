// Her test syllabus'unu (PDF ve DOCX) ayrıştırır, expected.json ile alan alan karşılaştırır.
import { readFileSync, existsSync } from "node:fs";
import { extractText } from "../doc-text.js";
import { parseSyllabus, fold } from "../syllabus-local.js";
const dir = new URL("./syllabus/", import.meta.url).pathname;
const exp = JSON.parse(readFileSync(dir + "expected.json", "utf8"));
const now = new Date(2026, 8, 26);
const verbose = process.argv.includes("-v");
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
for (const [name, e] of Object.entries(exp)) {
  for (const ext of ["pdf", "docx"]) {
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
    ok(r.attendance.percent === e.attendance, `attendance %: ${r.attendance.percent} ≠ ${e.attendance}`);
    if ("max_absences" in e) ok(r.attendance.max_absences === e.max_absences, `max_absences: ${r.attendance.max_absences} ≠ ${e.max_absences}`);
    ok(r.final_min === e.final_min, `final_min: ${r.final_min} ≠ ${e.final_min}`);
    // Öğeler: beklenen her öğe için başlığı anahtar kelimeyi içeren, tarihi/saati/haftası eşleşen bir kayıt
    for (const [t, date, time, week] of e.items) {
      const hit = r.items.find((x) => fold(x.title).includes(fold(t)) && x.date === date && (time ? x.time === time : true) && (week ? x.week === week : true));
      ok(hit, `item ${t} ${date} ${time || ""} ${week || ""} yok`);
    }
    ok(r.items.length === e.items.length, `item sayısı ${r.items.length} ≠ ${e.items.length}: ${r.items.map((x) => `${x.title}@${x.date || "w" + x.week}${x.time ? " " + x.time : ""}`).join(" | ")}`);
    const kinds = [...new Set(r.policies.map((p) => p.kind))].sort();
    ok(JSON.stringify(kinds) === JSON.stringify([...e.policies].sort()), `policies: ${kinds} ≠ ${[...e.policies].sort()}`);
  }
}
console.log(`\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
