/**
 * KPR — "Seçmeli Keşfi": Ekle/Sil (Add/Drop) haftasında seçmeli dersleri değerlendirme.
 *
 *   1. Adaylar: öğrenci düşündüğü seçmelinin syllabus'unu yükler (isteğe bağlı) → cihazda okunur, özeti
 *      (sınav sayısı, devam şartı, not dağılımı, kritik kurallar) yan yana karşılaştırılır. Aday ders değildir:
 *      takvime, görevlere ve GNO'ya girmez. Dosya saklanmaz, yalnızca özet (store → electives).
 *   2. İlgi alanı seçimi (çoklu çip + Tamam); seçimler cihazda, store → settings.interests.
 *   3. Öneriler: öğrenci kendi elindeki seçmeli listesini (PDF/Word) yükler; metin cihazda çıkarılır, rızayla
 *      yapay zekâya gider (functions/api/electives.js) ve ilgi alanıyla eşleşen dersler gerekçesi ve listeden alıntısıyla
 *      gelir. Sunucu belgede olmayan dersi atar, birebir olmayan alıntıyı boşaltır. Sonuç yalnız cihazda (kpr:suggest:v1).
 *      Yapay zekâ yoksa küçük "Önizleme" listesi (sahte ders öneri gibi gösterilmez).
 *   4. Sınav çakışması: adayın syllabus'undaki sınav tarihi, öğrencinin kendi derslerinden bir sınavla aynı günse uyarı.
 * Okuma önce cihazda; okuma eksikse (not toplamı tutmuyor, tarihsiz sınav) öğrenciye yapay zekâ ile okuma
 * önerilir. Rıza verilirse yalnızca cihazda çıkarılmış syllabus metni gönderilir (importer.js readWithAI).
 */

import { store, INTERESTS, isExam } from "./store.js";
import { esc, toast, openSheet, closeSheet } from "./ui.js";
import { icon } from "./icons.js";
import { t, pct, localize, getLang } from "./i18n.js";
import { infoNote } from "./components.js";
import { fmtShort } from "./dates.js";
import { endpointStatus, postJSON } from "./api.js";

const EL_API = "api/electives";
const SUGGEST_KEY = "kpr:suggest:v1";
let aiState = null; // null | "ready" | "off" | "none"
let matching = false;

/** Son eşleştirme: { courses, interests } — yalnız bu cihazda. Bozuk/yoksa boş. */
function loadSuggestions() {
  try {
    const v = JSON.parse(localStorage.getItem(SUGGEST_KEY) || "null");
    return v && Array.isArray(v.courses) ? v : { courses: [], interests: [] };
  } catch { return { courses: [], interests: [] }; }
}
function saveSuggestions(v) {
  try { localStorage.setItem(SUGGEST_KEY, JSON.stringify(v)); } catch { /* depolama yoksa oturumda kalır */ }
  suggestions = v;
}
let suggestions = loadSuggestions();

/**
 * Adayın sınavı, öğrencinin kendi derslerindeki bir sınavla aynı gün mü?
 * Dönüş: [{ date, title, with }] — with: çakışan dersin kodu/adı ve sınavı.
 */
export function examClashes(e, tasks, courses) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const mine = tasks.filter((x) => isExam(x) && x.due && !x.done);
  return (e.examDates || []).flatMap((x) =>
    mine.filter((m) => m.due === x.date).map((m) => ({ date: x.date, title: x.title, with: `${byId.get(m.courseId)?.code || byId.get(m.courseId)?.name || ""} ${m.title}`.trim() }))
  );
}

