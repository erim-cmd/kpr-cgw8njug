/**
 * KPR — Syllabus'tan içe aktarma
 * 1) Dosya seç (PDF / Word / metin)  →  2) Cihazda okunur: doc-text.js metni çıkarır,
 *    syllabus-local.js alanlara ayırır (internet gerekmez, dosya cihazdan çıkmaz)
 * 3) Öğrenci sonucu kontrol eder, düzeltir  →  4) Ders + görevler tek seferde kaydedilir
 * Yapay zekâ ile okuma (functions/api/syllabus.js): sunucu hazırsa seçenek olarak görünür,
 * açık rıza kutusu işaretlenirse dosya okunmak üzere gönderilir. Çıktı şekli cihaz içi okuyucuyla
 * aynı. Yapay zekâ okuyamazsa (sunucu yok, sınır doldu, zaman aşımı…) cihaz içi okuyucuya düşülür.
 */

import { store, COLORS, TASK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { flagItem, sortFlags } from "./components.js";
import { sessionRow, gradeRow, swatches, bindRows, readSessions, readGrading, openCourseForm } from "./forms.js";
import { mergeIntoCourse } from "./course-merge.js";
import { extractText, DocError } from "./doc-text.js";
import { parseSyllabus } from "./syllabus-local.js";
import { t, localize } from "./i18n.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/* ------------------------------------------------------------------ */
/* Yapay zekâ ile okuma (isteğe bağlı)                                 */
/* ------------------------------------------------------------------ */

const API = "api/syllabus"; // göreli: sitenin bulunduğu klasöre göre
const AI_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]); // sunucunun kabul ettikleri
const AI_MAX_BYTES = 4 * 1024 * 1024;
let apiState = null; // "ready" | "off" | "none"

/**
 * Sunucu var mı, yapılandırılmış mı? GET /api/syllabus sorar: fonksiyon Claude'u çağırmadan ve
 * günlük sayacı artırmadan 200 + { ready } döner. Yanıtta hata kodu olmadığı için konsola hata düşmez.
 * GitHub Pages'te hiç sorulmaz (statik; sunucu yok) → "none".
 */
/**
 * Uyuyan yol kapalı mı? Yapay zekâ ile okuma ancak ayarlarda AÇIKÇA açılmışsa (settings.aiReading === true)
 * denenir. Kapalıyken sunucu hiç sorulmaz (ağ isteği yok), seçenek görünmez, dosya gönderilmez —
 * sunucu yapılandırılmış olsa bile. Syllabus her zaman cihaz içinde okunur. test/ai-gate.mjs
 */
export const aiAllowed = (settings = store.get().settings) => settings?.aiReading === true;

export async function aiStatus() {
  if (!aiAllowed()) return "off";
  if (apiState) return apiState;
  // GitHub Pages yalnızca statik dosya sunar: sunucu yok. Yoklama orada 405 döner ve
  // tarayıcı konsoluna kırmızı hata yazar; hiç sormadan "none" say.
  if (/\.github\.io$/i.test(location.hostname)) return (apiState = "none");
  if (!navigator.onLine) return "none";
  try {
    // GET /api/syllabus her zaman 200 + { ready } döner (Claude çağrılmaz, sayaç artmaz).
    // JSON gelmezse (statik barındırma) sunucu yok demektir.
    const res = await fetch(API, { cache: "no-store" });
    const body = (res.headers.get("content-type") || "").includes("json") ? await res.json().catch(() => null) : null;
    apiState = !body || typeof body.ready !== "boolean" ? "none" : body.ready ? "ready" : "off";
  } catch {
    apiState = "none";
  }
  return apiState;
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const mediaTypeOf = (file) =>
  file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "");

/** Yapay zekâ ile okur. Başarısızsa { error } döner (asla fırlatmaz), çağıran cihaz içine düşer. */
export async function readWithAI(file) {
  if (!aiAllowed()) return { error: "off" }; // ayar kapalı: dosya hiçbir yere gitmez
  const mediaType = mediaTypeOf(file);
  if (!AI_TYPES.has(mediaType)) return { error: t("Word ve metin dosyaları yapay zekâya gönderilmiyor") };
  if (file.size > AI_MAX_BYTES) return { error: t("dosya 4 MB'tan büyük") };
  if (!navigator.onLine) return { error: t("internet bağlantısı yok") };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 80_000);
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: await blobToBase64(file), mediaType, fileName: file.name }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.result) return { result: body.result };
    return { error: body.error || t("sunucu {kod} döndü", { kod: res.status }) };
  } catch (err) {
    return { error: err.name === "AbortError" ? t("okuma çok uzun sürdü") : t("sunucuya ulaşılamadı") };
  } finally {
    clearTimeout(timer);
  }
}

