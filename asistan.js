/**
 * KPR — "Asistan": öğrencinin kendi dersleri hakkında soru-cevap.
 * Önce cihaz: asistan-core.js sadece cihazdaki veriden (syllabus kuralları, görevler, not hesabı, bilgi kartı)
 * anahtar kelimeyle cevaplar; 0 token. Bulamazsa ve sunucu hazırsa "Yapay zekâya sor" önerilir: öğrenci rıza
 * kutusunu işaretleyip dokunmadan hiçbir şey gitmez. Giden: soru + o dersin syllabus bilgisi (buildContext);
 * notlar, devamsızlık ve ad gitmez. Cevap kaynağıyla ve "Yapay zekâ" etiketiyle gösterilir (functions/api/ask.js).
 * Okula ait işlem/birim/süreç içeriği yok. Sohbet geçmişi sadece bu oturumda (kaydedilmez).
 * Cevaplar düz metin: esc() ile basılır, HTML/markdown işlenmez.
 */

import { store } from "./store.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { answer, buildContext, EXAMPLES } from "./asistan-core.js";
import { t, getLang } from "./i18n.js";
import { endpointStatus, postJSON } from "./api.js";

const ASK = "api/ask";
let aiState = null; // null (sorulmadı) | "ready" | "off" | "none"
let consent = false; // bu oturumda rıza verildi mi (kaydedilmez)
let busy = false;
let renderFn = null; // app.js'in render'ı (ilk soru/eylemle gelir)
/**
 * Arka planda gelen sonuçla (sunucu hazır, yapay zekâ cevabı) ekranı yeniden çiz. Soru kutusu odaklıyken app.js'in
 * genel "kpr:render" olayı bekletir; burada doğrudan çizilir, yazılmakta olan metin ve odak korunur.
 */
function rerender() {
  if (!renderFn || !location.hash.startsWith("#/asistan")) return;
  const input = document.querySelector(".ask-box input");
  const value = input?.value || "";
  const focused = document.activeElement === input;
  renderFn();
  const again = document.querySelector(".ask-box input");
  if (again) {
    again.value = value;
    if (focused) again.focus();
  }
}

/** Yapay zekâ önerisi gösterilsin mi? Ayar açık (settings.aiReading) ve sunucu hazır. İlk sorguda bir kez sorulur. */
function checkAI() {
  if (aiState !== null || store.get().settings.aiReading !== true) return;
  aiState = "none";
  endpointStatus(ASK).then((st) => { aiState = st; if (st === "ready") rerender(); });
}

async function askAI(i) {
  const m = chat[i];
  if (!m || busy) return;
  const built = buildContext(m.q, store.get(), { courseId: m.courseId || null });
  if (!built) return;
  busy = true;
  m.aiPending = true;
  rerender();
  const history = chat.slice(0, i).filter((x) => x.ai).slice(-2).map((x) => ({ q: x.q, a: x.ai.answer }));
  const r = await postJSON(ASK, { question: m.q, context: built.context, history, lang: getLang() }, {
    timeout: 35_000,
    errors: { offline: t("internet bağlantısı yok"), timeout: t("cevap çok uzun sürdü"), network: t("sunucuya ulaşılamadı") },
  });
  busy = false;
  m.aiPending = false;
  if (r.body?.answer) m.ai = { answer: r.body.answer, source: r.body.source || "", found: r.body.found !== false, label: built.label };
  else m.aiError = r.error || t("Yapay zekâ cevap veremedi.");
  rerender();
}

// Oturumluk sohbet: { q, text, source, chips } (sayfa yenilenince silinir)
const chat = [];

function ask(q, courseId = null) {
  const a = answer(q, store.get(), { courseId });
  // "Hangi ders?" seçimi yapılınca aynı soru o dersle tekrar sorulur; çipli soru yerinde güncellenir
  if (courseId && chat.length && chat[chat.length - 1].chips) chat.pop();
  chat.push({ q, courseId, ...a });
  if (a.missing) checkAI();
}

/** Cihazda cevap yoksa: rıza kutusu + "Yapay zekâya sor" (sunucu hazırsa). */
function aiOffer(m, i) {
  if (!m.missing || m.ai || aiState !== "ready") return "";
  if (m.aiPending) return `<p class="msg-ai-wait" role="status">${t("Yapay zekâ cevaplıyor…")}</p>`;
  return `<div class="msg-ai-offer">
    ${m.aiError ? `<p class="msg-src">${esc(m.aiError)}</p>` : ""}
    ${consent ? "" : `<label class="consent"><input type="checkbox" data-ai-consent><span>${t("Sorum ve bu dersin syllabus bilgileri yapay zekâya (Anthropic) gönderilsin. Notlarım, devamsızlığım ve adım gönderilmez.")}</span></label>`}
    <button type="button" class="btn btn-violet btn-sm" data-action="ask-ai" data-i="${i}">${icon.chat}${t("Yapay zekâya sor")}</button>
  </div>`;
}

