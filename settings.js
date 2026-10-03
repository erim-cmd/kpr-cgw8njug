import { store } from "./store.js";
import { runMigrations } from "./migrate.js";
import { esc, toast } from "./ui.js";
import { icon } from "./icons.js";
import { infoNote } from "./components.js";
import { todayISO } from "./dates.js";
import { installMode, isStandalone, promptInstall } from "./install.js";
import { permissionState, enableNotifications, disableNotifications, testNotification } from "./notify.js";
import { buildICS, deliverICS, countExportable } from "./ics.js";

export const APP_VERSION = "2.16.0";

let icsClasses = true;

function notifyRows(state) {
  const perm = permissionState();
  const on = perm === "granted" && state.settings.notify;
  let main;
  if (perm === "unsupported") {
    main = `<div class="group-row"><div><strong>Bildirimler</strong><p>Bu tarayıcı bildirimleri desteklemiyor. Takvime aktarmayı kullan.</p></div></div>`;
  } else if (perm === "ios-install") {
    main = `<div class="group-row"><div><strong>Bildirimler</strong><p>iPhone'da bildirim için Köprü'yü önce ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra ana ekrandaki ikondan aç.</p></div></div>`;
  } else if (perm === "denied") {
    main = `<div class="group-row"><div><strong>Bildirimler</strong><p>İzin reddedilmiş. Tarayıcının site ayarlarından bildirim iznini aç, sonra buraya dön.</p></div><span class="status-warn">Kapalı</span></div>`;
  } else {
    main = `<div class="group-row"><div><strong>Bildirimler</strong><p>Sınavdan 1 hafta ve 1 gün önce, teslimden 3 gün, 1 gün ve 3 saat önce, her sabah günün özeti.</p></div>
      ${on ? '<button class="btn btn-ghost" type="button" data-action="notify-off">Kapat</button>' : '<button class="btn btn-primary" type="button" data-action="notify-on">Aç</button>'}</div>`;
  }
  const extra = on
    ? `<label class="group-row"><div><strong>Dersten 15 dk önce</strong><p>Her ders için ayrı hatırlatma.</p></div>
        <input type="checkbox" class="switch" data-change="notify-classes" ${state.settings.notifyClasses ? "checked" : ""} aria-label="Dersten önce hatırlat"></label>
      <div class="group-row"><div><strong>Deneme</strong><p>Bildirimlerin nasıl göründüğüne bak.</p></div>
        <button class="btn btn-ghost" type="button" data-action="notify-test">Gönder</button></div>`
    : "";
  return main + extra;
}

function calendarRows(state) {
  const n = countExportable(state);
  return `<div class="group-row"><div><strong>Takvime aktar</strong><p>${n} sınav ve teslim, alarmlarıyla telefonunun takvimine. Uygulama kapalıyken de çalar.</p></div>
      <button class="btn btn-ghost" type="button" data-action="export-ics" ${n || state.courses.length ? "" : "disabled"}>${icon.calendarPlus}Aktar</button></div>
    <label class="group-row"><div><strong>Ders saatlerini de ekle</strong><p>Her ders haftalık tekrar eden etkinlik olur, 15 dk önce alarm.</p></div>
      <input type="checkbox" class="switch" data-change="ics-classes" ${icsClasses ? "checked" : ""} aria-label="Ders saatlerini de ekle"></label>`;
}

function installRow() {
  if (isStandalone()) {
    return `<div class="group-row"><div><strong>Uygulama</strong><p>Ana ekrandan açıldı.</p></div><span class="status-ok">Kurulu ✓</span></div>`;
  }
  const mode = installMode();
  if (mode === "prompt") {
    return `<div class="group-row"><div><strong>Telefonuna kur</strong><p>Tam ekran ve internetsiz kullan.</p></div>
      <button class="btn btn-primary" type="button" data-action="install-now">Kur</button></div>`;
  }
  if (mode === "ios") {
    return `<div class="group-row"><div><strong>Telefonuna kur</strong><p>Safari'de Paylaş → Ana Ekrana Ekle.</p></div></div>`;
  }
  return `<div class="group-row"><div><strong>Telefonuna kur</strong><p>Tarayıcı menüsünden "Uygulamayı yükle" / "Ana ekrana ekle"yi seç.</p></div></div>`;
}