const head = (title) => `<header class="sheet-head">
  <h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button>
</header>`;

/* ------------------------------------------------------------------ */
/* 1) Dosya seçme ekranı                                               */
/* ------------------------------------------------------------------ */

// Ders düzenleme formundaki "Yeni syllabus'u yükle": okunan syllabus bu derse BİRLEŞTİRİLİR
let target = null;

/** into: var olan dersin id'si → okununca tam kontrol ekranı yerine sadece eksikleri ekleyen onay. */
export function openImport({ into = null } = {}) {
  target = into;
  openSheet(
    `<form class="sheet-form" data-step="pick">
      ${head(t("Syllabus'tan ekle"))}
      <div class="sheet-body">
        <p class="lead-text">${t("Dersin syllabus'unu (izlence) yükle. Köprü ders bilgilerini, ders saatlerini, vize-final ve ödev tarihlerini, not dağılımını, devam şartını ve dikkat edilecek kuralları bulsun. Kaydetmeden önce her şeyi kontrol edebilirsin.")}</p>
        <label class="drop" data-drop>
          <input type="file" name="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain" required class="visually-hidden">
          <span class="drop-icon">${icon.upload}</span>
          <strong data-file-label>${t("Dosya seç")}</strong>
          <small>${t("PDF, Word (.docx) ya da metin")}</small>
        </label>
        <p class="fine" data-local-note>${t("Dosyan cihazında okunur, hiçbir yere gönderilmez. İnternet olmadan da çalışır.")}</p>
        <label class="consent" data-ai hidden>
          <input type="checkbox" name="ai">
          <span><b>${t("Yapay zekâ ile oku (daha doğru).")}</b> ${t("{link} okudum; PDF ya da fotoğrafımın, okunması için yurt dışındaki yapay zekâ hizmetine (Anthropic) aktarılmasına açık rıza veriyorum. Dosya saklanmaz. Günde 5 okuma hakkın var; olmazsa cihazında okunur.", { link: `<a href="gizlilik.html" target="_blank" rel="noopener">${t("Aydınlatma metnini")}</a>` })}</span>
        </label>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-manual>${t("Elle ekle")}</button>
        <button type="submit" class="btn btn-primary">${t("Oku")}</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const input = form.elements.namedItem("file");
      const label = form.querySelector("[data-file-label]");
      const drop = form.querySelector("[data-drop]");

      input.addEventListener("change", () => {
        const f = input.files[0];
        label.textContent = f ? f.name : t("Dosya seç");
        drop.classList.toggle("has-file", !!f);
      });
      ["dragover", "dragenter"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })
      );
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event("change"));
        }
      });

      form.querySelector("[data-manual]").addEventListener("click", () => openCourseForm());
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const ai = form.elements.namedItem("ai");
        run(input.files[0], { ai: !!ai && !ai.closest("[hidden]") && ai.checked });
      });

      // Yalnız ayar açıksa ve sunucu hazırsa yapay zekâ seçeneğini göster (yoksa sunucu sorulmaz, ekran değişmez)
      if (aiAllowed()) {
        aiStatus().then((st) => {
          if (st === "ready") form.querySelector("[data-ai]").hidden = false;
        });
      }
    }
  );
}

/* ------------------------------------------------------------------ */
/* 2) Okuma                                                            */
/* ------------------------------------------------------------------ */

const STEPS = localize(
  ["Dosya açılıyor", "Ders bilgileri okunuyor", "Tarihler ve not dağılımı çıkarılıyor", "Kurallar bulunuyor"],
  ["Opening the file", "Reading course details", "Pulling out dates and the grade breakdown", "Finding rules"]
);

function showProgress(ai = false) {
  const d = openSheet(`<div class="sheet-form">
    <header class="sheet-head"><h2>${t("Syllabus okunuyor")}</h2></header>
    <div class="sheet-body">
      <div class="reading" role="status" aria-live="polite">
        <div class="reading-orb"><img class="brand-mark" src="logo-mark.svg" alt="" width="32" height="32"></div>
        <ol class="steps">${STEPS.map((s, i) => `<li data-s="${i}">${s}</li>`).join("")}</ol>
        <p class="fine">${ai ? t("Yapay zekâ ile okuma genelde 10–40 saniye sürer. Pencereyi kapatma.") : t("Birkaç saniye sürer.")}</p>
      </div>
    </div>
  </div>`);
  // Kapatılamasın: okuma bitene kadar arka plana tıklama/Esc devre dışı
  d.onclick = null;
  const blockEsc = (e) => e.preventDefault();
  d.addEventListener("cancel", blockEsc);

  let i = 0;
  const mark = () =>
    d.querySelectorAll("[data-s]").forEach((li, k) => {
      li.classList.toggle("done", k < i);
      li.classList.toggle("active", k === i);
    });
  mark();
  const timer = setInterval(() => { if (i < STEPS.length - 1) { i++; mark(); } }, ai ? 7000 : 120);
  return () => { clearInterval(timer); d.removeEventListener("cancel", blockEsc); };
}

function showError(message, file) {
  openSheet(`<div class="sheet-form">
    ${head(t("Okunamadı"))}
    <div class="sheet-body"><p class="error-box">${esc(message)}</p></div>
    <footer class="sheet-foot">
      <button type="button" class="btn btn-ghost" data-manual>${t("Elle ekle")}</button>
      ${file ? `<button type="button" class="btn btn-primary" data-retry>${t("Tekrar dene")}</button>` : `<button type="button" class="btn btn-primary" data-back>${t("Başka dosya seç")}</button>`}
    </footer>
  </div>`, (d) => {
    d.querySelector("[data-manual]").addEventListener("click", () => openCourseForm());
    d.querySelector("[data-retry]")?.addEventListener("click", () => run(file));
    d.querySelector("[data-back]")?.addEventListener("click", () => openImport());
  });
}

async function run(file, { ai = false } = {}) {
  if (!file) return;
  ai = ai && aiAllowed();
  const stop = showProgress(ai);
  try {
    // 1) Rıza verildiyse yapay zekâ; olmazsa sebebiyle birlikte cihaz içine düş
    let aiError = "";
    if (ai) {
      const r = await readWithAI(file);
      if (r.result) {
        stop();
        if (target) openMerge(r.result);
        else openReview(r.result, { reader: "ai" });
        return;
      }
      aiError = r.error;
    }
    // 2) Cihaz içi okuma
    const { text } = await extractText(file);
    const result = parseSyllabus(text);
    // İlerleme ekranı bir an görünsün (çok hızlı biter)
    await new Promise((r) => setTimeout(r, 400));
    stop();
    if (target) openMerge(result);
    else openReview(result, { reader: "local", aiError });
  } catch (err) {
    stop();
    showError(err instanceof DocError ? err.message : t("Dosya okunamadı. Başka bir dosya dene ya da dersi elle ekle."));
    if (!(err instanceof DocError)) console.error(err);
  }
}

/* ------------------------------------------------------------------ */
/* 3) Kontrol et ve kaydet                                             */
/* ------------------------------------------------------------------ */

/** Dönem başlangıcı ayarlıysa "N. hafta" → o haftanın pazartesisi (tahmini, işaretsiz gelir). */
function weekDate(week) {
  const start = store.get().settings.termStart;
  if (!week || !DATE.test(start)) return "";
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (week - 1) * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function itemRow(it, i) {
  const guess = !DATE.test(it.date) ? weekDate(it.week) : "";
  const hasDate = DATE.test(it.date);
  const hint = hasDate ? "" : guess ? t("Tarih yazmıyor; {n}. haftanın başı olarak dolduruldu. Doğruysa işaretle.", { n: it.week }) : it.week ? t("Tarih yazmıyor ({n}. hafta). Tarihi girersen eklenir.", { n: it.week }) : t("Tarih bulunamadı. Tarihi girersen eklenir.");
  return `<li class="irow ${hasDate ? "" : "no-date"}">
    <label class="irow-check"><input type="checkbox" data-f="on" ${hasDate ? "checked" : ""} aria-label="${t("Bu tarihi ekle")}"></label>
    <div class="irow-body">
      <div class="irow-top">
        <select data-f="type" aria-label="${t("Tür")}">${Object.entries(TASK_TYPES).map(([k, l]) => `<option value="${k}" ${k === it.type ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input data-f="title" value="${esc(it.title)}" maxlength="120" aria-label="${t("Başlık")}">
      </div>
      <div class="irow-when">
        <input type="date" data-f="due" value="${hasDate ? esc(it.date) : guess}" aria-label="${t("Tarih")}">
        <input type="time" data-f="time" value="${TIME.test(it.time) ? esc(it.time) : ""}" aria-label="${t("Saat")}">
      </div>
      ${hint ? `<small class="irow-hint">${hint}</small>` : ""}
      ${it.source ? `<small class="irow-src">“${esc(it.source)}”</small>` : ""}
      <input type="hidden" data-f="source" value="${esc(it.source)}">
    </div>
  </li>`;
}

/** Haftalık konular: kapalı gelir, açınca her hafta düzeltilebilir (boş bırakılan hafta kaydedilmez). */
function weeksBlock(weeks) {
  if (!weeks.length) return "";
  return `<details class="wk-edit">
    <summary class="mini-title">${t("Haftalık konular ({n})", { n: weeks.length })}</summary>
    <ul class="wrows">${weeks.map((w) => `<li class="wrow" data-n="${w.n}" data-date="${esc(w.date || "")}" data-note="${esc(w.note || "")}">
      <span class="wrow-n">${t("H{n}", { n: w.n })}</span>
      <input data-f="topic" value="${esc(w.topic)}" maxlength="200" aria-label="${t("{n}. hafta konusu", { n: w.n })}">
    </li>`).join("")}</ul>
  </details>`;
}

function readWeeks(form) {
  return [...form.querySelectorAll(".wrow")]
    .map((row) => ({
      n: Number(row.dataset.n),
      date: row.dataset.date || null,
      topic: row.querySelector('[data-f="topic"]').value.trim(),
      note: row.dataset.note || null,
    }))
    .filter((w) => w.topic);
}

/** Var olan derse ekleme: neyin ekleneceğini göster, öğrencinin girdileri ezilmez (course-merge.js). */
function openMerge(r) {
  const course = store.get().courses.find((c) => c.id === target);
  if (!course) return openReview(r, {});
  const { course: merged, added } = mergeIntoCourse(course, r);
  const weeks = r.weeks || [];
  openSheet(
    `<div class="sheet-form">
      ${head(`${esc(course.code || course.name)} · syllabus`)}
      <div class="sheet-body">
        ${added.length
          ? `<p class="lead-text">${t("Bu derse eklenecekler:")}</p><ul class="kv">${added.map((a) => `<li><b>${esc(a)}</b><span>${t("eklenecek")}</span></li>`).join("")}</ul>`
          : `<p class="lead-text">${t("Bu syllabus derse yeni bir bilgi eklemiyor.")}</p>`}
        ${!weeks.length ? `<p class="calc-note">${t("Haftalık plan bu dosyada okunamadı (tablo PDF'te dağılmış olabilir). Word (.docx) sürümü varsa onu dene.")}</p>` : ""}
        <p class="fine">${t("Notların, devamsızlıkların ve düzelttiğin bilgiler değişmez; sadece boş olanlar dolar.")}</p>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-close>${t("Vazgeç")}</button>
        ${added.length ? `<button type="button" class="btn btn-primary" data-merge>${t("Ekle")}</button>` : ""}
      </footer>
    </div>`,
    (d) => {
      d.querySelector("[data-merge]")?.addEventListener("click", () => {
        store.saveCourse(merged);
        closeSheet();
        const name = course.code || course.name;
        toast(added.length > 1 ? t("{ders}: {alan} ve {n} alan daha eklendi", { ders: name, alan: added[0], n: added.length - 1 }) : t("{ders}: {alan} eklendi", { ders: name, alan: added[0] }));
      });
    }
  );
}

function openReview(r, { reader = "local", aiError = "" } = {}) {
  const { courses } = store.get();
  const code = (r.course.code || "").trim().toLowerCase();
  const existing = code ? courses.find((c) => c.code.trim().toLowerCase() === code) : null;
  const color = existing?.color || COLORS[courses.length % COLORS.length];
  const sessions = r.sessions.filter((s) => TIME.test(s.start) && TIME.test(s.end));
  const att = r.attendance || { percent: null, max_absences: null, source: "" };
  r.warnings = r.warnings || [];
  const found = [
    sessions.length && t("{n} ders saati", { n: sessions.length }),
    r.items.length && t("{n} tarih", { n: r.items.length }),
    r.grading.length && t("{n} not bileşeni", { n: r.grading.length }),
    (r.policies || []).length && t("{n} kural", { n: r.policies.length }),
  ].filter(Boolean).join(", ");

  openSheet(
    `<form class="sheet-form" novalidate>
      ${head(t("Kontrol et ve kaydet"))}
      <div class="sheet-body">
        <p class="lead-text">${found ? t("Köprü {bulunan} buldu. Yanlış bir şey varsa düzelt, sonra kaydet.", { bulunan: `<b>${found}</b>` }) : t("Köprü bu dosyada tarih veya saat bulamadı. Yanlış bir şey varsa düzelt, sonra kaydet.")}</p>
        <p class="fine reader-note" data-reader="${reader}">${reader === "ai" ? t("Yapay zekâ ile okundu.") : aiError ? t("Yapay zekâ ile okunamadı ({hata}); dosya cihazında okundu.", { hata: esc(aiError) }) : t("Cihazında okundu.")}</p>
        ${existing ? `<p class="info-box">${t("{ders} dersin zaten kayıtlı. Kaydedince bu dersin bilgileri güncellenir, yeni tarihler eklenir.", { ders: esc(existing.name) })}</p>` : ""}
        ${r.warnings.length ? `<ul class="warn-box">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}

        <h3 class="mini-title">${t("Ders")}</h3>
        <label class="field"><span>${t("Ders adı")}</span><input name="name" value="${esc(r.course.name)}" required maxlength="80"></label>
        <div class="row2">
          <label class="field"><span>${t("Ders kodu")}</span><input name="code" value="${esc(r.course.code)}" maxlength="20"></label>
          <label class="field"><span>${t("Hoca")}</span><input name="instructor" value="${esc(r.course.instructor)}" maxlength="60"></label>
        </div>
        <div class="row2">
          <label class="field"><span>${t("E-posta")}</span><input name="email" value="${esc(r.course.email)}" maxlength="80"></label>
          <label class="field"><span>${t("Ofis")}</span><input name="office" value="${esc(r.course.office)}" maxlength="60"></label>
        </div>
        <label class="field"><span>${t("Ofis saatleri")}</span><input name="officeHours" value="${esc(r.course.office_hours)}" maxlength="80"></label>
        <div class="row2">
          <label class="field"><span>${t("Kredi")} <span class="hint">${t("(GNO için)")}</span></span><input name="credit" type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${r.course.credit ?? existing?.credit ?? ""}"></label>
          <label class="field"><span>${t("AKTS")}</span><input name="ects" type="number" min="0" max="60" step="0.5" inputmode="decimal" value="${r.course.ects ?? existing?.ects ?? ""}"></label>
        </div>
        <fieldset class="field"><legend>${t("Renk")}</legend>${swatches(color)}</fieldset>

        <h3 class="mini-title">${t("Haftalık ders saatleri")}</h3>
        <div class="srows" data-rows="sessions">${sessions.map(sessionRow).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="sessions">${icon.plus}${t("Saat ekle")}</button>

        <h3 class="mini-title">${t("Sınav ve ödev tarihleri")}</h3>
        ${r.items.length ? `<ul class="irows">${r.items.map(itemRow).join("")}</ul>` : `<p class="calc-note">${t("Tarih bulunamadı. Kaydettikten sonra elle ekleyebilirsin.")}</p>`}

        ${weeksBlock(r.weeks || [])}

        <h3 class="mini-title">${t("Devam şartı")}</h3>
        <div class="row2">
          <label class="field"><span>${t("Devam zorunluluğu")}</span>
            <span class="pct"><input name="attendPct" type="number" min="0" max="100" step="1" inputmode="numeric" value="${att.percent ?? existing?.attendPct ?? ""}" placeholder="${t("ör. 70")}"><span>%</span></span></label>
          <label class="field"><span>${t("ya da en fazla devamsızlık")}</span>
            <input name="absLimit" type="number" min="0" max="200" step="1" inputmode="numeric" value="${att.max_absences ?? existing?.absLimit ?? ""}" placeholder="${t("ders sayısı")}"></label>
        </div>
        ${att.source ? `<small class="irow-src">“${esc(att.source)}”</small>` : `<p class="calc-note">${t("Syllabus'ta devam şartı bulunamadı. Biliyorsan gir; devamsızlık takibi buna göre çalışır.")}</p>`}

        ${(r.policies || []).length ? `<h3 class="mini-title">${t("Dikkat edilecek kurallar")}</h3>
        <ul class="flags">${sortFlags(r.policies).map((p) => flagItem(p)).join("")}</ul>
        <p class="calc-note">${t("Bunlar ders sayfasının en üstünde görünecek.")}</p>` : ""}

        <h3 class="mini-title">${t("Not dağılımı")}</h3>
        <div class="srows" data-rows="grading">${r.grading.map(gradeRow).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="grading">${icon.plus}${t("Bileşen ekle")}</button>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-close>${t("Vazgeç")}</button>
        <button type="submit" class="btn btn-primary">${t("Kaydet")}</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const sessionsBox = form.querySelector('[data-rows="sessions"]');
      const gradingBox = form.querySelector('[data-rows="grading"]');
      bindRows(sessionsBox, form.querySelector('[data-add="sessions"]'), () => sessionRow());
      bindRows(gradingBox, form.querySelector('[data-add="grading"]'), () => gradeRow());

      // Tarih girilince o satır otomatik işaretlensin
      form.querySelectorAll(".irow").forEach((row) => {
        const due = row.querySelector('[data-f="due"]');
        const on = row.querySelector('[data-f="on"]');
        due.addEventListener("input", () => { if (due.value) on.checked = true; due.setCustomValidity(""); });
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const nameInput = form.elements.namedItem("name");
        if (!nameInput.value.trim()) {
          nameInput.setCustomValidity(t("Ders adı gerekli."));
          nameInput.reportValidity();
          nameInput.addEventListener("input", () => nameInput.setCustomValidity(""), { once: true });
          return;
        }
        const list = readSessions(sessionsBox);
        if (!list) return;

        const tasks = [];
        for (const row of form.querySelectorAll(".irow")) {
          const get = (f) => row.querySelector(`[data-f="${f}"]`);
          if (!get("on").checked) continue;
          if (!get("due").value) {
            get("due").setCustomValidity(t("Eklemek için tarih gir ya da işareti kaldır."));
            get("due").reportValidity();
            return;
          }
          tasks.push({ type: get("type").value, title: get("title").value, due: get("due").value, time: get("time").value, source: get("source").value, done: false });
        }

        const fd = new FormData(form);
        const res = store.importCourse(
          {
            ...existing,
            name: fd.get("name"),
            code: fd.get("code"),
            instructor: fd.get("instructor"),
            email: fd.get("email"),
            office: fd.get("office"),
            officeHours: fd.get("officeHours"),
            color: fd.get("color"),
            sessions: list.length ? list : existing?.sessions ?? [],
            grading: readGrading(gradingBox, existing?.grading),
            credit: numOrNull(fd.get("credit")),
            ects: numOrNull(fd.get("ects")),
            attendPct: numOrNull(fd.get("attendPct")),
            absLimit: fd.get("absLimit") === "" ? null : Math.round(Number(fd.get("absLimit"))),
            policies: (r.policies || []).length ? r.policies : existing?.policies ?? [],
            weeks: (r.weeks || []).length ? readWeeks(form) : existing?.weeks ?? [],
            finalMin: r.final_min ?? existing?.finalMin ?? null,
          },
          tasks
        );
        closeSheet();
        if (!res) return toast(t("Kaydedilemedi"));
        // Ders artık Dönem → Ortalama bölümündeki tabloda (UMIS görünümü)
        toast(t("{ders} eklendi · {n} tarih", { ders: res.course.code || res.course.name, n: res.count }), { label: t("Tabloda gör"), onClick: () => (location.hash = "#/ortalama") });
      });
    }
  );
}