// Eşleştirme gelene kadar arayüzün nasıl görüneceğini gösteren ÖRNEK satırlar.
// "Önizleme" etiketiyle ve soluk çizilir; gerçek bir ders önerisi değildir, okul verisi içermez.
const PREVIEW = [
  localize({ code: "ÖRN 301", name: "Ürün yönetimine giriş", fit: 92, matches: ["girisimcilik", "teknoloji"] }, { code: "EX 301", name: "Intro to product management" }),
  localize({ code: "ÖRN 214", name: "Veri görselleştirme", fit: 81, matches: ["veri", "teknoloji"] }, { code: "EX 214", name: "Data visualization" }),
  localize({ code: "ÖRN 330", name: "Dijital pazarlama stratejisi", fit: 74, matches: ["pazarlama", "girisimcilik"] }, { code: "EX 330", name: "Digital marketing strategy" }),
  localize({ code: "ÖRN 205", name: "Finansal okuryazarlık", fit: 68, matches: ["finans"] }, { code: "EX 205", name: "Financial literacy" }),
  localize({ code: "ÖRN 318", name: "Sürdürülebilir tasarım", fit: 63, matches: ["surdurulebilirlik", "teknoloji"] }, { code: "EX 318", name: "Sustainable design" }),
  localize({ code: "ÖRN 240", name: "Teknoloji hukukuna giriş", fit: 58, matches: ["hukuk", "teknoloji"] }, { code: "EX 240", name: "Intro to technology law" }),
  localize({ code: "ÖRN 260", name: "Küresel ekonomiye bakış", fit: 55, matches: ["uluslararasi", "finans"] }, { code: "EX 260", name: "A look at the global economy" }),
];

let editing = false; // kayıtlı seçim varken kart yeniden açıldı mı
let draft = null; // açık karttaki seçim (Tamam'a basılınca kaydedilir)
let reading = false; // syllabus okunuyor

/**
 * Öneri satırı (tek satır): { code, name, fit: 0–100 }. Eşleştirme gelince SUGGESTIONS bununla çizilecek.
 */
export function courseCard(c, preview = false) {
  const fit = Math.max(0, Math.min(100, Math.round(Number(c.fit) || 0)));
  const why = !preview && c.reason ? `<p class="el-why">${esc(c.reason)}${c.quote ? `<q>${esc(c.quote)}</q>` : `<small>${t("Yapay zekânın yorumu; listede birebir alıntı yok.")}</small>`}</p>` : "";
  return `<li class="el-row${preview ? " is-preview" : ""}${why ? " has-why" : ""}">
    <b>${esc(c.code)}</b><span>${esc(c.name)}</span><em aria-label="${t("Uyum yüzde {n}", { n: fit })}">${pct(fit)}</em>${why}
  </li>`;
}

/* ------------------------------------------------------------------ */
/* Adaylar                                                             */
/* ------------------------------------------------------------------ */

function candidateCard(e) {
  const g = e.grading.filter((x) => !x.bonus);
  const bonus = e.grading.filter((x) => x.bonus);
  // Devamsızlık hakkı saat ya da hafta olarak verildiyse birimiyle ("en fazla 8 saat devamsızlık")
  const abs = e.absUnit === "saat" ? t("en fazla {n} saat devamsızlık", { n: e.absLimit }) : e.absUnit === "hafta" ? t("en fazla {n} hafta devamsızlık", { n: e.absLimit }) : t("en fazla {n} devamsızlık", { n: e.absLimit }); // i18n-ok
  const att = e.attendPct !== null ? t("en az {p} devam", { p: pct(e.attendPct) }) : e.absLimit !== null ? abs : t("devam şartı yazmıyor");
  const stats = [
    e.ects !== null && t("{n} AKTS", { n: e.ects }),
    e.exams ? t("{n} sınav", { n: e.exams }) : null,
    e.deadlines ? t("{n} teslim", { n: e.deadlines }) : null,
    att,
  ].filter(Boolean);
  return `<li class="cand">
    <div class="cand-head">
      <div class="cand-title"><b>${esc(e.code || e.name)}</b>${e.code ? `<span>${esc(e.name)}</span>` : ""}</div>
      <button type="button" class="icon-btn sm" data-action="remove-elective" data-id="${esc(e.id)}" aria-label="${t("{name} adayını kaldır", { name: esc(e.code || e.name) })}">${icon.close}</button>
    </div>
    <p class="cand-stats">${stats.map(esc).join(" · ")}</p>
    ${g.length ? `<p class="cand-grading">${g.map((x) => `${esc(x.name)} ${pct(x.weight)}`).join(" · ")}${bonus.length ? ` · ${bonus.map((x) => `${esc(x.name)} +${pct(x.weight)}`).join(" · ")}` : ""}</p>` : `<p class="cand-grading muted">${t("Not dağılımı syllabus'ta bulunamadı.")}</p>`}
    ${clashes(e)}
    ${e.finalMin !== null ? `<p class="cand-rule">${t("Final barajı {n}", { n: e.finalMin })}</p>` : ""}
    ${e.rules.filter((r) => !/^Derslerin en az/.test(r) && !/^En fazla \d+/.test(r) && !/^Finalden en az/.test(r)).map((r) => `<p class="cand-rule">${esc(r)}</p>`).join("")}
  </li>`;
}

