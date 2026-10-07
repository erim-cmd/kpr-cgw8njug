import { store } from "./store.js";
import { runMigrations } from "./migrate.js";
import { esc, toast } from "./ui.js";
import { icon } from "./icons.js";
import { infoNote } from "./components.js";
import { todayISO } from "./dates.js";
import { installMode, isStandalone, isNativeApp, promptInstall } from "./install.js";
import { permissionState, enableNotifications, disableNotifications, testNotification } from "./notify.js";
import { buildICS, deliverICS, countExportable } from "./ics.js";
import { THEMES, applyTheme } from "./theme.js";
import { LANGS, setLang, t } from "./i18n.js";

export const APP_VERSION = "2.21.1";

function themeSeg(current) {
  const items = Object.entries(THEMES).map(([k, label]) =>
    `<button type="button" data-action="set-theme" data-theme="${k}" aria-pressed="${current === k}">${label}</button>`).join("");
  return `<div class="seg theme-seg" role="group" aria-label="${t("Görünüm")}">${items}</div>`;
}

// Dil adları kendi dilinde yazılır (Türkçe / English), çevrilmez
function langSeg(current) {
  const items = Object.entries(LANGS).map(([k, label]) =>
    `<button type="button" data-action="set-lang" data-lang="${k}" lang="${k}" aria-pressed="${current === k}">${label}</button>`).join("");
  return `<div class="seg lang-seg" role="group" aria-label="${t("Dil")} / Language">${items}</div>`;
}

let icsClasses = true;

function notifyRows(state) {
  const perm = permissionState();
  const on = perm === "granted" && state.settings.notify;
  let main;
  if (perm === "unsupported") {
    main = `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("Bu tarayıcı bildirimleri desteklemiyor. Takvime aktarmayı kullan.")}</p></div></div>`;
  } else if (perm === "ios-install") {
    main = `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("iPhone'da bildirim için Köprü'yü önce ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra ana ekrandaki ikondan aç.")}</p></div></div>`;
  } else if (perm === "denied") {
    main = `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("İzin reddedilmiş. Tarayıcının site ayarlarından bildirim iznini aç, sonra buraya dön.")}</p></div><span class="status-warn">${t("Kapalı")}</span></div>`;
  } else {
    main = `<div class="group-row"><div><strong>${t("Bildirimler")}</strong><p>${t("Sınavdan 1 hafta ve 1 gün önce, teslimden 3 gün, 1 gün ve 3 saat önce, her sabah günün özeti.")}</p></div>
      ${on ? `<button class="btn btn-ghost" type="button" data-action="notify-off">${t("Kapat")}</button>` : `<button class="btn btn-primary" type="button" data-action="notify-on">${t("Aç")}</button>`}</div>`;
  }
  const extra = on
    ? `<label class="group-row"><div><strong>${t("Dersten 15 dk önce")}</strong><p>${t("Her ders için ayrı hatırlatma.")}</p></div>
        <input type="checkbox" class="switch" data-change="notify-classes" ${state.settings.notifyClasses ? "checked" : ""} aria-label="${t("Dersten önce hatırlat")}"></label>
      <div class="group-row"><div><strong>${t("Deneme")}</strong><p>${t("Bildirimlerin nasıl göründüğüne bak.")}</p></div>
        <button class="btn btn-ghost" type="button" data-action="notify-test">${t("Gönder")}</button></div>`
    : "";
  return main + extra;
}

function calendarRows(state) {
  const n = countExportable(state);
  return `<div class="group-row"><div><strong>${t("Takvime aktar")}</strong><p>${t("{n} sınav ve teslim, alarmlarıyla telefonunun takvimine. Uygulama kapalıyken de çalar.", { n })}</p></div>
      <button class="btn btn-ghost" type="button" data-action="export-ics" ${n || state.courses.length ? "" : "disabled"}>${icon.calendarPlus}${t("Aktar")}</button></div>
    <label class="group-row"><div><strong>${t("Ders saatlerini de ekle")}</strong><p>${t("Her ders haftalık tekrar eden etkinlik olur, 15 dk önce alarm.")}</p></div>
      <input type="checkbox" class="switch" data-change="ics-classes" ${icsClasses ? "checked" : ""} aria-label="${t("Ders saatlerini de ekle")}"></label>`;
}

function installRow() {
  if (isNativeApp()) return "";
  if (isStandalone()) {
    return `<div class="group-row"><div><strong>${t("Uygulama")}</strong><p>${t("Ana ekrandan açıldı.")}</p></div><span class="status-ok">${t("Kurulu ✓")}</span></div>`;
  }
  const mode = installMode();
  if (mode === "prompt") {
    return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Tam ekran ve internetsiz kullan.")}</p></div>
      <button class="btn btn-primary" type="button" data-action="install-now">${t("Kur")}</button></div>`;
  }
  if (mode === "ios") {
    return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Safari'de Paylaş → Ana Ekrana Ekle.")}</p></div></div>`;
  }
  return `<div class="group-row"><div><strong>${t("Telefonuna kur")}</strong><p>${t("Tarayıcı menüsünden \"Uygulamayı yükle\" / \"Ana ekrana ekle\"yi seç.")}</p></div></div>`;
}

