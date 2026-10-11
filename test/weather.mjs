// Kampüste: hava durumu (weather.js). Konum izni yok; yalnız şehir koordinatı gider; önbellek; gizlenme kuralları.
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const { CITIES, sameKeys, weatherUrl, refreshWeather, readWeather, campusSection, weatherVisible, conditionText } = await import("../weather.js");
const { store, normalize } = await import("../store.js");
const { readFileSync } = await import("node:fs");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const calls = [];
const fakeFetch = (temp = 18.4, code = 2) => async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ current: { temperature_2m: temp, weather_code: code } }) }; };
const S = (o) => ({ ...store.get().settings, ...o });

// Varsayılanlar
ok(store.get().settings.weatherOn === true && store.get().settings.weatherCity === "istanbul", "varsayılan: açık, İstanbul");
ok(sameKeys(), "weather.js şehirleri store.js CITY_KEYS ile aynı");
ok(normalize({ settings: { weatherCity: "atlantis" } }).settings.weatherCity === "istanbul", "bilinmeyen şehir → varsayılan");
ok(normalize({ settings: { weatherCity: "" } }).settings.weatherCity === "", "şehir seçilmedi (boş) korunur");

// Gönderilen veri: yalnız koordinat + istenen alanlar
const u = new URL(weatherUrl("ankara"));
ok(u.origin === "https://api.open-meteo.com" && [...u.searchParams.keys()].sort().join() === "current,latitude,longitude,timezone", `istek yalnız koordinat ve alanlar: ${u.search}`);
ok(u.searchParams.get("latitude") === String(CITIES.ankara[1]), "şehrin sabit koordinatı");

// İlk yükleme → istek, önbellek
const now = Date.UTC(2026, 9, 11, 9, 0);
const d1 = await refreshWeather({ settings: S({}), now, fetchImpl: fakeFetch(), online: true });
ok(d1 && d1.temp === 18.4 && calls.length === 1, `ilk istek ve veri: ${JSON.stringify(d1)}`);
ok(calls[0].opts.credentials === "omit" && calls[0].opts.referrerPolicy === "no-referrer", "çerez ve yönlendiren adres gönderilmez");
ok(readWeather()?.city === "istanbul", "önbelleğe yazıldı");
// 30 dk içinde tekrar istek yok
ok((await refreshWeather({ settings: S({}), now: now + 10 * 60e3, fetchImpl: fakeFetch(), online: true })) === null && calls.length === 1, "taze önbellekte istek yok");
// Bayatlayınca yenilenir
await refreshWeather({ settings: S({}), now: now + 31 * 60e3, fetchImpl: fakeFetch(20, 0), online: true });
ok(calls.length === 2 && readWeather().temp === 20, "30 dk sonra yenilenir");
// Şehir değişince hemen yenilenir
await refreshWeather({ settings: S({ weatherCity: "izmir" }), now: now + 32 * 60e3, fetchImpl: fakeFetch(25, 1), online: true });
ok(calls.length === 3 && readWeather().city === "izmir", "şehir değişince yeni istek");

// Gizlenme: internet yok, şehir yok, ayar kapalı → istek yok, kart yok
const before = calls.length;
for (const [o, online, why] of [[{}, false, "internet yok"], [{ weatherCity: "" }, true, "şehir seçilmemiş"], [{ weatherOn: false }, true, "ayardan kapalı"]]) {
  ok((await refreshWeather({ settings: S(o), now: now + 99 * 60e3, fetchImpl: fakeFetch(), online })) === null, `${why}: yenileme yok`);
  ok(campusSection(S(o), readWeather(), online) === "", `${why}: kart gizli`);
  ok(!weatherVisible(S(o), online), `${why}: görünmez`);
}
ok(calls.length === before, "gizliyken hiç istek yapılmadı");

// Kart: sıcaklık °C, durum, son güncelleme; başka şehrin eski verisi gösterilmez
const html = campusSection(S({ weatherCity: "izmir" }), readWeather(), true);
ok(/Kampüste/.test(html) && /25°C/.test(html) && /Parçalı bulutlu/.test(html) && /son güncelleme \d\d:\d\d/.test(html) && /İzmir/.test(html), `kart içeriği: ${html.replace(/\s+/g, " ").slice(0, 200)}`);
ok(campusSection(S({ weatherCity: "ankara" }), readWeather(), true) === "", "başka şehrin verisi gösterilmez");
ok(conditionText(0) === "Açık" && conditionText(63) === "Yağmurlu" && conditionText(95) === "Gök gürültülü", "durum metinleri");

// Hata/çöp yanıt: çökmez, önbellek bozulmaz
const keep = JSON.stringify(readWeather());
await refreshWeather({ settings: S({ weatherCity: "izmir" }), now: now + 300 * 60e3, fetchImpl: async () => { throw new Error("ağ"); }, online: true });
await refreshWeather({ settings: S({ weatherCity: "izmir" }), now: now + 301 * 60e3, fetchImpl: async () => ({ ok: true, json: async () => ({}) }), online: true });
ok(JSON.stringify(readWeather()) === keep, "ağ hatası ve bozuk yanıt önbelleği bozmaz");

// Konum API'si hiç kullanılmıyor
const src = readFileSync(new URL("../weather.js", import.meta.url), "utf8") + readFileSync(new URL("../today.js", import.meta.url), "utf8");
ok(!/geolocation/.test(src), "konum izni istenmez (navigator.geolocation yok)");

console.log(`\nkampüste (hava durumu)\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