export function view() {
  const { profile, courses, tasks } = store.get();
  return `
    <header class="page-head"><h1 class="page-title">Ayarlar</h1></header>

    <section class="section">
      <div class="section-head"><h2>Profil</h2></div>
      <div class="group">
        <label class="group-row"><div><strong>Adın</strong></div>
          <input data-change="set-name" value="${esc(profile.name)}" maxlength="40" required aria-label="Adın">
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Hatırlatmalar</h2></div>
      <div class="group">${notifyRows(store.get())}</div>
      <div class="gap-t">${infoNote("Bildirimler nasıl çalışır?", "Uygulama kapalıyken zamanında bildirim için sunucu gerekiyor; o gelene kadar en garanti yol takvime aktarmak. Android'de uygulama kapalıyken de ara ara kontrol ediyoruz.")}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Takvim</h2></div>
      <div class="group">${calendarRows(store.get())}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Dönem</h2></div>
      <div class="group">
        <label class="group-row"><div><strong>Dönem kaç hafta?</strong><p>Devamsızlık hakkı ve takvimdeki ders tekrarları buna göre hesaplanır.</p></div>
          <input type="number" class="num-in" min="1" max="30" step="1" inputmode="numeric" value="${store.get().settings.termWeeks}" data-change="term-weeks" aria-label="Dönem hafta sayısı"></label>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Uygulama</h2></div>
      <div class="group">
        ${installRow()}
        <div class="group-row"><div><strong>İnternetsiz çalışma</strong><p>Uygulama bir kez açıldıktan sonra çevrimdışı da çalışır.</p></div>
          ${"serviceWorker" in navigator && navigator.serviceWorker.controller ? '<span class="status-ok" id="sw-status">Hazır ✓</span>' : '<span class="status-muted" id="sw-status">Hazırlanıyor…</span>'}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Verilerin</h2></div>
      <div class="group">
        <div class="group-row"><div><strong>Yedek al</strong><p>${courses.length} ders, ${tasks.length} görev. Veriler sadece bu cihazda.</p></div>
          <button class="btn btn-ghost" type="button" data-action="export">${icon.download}İndir</button></div>
        <div class="group-row"><div><strong>Yedekten yükle</strong><p>Mevcut verilerin yerini alır.</p></div>
          <label class="btn btn-ghost">${icon.upload}Seç<input type="file" accept="application/json,.json" data-change="import" class="visually-hidden"></label></div>
        <div class="group-row"><div><strong>Her şeyi sil</strong><p>Tüm ders ve görevler kalıcı olarak silinir.</p></div>
          <button class="btn btn-danger" type="button" data-action="reset">Sil</button></div>
      </div>
    </section>

    <p class="footnote">Köprü v${APP_VERSION} · <a href="./">Köprü hakkında</a> · <a href="gizlilik.html">Gizlilik ve KVKK</a></p>`;
}

let resetArmed = false;

export const actions = {
  async "install-now"(_el, { render }) {
    await promptInstall();
    render();
  },

  async "notify-on"(_el, { render }) {
    const ok = await enableNotifications();
    toast(ok ? "Bildirimler açıldı" : "Bildirim izni verilmedi");
    render();
  },

  "notify-off"(_el, { render }) {
    disableNotifications();
    toast("Bildirimler kapatıldı");
    render();
  },

  async "notify-test"() {
    await testNotification();
  },

  async "export-ics"() {
    const result = await deliverICS(buildICS(store.get(), { classes: icsClasses }));
    if (result === "downloaded") toast("Takvim dosyası indirildi. Açınca takvimine eklenir.");
  },

  export() {
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kpr-yedek-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Yedek indirildi");
  },

  reset(el) {
    if (!resetArmed) {
      resetArmed = true;
      el.classList.add("armed");
      el.textContent = "Emin misin?";
      setTimeout(() => {
        resetArmed = false;
        el.classList.remove("armed");
        el.textContent = "Sil";
      }, 3000);
      return;
    }
    resetArmed = false;
    store.reset();
    location.hash = "";
    toast("Tüm veriler silindi");
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
      toast("Kaydedildi");
    } else {
      el.value = store.get().settings.termWeeks;
    }
  },

  "set-name"(el) {
    if (!el.value.trim()) return (el.value = store.get().profile.name);
    store.setName(el.value);
    toast("Kaydedildi");
  },

  async import(el) {
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.courses) || !Array.isArray(data?.tasks)) throw new Error("biçim");
      const keepName = store.get().profile.name;
      store.replace(data);
      runMigrations(); // eski sürümün yedeği de yeni biçime geçsin
      if (!store.get().profile.name) store.setName(keepName);
      toast("Yedek yüklendi");
    } catch {
      toast("Bu dosya geçerli bir Köprü yedeği değil");
    }
  },
};