function clashes(e) {
  const st = store.get();
  return examClashes(e, st.tasks, st.courses).slice(0, 2)
    .map((x) => `<p class="cand-clash">${t("Sınav çakışması: {tarih} — {aday} ile {ders} aynı gün", { tarih: fmtShort(x.date), aday: esc(x.title), ders: esc(x.with) })}</p>`).join("");
}

function candidatesBlock(list) {
  const upload = `<label class="btn btn-ghost el-upload${reading ? " is-busy" : ""}">
      ${icon.upload}${reading ? t("Okunuyor…") : t("Seçmeli syllabus'u yükle")}
      <input type="file" class="visually-hidden" data-change="elective-file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain" ${reading ? "disabled" : ""}>
    </label>`;
  return `<section class="section">
    <div class="section-head"><h2>${t("Düşündüğün seçmeliler")}</h2></div>
    ${list.length
      ? `<ul class="cands">${list.map(candidateCard).join("")}</ul>`
      : `<p class="fine">${t("Aklındaki seçmelinin syllabus'unu yükle; sınavlarını, devam şartını ve not dağılımını diğerleriyle yan yana gör.")}</p>`}
    ${list.length < 8 ? upload : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* İlgi alanları ve öneriler                                           */
/* ------------------------------------------------------------------ */

function interestCard(selected) {
  const chips = Object.entries(INTERESTS)
    .map(([k, label]) => `<button type="button" class="pick-chip" data-action="toggle-interest" data-key="${k}" aria-pressed="${selected.has(k)}">${label}</button>`)
    .join("");
  return `<div class="card-box interest-card">
    <p class="fine">${t("Hangi konular ilgini çekiyor? Birden fazla seçebilirsin.")}</p>
    <div class="pick-chips" role="group" aria-label="${t("İlgi alanları")}">${chips}</div>
    <button type="button" class="btn btn-primary" data-action="save-interests" ${selected.size ? "" : "disabled"}>${t("Tamam")}</button>
  </div>`;
}

function interestTags(saved) {
  return `<button type="button" class="interest-tags" data-action="edit-interests" aria-label="${t("İlgi alanlarını düzenle")}">
    <span class="fine">${t("İlgi alanların:")}</span>
    ${saved.map((k) => `<span class="match-tag">${esc(INTERESTS[k])}</span>`).join("")}
  </button>`;
}

/** İlgi alanına uyan örnek satırlar (en fazla 3), tek kutuda "Önizleme" etiketiyle. */
function previewList(saved) {
  const keys = new Set(saved);
  const list = PREVIEW.filter((c) => !keys.size || c.matches.some((k) => keys.has(k))).slice(0, 3);
  return `<div class="el-preview">
    <p class="preview-note"><span class="badge soft">${t("Önizleme")}</span>${t("Ders listesi eklenince öneriler böyle görünecek.")}</p>
    <ul class="el-rows" aria-label="${t("Örnek öneriler")}">${list.map((c) => courseCard(c, true)).join("")}</ul>
  </div>`;
}

/** Öneriler: liste yükle (yapay zekâ hazırsa) → eşleşen dersler; yoksa önizleme. */
function suggestBlock(saved) {
  if (aiState === null && store.get().settings.aiReading === true) {
    aiState = "none";
    endpointStatus(EL_API).then((st) => { aiState = st; if (st === "ready") globalThis.dispatchEvent?.(new Event("kpr:render")); });
  }
  const list = suggestions.courses;
  const stale = list.length && suggestions.interests.join() !== saved.join();
  const upload = aiState === "ready" && saved.length ? `<label class="btn btn-ghost el-upload${matching ? " is-busy" : ""}">
      ${icon.upload}${matching ? t("Eşleştiriliyor…") : list.length ? t("Başka bir liste yükle") : t("Seçmeli listesini yükle")}
      <input type="file" class="visually-hidden" data-change="elective-list" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain" ${matching ? "disabled" : ""}>
    </label>` : "";
  if (list.length) {
    return `<ul class="el-rows">${list.map((c) => courseCard(c)).join("")}</ul>
      ${stale ? `<p class="fine">${t("İlgi alanların değişti; güncel öneri için listeyi yeniden yükle.")}</p>` : ""}
      <p class="fine">${t("Bu bir öneridir, kayıt değildir. Gerekçeler yüklediğin listeden; yapay zekâ yanılabilir.")}</p>${upload}`;
  }
  return `${upload ? `<p class="fine">${t("Elindeki seçmeli ders listesini (PDF ya da Word) yükle; ilgi alanına uyan dersleri gerekçesiyle sıralayalım.")}</p>${upload}` : ""}${previewList(saved)}`;
}

/** Liste eşleştirmesi için rıza penceresi (ne gideceği açıkça yazar). */
function listConsent() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    {
      const d = openSheet(`<form class="sheet-form" novalidate>
        <header class="sheet-head"><h2>${t("Yapay zekâ ile eşleştir")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("Kapat")}">${icon.close}</button></header>
        <div class="sheet-body">
          <p class="lead-text">${t("Listedeki dersler ilgi alanlarınla eşleştirilecek.")}</p>
          <label class="consent"><input type="checkbox" name="ok"><span>${t("Listenin metni ve seçtiğim ilgi alanları yapay zekâya (Anthropic) gönderilsin. Derslerim, notlarım ve adım gönderilmez.")}</span></label>
        </div>
        <footer class="sheet-foot">
          <button type="button" class="btn btn-ghost" data-close>${t("Vazgeç")}</button>
          <button type="submit" class="btn btn-primary">${t("Eşleştir")}</button>
        </footer>
      </form>`, (dlg) => {
        const form = dlg.querySelector("form");
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const box = form.elements.namedItem("ok");
          if (!box.checked) { box.setCustomValidity(t("Devam etmek için kutuyu işaretle.")); box.reportValidity(); box.addEventListener("change", () => box.setCustomValidity(""), { once: true }); return; }
          finish(true);
          closeSheet();
        });
      });
      d?.addEventListener?.("close", () => finish(false), { once: true });
    }
  });
}

export function view() {
  const st = store.get();
  const saved = st.settings.interests;
  const open = editing || !saved.length;
  if (open && !draft) draft = new Set(saved);
  return `
    <header class="page-head">
      <h1 class="page-title">${t("Seçmeli Keşfi")}</h1>
      <p class="page-sub">${t("Ekle/Sil (Add/Drop) haftasında seçmelilerine karar vermen için")}</p>
      ${infoNote(t("Bu ekran ne işe yarar?"), t("Ekle/Sil haftasında hangi seçmeliyi tutacağına karar vermene yardım eder: düşündüğün derslerin syllabus'larını yükleyip iş yükünü yan yana karşılaştırırsın, ilgi alanına göre öneri görürsün. Syllabus yüklemek isteğe bağlıdır; dosya cihazında okunur ve saklanmaz. Bu bir öneridir, kayıt değildir; kayıt okulunun kendi sisteminde yapılır."))}
    </header>

    ${candidatesBlock(st.electives)}

    <section class="section">
      <div class="section-head"><h2>${t("Öneriler")}</h2></div>
      ${open ? interestCard(draft) : interestTags(saved)}
      ${suggestBlock(saved)}
    </section>`;
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
  "remove-elective"(el) {
    const e = store.get().electives.find((x) => x.id === el.dataset.id);
    if (!e) return;
    store.deleteElective(e.id);
    toast(t("Aday kaldırıldı"), { label: t("Geri al"), onClick: () => store.saveElective(e) });
  },
};

/** Rıza alınırsa aday dersi yapay zekâ ile yeniden okur ve aynı kaydın üzerine yazar. */
async function readElectiveWithAI(saved, text, reasons, render) {
  const [{ askAIConsent, readWithAI }, { electiveFrom }] = await Promise.all([import("./importer.js"), import("./syllabus-local.js")]);
  if (!(await askAIConsent(reasons))) return;
  toast(t("Yapay zekâ okuyor…"));
  const r = await readWithAI({ text, name: saved.code || saved.name });
  if (!r.result) return toast(t("Yapay zekâ ile okunamadı ({hata}); cihazdaki okuma kaldı.", { hata: r.error }));
  const e = electiveFrom(r.result);
  store.saveElective({ ...e, instructor: e.instructor || saved.instructor, id: saved.id });
  toast(t("{name} yapay zekâ ile güncellendi", { name: e.code || e.name || saved.code || saved.name }));
  render();
}

export const changes = {
  async "elective-list"(el, { render }) {
    const file = el.files?.[0];
    if (!file || matching) return;
    const saved = store.get().settings.interests;
    if (!saved.length) return toast(t("Önce ilgi alanlarını seç."));
    const { extractText, DocError } = await import("./doc-text.js");
    let text;
    try {
      ({ text } = await extractText(file));
    } catch (err) {
      return toast(err instanceof DocError ? err.message : t("Dosya okunamadı. Başka bir dosya dene."));
    }
    if (!(await listConsent())) return;
    matching = true;
    render();
    const r = await postJSON(EL_API, { text, interests: saved.map((k) => INTERESTS[k]), lang: getLang() }, {
      timeout: 70_000,
      errors: { offline: t("internet bağlantısı yok"), timeout: t("eşleştirme çok uzun sürdü"), network: t("sunucuya ulaşılamadı") },
    });
    matching = false;
    if (r.body?.courses) {
      saveSuggestions({ courses: r.body.courses, interests: [...saved] });
      toast(r.body.courses.length ? t("{n} ders ilgi alanına uyuyor", { n: r.body.courses.length }) : t("Bu listede ilgi alanına uyan ders bulunamadı."));
    } else toast(t("Eşleştirilemedi ({hata}).", { hata: r.error }));
    render();
  },
  async "elective-file"(el, { render }) {
    const file = el.files?.[0];
    if (!file || reading) return;
    reading = true;
    render();
    try {
      // Okuyucu yalnızca gerektiğinde yüklenir (Seçmeli ekranı hızlı açılsın)
      const [{ extractText, DocError }, { parseSyllabus, electiveFrom }] = await Promise.all([import("./doc-text.js"), import("./syllabus-local.js")]);
      try {
        const { text } = await extractText(file);
        const parsed = parseSyllabus(text);
        const e = electiveFrom(parsed);
        if (!e.name && !e.code) toast(t("Bu dosyada ders adı ya da kodu bulunamadı."));
        else {
          const saved = store.saveElective(e);
          const { needsHelp, aiAllowed, aiStatus } = await import("./importer.js");
          const reasons = needsHelp(parsed);
          if (saved && reasons.length && aiAllowed() && (await aiStatus()) === "ready") {
            toast(t("{name} adaylara eklendi; okuma eksik olabilir", { name: e.code || e.name }), {
              label: t("Yapay zekâ ile oku"),
              onClick: () => readElectiveWithAI(saved, text, reasons, render),
            });
          } else toast(t("{name} adaylara eklendi", { name: e.code || e.name }));
        }
      } catch (err) {
        toast(err instanceof DocError ? err.message : t("Dosya okunamadı. Başka bir dosya dene."));
        if (!(err instanceof DocError)) console.error(err);
      }
    } finally {
      reading = false;
      render();
    }
  },
};
