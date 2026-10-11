// Bugün ekranı (today.js view): aynı bilgi iki kez gösterilmez.
// "Sıradaki" kartındaki iş ve kartın altındaki "Sonraki sınav", "Bu hafta" listesinde tekrar etmez.
// Özet cümlesi "Bu hafta" listesiyle aynı pencereyi sayar (önümüzdeki 7 gün): Pazar günü yarınki teslim
// varken "bu hafta teslimin yok" demez.
// Bugün = 11 Ekim 2026 Pazar 12:00 (takvim haftasının son günü)
const RealDate = Date;
const FIXED = new RealDate(2026, 9, 11, 12, 0, 0).getTime();
globalThis.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(FIXED); }
  static now() { return FIXED; }
};
import { toISO } from "../dates.js";
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };
const T = (id, title, type, due) => ({ id, title, type, courseId: "c1", due, time: "", note: "", source: "", done: false });
const data = {
  version: 2, profile: { name: "Test" },
  courses: [{ id: "c1", name: "Kalkülüs I", code: "MAT 1001", color: "#4CC9F0", sessions: [], grading: [], policies: [], absences: [] }],
  tasks: [T("t1", "Ödev Bir", "odev", day(1)), T("e1", "Ara Sınav Bir", "sinav", day(3)), T("t2", "Rapor İki", "odev", day(5))],
  transcript: [], gpaBase: null, settings: { termWeeks: 14, todayView: "bugun", interests: [] }, archive: { transcript: [] },
};
const mem = { "kpr:data:v1": JSON.stringify(data), "kpr:install-dismissed": String(Date.now()) };
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
globalThis.window = globalThis;
// Kampüste (hava durumu) testte ağa çıkmasın
let netCalls = 0;
globalThis.fetch = async () => { netCalls++; throw new Error("test: ağ yok"); };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { documentElement: { lang: "tr", dataset: {}, style: { setProperty() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) };
const { view } = await import("../today.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const html = view();
// Görünen her iş tek bir "düzenle" düğmesiyle çizilir (kartın başlığı, "Sonraki sınav" satırı ya da liste satırı)
const count = (id) => html.split(`data-action="edit-task" data-id="${id}"`).length - 1;
ok(count("t1") === 1, `"Sıradaki" kartındaki ödev bir kez görünmeli: ${count("t1")}`);
ok(count("e1") === 1, `kartın altındaki sonraki sınav "Bu hafta"da tekrar etmemeli: ${count("e1")}`);
ok(count("t2") === 1, `kartta olmayan iş "Bu hafta"da görünmeli: ${count("t2")}`);

// Pazar: yarın (Pazartesi) teslim, 3. ve 5. gün iş var → cümle "teslimin yok" demez, listeyle aynı sayıyı söyler
ok(new Date().getDay() === 0, "test günü Pazar");
const sub = (html.match(/<p class="page-sub">([^<]*)<\/p>/) || [])[1] || "";
ok(!/teslimin yok/.test(sub), `Pazar günü yarınki teslim varken "teslimin yok" dememeli: "${sub}"`);
ok(/bu hafta 3 teslimin var/.test(sub), `cümle "Bu hafta" penceresindeki (7 gün) işleri sayar: "${sub}"`);

console.log(`\nbugün ekranı\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
