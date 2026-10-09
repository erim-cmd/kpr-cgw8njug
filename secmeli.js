/**
 * KPR — "Seçmeli Keşfi": Ekle/Sil (Add/Drop) haftasında seçmeli dersleri değerlendirme.
 *
 *   1. Adaylar: öğrenci düşündüğü seçmelinin syllabus'unu yükler (isteğe bağlı) → cihazda okunur, özeti
 *      (sınav sayısı, devam şartı, not dağılımı, kritik kurallar) yan yana karşılaştırılır. Aday ders değildir:
 *      takvime, görevlere ve GNO'ya girmez. Dosya saklanmaz, yalnızca özet (store → electives).
 *   2. İlgi alanı seçimi (çoklu çip + Tamam); seçimler cihazda, store → settings.interests.
 *   3. Öneriler: eşleştirme gelene kadar küçük "Önizleme" listesi (sahte ders öneri gibi gösterilmez).
 * Yapay zekâ ve ağ isteği yok.
 */

import { store, INTERESTS } from "./store.js";
import { esc, toast } from "./ui.js";
import { icon } from "./icons.js";
import { t, pct, localize } from "./i18n.js";
import { infoNote } from "./components.js";

// Öneri listesi: eşleştirme gelene kadar boş (sahte ders öneri gibi gösterilmez)
const SUGGESTIONS = [];

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
  return `<li class="el-row${preview ? " is-preview" : ""}">
    <b>${esc(c.code)}</b><span>${esc(c.name)}</span><em aria-label="${t("Uyum yüzde {n}", { n: fit })}">${pct(fit)}</em>
  </li>`;
}

/* ------------------------------------------------------------------ */
/* Adaylar                                                             */
/* ------------------------------------------------------------------ */

function candidateCard(e) {
  const g = e.grading.filter((x) => !x.bonus);
  const bonus = e.grading.filter((x) => x.bonus);
  const att = e.attendPct !== null ? t("en az {p} devam", { p: pct(e.attendPct) }) : e.absLimit !== null ? t("en fazla {n} devamsızlık", { n: e.absLimit }) : t("devam şartı yazmıyor");
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
    ${e.finalMin !== null ? `<p class="cand-rule">${t("Final barajı {n}", { n: e.finalMin })}</p>` : ""}
    ${e.rules.filter((r) => !/^Derslerin en az/.test(r) && !/^Finalden en az/.test(r)).map((r) => `<p class="cand-rule">${esc(r)}</p>`).join("")}
  </li>`;
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
      ${SUGGESTIONS.length ? `<ul class="el-rows">${SUGGESTIONS.map((c) => courseCard(c)).join("")}</ul>` : previewList(saved)}
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

export const changes = {
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
        const e = electiveFrom(parseSyllabus(text));
        if (!e.name && !e.code) toast(t("Bu dosyada ders adı ya da kodu bulunamadı."));
        else {
          store.saveElective(e);
          toast(t("{name} adaylara eklendi", { name: e.code || e.name }));
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