function bubble(m, i) {
  return `<li class="msg q"><p>${esc(m.q)}</p></li>
    <li class="msg a">
      <p>${esc(m.text)}</p>
      ${m.chips ? `<div class="msg-chips">${m.chips.map((c) => `<button type="button" class="pick-chip" data-action="ask-course" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join("")}</div>` : ""}
      ${m.source ? `<small class="msg-src">${t("Kaynak: {src}", { src: esc(m.source) })}</small>` : ""}
      ${aiOffer(m, i)}
    </li>
    ${m.ai ? `<li class="msg a ai">
      <span class="ai-tag">${t("Yapay zekâ")}</span>
      <p>${esc(m.ai.answer)}</p>
      ${m.ai.source ? `<small class="msg-src">${t("Kaynak: {src}", { src: esc(`${m.ai.label} · ${m.ai.source}`) })}</small>` : ""}
      <small class="msg-src">${t("Yapay zekâ yanılabilir; önemli bir kararda syllabus'a bak.")}</small>
    </li>` : ""}`;
}

/** Sohbet boşken ilk örnek sorunun öğrencinin kendi verisinden cevabı: ne yaptığı tek bakışta görünsün. */
function sample() {
  const state = store.get();
  if (!state.courses.length) return "";
  const q = EXAMPLES[0];
  const m = answer(q, state, {});
  if (!m || m.chips || !m.text) return "";
  return `<section class="section ask-sample" aria-label="${t("Örnek cevap")}">
    <div class="section-head"><h2>${t("Örnek")}</h2></div>
    <ul class="chat">${bubble({ q, ...m, chips: null })}</ul>
  </section>`;
}

export function view() {
  return `
    <header class="page-head">
      <h1 class="page-title">${t("Asistan")}</h1>
      <p class="page-sub">${t("Derslerin hakkında sor: tarihler, kurallar, notlar")}</p>
    </header>

    ${chat.length ? `<ul class="chat" aria-live="polite">${chat.map((m, i) => bubble(m, i)).join("")}</ul>` : ""}

    <form class="ask-box" data-submit="ask">
      <label class="ask-field">
        <span class="visually-hidden">${t("Sorunu yaz")}</span>
        <input name="q" maxlength="200" placeholder="${t("Örn. finalden kaç almam lazım?")}" autocomplete="off" enterkeyhint="send">
      </label>
      <button type="submit" class="btn btn-violet" aria-label="${t("Sor")}">${icon.chat}${t("Sor")}</button>
    </form>

    ${chat.length ? "" : sample()}

    ${chat.length ? "" : `<section class="section">
      <div class="section-head"><h2>${t("Örnek sorular")}</h2></div>
      <ul class="list ask-examples">${EXAMPLES.map(
        (q) => `<li><button type="button" class="ask-example" data-action="ask-example" data-q="${esc(q)}">${icon.chat}<span>${esc(q)}</span></button></li>`
      ).join("")}</ul>
    </section>`}
    <p class="fine">${t("Cevaplar önce senin derslerinden (syllabus, görevler, notlar) gelir. Bulamazsa ve sen onaylarsan yapay zekâya sorulur; o cevap etiketli gösterilir.")}${chat.length ? ` <button type="button" class="link" data-action="clear-chat">${t("Sohbeti temizle")}</button>` : ""}</p>`;
}

const focusInput = () => requestAnimationFrame(() => document.querySelector(".ask-box input")?.focus());

export const actions = {
  "ask-example"(el, { render }) {
    renderFn = render;
    ask(el.dataset.q);
    render();
  },
  "ask-course"(el, { render }) {
    const last = chat[chat.length - 1];
    if (!last) return;
    ask(last.q, el.dataset.id);
    render();
  },
  "ask-ai"(el, { render }) {
    renderFn = render;
    const box = el.closest(".msg-ai-offer")?.querySelector("[data-ai-consent]");
    if (box && !box.checked) {
      box.setCustomValidity(t("Devam etmek için kutuyu işaretle."));
      box.reportValidity();
      box.addEventListener("change", () => box.setCustomValidity(""), { once: true });
      return;
    }
    consent = true;
    askAI(Number(el.dataset.i));
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
    renderFn = render;
    ask(q);
    render();
    focusInput();
  },
};