export function view() {
  const { profile, courses, tasks } = store.get();
  return `
    <header class="page-head"><h1 class="page-title">${t("Ayarlar")}</h1></header>

    <section class="section">
      <div class="section-head"><h2>${t("Profil")}</h2></div>
      <div class="group">
        <label class="group-row"><div><strong>${t("Adın")}</strong></div>
          <input data-change="set-name" value="${esc(profile.name)}" maxlength="40" required aria-label="${t("Adın")}">
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Görünüm")}</h2></div>
      ${themeSeg(store.get().settings.theme)}
      <p class="fine">${t("Otomatik: telefonun açık/koyu ayarını izler.")}</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Dil")}${t("Dil") === "Language" ? "" : " · Language"}</h2></div>
      ${langSeg(store.get().settings.lang)}
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Hatırlatmalar")}</h2></div>
      <div class="group">${notifyRows(store.get())}</div>
      <div class="gap-t">${infoNote(t("Bildirimler nasıl çalışır?"), t("Uygulama kapalıyken zamanında bildirim için sunucu gerekiyor; o gelene kadar en güvenilir yol takvime aktarmak. Android'de uygulama kapalıyken de ara ara kontrol ediyoruz."))}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Takvim")}</h2></div>
      <div class="group">${calendarRows(store.get())}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>${t("Dönem")}</h2></div>
      <div class="group">
        <label class="group-row"><div><strong>${t("Dönem kaç hafta?")}</strong><p>${t("Devamsızlık hakkı ve takvimdeki ders tekrarları buna göre hesaplanır.")}</p></div>
          <input type="number" class="num-in" min="1" max="30" step="1" inputmode="numeric" value="${store.get().settings.termWeeks}" data-change="term-weeks" aria-label="${t("Dönem hafta sayısı")}"></label>
      </div>
    </section>

    ${isNativeApp() ? "" : `<section class="section">
      <div class="section-head"><h2>${t("Uygulama")}</h2></div>
      <div class="group">
        ${installRow()}
        <div class="group-row"><div><strong>${t("İnternetsiz çalışma")}</strong><p>${t("Bir kez açtıktan sonra internet olmadan da çalışır.")}</p></div>
          ${"serviceWorker" in navigator && navigator.serviceWorker.controller ? `<span class="status-ok" id="sw-status">${t("Hazır ✓")}</span>` : `<span class="status-muted" id="sw-status">${t("Hazırlanıyor…")}</span>`}</div>
      </div>
    </section>`}

    <section class="section">
      <div class="section-head"><h2>${t("Verilerin")}</h2></div>
      <div class="group">
        <div class="group-row"><div><strong>${t("Yedek al")}</strong><p>${t("{c} ders, {g} görev. Veriler sadece bu cihazda.", { c: courses.length, g: tasks.length })}</p></div>
          <button class="btn btn-ghost" type="button" data-action="export">${icon.download}${t("İndir")}</button></div>
        <div class="group-row"><div><strong>${t("Yedekten yükle")}</strong><p>${t("Mevcut verilerin yerini alır.")}</p></div>
          <label class="btn btn-ghost">${icon.upload}${t("Seç")}<input type="file" accept="application/json,.json" data-change="import" class="visually-hidden"></label></div>
        <div class="group-row"><div><strong>${t("Her şeyi sil")}</strong><p>${t("Tüm ders ve görevler kalıcı olarak silinir.")}</p></div>
          <button class="btn btn-danger" type="button" data-action="reset">${t("Sil")}</button></div>
      </div>
    </section>

    ${footnote()}`;
}

// "Köprü" adı çevrilmez
const footnote = () => `<p class="footnote">Köprü v${APP_VERSION} · <a href="./">${t("Köprü hakkında")}</a> · <a href="gizlilik.html">${t("Gizlilik ve KVKK")}</a></p>`; // i18n-ok

let resetArmed = false;

export const actions = {
  "set-theme"(el) {
    const theme = el.dataset.theme;
    if (!Object.hasOwn(THEMES, theme)) return;
    applyTheme(theme);
    store.setSettings({ theme });
  },

  "set-lang"(el) {
    const lang = el.dataset.lang;
    if (!Object.hasOwn(LANGS, lang)) return;
    setLang(lang);
    store.setSettings({ lang }); // ekran yeniden çizilir
  },

  async "install-now"(_el, { render }) {
    await promptInstall();
    render();
  },

  async "notify-on"(_el, { render }) {
    const ok = await enableNotifications();
    toast(ok ? t("Bildirimler açıldı") : t("Bildirim izni verilmedi"));
    render();
  },

  "notify-off"(_el, { render }) {
    disableNotifications();
    toast(t("Bildirimler kapatıldı"));
    render();
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

  reset(el) {
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
    location.hash = "";
    toast(t("Tüm veriler silindi"));
  },
};

export const changes = {
  "notify-classes"(el) {
    store.setSettings({ notifyClasses: el.checked });
  },

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

  "set-name"(el) {
    if (!el.value.trim()) return (el.value = store.get().profile.name);
    store.setName(el.value);
    toast(t("Kaydedildi"));
  },

  async import(el) {
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
      toast(t("Yedek yüklendi"));
    } catch {
      toast(t("Bu dosya geçerli bir Köprü yedeği değil"));
    }
  },
};
