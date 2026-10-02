/**
 * KPR — "Seçmeli Keşfi" (sadece arayüz): ilgi alanlarına göre seçmeli ders uyumu.
 *
 * Bu sürümde:
 *   - İlgi alanı seçimi (çoklu çip + Tamam); seçimler cihazda, store → settings.interests.
 *   - Ders kartı bileşeni (kod, ad, uyum çubuğu, yüzde, eşleşen konular) hazır ama liste boş.
 * PDF yükleme, ders verisi, eşleştirme, arama ve yapay zekâ YOK; ağ isteği yok.
 */

import { store, INTERESTS } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";

// Öneri listesi: eşleştirme gelene kadar boş (sahte ders öneri gibi gösterilmez)
const SUGGESTIONS = [];

// Eşleştirme gelene kadar arayüzün nasıl görüneceğini gösteren ÖRNEK kartlar.
// "Önizleme" etiketiyle ve soluk çizilir; gerçek bir ders önerisi değildir, okul verisi içermez.
const PREVIEW = [
  { code: "ÖRN 301", name: "Ürün yönetimine giriş", fit: 92, matches: ["girisimcilik", "teknoloji"] },
  { code: "ÖRN 214", name: "Veri görselleştirme", fit: 81, matches: ["veri", "teknoloji"] },
  { code: "ÖRN 330", name: "Dijital pazarlama stratejisi", fit: 74, matches: ["pazarlama", "girisimcilik"] },
  { code: "ÖRN 205", name: "Finansal okuryazarlık", fit: 68, matches: ["finans"] },
  { code: "ÖRN 318", name: "Sürdürülebilir tasarım", fit: 63, matches: ["surdurulebilirlik", "teknoloji"] },
  { code: "ÖRN 240", name: "Teknoloji hukukuna giriş", fit: 58, matches: ["hukuk", "teknoloji"] },
  { code: "ÖRN 260", name: "Küresel ekonomiye bakış", fit: 55, matches: ["uluslararasi", "finans"] },
];

let editing = false; // kayıtlı seçim varken kart yeniden açıldı mı
let draft = null; // açık karttaki seçim (Tamam'a basılınca kaydedilir)

/**
 * Ders kartı: { code, name, fit: 0–100, matches: [INTERESTS anahtarı] }.
 * Eşleştirme gelince SUGGESTIONS bununla çizilecek.
 */
export function courseCard(c, preview = false) {
  const fit = Math.max(0, Math.min(100, Math.round(Number(c.fit) || 0)));
  return `<li class="el-card${preview ? " is-preview" : ""}">
    <div class="el-top">
      <div class="el-title"><b>${esc(c.code)}</b><span>${esc(c.name)}</span></div>
      <span class="el-fit">%${fit}</span>
    </div>
    <div class="el-bar" role="img" aria-label="Uyum yüzde ${fit}"><i style="width:${fit}%"></i></div>
    ${c.matches?.length ? `<div class="el-tags">${c.matches.map((k) => `<span class="match-tag">${esc(INTERESTS[k] || k)}</span>`).join("")}</div>` : ""}
  </li>`;
}

function interestCard(selected) {
  const chips = Object.entries(INTERESTS)
    .map(([k, label]) => `<button type="button" class="pick-chip" data-action="toggle-interest" data-key="${k}" aria-pressed="${selected.has(k)}">${label}</button>`)
    .join("");
  return `<section class="card-box interest-card">
    <h2 class="sub-title">İlgi alanların</h2>
    <p class="fine">Hangi konular ilgini çekiyor? Birden fazla seçebilirsin.</p>
    <div class="pick-chips" role="group" aria-label="İlgi alanları">${chips}</div>
    <button type="button" class="btn btn-primary" data-action="save-interests" ${selected.size ? "" : "disabled"}>Tamam</button>
  </section>`;
}

function interestTags(saved) {
  return `<button type="button" class="interest-tags" data-action="edit-interests" aria-label="İlgi alanlarını düzenle">
    <span class="fine">İlgi alanların:</span>
    ${saved.map((k) => `<span class="match-tag">${esc(INTERESTS[k])}</span>`).join("")}
  </button>`;
}

/** İlgi alanına uyan örnek kartlar (en fazla 3), üstünde "Önizleme" açıklaması. */
function previewList(saved) {
  const keys = new Set(saved);
  const list = PREVIEW.filter((c) => !keys.size || c.matches.some((k) => keys.has(k))).slice(0, 3);
  return `<p class="preview-note"><span class="badge soft">Önizleme</span>Gerçek öneriler ders listesi eklenince gelecek. Kartlar böyle görünecek:</p>
    <ul class="list" aria-label="Örnek kartlar">${list.map((c) => courseCard(c, true)).join("")}</ul>`;
}

export function view() {
  const saved = store.get().settings.interests;
  const open = editing || !saved.length;
  if (open && !draft) draft = new Set(saved);
  return `
    <header class="page-head">
      <h1 class="page-title">Seçmeli Keşfi</h1>
      <p class="page-sub">İlgi alanlarına göre seçmeli ders uyumu</p>
    </header>

    ${open ? interestCard(draft) : interestTags(saved)}

    <section class="section">
      <div class="section-head"><h2>Öneriler</h2></div>
      ${SUGGESTIONS.length
        ? `<ul class="list">${SUGGESTIONS.map(courseCard).join("")}</ul>`
        : previewList(saved)}
    </section>

    <p class="fine el-note">Bu bir öneridir, kayıt değildir. Kayıt okulunun kendi sisteminde yapılır.</p>`;
}

export const actions = {
  "toggle-interest"(el, { render }) {
    const k = el.dataset.key;
    if (!draft || !Object.hasOwn(INTERESTS, k)) return;
    if (draft.has(k)) draft.delete(k);
    else draft.add(k);
    render();
  },
  "save-interests"() {
    if (!draft?.size) return;
    const picked = Object.keys(INTERESTS).filter((k) => draft.has(k));
    editing = false;
    draft = null;
    store.setSettings({ interests: picked });
  },
  "edit-interests"(_el, { render }) {
    editing = true;
    draft = new Set(store.get().settings.interests);
    render();
  },
};
