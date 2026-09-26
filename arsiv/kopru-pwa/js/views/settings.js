import { store, DEFAULT_SCALE, DEFAULT_SCORE_TABLE } from "../store.js";
import { esc, toast, openSheet, closeSheet } from "../ui.js";
import { bindRows } from "../forms.js";
import { icon } from "../icons.js";
import { todayISO } from "../dates.js";
import { installMode, isStandalone, promptInstall } from "../install.js";

export const APP_VERSION = "2.1.0";

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
  const { profile, courses, tasks, settings } = store.get();
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
      <div class="section-head"><h2>Not sistemi</h2></div>
      <div class="group">
        <label class="group-row"><div><strong>Ortalama neye göre?</strong><p>Üniversitenin hangisini kullandığına bak.</p></div>
          <select data-change="set-weightby" aria-label="Ortalama neye göre">
            <option value="akts" ${settings.weightBy === "akts" ? "selected" : ""}>AKTS</option>
            <option value="kredi" ${settings.weightBy === "kredi" ? "selected" : ""}>Ulusal kredi</option>
          </select>
        </label>
        <div class="group-row"><div><strong>Harf notları ve katsayılar</strong><p>${settings.scale.map((s) => `${esc(s.letter)} ${String(s.point).replace(".", ",")}`).join(" · ")}</p></div>
          <button class="btn btn-ghost" type="button" data-action="edit-scale">Düzenle</button></div>
        <label class="group-row"><div><strong>Dönem kaç hafta?</strong><p>Devamsızlık sınırı buna göre hesaplanır.</p></div>
          <input type="number" inputmode="numeric" min="1" max="30" value="${settings.termWeeks}" data-change="set-setting" data-f="termWeeks" aria-label="Dönem hafta sayısı" class="num-sm">
        </label>
        <label class="group-row"><div><strong>Varsayılan devamsızlık sınırı</strong><p>Yüzde olarak. Her dersin ayarından ayrıca değiştirebilirsin.</p></div>
          <span class="pct"><input type="number" inputmode="numeric" min="0" max="100" value="${settings.absenceLimit}" data-change="set-setting" data-f="absenceLimit" aria-label="Varsayılan devamsızlık sınırı" class="num-sm"><span>%</span></span>
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

    <p class="footnote">KPR v${APP_VERSION} · <a href="/">KPR hakkında</a> · <a href="/gizlilik">Gizlilik ve KVKK</a></p>`;
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

  "edit-scale"() {
    openScaleSheet();
  },
};

/* Harf ölçeği ve puan → harf tablosu (üniversiteye göre değiştirilebilir) */
function openScaleSheet(draft) {
  const s = draft || store.get().settings;
  const row = (kind, r) => `<div class="grow scale-row" data-kind="${kind}">
    <input data-f="letter" value="${esc(r.letter)}" maxlength="4" aria-label="Harf" required>
    <input type="number" data-f="val" value="${kind === "scale" ? r.point : r.min}" min="0" max="${kind === "scale" ? 10 : 100}" step="${kind === "scale" ? 0.01 : 1}" inputmode="decimal" aria-label="${kind === "scale" ? "Katsayı" : "En düşük puan"}" required>
    <button type="button" class="icon-btn sm" data-remove-row aria-label="Satırı kaldır">${icon.close}</button>
  </div>`;

  openSheet(
    `<form class="sheet-form">
      <header class="sheet-head"><h2>Not ölçeği</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>
      <div class="sheet-body">
        <p class="lead-text">Üniversitenin yönetmeliğine göre düzenle. Yanlış bir şey yaparsan "Varsayılana dön" ile geri alabilirsin.</p>
        <h3 class="mini-title">Harf notu → katsayı</h3>
        <div class="srows" data-rows="scale">${s.scale.map((r) => row("scale", r)).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="scale">${icon.plus}Harf ekle</button>
        <h3 class="mini-title">Puan → tahmini harf</h3>
        <p class="fine">Not hesaplayıcıdaki puandan "tahmini" harf bulmak için kullanılır (mutlak sistem). Her harf için gereken en düşük puanı yaz. Bağıl sistemde gerçek harf farklı olabilir.</p>
        <div class="srows" data-rows="scoreTable">${s.scoreTable.map((r) => row("score", r)).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="scoreTable">${icon.plus}Satır ekle</button>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-defaults>Varsayılana dön</button>
        <button type="submit" class="btn btn-primary">Kaydet</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const scaleBox = form.querySelector('[data-rows="scale"]');
      const scoreBox = form.querySelector('[data-rows="scoreTable"]');
      bindRows(scaleBox, form.querySelector('[data-add="scale"]'), () => row("scale", { letter: "", point: "" }));
      bindRows(scoreBox, form.querySelector('[data-add="scoreTable"]'), () => row("score", { letter: "", min: "" }));

      form.querySelector("[data-defaults]").addEventListener("click", () =>
        openScaleSheet({ scale: DEFAULT_SCALE, scoreTable: DEFAULT_SCORE_TABLE })
      );

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const read = (box) => [...box.querySelectorAll(".scale-row")].map((r) => ({
          letter: r.querySelector('[data-f="letter"]').value.trim().toUpperCase(),
          val: r.querySelector('[data-f="val"]').value,
          el: r.querySelector('[data-f="letter"]'),
          valEl: r.querySelector('[data-f="val"]'),
        }));
        const scale = read(scaleBox);
        const score = read(scoreBox);
        for (const list of [scale, score]) {
          const seen = new Set();
          for (const r of list) {
            if (!r.letter) return r.el.reportValidity();
            if (r.val === "" || !r.valEl.checkValidity()) return r.valEl.reportValidity();
            if (seen.has(r.letter)) {
              r.el.setCustomValidity("Bu harf listede iki kez var.");
              r.el.reportValidity();
              r.el.addEventListener("input", () => r.el.setCustomValidity(""), { once: true });
              return;
            }
            seen.add(r.letter);
          }
        }
        if (!scale.length) return toast("En az bir harf notu olmalı");
        store.setSettings({
          scale: scale.map((r) => ({ letter: r.letter, point: Number(r.val) })),
          scoreTable: score.map((r) => ({ letter: r.letter, min: Number(r.val) })),
        });
        closeSheet();
        toast("Not ölçeği kaydedildi");
      });
    }
  );
}

export const changes = {
  "set-weightby"(el) {
    store.setSettings({ weightBy: el.value });
    toast(el.value === "kredi" ? "Ortalama ulusal krediye göre hesaplanacak" : "Ortalama AKTS'ye göre hesaplanacak");
  },

  "set-setting"(el) {
    if (el.value === "" || !el.checkValidity()) return (el.value = store.get().settings[el.dataset.f]);
    store.setSettings({ [el.dataset.f]: Number(el.value) });
    toast("Kaydedildi");
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
      if (!store.get().profile.name) store.setName(keepName);
      toast("Yedek yüklendi");
    } catch {
      toast("Bu dosya geçerli bir KPR yedeği değil");
    }
  },
};
