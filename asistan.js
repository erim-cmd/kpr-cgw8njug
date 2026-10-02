/**
 * KPR — "Asistan" (iskelet): öğrencinin kendi dersleri hakkında soru-cevap.
 * Yalnızca öğrencinin kendi dersleri ve verisi (syllabus, tarihler, notlar) kaynak olacak;
 * okula ait işlem/birim/süreç içeriği yok.
 * Şimdilik sadece görünüm: ağ isteği, yapay zekâ çağrısı ve hazır cevap YOK.
 * Soru alanı ve örnek sorular "Bu bölüm hazırlanıyor" bildirimi verir.
 */

import { toast } from "./ui.js";
import { icon } from "./icons.js";

const EXAMPLES = ["Bu hafta neye çalışmalıyım?", "Finalden kaç almam lazım?", "Yoklama var mı?", "Geç teslim kabul mü?"];

const soon = () => toast("Bu bölüm hazırlanıyor");

export function view() {
  return `
    <header class="page-head">
      <h1 class="page-title">Asistan</h1>
      <p class="page-sub">Derslerin hakkında sor: tarihler, kurallar, notlar</p>
    </header>

    <form class="ask-box" data-submit="ask">
      <label class="ask-field">
        <span class="visually-hidden">Sorunu yaz</span>
        <input name="q" maxlength="200" placeholder="Örn. finalden kaç almam lazım?" autocomplete="off">
      </label>
      <button type="submit" class="btn btn-primary" aria-label="Sor">${icon.chat}Sor</button>
      <span class="soon-tag">Yakında</span>
    </form>

    <section class="section">
      <div class="section-head"><h2>Örnek sorular</h2></div>
      <ul class="list ask-examples">${EXAMPLES.map(
        (q) => `<li><button type="button" class="ask-example" data-action="ask-example">${icon.chat}<span>${q}</span></button></li>`
      ).join("")}</ul>
    </section>
    <p class="fine">Asistan hazır olduğunda cevaplar sadece senin derslerine ve girdiğin verilere (syllabus, tarihler, notlar) dayanacak.</p>`;
}

export const actions = {
  "ask-example": soon,
};

export const submits = {
  ask: soon,
};
