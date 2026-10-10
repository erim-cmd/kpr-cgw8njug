// Takvime aktarma (ics.js): haftalık ders tekrarı dönem sonunu aşmamalı.
// Dönem başlangıcı (settings.termStart) + termWeeks hafta = dönem sonu; tekrar o tarihten sonra sürmez.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { buildICS } = await import("../ics.js");
const { toISO, parseISO } = await import("../dates.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

const today = parseISO(toISO(new Date()));
const monday = new Date(today);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const weeksAgo = (n) => { const d = new Date(monday); d.setDate(d.getDate() - n * 7); return toISO(d); };
const course = { id: "c1", code: "MAT 1001", name: "Kalkülüs I", sessions: [{ day: 0, start: "09:00", end: "10:50", room: "A-110" }, { day: 3, start: "13:00", end: "14:50", room: "" }] };
const state = (settings) => ({ courses: [course], tasks: [], settings: { termWeeks: 14, ...settings } });

/** Her VEVENT için ilk tarih + COUNT → son tekrarın tarihi. */
function lastDates(ics) {
  return [...ics.matchAll(/DTSTART:(\d{4})(\d{2})(\d{2})T\d{6}\r\n(?:[^\r\n]*\r\n)*?RRULE:FREQ=WEEKLY;COUNT=(\d+)/g)].map((m) => {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + (+m[4] - 1) * 7);
    return toISO(d);
  });
}

// 1) Dönemin 10. haftası (başlangıç 9 hafta önceki pazartesi), 14 haftalık dönem: kalan ~5 hafta
{
  const start = weeksAgo(9);
  const end = new Date(parseISO(start));
  end.setDate(end.getDate() + 14 * 7 - 1); // son ders günü dönem sonu (14. haftanın pazarı)
  const ics = buildICS(state({ termStart: start }), { classes: true });
  const last = lastDates(ics);
  ok(last.length === 2, `iki ders saati için iki tekrar: ${last.length}`);
  for (const l of last) ok(l <= toISO(end), `son tekrar ${l} dönem sonunu (${toISO(end)}) aşmamalı`);
  const counts = [...ics.matchAll(/COUNT=(\d+)/g)].map((m) => +m[1]);
  ok(counts.every((n) => n <= 5), `kalan hafta sayısı kadar tekrar (≤5): ${counts}`);
}

// 2) Dönem bitmiş: ders tekrarı hiç yazılmaz
{
  const ics = buildICS(state({ termStart: weeksAgo(20) }), { classes: true });
  ok(!/RRULE/.test(ics), "dönem bittiyse ders tekrarı olmamalı");
}

// 3) Dönem başlangıcı girilmemiş ve görev yok: bugünden itibaren termWeeks (eski davranış)
{
  const ics = buildICS(state({ termStart: "" }), { classes: true });
  const counts = [...ics.matchAll(/COUNT=(\d+)/g)].map((m) => +m[1]);
  ok(counts.length === 2 && counts.every((n) => n >= 13 && n <= 14), `başlangıç bilinmiyorsa termWeeks: ${counts}`);
}

console.log(`\ntakvime aktarma\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
