import { store } from "./store.js";
import { esc, toast } from "./ui.js";
import { icon } from "./icons.js";
import { todayISO } from "./dates.js";
import { installMode, isStandalone, promptInstall } from "./install.js";

export const APP_VERSION = "2.0.0";

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
      <div class="section-head"><h2>Uygulama</h2></div>
      <div class="group">
        ${installRow()}
        <div class="group-row"><div><strong>İnternetsiz çalışma</strong><p>Uygulama bir kez açıldıktan sonra çevrimdışı da çalışır.</p></div>
          <span class="status-ok" id="sw-status">${"serviceWorker" in navigator && navigator.serviceWorker.controller ? "Hazır ✓" : "Hazırlanıyor…"}</span></div>
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

    <p class="footnote">KPR v${APP_VERSION} · <a href="./">KPR hakkında</a> · <a href="gizlilik.html">Gizlilik ve KVKK</a></p>`;
}

let resetArmed = false;

export const actions = {
  async "install-now"(_el, { render }) {
    await promptInstall();
    render();
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
      if (!store.get().profile.name) store.setName(keepName);
      toast("Yedek yüklendi");
    } catch {
      toast("Bu dosya geçerli bir KPR yedeği değil");
    }
  },
};
