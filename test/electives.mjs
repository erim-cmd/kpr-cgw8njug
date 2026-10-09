// Seçmeli adayları: syllabus özeti doğru çıkıyor mu, kayıt normalize ediliyor mu, derslere/görevlere sızmıyor mu?
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { parseSyllabus, electiveFrom } = await import("../syllabus-local.js");
const { normalize } = await import("../store.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

const dir = fileURLToPath(new URL("./syllabus/", import.meta.url));
const e = electiveFrom(parseSyllabus(readFileSync(dir + "en_bonus_ofis.txt", "utf8"), new Date(2026, 8, 26)));
ok(e.code === "MAN 3011" && e.ects === 5, `kod/AKTS: ${e.code} ${e.ects}`);
ok(e.exams === 2, `sınav sayısı ${e.exams} ≠ 2`);
ok(e.grading.some((g) => g.name === "Quiz" && g.bonus), "bonus bileşen korunmalı");
ok(e.rules.includes("Yapay zekâ ile ödev yazmak intihal sayılıyor."), `kritik kural yok: ${e.rules}`);

const st = normalize({ profile: { name: "T" }, courses: [], tasks: [], electives: [e, { name: "" }, ...Array.from({ length: 10 }, (_, i) => ({ code: "X " + i }))] });
ok(st.electives.length === 8, `en fazla 8 aday: ${st.electives.length}`);
ok(st.electives[0].id && st.electives[0].grading[2].bonus === true, "id ve bonus normalize sonrası kalmalı");
ok(st.courses.length === 0 && st.tasks.length === 0, "aday derse/göreve dönüşmemeli");
ok(Array.isArray(normalize({}).electives) && normalize({}).electives.length === 0, "eski veride electives boş dizi");

console.log(`\nelectives\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
