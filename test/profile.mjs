// Profil ve ayarlar (settings.js) + Ara (search.js):
//  - eski Ayarlar ekranındaki her işlev yeni yapıda bir yerde (hiçbiri kaybolmadı)
//  - Profil kök sayfası: avatar (baş harfler), ad, üniversite, sınıf, Profili düzenle, 4 ayar satırı
//  - her alt sayfa TR ve EN çiziliyor; LMS/takvim bağlantısı yok; hesap isteğe bağlı ve sunucu hazır değilse görünmez (v2.33)
//  - profil alanları doğrulanıyor (store.js normalize / setProfile)
//  - arama: Türkçe harf duyarsız, dersler / sınavlar / görevler
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { documentElement: { lang: "tr", dataset: {}, style: { setProperty() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {} }) };

const { store, normalize } = await import("../store.js");
const { runMigrations } = await import("../migrate.js");
const { pageHtml, PAGES, initials } = await import("../settings.js");
const { searchAll } = await import("../search.js");
const { setLang } = await import("../i18n.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

runMigrations();
store.setName("Elif Yılmaz");
store.saveCourse({ id: "c1", name: "Kalkülüs I", code: "MAT 1001", instructor: "Dr. Deneme Kişi", color: "#4CC9F0", sessions: [], grading: [], policies: [] });
store.saveTask({ id: "t1", courseId: "c1", title: "Ödev 1", type: "odev", due: "2026-10-20", done: false });
store.saveTask({ id: "e1", courseId: "c1", title: "Ara Sınav", type: "sinav", due: "2026-11-16", done: false });

// 1) Eski Ayarlar ekranının işlevleri → yeni yerleri (sayfa: işaret)
const MOVED = [
  ["edit", 'name="name"', "Profil → ad"],
  ["edit", 'name="no"', "Öğrenci numarası (mail imzası)"],
  ["prefs", 'data-act="set-theme"', "Görünüm (tema)"],
  ["prefs", 'data-act="set-lang"', "Dil"],
  ["prefs", 'data-ch="term-weeks"', "Dönem kaç hafta"],
  ["notify", 'name="notifyClasses"', "Dersten 15 dk önce"],
  ["notify", 'data-ch="ics-classes"', "Takvime aktar: ders saatleri"],
  ["notify", 'data-act="export-ics"', "Takvime aktar"],
  ["notify", "Bildirimler nasıl çalışır?", "Bildirim açıklaması"],
  ["data", 'data-act="export"', "Yedek al"],
  ["data", 'data-ch="import"', "Yedekten yükle"],
  ["data", 'data-act="reset"', "Her şeyi sil"],
  ["data", 'href="gizlilik.html"', "Gizlilik ve KVKK"],
  ["about", "Sürüm 2.", "Sürüm"],
  ["about", "Telefonuna kur", "Telefona kur (web)"],
  ["about", "İnternetsiz çalışma", "İnternetsiz çalışma durumu"],
  ["about", 'href="./"', "Tanıtım sayfası"],
];
const st = store.get();
for (const [page, mark, what] of MOVED) ok(pageHtml(page, st).includes(mark), `${what} → ${PAGES[page].title()} sayfasında olmalı`);
// Bildirim izni satırı her durumda bildirim sayfasında (bu ortamda "desteklemiyor")
ok(/Bildirimler/.test(pageHtml("notify", st)), "bildirim izni satırı");

// 2) Kök sayfa
const root = pageHtml("root", st);
ok(root.includes(">EY<") && root.includes("Elif Yılmaz"), "avatar baş harfleri ve ad");
ok(root.includes('data-go="edit"') && ["prefs", "notify", "data", "about"].every((p) => root.includes(`data-go="${p}"`)), "Profili düzenle + 4 ayar satırı");
ok(root.includes("Üniversite ve sınıf eklenmedi"), "üniversite/sınıf yoksa söyler");
ok(!/data-close/.test(root) === false && !/data-go="root"/.test(root), "kökte geri düğmesi yok, kapat var");
ok(/data-go="root"/.test(pageHtml("prefs", st)), "alt sayfada geri düğmesi");
ok(/type="submit"/.test(pageHtml("edit", st)) && /type="submit"/.test(pageHtml("notify", st)), "Profili düzenle ve Bildirimler'de Kaydet");
// Kampüste ayarı
const prefs = pageHtml("prefs", st);
ok(/data-ch="weather-on"/.test(prefs) && /data-ch="weather-city"/.test(prefs) && /value="istanbul" selected/.test(prefs), "hava durumu aç/kapa + şehir (varsayılan İstanbul)");
ok(/Open-Meteo/.test(prefs), "hangi verinin gittiği açıklanıyor");
// Bildirim türleri ve sessiz saatler
const notify = pageHtml("notify", st);
ok(["notifyExams", "notifyDue", "notifyDaily", "notifyClasses"].every((n) => notify.includes(`name="${n}"`)), "4 hatırlatma türü");
ok(/name="quietStart" value="23:00"/.test(notify) && /name="quietEnd" value="08:00"/.test(notify), "sessiz saatler varsayılan 23:00–08:00");
// Haftaya bakış: Günün özeti'nin hemen altında, varsayılan açık
const iDaily = notify.indexOf('name="notifyDaily"'), iWeekly = notify.indexOf('name="notifyWeekly"'), iClasses = notify.indexOf('name="notifyClasses"');
ok(iDaily > 0 && iDaily < iWeekly && iWeekly < iClasses, "Haftaya bakış Günün özeti'nin altında");
ok(/name="notifyWeekly" checked/.test(notify) && notify.includes("Pazar 20:00'de"), "Haftaya bakış varsayılan açık, açıklamalı");
// Tatil ve ara dönem: Sessiz saatler'in altında; aç/kapa + iki tarih, varsayılan kapalı
const iQuiet = notify.indexOf("Sessiz saatler"), iPause = notify.indexOf("Tatil ve ara dönem");
ok(iQuiet > 0 && iPause > iQuiet && iPause < notify.indexOf('name="pauseOn"'), "Tatil ve ara dönem Sessiz saatler'in altında");
ok(!/name="pauseOn" checked/.test(notify) && notify.includes('name="pauseOn"') && /type="date" class="date-native" value="" name="pauseStart"/.test(notify) && /type="date" class="date-native" value="" name="pauseEnd"/.test(notify), "duraklatma varsayılan kapalı, tarihler boş");
// Ayar doğrulaması (store.js normalize)
const S = (s) => normalize({ settings: s }).settings;
ok(S({}).notifyWeekly === true && S({ notifyWeekly: false }).notifyWeekly === false, "notifyWeekly varsayılan açık, kapatılabilir");
ok(S({}).pauseOn === false && S({}).pauseStart === "" && S({}).pauseEnd === "", "eski kayıtta duraklatma kapalı");
const okP = S({ pauseOn: true, pauseStart: "2026-12-28", pauseEnd: "2027-01-04" });
ok(okP.pauseOn && okP.pauseStart === "2026-12-28" && okP.pauseEnd === "2027-01-04", "geçerli aralık kaydedilir");
ok(S({ pauseOn: true, pauseStart: "2026-11-10", pauseEnd: "2026-11-10" }).pauseOn, "tek günlük aralık geçerli");
ok(!S({ pauseOn: true, pauseStart: "2026-11-10", pauseEnd: "2026-11-01" }).pauseOn, "bitiş < başlangıç → kapalı");
ok(!S({ pauseOn: true, pauseStart: "2026-02-30", pauseEnd: "2026-03-05" }).pauseOn && S({ pauseStart: "2026-02-30" }).pauseStart === "", "takvimde olmayan tarih → boş, kapalı");
ok(!S({ pauseOn: true, pauseStart: "x", pauseEnd: "" }).pauseOn && !S({ pauseOn: "evet", pauseStart: "2026-11-01", pauseEnd: "2026-11-02" }).pauseOn, "eksik/bozuk değer → kapalı");
store.setSettings({ pauseOn: true, pauseStart: "2026-11-10", pauseEnd: "2026-11-15" });
ok(/name="pauseOn" checked/.test(pageHtml("notify", store.get())) && /value="2026-11-15"/.test(pageHtml("notify", store.get())), "kaydedilen duraklatma sayfada görünür");
store.setSettings({ pauseOn: false, pauseStart: "", pauseEnd: "" });

// 3) LMS / Google Takvim bağlantısı yok; hesap isteğe bağlı: sunucu hazır değilken kök sayfada hesap önerisi yok
const all = Object.keys(PAGES).filter((p) => p !== "account").map((p) => pageHtml(p, st)).join(" ");
ok(!/LMS|Google Takvim|Moodle|Canvas/i.test(all), "LMS/takvim bağlantısı yok");
ok(!/giriş yap|kayıt ol|sign in|log in/i.test(pageHtml("root", st)) && /hesapsız çalışır/.test(pageHtml("root", st)), "sunucu hazır değilken hesap önerisi görünmez");
ok(/name="email"/.test(pageHtml("account", st)) && /name="password"/.test(pageHtml("account", st)), "hesap sayfası: giriş formu");

// 4) İngilizce: her sayfa çiziliyor, Türkçe başlık kalmıyor
setLang("en");
for (const p of Object.keys(PAGES)) {
  const h = pageHtml(p, st);
  ok(h.includes(`<h2>${PAGES[p].title()}</h2>`) && !/Profili düzenle|Tercihler|Veri ve gizlilik|Hakkında/.test(h.replace(/<option[^>]*>[^<]*<\/option>/g, "")), `EN ${p} sayfası`);
}
ok(pageHtml("root", st).includes("Edit profile") && pageHtml("prefs", st).includes("On campus"), "EN metinler");
setLang("tr");

// 5) Profil verisi
store.setProfile({ name: "  ", university: "  Örnek Üniversitesi ", year: "3" });
ok(store.get().profile.name === "Elif Yılmaz", "boş ad mevcut adı silmez");
ok(store.get().profile.university === "Örnek Üniversitesi" && store.get().profile.year === "3", "üniversite ve sınıf kaydedilir");
ok(pageHtml("root", store.get()).includes("Örnek Üniversitesi · 3. sınıf"), "kökte üniversite · sınıf");
store.setProfile({ year: "99" });
ok(store.get().profile.year === "", "geçersiz sınıf boş");
ok(normalize({ profile: { name: "A", university: "x".repeat(300), year: "dr" } }).profile.university.length === 80, "üniversite 80 karakterle sınırlı");
ok(normalize({}).profile.university === "" && normalize({}).profile.year === "", "eski yedekte alanlar boş");
ok(JSON.parse(mem["kpr:data:v1"]).profile.university === "Örnek Üniversitesi", "cihaza kaydedildi");
ok(initials("ali") === "A" && initials("Çağla nur Öz") === "ÇÖ" && initials("") === "", "baş harfler");

// 6) Ara
const r1 = searchAll(store.get(), "kalkulus");
ok(r1.courses.length === 1 && r1.exams.length === 1 && r1.tasks.length === 1, `ders adıyla: ders + sınav + görev (${JSON.stringify(Object.fromEntries(Object.entries(r1).map(([k, v]) => [k, v.length])))})`);
ok(searchAll(store.get(), "ARA SINAV").exams[0]?.id === "e1", "büyük harf / Türkçe harf duyarsız");
ok(searchAll(store.get(), "odev").tasks[0]?.id === "t1", "\"odev\" → \"Ödev 1\"");
ok(searchAll(store.get(), "mat 1001 ödev").tasks.length === 1 && searchAll(store.get(), "mat 1001 ödev").exams.length === 0, "çok kelime: hepsi geçmeli");
ok(searchAll(store.get(), "deneme").courses.length === 1, "hoca adıyla ders");
ok(Object.values(searchAll(store.get(), "a")).every((x) => !x.length), "tek harf aramaz");

console.log(`\nprofil ve ayarlar\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
