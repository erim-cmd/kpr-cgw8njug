// Bildirimlerdeki zaman ifadeleri GÖSTERİM anındaki gerçek süreyle tutarlı mı? (alerts.js + sw.js kopyası)
//  1) 10:00 teslimli ödev: önceki akşam 20:00'de "yarın 10:00"; sabah 07:00'de "3 saat sonra"
//  2) Sınav günü sabahı açılışta "Yarın sınav" çıkmaz ("bugün 10:00"); aynı görevin eski hatırlatması gösterilmez
//  3) Başlamış ders için "15 dk sonra" gelmez (gönderildi sayılır)
//  4) Geçmiş teslim için "3 saat kaldı" gelmez
//  5) service worker kopyası aynı kaynak ve aynı çıktı; İngilizce
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const A = await import("../alerts.js");
const { setLang } = await import("../i18n.js");
const { buildReminders, describe, describeReminder, pickDueReminders, reminderStrings } = A;

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const D = (m, d, h = 0, mi = 0) => new Date(2026, m - 1, d, h, mi, 0, 0); // yerel saat
const DAY = 86400000, CATCH = 12 * 3600 * 1000;

const course = { id: "c1", code: "MAT 1001", name: "Kalkülüs I", sessions: [{ day: 0, start: "09:00", end: "10:50", room: "A-110" }] }; // Pazartesi
const task = (o) => ({ id: "t1", courseId: "c1", title: "Ödev 1", type: "odev", due: "2026-10-13", time: "", done: false, ...o });
const state = (tasks, extra = {}) => ({ courses: [course], tasks, settings: { notifyClasses: true, termWeeks: 14, ...extra } });
const flat = (list) => list.map((r) => ({ ...r, fireAt: r.fireAt.getTime() }));
const byId = (list, id) => list.find((r) => r.id === id);
/** Şimdi (now) gösterilecek hatırlatmalar, metniyle. */
function shownAt(st, now, only = /^r:(t1|e\d):/) {
  const all = flat(buildReminders(st, new Date(now - CATCH), 2));
  const { show, skip } = pickDueReminders(all, {}, now, CATCH);
  const L = reminderStrings();
  return { show: show.filter((r) => only.test(r.id)).map((r) => ({ id: r.id, ...describeReminder(r, now, L) })), skip: skip.filter((r) => only.test(r.id)).map((r) => r.id) };
}

// 1) 10:00 teslimli ödev (Salı 13 Ekim 10:00)
{
  const st = state([task({ time: "10:00" })]);
  const rem = buildReminders(st, D(10, 12, 0), 3);
  const three = byId(rem, "r:t1:3h");
  ok(three && three.fireAt.getTime() === D(10, 12, 20).getTime(), `3 saat hatırlatması sessiz saatte önceki akşam 20:00'ye çekilmeli: ${three?.fireAt}`);
  const evening = describe(three, D(10, 12, 20).getTime());
  ok(/yarın 10:00/.test(evening.title) && !/3 saat/.test(evening.title), `20:00'de "yarın 10:00" yazmalı, "3 saat" değil: ${evening.title}`);
  ok(three.title === evening.title, `planlanan metin = fireAt anındaki metin: ${three.title}`);
  ok(evening.title === "MAT 1001 · Ödev 1 · teslim yarın 10:00", `başlık biçimi "{ad} · teslim {ne zaman}": ${evening.title}`);
  const dayOf = describe(three, D(10, 13, 7, 0).getTime());
  ok(/3 saat sonra/.test(dayOf.title), `sabah 07:00'de "3 saat sonra": ${dayOf.title}`);
  ok(/45 dk sonra/.test(describe(three, D(10, 13, 9, 15).getTime()).title), "09:15'te 45 dk sonra");
  ok(/bugün 10:00/.test(describe(three, D(10, 13, 2, 0).getTime()).title), "8 saat kala gün+saat: " + describe(three, D(10, 13, 2, 0).getTime()).title);
  ok(/90 dk sonra/.test(describe(three, D(10, 13, 8, 30).getTime()).title), "2 saatten az kalınca dakika: " + describe(three, D(10, 13, 8, 30).getTime()).title);
  ok(/yarın 10:00/.test(describe(byId(rem, "r:t1:1d"), D(10, 12, 20).getTime()).title), "1 gün önceki hatırlatma da yarın 10:00");
}

