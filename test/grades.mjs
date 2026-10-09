// Not hesabı (ders-calc.js): bonus (ek puan) bileşenleri 100'lük dağılıma katılmaz.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { calcGrades, targetResult } = await import("../ders-calc.js");
const { normalize } = await import("../store.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-6;

const G = (score = {}) => [
  { name: "Video Project", weight: 20, score: score.v ?? null },
  { name: "Midterm Exam", weight: 40, score: score.m ?? null },
  { name: "Quiz", weight: 20, score: score.q ?? null, bonus: true },
  { name: "Final Exam", weight: 40, score: score.f ?? null },
];

// Bonus toplamda yok: 20 + 40 + 40 = 100
let r = calcGrades(G(), 70);
ok(r.total === 100, `total ${r.total} ≠ 100`);
ok(near(r.needed, 70), `hiç not yokken gereken ${r.needed} ≠ 70`);

// Video 80, vize 60 → kazanılan 16 + 24 = 40; kalan 40 (yalnız final); hedef 70 → finalden 75
r = calcGrades(G({ v: 80, m: 60 }), 70);
ok(near(r.earned, 40), `kazanılan ${r.earned} ≠ 40`);
ok(near(r.remaining, 40), `kalan ${r.remaining} ≠ 40 (bonus kalana sayılmamalı)`);
ok(near(r.needed, 75), `gereken ${r.needed} ≠ 75`);
ok(near(r.average, 66.666666666), `ortalama ${r.average} ≠ 66,67 (bonus ortalamayı şişirmemeli)`);

// Quiz bonusundan 50 → +10 puan; finalden gereken 50'ye düşer
r = calcGrades(G({ v: 80, m: 60, q: 50 }), 70);
ok(near(r.earned, 50), `bonuslu kazanılan ${r.earned} ≠ 50`);
ok(near(r.needed, 50), `bonuslu gereken ${r.needed} ≠ 50`);

// Bonus dışı her şey girildiyse ders bitti sayılır (bonus boş kalsa da)
const scale = [{ letter: "A", min: 90 }, { letter: "B", min: 75 }, { letter: "C", min: 60 }, { letter: "D", min: 50 }];
const st = normalize({ profile: { name: "T" }, courses: [{ id: "c", name: "Ops", grading: G({ v: 80, m: 60, f: 70 }), scale, target: 75 }], tasks: [], settings: {} });
const c = st.courses[0];
ok(c.grading[2].bonus === true && c.grading[0].bonus === undefined, `store bonus işaretini korumuyor: ${JSON.stringify(c.grading)}`);
const tr = targetResult(c);
ok(tr.done && tr.letter === "C", `bitmiş ders: done=${tr.done} harf=${tr.letter} ≠ C (16+24+28=68)`);
// Yalnız final kaldıysa "Finalden en az" denir; boş bonus bunu bozmaz
const c2 = { ...c, grading: G({ v: 80, m: 60 }), targetLetter: "B", target: 75 };
ok(targetResult(c2).onlyFinal === true, "bonus boşken 'yalnız final kaldı' algılanmalı");

console.log(`\ngrades\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
