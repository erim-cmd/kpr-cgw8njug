/**
 * KPR — "Asistan": öğrencinin kendi dersleri hakkında soru-cevap (internetsiz ilk sürüm).
 * Cevaplar asistan-core.js'ten: sadece cihazdaki veri (syllabus kuralları, görevler, not hesabı,
 * bilgi kartı), anahtar kelimeyle. Yapay zekâ, ağ isteği, uydurma cevap YOK.
 * Okula ait işlem/birim/süreç içeriği yok. Sohbet geçmişi sadece bu oturumda (kaydedilmez).
 * Cevaplar düz metin: esc() ile basılır, HTML/markdown işlenmez.
 */

import { store } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { answer, EXAMPLES } from "./asistan-core.js";

// Oturumluk sohbet: { q, text, source, chips } (sayfa yenilenince silinir)
const chat = [];

function ask(q, courseId = null) {
  const a = answer(q, store.get(), { courseId });
  // "Hangi ders?" seçimi yapılınca aynı soru o dersle tekrar sorulur; çipli soru yerinde güncellenir
  if (courseId && chat.length && chat[chat.length - 1].chips) chat.pop();
  chat.push({ q, ...a });
}

function bubble(m) {
  return `<li class="msg q"><p>${esc(m.q)}</p></li>
    <li class="msg a">
      <p>${esc(m.text)}</p>
      ${m.chips ? `<div class="msg-chips">${m.chips.map((c) => `<button type="button" class="pick-chip" data-action="ask-course" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join("")}</div>` : ""}
      ${m.source ? `<small class="msg-src">Kaynak: ${esc(m.source)}</small>` : ""}
    </li>`;
}

/** Sohbet boşken ilk örnek sorunun öğrencinin kendi verisinden cevabı: ne yaptığı tek bakışta görünsün. */
function sample() {
  const state = store.get();
  if (!state.courses.length) return "";
  const q = EXAMPLES[0];
  const m = answer(q, state, {});
  if (!m || m.chips || !m.text) return "";
  return `<section class="section ask-sample" aria-label="Örnek cevap">
    <div class="section-head"><h2>Örnek</h2></div>
    <ul class="chat">${bubble({ q, ...m, chips: null })}</ul>
  </section>`;
}

export function view() {
  return `
    <header class="page-head">
      <h1 class="page-title">Asistan</h1>
      <p class="page-sub">Derslerin hakkında sor: tarihler, kurallar, notlar</p>
    </header>

    ${chat.length ? `<ul class="chat" aria-live="polite">${chat.map(bubble).join("")}</ul>` : ""}

    <form class="ask-box" data-submit="ask">
      <label class="ask-field">
        <span class="visually-hidden">Sorunu yaz</span>
        <input name="q" maxlength="200" placeholder="Örn. finalden kaç almam lazım?" autocomplete="off" enterkeyhint="send">
      </label>
      <button type="submit" class="btn btn-violet" aria-label="Sor">${icon.chat}Sor</button>
    </form>

    ${chat.length ? "" : sample()}

    ${chat.length ? "" : `<section class="section">
      <div class="section-head"><h2>Örnek sorular</h2></div>
      <ul class="list ask-examples">${EXAMPLES.map(
        (q) => `<li><button type="button" class="ask-example" data-action="ask-example" data-q="${esc(q)}">${icon.chat}<span>${esc(q)}</span></button></li>`
      ).join("")}</ul>
    </section>`}
    <p class="fine">Cevaplar sadece senin derslerinden (syllabus, görevler, notlar) gelir; internete bağlanmaz. Bulamazsa bulamadığını söyler.${chat.length ? ` <button type="button" class="link" data-action="clear-chat">Sohbeti temizle</button>` : ""}</p>`;
}

const focusInput = () => requestAnimationFrame(() => document.querySelector(".ask-box input")?.focus());

export const actions = {
  "ask-example"(el, { render }) {
    ask(el.dataset.q);
    render();
  },
  "ask-course"(el, { render }) {
    const last = chat[chat.length - 1];
    if (!last) return;
    ask(last.q, el.dataset.id);
    render();
  },
  "clear-chat"(_el, { render }) {
    chat.length = 0;
    render();
  },
};

export const submits = {
  ask(form, { render }) {
    const q = form.elements.q.value.trim();
    if (!q) return;
    ask(q);
    render();
    focusInput();
  },
};