// 2) Sınav günü sabahı: "Yarın sınav" çıkmaz
{
  const st = state([task({ id: "e1", type: "sinav", title: "Ara sınav", due: "2026-10-13", time: "09:00" })]);
  const morning = D(10, 13, 7, 30); // uygulama sabah açıldı; dünkü 20:00 ve bugünkü 07:00 hatırlatmaları birikmiş
  const { show, skip } = shownAt(st, morning);
  ok(show.length === 1, `aynı sınav için tek bildirim (en yenisi): ${show.map((s) => s.id)}`);
  ok(show[0] && show[0].id === "r:e1:2h", `en yeni hatırlatma gösterilmeli: ${show[0]?.id}`);
  ok(show.every((s) => !/yarın sınav/i.test(s.title) && !/^Yarın/.test(s.title)), `"Yarın sınav" çıkmamalı: ${show.map((s) => s.title)}`);
  ok(show[0] && /^MAT 1001 · Ara sınav · sınav 90 dk sonra$/.test(show[0].title), `kalan süre yazmalı: ${show[0]?.title}`);
  ok(skip.includes("r:e1:1d"), "eski (dünkü) hatırlatma gösterilmeden gönderildi sayılmalı");
  // Yalnız dünkü hatırlatma pencerede kalmışsa (06:55'te 2 saat önceki henüz yok) metin "bugün 09:00" der, "yarın" demez
  const early = shownAt(st, D(10, 13, 6, 55));
  ok(early.show.length === 1 && /bugün 09:00|2 saat sonra/.test(early.show[0].title) && !/yarın/i.test(early.show[0].title), `06:55'te: ${early.show.map((s) => s.title)}`);
  // Akşam 20:00'de gerçekten "yarın"
  const eve = shownAt(st, D(10, 12, 20, 0));
  ok(eve.show.length === 1 && /yarın 09:00/.test(eve.show[0].title), `önceki akşam 20:00: ${eve.show.map((s) => s.title)}`);
  // Saatsiz sınav: yalnız gün sözcüğü, saat uydurulmaz
  const noTime = state([task({ id: "e2", type: "sinav", title: "Final", due: "2026-10-13", time: "" })]);
  const nt = shownAt(noTime, D(10, 12, 20, 0));
  ok(nt.show.length === 1 && /yarın/.test(nt.show[0].title) && !/\d\d:\d\d/.test(nt.show[0].title), `saatsiz sınav: ${nt.show.map((s) => s.title)}`);
}

// 3) Başlamış ders için bildirim gelmez (Pazartesi 12 Ekim 09:00)
{
  const st = state([]);
  const before = shownAt(st, D(10, 12, 8, 50), /./);
  const cls = before.show.find((s) => s.id.startsWith("r:class:"));
  ok(cls && /^10 dk sonra: Kalkülüs I/.test(cls.title), `ders öncesi dk hesabı gösterim anına göre: ${cls?.title}`);
  const after = shownAt(st, D(10, 12, 9, 10), /./);
  ok(!after.show.some((s) => s.id.startsWith("r:class:")), `ders başladıktan sonra "15 dk sonra" gelmemeli: ${after.show.map((s) => s.title)}`);
  ok(after.skip.some((id) => id.startsWith("r:class:")), "başlamış dersin hatırlatması gönderildi sayılmalı");
  ok(after.show.some((s) => s.id === "r:day:2026-10-12"), "günün özeti ders başlasa da gün boyu gösterilir");
}

// 4) Geçmiş teslim için "3 saat kaldı" gelmez (Salı 15:00 teslim, 12:00'de planlı)
{
  const st = state([task({ time: "15:00" })]);
  const live = shownAt(st, D(10, 13, 12, 30));
  ok(live.show.some((s) => s.id === "r:t1:3h" && /^MAT 1001 · Ödev 1 · teslim (3|2) saat sonra$/.test(s.title)), `teslimden önce gösterilir: ${live.show.map((s) => s.title)}`);
  const late = shownAt(st, D(10, 13, 15, 30));
  ok(!late.show.some((s) => s.id === "r:t1:3h"), `teslim geçtikten sonra gelmemeli: ${late.show.map((s) => s.title)}`);
  ok(late.skip.includes("r:t1:3h"), "geçmiş teslim hatırlatması gönderildi sayılmalı");
  const sentAlready = pickDueReminders(flat(buildReminders(st, D(10, 13, 11, 0), 2)), { "r:t1:3h": 1 }, D(10, 13, 12, 30).getTime(), CATCH);
  ok(!sentAlready.show.some((r) => r.id === "r:t1:3h"), "gönderilmiş hatırlatma tekrar gelmez");
}

