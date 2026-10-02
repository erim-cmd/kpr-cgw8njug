/**
 * KPR — "Seçmeli" (iskelet): gelecek dönemin seçmeli derslerini keşif.
 * Şimdilik sadece "liste yüklenmemiş" durumu. Dosya okuma, eşleştirme ve yapay zekâ YOK.
 */

import { toast } from "./ui.js";
import { icon } from "./icons.js";

const STEPS = [
  ["Listeyi yükle", "Bölümünün açacağı seçmeli ders listesini (PDF ya da Excel) ekle."],
  ["Köprü okur", "Ders adlarını, kredilerini, gün ve saatlerini cihazında çıkarır."],
  ["İlgi alanına göre eşleşir", "Programına uyan ve ilgini çekebilecek dersleri öne çıkarır."],
];

export function view() {
  return `
    <header class="page-head">
      <h1 class="page-title">Seçmeli</h1>
      <p class="page-sub">Gelecek dönemin seçmelilerini keşfet</p>
    </header>

    <section class="empty secmeli-empty">
      <span class="empty-icon">${icon.compass}</span>
      <strong>Henüz seçmeli listesi yüklenmedi</strong>
      <p>Liste gelince sana uyan seçmelileri birlikte bulalım.</p>
      <div class="empty-actions"><button class="btn btn-primary" type="button" data-action="upload-list">${icon.upload}Liste yükle</button></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Nasıl çalışır</h2></div>
      <ol class="steps">${STEPS.map(([t, d], i) => `<li><b class="step-n">${i + 1}</b><div><strong>${t}</strong><p>${d}</p></div></li>`).join("")}</ol>
    </section>`;
}

export const actions = {
  "upload-list": () => toast("Bu bölüm hazırlanıyor"),
};
