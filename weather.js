/**
 * KPR — Kampüste: hava durumu kartı (Bugün ekranı).
 *
 * Gizlilik: konum izni İSTENMEZ. Şehir Profil → Tercihler'den seçilir (varsayılan İstanbul); Open-Meteo'ya
 * (anahtarsız, ücretsiz) yalnızca o şehrin sabit koordinatı gider — çerez, yönlendiren adres (referrer) ve
 * öğrenci verisi gönderilmez. Sonuç cihazda önbellekte (kpr:weather), 30 dakika taze sayılır.
 * İnternet yoksa, şehir seçilmemişse ya da ayardan kapatıldıysa kart hiç görünmez ve istek yapılmaz.
 */
import { store, CITY_KEYS } from "./store.js";
import { t, locale } from "./i18n.js";
import { esc } from "./ui.js";

// Şehir adları özel ad, çevrilmez. Koordinatlar şehir merkezi (store.js CITY_KEYS ile aynı anahtarlar).
export const CITIES = {
  istanbul: ["İstanbul", 41.01, 28.98], ankara: ["Ankara", 39.93, 32.86], izmir: ["İzmir", 38.42, 27.14], // i18n-ok
  bursa: ["Bursa", 40.19, 29.06], antalya: ["Antalya", 36.9, 30.71], eskisehir: ["Eskişehir", 39.78, 30.52], // i18n-ok
  kocaeli: ["Kocaeli", 40.77, 29.92], sakarya: ["Sakarya", 40.69, 30.44], konya: ["Konya", 37.87, 32.48], // i18n-ok
  kayseri: ["Kayseri", 38.73, 35.48], adana: ["Adana", 37.0, 35.32], mersin: ["Mersin", 36.81, 34.64], // i18n-ok
  gaziantep: ["Gaziantep", 37.07, 37.38], samsun: ["Samsun", 41.29, 36.33], trabzon: ["Trabzon", 41.0, 39.72], // i18n-ok
  erzurum: ["Erzurum", 39.9, 41.27], diyarbakir: ["Diyarbakır", 37.91, 40.24], malatya: ["Malatya", 38.35, 38.31], // i18n-ok
  denizli: ["Denizli", 37.78, 29.09], edirne: ["Edirne", 41.68, 26.56], canakkale: ["Çanakkale", 40.15, 26.41], // i18n-ok
  isparta: ["Isparta", 37.76, 30.55], van: ["Van", 38.5, 43.38], sivas: ["Sivas", 39.75, 37.02], // i18n-ok
};
// Store'daki anahtar listesiyle aynı olmalı (test/weather.mjs denetler)
export const sameKeys = () => Object.keys(CITIES).sort().join() === Object.keys(CITY_KEYS).sort().join();

const KEY = "kpr:weather";
const FRESH_MS = 30 * 60 * 1000;
let inflight = false;

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Gönderilen tek şey: şehrin koordinatı ve istenen iki alan. */
export function weatherUrl(city) {
  const [, lat, lon] = CITIES[city];
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
}

export function readWeather() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

/** Kart (ve istek) ancak: ayar açık, şehir seçili, internet var. */
export const weatherVisible = (settings, online = isOnline()) =>
  settings?.weatherOn !== false && !!settings?.weatherCity && Object.hasOwn(CITIES, settings.weatherCity) && online;

/**
 * Önbellek bayatsa ya da şehir değiştiyse yeniler. Yeni veri geldiyse onu döndürür (ekran yeniden çizilsin),
 * yoksa null. Asla fırlatmaz.
 */
export async function refreshWeather({ settings = store.get().settings, now = Date.now(), fetchImpl = globalThis.fetch, online = isOnline() } = {}) {
  if (!weatherVisible(settings, online) || inflight || !fetchImpl) return null;
  const city = settings.weatherCity;
  const c = readWeather();
  if (c && c.city === city && now - c.at < FRESH_MS) return null;
  inflight = true;
  try {
    const res = await fetchImpl(weatherUrl(city), { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const cur = (await res.json())?.current;
    if (typeof cur?.temperature_2m !== "number") return null;
    const data = { city, at: now, temp: cur.temperature_2m, code: Number(cur.weather_code) };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch {
    return null;
  } finally {
    inflight = false;
  }
}

/** WMO hava kodu → kısa durum. */
export function conditionText(code) {
  if (code === 0) return t("Açık");
  if (code === 1 || code === 2) return t("Parçalı bulutlu");
  if (code === 3) return t("Bulutlu");
  if (code === 45 || code === 48) return t("Sisli");
  if (code >= 51 && code <= 57) return t("Çiseleme");
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return t("Yağmurlu");
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return t("Karlı");
  if (code >= 95) return t("Gök gürültülü");
  return t("Değişken");
}

/** "Kampüste" bölümü; görünmemesi gerekiyorsa boş metin. */
export function campusSection(settings, data = readWeather(), online = isOnline()) {
  if (!weatherVisible(settings, online) || !data || data.city !== settings.weatherCity) return "";
  const time = new Date(data.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  return `<section class="section campus">
    <div class="section-head"><h2>${t("Kampüste")}</h2></div>
    <div class="card-box weather-card">
      <b class="weather-temp">${Math.round(data.temp)}°C</b>
      <span class="weather-info"><strong>${esc(conditionText(data.code))}</strong><small>${esc(CITIES[data.city][0])} · ${t("son güncelleme {saat}", { saat: time })}</small></span>
    </div>
  </section>`;
}