// 5) service worker kopyası
{
  const root = fileURLToPath(new URL("../", import.meta.url));
  const norm = (src, name) => {
    const i = src.indexOf(`function ${name}(`);
    return src.slice(i, src.indexOf("\n}\n", i) + 3).replace(/\s+/g, " ").trim();
  };
  const a = readFileSync(root + "alerts.js", "utf8");
  const s = readFileSync(root + "sw.js", "utf8");
  for (const name of ["describeReminder", "pickDueReminders", "digestNotice"]) ok(norm(a, name) === norm(s, name) && norm(s, name).length > 100, `sw.js ${name} kopyası alerts.js ile aynı olmalı`);
  const ctx = { self: { addEventListener() {}, registration: {}, location: { origin: "http://x" } }, URL, Response: class {}, console };
  vm.createContext(ctx);
  vm.runInContext(s, ctx);
  const st = state([task({ time: "10:00" }), task({ id: "e1", type: "sinav", title: "Ara sınav", time: "10:00" })]);
  const L = JSON.parse(JSON.stringify(reminderStrings()));
  for (const now of [D(10, 12, 20), D(10, 13, 7), D(10, 13, 8, 30), D(10, 13, 9, 30), D(10, 13, 11)]) {
    const all = flat(buildReminders(st, new Date(now - CATCH), 3));
    const mine = pickDueReminders(all, {}, now.getTime(), CATCH);
    const theirs = ctx.pickDueReminders(all, {}, now.getTime(), CATCH);
    ok(JSON.stringify(mine.show.map((r) => r.id)) === JSON.stringify(Array.from(theirs.show, (r) => r.id)) && mine.skip.length === theirs.skip.length, `worker aynı hatırlatmaları seçmeli (${now.toTimeString().slice(0, 5)})`);
    for (const r of all) ok(JSON.stringify(describeReminder(r, now.getTime(), L)) === JSON.stringify(ctx.describeReminder(r, now.getTime(), L)), `worker metni aynı: ${r.id} @ ${now.toTimeString().slice(0, 5)}`);
  }
  // Eski önbellek (strings yok): planlanan metin korunur, çökmez
  const old = ctx.describeReminder({ kind: "due", title: "T", body: "B" }, Date.now(), undefined);
  ok(old.title === "T" && old.body === "B", "strings yoksa planlanan metin");
}

// 6) İngilizce
{
  setLang("en");
  const st = state([task({ time: "10:00" })]);
  const three = byId(buildReminders(st, D(10, 12, 0), 3), "r:t1:3h");
  ok(/^MAT 1001 · Ödev 1 · due tomorrow 10:00$/.test(describe(three, D(10, 12, 20).getTime()).title), `EN: ${describe(three, D(10, 12, 20).getTime()).title}`);
  ok(/^MAT 1001 · Ödev 1 · due in 3 hr$/.test(describe(three, D(10, 13, 7).getTime()).title), `EN: ${describe(three, D(10, 13, 7).getTime()).title}`);
  // Sınav İngilizce + worker kopyası İngilizce metin parçalarıyla da aynı çıktı
  const ex = state([task({ id: "e1", type: "sinav", title: "Midterm", time: "09:00" })]);
  const exR = byId(buildReminders(ex, D(10, 12, 0), 3), "r:e1:2h");
  const enTitle = describe(exR, D(10, 13, 7, 30).getTime()).title;
  ok(enTitle === "MAT 1001 · Midterm · exam in 90 min", `EN sınav: ${enTitle}`);
  const ctx = { self: { addEventListener() {} }, URL, Response: class {}, console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../sw.js", import.meta.url)), "utf8"), ctx);
  const LEN = JSON.parse(JSON.stringify(reminderStrings()));
  ok(ctx.describeReminder(exR, D(10, 13, 7, 30).getTime(), LEN).title === enTitle, "worker EN çıktısı aynı");
  setLang("tr");
}

// 7) Toplu bildirim: 4'ten fazla hatırlatma birikince fazlası "+N tane daha" (kaybolmaz)
{
  const L = reminderStrings();
  const six = Array.from({ length: 6 }, (_, i) => ({ title: `İş ${i}` }));
  const d = A.digestNotice(six, L);
  ok(d.title === "6 hatırlatman var", `toplu başlık: ${d.title}`);
  ok(d.body.split("\n").length === 5 && d.body.endsWith("+2 tane daha"), `ilk 4 + "+2 tane daha": ${JSON.stringify(d.body)}`);
  ok(!A.digestNotice(six.slice(0, 4), L).body.includes("tane daha"), "tam 4 iş: ek satır yok");
  // Worker uçtan uca: önbellekteki 6 hatırlatmadan tek toplu bildirim, "+2 tane daha" ile
  const now = D(10, 13, 21, 0).getTime();
  const many = Array.from({ length: 6 }, (_, i) => task({ id: "m" + i, title: "Ödev " + i, due: "2026-10-14" }));
  const list = flat(buildReminders(state(many, { notifyClasses: false }), new Date(now - CATCH), 2)).filter((r) => r.kind !== "day");
  const shown = [];
  const cache = { match: async () => ({ json: async () => ({ strings: reminderStrings(), reminders: list, sent: {} }) }), put: async () => {} };
  const wctx = { self: { addEventListener() {}, registration: { showNotification: async (title, o) => shown.push({ title, body: o.body }) } }, caches: { open: async () => cache }, Response: class {}, Date: class extends Date { static now() { return now; } }, URL, console };
  vm.createContext(wctx);
  vm.runInContext(readFileSync(fileURLToPath(new URL("../sw.js", import.meta.url)), "utf8"), wctx);
  await wctx.showDueReminders();
  ok(shown.length === 1 && shown[0].title === "6 hatırlatman var" && shown[0].body.endsWith("+2 tane daha"), `worker toplu bildirim: ${JSON.stringify(shown)}`);
  // Eski önbellek ("more" yok): çökmez, Türkçe yedek
  const oldL = { ...reminderStrings() };
  delete oldL.more;
  ok(A.digestNotice(six, { ...oldL, more: "+{n} tane daha" }).body.endsWith("+2 tane daha"), "yedek metinle");
}

console.log(`\nbildirim zamanı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
