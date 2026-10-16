/**
 * KPR — Profil ve ayarlar (sağ üstteki Profil düğmesi → aşağıdan açılan tam ekran sayfa).
 *
 *   Profil: baş harflerle avatar (fotoğraf yok), ad, üniversite, sınıf · "Profili düzenle" (ad, üniversite,
 *           sınıf, öğrenci numarası — mail imzasında kullanılır)
 *   Ayarlar: her satır ayrı alt sayfa
 *     Tercihler        — görünüm (tema), dil, dönem kaç hafta, Kampüste (hava durumu aç/kapa + şehir)
 *     Bildirimler      — bildirim izni, hatırlatma türleri, sessiz saatler (Kaydet), deneme, takvime aktar
 *     Veri ve gizlilik — yedek indir / yedekten yükle, her şeyi sil, Gizlilik ve KVKK
 *     Hakkında         — sürüm, internetsiz çalışma, telefona kur (mağaza uygulamasında yok), tanıtım sayfası
 * Hesap, LMS, takvim bağlantısı yok: Köprü hesapsız, veriler cihazda.
 * Eski "#/ayarlar" adresi (bildirimler, yer imleri) bu sayfayı açar (app.js).
 */
import { store, YEARS } from "./store.js";
import { runMigrations } from "./migrate.js";
import { esc, openSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { infoNote, dateField } from "./components.js";
import { todayISO } from "./dates.js";
import { installMode, isStandalone, isNativeApp, promptInstall } from "./install.js";
import { permissionState, enableNotifications, disableNotifications, testNotification, sync } from "./notify.js";
import { buildICS, deliverICS, countExportable } from "./ics.js";
import { THEMES, applyTheme } from "./theme.js";
import { LANGS, setLang, t, localize, locale } from "./i18n.js";
import { account, accountReady, onAccountChange, signIn, signOut, syncNow, deleteAccount } from "./sync.js";
import { CITIES } from "./weather.js";

export const APP_VERSION = "2.33.0";
const BRAND = "Köprü"; // i18n-ok — marka adı çevrilmez

// Sınıf etiketleri (store.js YEARS anahtarları)
const YEAR_LABEL = localize(
  { hz: "Hazırlık", 1: "1. sınıf", 2: "2. sınıf", 3: "3. sınıf", 4: "4. sınıf", 5: "5. sınıf", 6: "6. sınıf", yl: "Yüksek lisans", dr: "Doktora" }, // i18n-ok
  { hz: "Prep year", 1: "Year 1", 2: "Year 2", 3: "Year 3", 4: "Year 4", 5: "Year 5", 6: "Year 6", yl: "Master's", dr: "PhD" }
);

/** "Elif Yılmaz" → "EY"; ad yoksa boş (avatar yerine kişi simgesi). */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

/* ------------------------------------------------------------------ */
/* Satırlar (eski Ayarlar ekranından)                                 */
/* ------------------------------------------------------------------ */

function themeSeg(current) {
  const items = Object.entries(THEMES).map(([k, label]) =>
    `<button type="button" data-act="set-theme" data-theme="${k}" aria-pressed="${current === k}">${label}</button>`).join("");
  return `<div class="seg theme-seg" role="group" aria-label="${t("Görünüm")}">${items}</div>`;
}

// Dil adları kendi dilinde yazılır (Türkçe / English), çevrilmez
function langSeg(current) {
  const items = Object.entries(LANGS).map(([k, label]) =>
    `<button type="button" data-act="set-lang" data-lang="${k}" lang="${k}" aria-pressed="${current === k}">${label}</button>`).join("");
  return `<div class="seg lang-seg" role="group" aria-label="${t("Dil")} / Language">${items}</div>`;
}

let icsClasses = true;

function permissionRow(state) {
  const perm = permissionState();
  const on = perm === "granted" && state.settings.notify;
  if (perm === "unsupported") return `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("Bu tarayıcı bildirimleri desteklemiyor. Takvime aktarmayı kullan.")}</p></div></div>`;
  if (perm === "ios-install") return `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("iPhone'da bildirim için Köprü'yü önce ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra ana ekrandaki ikondan aç.")}</p></div></div>`;
  if (perm === "denied") return `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("İzin reddedilmiş. Tarayıcının site ayarlarından bildirim iznini aç, sonra buraya dön.")}</p></div><span class="status-warn">${t("Kapalı")}</span></div>`;
  return `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${on ? t("Açık. Aşağıdan neyin hatırlatılacağını seç.") : t("Sınav, teslim ve günün özeti için bildirim al.")}</p></div>
    ${on ? `<button class="btn btn-ghost" type="button" data-act="notify-off">${t("Kapat")}</button>` : `<button class="btn btn-primary" type="button" data-act="notify-on">${t("Aç")}</button>`}</div>`;
}

const switchRow = (name, title, hint, checked) => `<label class="group-row"><div><strong>${title}</strong>${hint ? `<p>${hint}</p>` : ""}</div>
  <input type="checkbox" class="switch" name="${name}" ${checked ? "checked" : ""} aria-label="${title}"></label>`;

function calendarRows(state) {
  const n = countExportable(state);
  return `<div class="group-row"><div><strong>${t("Takvime aktar")}</strong><p>${t("{n} sınav ve teslim, alarmlarıyla telefonunun takvimine. Uygulama kapalıyken de çalar.", { n })}</p></div>
      <button class="btn btn-ghost" type="button" data-act="export-ics" ${n || state.courses.length ? "" : "disabled"}>${icon.calendarPlus}${t("Aktar")}</button></div>
    <label class="group-row"><div><strong>${t("Ders saatlerini de ekle")}</strong><p>${t("Her ders haftalık tekrar eden etkinlik olur, 15 dk önce alarm.")}</p></div>
      <input type="checkbox" class="switch" data-ch="ics-classes" ${icsClasses ? "checked" : ""} aria-label="${t("Ders saatlerini de ekle")}"></label>`;
}

function installRow() {
  if (isNativeApp()) return "";
  if (isStandalone()) return `<div class="group-row"><div><strong>${t("Uygulama")}</strong><p>${t("Ana ekrandan açıldı.")}</p></div><span class="status-ok">${t("Kurulu ✓")}</span></div>`;
  const mode = installMode();
  if (mode === "prompt") return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Tam ekran ve internetsiz kullan.")}</p></div>
      <button class="btn btn-primary" type="button" data-act="install-now">${t("Kur")}</button></div>`;
  if (mode === "ios") return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Safari'de Paylaş → Ana Ekrana Ekle.")}</p></div></div>`;
  return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Tarayıcı menüsünden \"Uygulamayı yükle\" / \"Ana ekrana ekle\"yi seç.")}</p></div></div>`;
}

/* ------------------------------------------------------------------ */
/* Sayfalar                                                           */
/* ------------------------------------------------------------------ */

export const PAGES = {
  root: { title: () => t("Profil") },
  edit: { title: () => t("Profili düzenle") },
  prefs: { title: () => t("Tercihler") },
  notify: { title: () => t("Bildirimler") },
  data: { title: () => t("Veri ve gizlilik") },
  account: { title: () => (account() ? t("Hesap") : accMode === "register" ? t("Kayıt ol") : t("Giriş yap")) },
  about: { title: () => t("Hakkında") },
};

function rootPage(state) {
  const { profile } = state;
  const sub = [profile.university, YEAR_LABEL[profile.year]].filter(Boolean).join(" · ");
  const ini = initials(profile.name);
  const link = (page, title, hint) => `<button type="button" class="group-row pf-link" data-go="${page}"><div><strong>${title}</strong><p>${hint}</p></div>${icon.chevron}</button>`;
  return `<div class="pf-card">
      <span class="pf-avatar" aria-hidden="true">${ini ? esc(ini) : icon.user}</span>
      <div class="pf-who"><strong>${esc(profile.name)}</strong>${sub ? `<small>${esc(sub)}</small>` : `<small class="muted">${t("Üniversite ve sınıf eklenmedi")}</small>`}</div>
    </div>
    <button type="button" class="btn btn-ghost btn-block" data-go="edit">${t("Profili düzenle")}</button>
    <h3 class="mini-title pf-sec">${t("Ayarlar")}</h3>
    <div class="group pf-menu">
      ${link("prefs", t("Tercihler"), t("Görünüm, dil, dönem, Kampüste"))}
      ${link("notify", t("Bildirimler"), t("Hatırlatma türleri, sessiz saatler, takvime aktar"))}
      ${link("data", t("Veri ve gizlilik"), t("Yedek, verileri silme, Gizlilik ve KVKK"))}
      ${link("about", t("Hakkında"), t("Sürüm {v}", { v: APP_VERSION }))}
    </div>
    ${accountBlock()}`;
}

/* ------------------------------------------------------------------ */
/* Hesap (isteğe bağlı; sunucu hazır değilse hiç görünmez)              */
/* ------------------------------------------------------------------ */

let accReady = null; // null | "ready" | "off" | "none"
let accMode = "login"; // login | register
let accError = "";

const ACC_ERRORS = () => ({
  bad_email: t("Geçerli bir e-posta yaz."),
  weak_password: t("Şifre en az 8 karakter olmalı."),
  consent: t("Devam etmek için kutuyu işaretle."),
  exists: t("Bu e-postayla hesap var; giriş yap."),
  wrong: t("E-posta ya da şifre yanlış."),
  limit: t("Bugün çok deneme yapıldı. Yarın tekrar dene."),
  nonet: t("İnternet bağlantısı yok."),
  network: t("Sunucuya ulaşılamadı. İnternetini kontrol et."),
});
const accErrorText = (code) => ACC_ERRORS()[code] || t("Bir şeyler ters gitti. Tekrar dene.");

const fmtWhen = (ms) => new Date(ms).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function syncLine(a) {
  if (a.status === "syncing") return t("Eşitleniyor…");
  if (a.status === "nonet") return t("Şu an internetsiz; bağlanınca eşitlenir.");
  if (a.status === "error") return t("Eşitlenemedi; birazdan tekrar denenecek.");
  return a.at ? t("Son eşitleme: {t}", { t: fmtWhen(a.at) }) : t("Henüz eşitlenmedi.");
}

function accountBlock() {
  const a = account();
  if (a) {
    return `<h3 class="mini-title pf-sec">${t("Hesap")}</h3>
      <div class="group"><button type="button" class="group-row pf-link" data-go="account"><div><strong>${esc(a.email)}</strong><p>${syncLine(a)}</p></div>${icon.chevron}</button></div>
      <p class="fine pf-note">${t("Verilerin hesabınla eşitleniyor; telefonda ve bilgisayarda aynı.")}</p>`;
  }
  if (accReady !== "ready") return `<p class="fine pf-note">${t("Köprü hesapsız çalışır; profil ve tüm verilerin yalnız bu cihazda.")}</p>`;
  return `<h3 class="mini-title pf-sec">${t("Hesap")}</h3>
    <div class="group"><div class="group-row"><div><strong>${t("Telefonda ve bilgisayarda aynı veriler")}</strong><p>${t("İsteğe bağlı. Hesap açmazsan her şey bu cihazda kalır.")}</p></div></div>
      <div class="group-row acc-actions"><button type="button" class="btn btn-ghost" data-act="acc-open" data-mode="login">${t("Giriş yap")}</button>
        <button type="button" class="btn btn-primary" data-act="acc-open" data-mode="register">${t("Kayıt ol")}</button></div></div>`;
}

function accountPage() {
  const a = account();
  if (a) {
    return `<div class="group">
        <div class="group-row"><div><strong>${esc(a.email)}</strong><p>${syncLine(a)}</p></div>
          <button class="btn btn-ghost" type="button" data-act="acc-sync" ${a.status === "syncing" ? "disabled" : ""}>${t("Şimdi eşitle")}</button></div>
        <div class="group-row"><div><strong>${t("Çıkış yap")}</strong><p>${t("Verilerin bu cihazda kalır; eşitleme durur.")}</p></div>
          <button class="btn btn-ghost" type="button" data-act="acc-logout">${t("Çıkış")}</button></div>
      </div>
      <section><h3 class="mini-title">${t("Hesabı sil")}</h3>
        <p class="fine">${t("Hesabın ve buluttaki verilerin kalıcı olarak silinir. Bu cihazdaki veriler kalır.")}</p>
        <label class="field"><span>${t("Şifren")}</span><input name="delpw" type="password" autocomplete="current-password" maxlength="200"></label>
        <p class="warn-text fine" role="alert" data-acc-error ${accError ? "" : "hidden"}>${esc(accError)}</p>
        <button class="btn btn-danger btn-block" type="button" data-act="acc-delete">${t("Hesabı sil")}</button>
      </section>`;
  }
  const reg = accMode === "register";
  return `<div class="seg" role="group" aria-label="${t("Hesap")}">
      <button type="button" data-act="acc-mode" data-mode="login" aria-pressed="${!reg}">${t("Giriş yap")}</button>
      <button type="button" data-act="acc-mode" data-mode="register" aria-pressed="${reg}">${t("Kayıt ol")}</button></div>
    <label class="field"><span>${t("E-posta")}</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required></label>
    <label class="field"><span>${t("Şifre")}${reg ? ` <span class="hint">${t("(en az 8 karakter)")}</span>` : ""}</span>
      <input name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" maxlength="200" required></label>
    ${reg ? `<label class="consent"><input type="checkbox" name="consent"><span>${t("Derslerim, görevlerim, notlarım, devamsızlığım ve profilim telefonda ve bilgisayarda aynı olsun diye Köprü sunucusunda (Cloudflare, yurt dışı) saklansın.")} <a href="gizlilik.html" target="_blank" rel="noopener">${t("Gizlilik")}</a></span></label>` : ""}
    <p class="warn-text fine" role="alert" data-acc-error ${accError ? "" : "hidden"}>${esc(accError)}</p>
    <div class="gap-t">${infoNote(t("Hesap ne işe yarar?"), t("Aynı e-posta ve şifreyle telefonda ve bilgisayarda giriş yaparsın; derslerin, görevlerin ve notların her yerde aynı olur, Asistan da bu bilgilerden cevaplar. Giriş yapınca bu cihazdaki veriler hesabındakilerle birleşir, hiçbiri silinmez. Şifreni unutursan şimdilik sıfırlanamıyor; ara ara yedek al."))}</div>`;
}

async function submitAccount(form, { redraw, go }) {
  const btn = form.querySelector(".sheet-foot button");
  if (btn?.disabled) return;
  const f = form.elements;
  const email = f.email.value.trim();
  const password = f.password.value;
  const consent = accMode === "register" ? f.consent.checked : undefined;
  if (!email || !f.email.checkValidity()) return showAccError("bad_email", redraw);
  if (password.length < 8) return showAccError(accMode === "register" ? "weak_password" : "wrong", redraw);
  if (accMode === "register" && !consent) return showAccError("consent", redraw);
  if (btn) {
    btn.disabled = true;
    btn.textContent = t("Bekle…");
  }
  const code = await signIn(accMode, { email, password, consent });
  if (code) {
    if (btn) btn.disabled = false;
    if (btn) btn.textContent = accMode === "register" ? t("Kayıt ol") : t("Giriş yap");
    return showAccError(code, redraw);
  }
  accError = "";
  toast(accMode === "register" ? t("Hesabın açıldı; verilerin eşitlendi") : t("Giriş yapıldı; verilerin eşitlendi"));
  go("root");
}

/** Hata metni yerinde güncellenir (yeniden çizim yazılanları silmesin). */
function showAccError(code, redraw) {
  accError = accErrorText(code);
  const el = document.querySelector(".pf [data-acc-error]");
  if (!el) return redraw();
  el.textContent = accError;
  el.hidden = false;
}

function editPage(state) {
  const { profile, settings } = state;
  const years = Object.keys(YEARS).map((k) => `<option value="${k}" ${profile.year === k ? "selected" : ""}>${esc(YEAR_LABEL[k])}</option>`).join("");
  return `<label class="field"><span>${t("Adın")}</span><input name="name" value="${esc(profile.name)}" maxlength="40" required autocomplete="given-name"></label>
    <label class="field"><span>${t("Üniversite")} <span class="hint">${t("(isteğe bağlı)")}</span></span><input name="university" value="${esc(profile.university)}" maxlength="80" autocomplete="organization"></label>
    <label class="field"><span>${t("Sınıf")} <span class="hint">${t("(isteğe bağlı)")}</span></span><select name="year"><option value="">—</option>${years}</select></label>
    <label class="field"><span>${t("Öğrenci numaran")} <span class="hint">${t("(isteğe bağlı, imzaya eklenir)")}</span></span><input name="no" value="${esc(settings.studentNo)}" maxlength="20" inputmode="numeric" autocomplete="off"></label>`;
}

function prefsPage(state) {
  const s = state.settings;
  const cities = Object.entries(CITIES).map(([k, [name]]) => `<option value="${k}" ${s.weatherCity === k ? "selected" : ""}>${esc(name)}</option>`).join("");
  return `<section><h3 class="mini-title">${t("Görünüm")}</h3>${themeSeg(s.theme)}<p class="fine">${t("Otomatik: telefonun açık/koyu ayarını izler.")}</p></section>
    <section><h3 class="mini-title">${t("Dil")}${t("Dil") === "Language" ? "" : " · Language"}</h3>${langSeg(s.lang)}</section>
    <section><h3 class="mini-title">${t("Dönem")}</h3><div class="group">
      <label class="group-row"><div><strong>${t("Dönem kaç hafta?")}</strong><p>${t("Devamsızlık hakkı ve takvimdeki ders tekrarları buna göre hesaplanır.")}</p></div>
        <input type="number" class="num-in" min="1" max="30" step="1" inputmode="numeric" value="${s.termWeeks}" data-ch="term-weeks" aria-label="${t("Dönem hafta sayısı")}"></label>
    </div></section>
    <section><h3 class="mini-title">${t("Kampüste")}</h3><div class="group">
      <label class="group-row"><div><strong>${t("Hava durumu")}</strong><p>${t("Bugün ekranında, seçtiğin şehir için.")}</p></div>
        <input type="checkbox" class="switch" data-ch="weather-on" ${s.weatherOn ? "checked" : ""} aria-label="${t("Hava durumu")}"></label>
      <label class="group-row"><div><strong>${t("Şehir")}</strong></div>
        <select data-ch="weather-city" aria-label="${t("Şehir")}" ${s.weatherOn ? "" : "disabled"}><option value="" ${s.weatherCity ? "" : "selected"}>${t("Seçilmedi")}</option>${cities}</select></label>
    </div>
    <div class="gap-t">${infoNote(t("Hangi veri gidiyor?"), t("Konum iznin istenmez. Hava durumu için yalnızca seçtiğin şehrin sabit koordinatı Open-Meteo'ya gönderilir; adın, derslerin ya da başka bir bilgi gitmez. Sonuç cihazında saklanır. İnternet yoksa kart görünmez."))}</div></section>`;
}

function notifyPage(state) {
  const s = state.settings;
  const on = permissionState() === "granted" && s.notify;
  return `<section><div class="group">${permissionRow(state)}</div></section>
    <section><h3 class="mini-title">${t("Neler hatırlatılsın?")}</h3><div class="group">
      ${switchRow("notifyExams", t("Sınavlar"), t("1 hafta, 1 gün ve 2 saat önce."), s.notifyExams)}
      ${switchRow("notifyDue", t("Teslimler"), t("3 gün, 1 gün ve 3 saat önce."), s.notifyDue)}
      ${switchRow("notifyDaily", t("Günün özeti"), t("Her sabah 08:00'de bugünün dersleri ve teslimleri."), s.notifyDaily)}
      ${switchRow("notifyWeekly", t("Haftaya bakış"), t("Pazar 20:00'de: haftanın sınavları, teslimleri ve dönem notunun yüzde kaçı belirleniyor."), s.notifyWeekly)}
      ${switchRow("notifyClasses", t("Dersten 15 dk önce"), t("Her ders için ayrı hatırlatma."), s.notifyClasses)}
    </div></section>
    <section><h3 class="mini-title">${t("Sessiz saatler")}</h3><div class="group">
      <label class="group-row"><div><strong>${t("Başlangıç")}</strong></div><input type="time" name="quietStart" value="${esc(s.quietStart)}" aria-label="${t("Sessiz saatler başlangıç")}"></label>
      <label class="group-row"><div><strong>${t("Bitiş")}</strong></div><input type="time" name="quietEnd" value="${esc(s.quietEnd)}" aria-label="${t("Sessiz saatler bitiş")}"></label>
    </div><p class="fine">${t("Bu saatlere düşen teslim hatırlatması, sessiz saatler başlamadan 3 saat önce gelir.")}</p></section>
    <section><h3 class="mini-title">${t("Tatil ve ara dönem")}</h3><div class="group">
      ${switchRow("pauseOn", t("Ders hatırlatmalarını duraklat"), t("Bu tarihlerde ders, günün özeti ve haftaya bakış gelmez. Sınav ve teslim hatırlatmaları gelir."), s.pauseOn)}
      <label class="group-row"><div><strong>${t("Başlangıç")}</strong></div>${dateField(s.pauseStart, 'name="pauseStart"', t("Tatil başlangıcı"))}</label>
      <label class="group-row"><div><strong>${t("Bitiş")}</strong></div>${dateField(s.pauseEnd, 'name="pauseEnd"', t("Tatil bitişi"))}</label>
    </div></section>
    ${on ? `<section><div class="group"><div class="group-row"><div><strong>${t("Deneme")}</strong><p>${t("Bildirimlerin nasıl göründüğüne bak.")}</p></div>
      <button class="btn btn-ghost" type="button" data-act="notify-test">${t("Gönder")}</button></div></div></section>` : ""}
    <section><h3 class="mini-title">${t("Takvim")}</h3><div class="group">${calendarRows(state)}</div>
      <div class="gap-t">${infoNote(t("Bildirimler nasıl çalışır?"), t("Uygulama kapalıyken zamanında bildirim için sunucu gerekiyor; o gelene kadar en güvenilir yol takvime aktarmak. Android'de uygulama kapalıyken de ara ara kontrol ediyoruz."))}</div></section>`;
}

function dataPage(state) {
  const { courses, tasks } = state;
  return `<div class="group">
      <div class="group-row"><div><strong>${t("Yedek al")}</strong><p>${t("{c} ders, {g} görev. Veriler sadece bu cihazda.", { c: courses.length, g: tasks.length })}</p></div>
        <button class="btn btn-ghost" type="button" data-act="export">${icon.download}${t("İndir")}</button></div>
      <div class="group-row"><div><strong>${t("Yedekten yükle")}</strong><p>${t("Mevcut verilerin yerini alır.")}</p></div>
        <label class="btn btn-ghost">${icon.upload}${t("Seç")}<input type="file" accept="application/json,.json" data-ch="import" class="visually-hidden"></label></div>
      <div class="group-row"><div><strong>${t("Her şeyi sil")}</strong><p>${t("Tüm ders ve görevler kalıcı olarak silinir.")}</p></div>
        <button class="btn btn-danger" type="button" data-act="reset">${t("Sil")}</button></div>
    </div>
    <div class="group"><a class="group-row pf-link" href="gizlilik.html" target="_blank" rel="noopener"><div><strong>${t("Gizlilik ve KVKK")}</strong><p>${t("Hangi verinin nerede tutulduğu")}</p></div>${icon.chevron}</a></div>`;
}

function aboutPage() {
  const sw = "serviceWorker" in navigator && navigator.serviceWorker.controller;
  return `<div class="group">
      <div class="group-row"><div><strong>${BRAND}</strong><p>${t("Sürüm {v}", { v: APP_VERSION })}</p></div></div>
      ${isNativeApp() ? "" : `<div class="group-row"><div><strong>${t("İnternetsiz çalışma")}</strong><p>${t("Bir kez açtıktan sonra internet olmadan da çalışır.")}</p></div>
        ${sw ? `<span class="status-ok">${t("Hazır ✓")}</span>` : `<span class="status-muted">${t("Hazırlanıyor…")}</span>`}</div>`}
      ${installRow()}
    </div>
    <div class="group"><a class="group-row pf-link" href="./" target="_blank" rel="noopener"><div><strong>${t("Tanıtım sayfası")}</strong><p>${t("Köprü hakkında")}</p></div>${icon.chevron}</a></div>`;
}

const BODY = { root: rootPage, edit: editPage, prefs: prefsPage, notify: notifyPage, data: dataPage, about: aboutPage, account: accountPage };
// Kaydet düğmesi olan sayfalar (form)
const SAVE = { edit: "save-profile", notify: "save-notify" };

/** Bir sayfanın HTML'i (test/profile.mjs her sayfayı ayrı ayrı çizer). */
export function pageHtml(page, state = store.get()) {
  const p = PAGES[page] ? page : "root";
  const head = `<header class="sheet-head pf-head">
      ${p === "root" ? "" : `<button type="button" class="icon-btn sm" data-go="root" aria-label="${t("Geri")}">${icon.back}</button>`}
      <h2>${PAGES[p].title()}</h2>
      <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button>
    </header>`;
  const accForm = p === "account" && !account();
  const label = accForm ? (accMode === "register" ? t("Kayıt ol") : t("Giriş yap")) : t("Kaydet");
  const foot = SAVE[p] || accForm ? `<footer class="sheet-foot"><button type="submit" class="btn btn-primary">${label}</button></footer>` : "";
  return `<form class="sheet-form pf" data-page="${p}" novalidate>${head}<div class="sheet-body pf-body">${BODY[p](state)}</div>${foot}</form>`;
}

/* ------------------------------------------------------------------ */
/* Açma ve olaylar                                                    */
/* ------------------------------------------------------------------ */

let resetArmed = false;

export function openProfile(page = "root") {
  let current = page;
  const d = openSheet(pageHtml(current), (dlg) => {
    dlg.classList.add("full");
    dlg.addEventListener("close", () => dlg.classList.remove("full"), { once: true });
  });
  const go = (p) => {
    current = PAGES[p] ? p : "root";
    resetArmed = false;
    accError = "";
    d.innerHTML = pageHtml(current);
    d.querySelector(".pf-body").scrollTop = 0;
  };
  const redraw = () => {
    const y = d.querySelector(".pf-body")?.scrollTop || 0;
    d.innerHTML = pageHtml(current);
    d.querySelector(".pf-body").scrollTop = y;
  };

  // Hesap: sunucu hazır mı (bir kez sorulur) ve eşitleme durumu değişince güncelle
  if (accReady === null) {
    accountReady().then((st) => {
      accReady = st;
      if (d.open && (current === "root" || current === "account")) redraw();
    });
  }
  const off = onAccountChange(() => {
    if (d.open && (current === "root" || current === "account") && !d.querySelector(".pf input:focus")) redraw();
  });
  d.addEventListener("close", off, { once: true });

  d.onclick = async (e) => {
    if (e.target === d || e.target.closest("[data-close]")) return d.close();
    const goEl = e.target.closest("[data-go]");
    if (goEl) return go(goEl.dataset.go);
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    await ACT[el.dataset.act]?.(el, { redraw, go, close: () => d.close() });
  };
  d.onchange = (e) => {
    const el = e.target.closest("[data-ch]");
    if (el) CHANGE[el.dataset.ch]?.(el, { redraw });
  };
  d.onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.page === "edit") saveProfile(form, go);
    else if (form.dataset.page === "notify") saveNotify(form, go);
    else if (form.dataset.page === "account") submitAccount(form, { redraw, go });
  };
  return d;
}

function saveProfile(form, go) {
  const name = form.elements.name.value.trim();
  if (!name) {
    form.elements.name.focus();
    return toast(t("Adını yaz"));
  }
  store.setProfile({ name, university: form.elements.university.value, year: form.elements.year.value });
  store.setSettings({ studentNo: form.elements.no.value });
  toast(t("Kaydedildi"));
  go("root");
}

function saveNotify(form, go) {
  const f = form.elements;
  const pauseStart = f.pauseStart.value, pauseEnd = f.pauseEnd.value;
  // Duraklatma açıkken iki tarih de gerekli; bitiş başlangıçtan önce olamaz (store.js normalize da kapatır)
  if (f.pauseOn.checked && (!pauseStart || !pauseEnd)) return toast(t("Tatil için başlangıç ve bitiş tarihini seç"));
  if (f.pauseOn.checked && pauseEnd < pauseStart) return toast(t("Bitiş tarihi başlangıçtan önce olamaz"));
  store.setSettings({
    notifyExams: f.notifyExams.checked,
    notifyDue: f.notifyDue.checked,
    notifyDaily: f.notifyDaily.checked,
    notifyWeekly: f.notifyWeekly.checked,
    notifyClasses: f.notifyClasses.checked,
    pauseOn: f.pauseOn.checked,
    pauseStart,
    pauseEnd,
    quietStart: f.quietStart.value || "23:00",
    quietEnd: f.quietEnd.value || "08:00",
  });
  sync(); // arka plan hatırlatma listesi yeni ayarlarla
  toast(t("Kaydedildi"));
  go("root");
}

const ACT = {
  "acc-open"(el, { go }) {
    accMode = el.dataset.mode === "register" ? "register" : "login";
    go("account");
    requestAnimationFrame(() => document.querySelector('.pf input[name="email"]')?.focus());
  },
  "acc-mode"(el, { redraw }) {
    const email = document.querySelector('.pf input[name="email"]')?.value || "";
    accMode = el.dataset.mode === "register" ? "register" : "login";
    accError = "";
    redraw();
    const input = document.querySelector('.pf input[name="email"]');
    if (input) input.value = email;
  },
  "acc-sync"() {
    syncNow();
  },
  async "acc-logout"(_el, { go }) {
    await signOut();
    toast(t("Çıkış yapıldı; verilerin bu cihazda"));
    go("root");
  },
  async "acc-delete"(el, { redraw, go }) {
    const pw = document.querySelector('.pf input[name="delpw"]')?.value || "";
    if (!pw) return showAccError("wrong", redraw);
    el.disabled = true;
    const code = await deleteAccount(pw);
    if (code) return showAccError(code, redraw);
    toast(t("Hesabın silindi"));
    go("root");
  },
  "set-theme"(el, { redraw }) {
    const theme = el.dataset.theme;
    if (!Object.hasOwn(THEMES, theme)) return;
    applyTheme(theme);
    store.setSettings({ theme });
    redraw();
  },
  "set-lang"(el, { redraw }) {
    const lang = el.dataset.lang;
    if (!Object.hasOwn(LANGS, lang)) return;
    setLang(lang);
    store.setSettings({ lang });
    redraw();
  },
  async "install-now"(_el, { redraw }) {
    await promptInstall();
    redraw();
  },
  async "notify-on"(_el, { redraw }) {
    const ok = await enableNotifications();
    toast(ok ? t("Bildirimler açıldı") : t("Bildirim izni verilmedi"));
    redraw();
  },
  "notify-off"(_el, { redraw }) {
    disableNotifications();
    toast(t("Bildirimler kapatıldı"));
    redraw();
  },
  async "notify-test"() {
    await testNotification();
  },
  async "export-ics"() {
    const result = await deliverICS(buildICS(store.get(), { classes: icsClasses }));
    if (result === "downloaded") toast(t("Takvim dosyası indirildi. Açınca takvimine eklenir."));
  },
  export() {
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kpr-yedek-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t("Yedek indirildi"));
  },
  reset(el, { close }) {
    if (!resetArmed) {
      resetArmed = true;
      el.classList.add("armed");
      el.textContent = t("Emin misin?");
      setTimeout(() => {
        resetArmed = false;
        el.classList.remove("armed");
        el.textContent = t("Sil");
      }, 3000);
      return;
    }
    resetArmed = false;
    store.reset();
    close();
    location.hash = "";
    toast(t("Tüm veriler silindi"));
  },
};

const CHANGE = {
  "ics-classes"(el) {
    icsClasses = el.checked;
  },
  "term-weeks"(el) {
    const n = Math.round(Number(el.value));
    if (n >= 1 && n <= 30) {
      store.setSettings({ termWeeks: n });
      toast(t("Kaydedildi"));
    } else {
      el.value = store.get().settings.termWeeks;
    }
  },
  "weather-on"(el, { redraw }) {
    store.setSettings({ weatherOn: el.checked });
    redraw();
  },
  "weather-city"(el) {
    store.setSettings({ weatherCity: el.value });
    toast(t("Kaydedildi"));
  },
  async import(el, { redraw }) {
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.courses) || !Array.isArray(data?.tasks)) throw new Error("biçim"); // i18n-ok
      const keepName = store.get().profile.name;
      store.replace(data);
      runMigrations(); // eski sürümün yedeği de yeni biçime geçsin
      if (!store.get().profile.name) store.setName(keepName);
      applyTheme(store.get().settings.theme);
      setLang(store.get().settings.lang);
      toast(t("Yedek yüklendi"));
      redraw();
    } catch {
      toast(t("Bu dosya geçerli bir Köprü yedeği değil"));
    }
  },
};
