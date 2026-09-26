/**
 * KPR — Syllabus'tan içe aktarma
 * 1) Dosya seç (PDF / fotoğraf) + açık rıza  →  2) /api/syllabus yapay zekâ ile okur
 * 3) Öğrenci sonucu kontrol eder, düzeltir  →  4) Ders + görevler tek seferde kaydedilir
 * Dosya sunucuda saklanmaz; sadece okuma süresince işlenir.
 */

import { store, COLORS, TASK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { icon } from "./icons.js";
import { sessionRow, gradeRow, swatches, bindRows, readSessions, readGrading, openCourseForm } from "./forms.js";

const ENDPOINT = "/api/syllabus";
const MAX_BYTES = 4 * 1024 * 1024;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Yapay zekâ bulamadığında 0 döndürür; 0'ı "bulunamadı" sayıyoruz
const credit = (v) => (typeof v === "number" && v > 0 && v <= 60 ? v : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const head = (title) => `<header class="sheet-head">
  <h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button>
</header>`;

/* ------------------------------------------------------------------ */
/* Dosya hazırlama                                                     */
/* ------------------------------------------------------------------ */

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Fotoğrafları küçültüp JPEG'e çevirir: hem hızlı yüklenir hem sınırın altında kalır. */
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob;
}

async function prepareFile(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_BYTES) throw new Error("PDF en fazla 4 MB olabilir. Sadece ilgili sayfaları ayrı bir PDF olarak kaydetmeyi dene.");
    return { data: await blobToBase64(file), mediaType: "application/pdf" };
  }
  if (file.type.startsWith("image/")) {
    let blob;
    try {
      blob = await compressImage(file);
    } catch {
      throw new Error("Bu fotoğraf biçimi açılamadı. JPG veya PNG olarak kaydedip tekrar dene.");
    }
    if (blob.size > MAX_BYTES) throw new Error("Fotoğraf çok büyük. Daha düşük çözünürlükle tekrar dene.");
    return { data: await blobToBase64(blob), mediaType: "image/jpeg" };
  }
  throw new Error("Sadece PDF veya fotoğraf yükleyebilirsin.");
}

/* ------------------------------------------------------------------ */
/* 1) Dosya seçme ekranı                                               */
/* ------------------------------------------------------------------ */

export function openImport() {
  openSheet(
    `<form class="sheet-form" data-step="pick">
      ${head("Syllabus'tan ekle")}
      <div class="sheet-body">
        <p class="lead-text">Dersin syllabus'unu (izlence) yükle. KPR ders saatlerini, vize-final ve ödev tarihlerini, not dağılımını bulsun. Kaydetmeden önce her şeyi kontrol edebilirsin.</p>
        <label class="drop" data-drop>
          <input type="file" name="file" accept="application/pdf,.pdf,image/*" required class="visually-hidden">
          <span class="drop-icon">${icon.upload}</span>
          <strong data-file-label>Dosya seç</strong>
          <small>PDF veya fotoğraf · en fazla 4 MB</small>
        </label>
        <label class="consent">
          <input type="checkbox" name="consent" required>
          <span><a href="/gizlilik" target="_blank" rel="noopener">Aydınlatma metnini</a> okudum. Dosyamın, içeriğinin okunması için yurt dışındaki yapay zekâ hizmetine (Anthropic) aktarılmasına açık rıza veriyorum.</span>
        </label>
        <p class="fine">Dosyan kaydedilmez; sadece okuma süresince işlenir. Kişisel bilgi (öğrenci numarası vb.) içeren sayfaları yüklememeni öneririz. Günde 5 yükleme hakkın var.</p>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-manual>Elle ekle</button>
        <button type="submit" class="btn btn-primary">Oku</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const input = form.elements.namedItem("file");
      const label = form.querySelector("[data-file-label]");
      const drop = form.querySelector("[data-drop]");

      input.addEventListener("change", () => {
        const f = input.files[0];
        label.textContent = f ? f.name : "Dosya seç";
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
        run(input.files[0]);
      });
    }
  );
}

/* ------------------------------------------------------------------ */
/* 2) Okuma                                                            */
/* ------------------------------------------------------------------ */

const STEPS = ["Dosya hazırlanıyor", "Ders bilgileri okunuyor", "Sınav ve ödev tarihleri çıkarılıyor", "Not dağılımı kontrol ediliyor"];

function showProgress() {
  const d = openSheet(`<div class="sheet-form">
    <header class="sheet-head"><h2>Syllabus okunuyor</h2></header>
    <div class="sheet-body">
      <div class="reading" role="status" aria-live="polite">
        <div class="reading-orb"><span class="brand-mark">K</span></div>
        <ol class="steps">${STEPS.map((s, i) => `<li data-s="${i}">${s}</li>`).join("")}</ol>
        <p class="fine">Bu genelde 10–40 saniye sürer. Pencereyi kapatma.</p>
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
  const timer = setInterval(() => { if (i < STEPS.length - 1) { i++; mark(); } }, 7000);
  return () => { clearInterval(timer); d.removeEventListener("cancel", blockEsc); };
}

function showError(message, file) {
  openSheet(`<div class="sheet-form">
    ${head("Okunamadı")}
    <div class="sheet-body"><p class="error-box">${esc(message)}</p></div>
    <footer class="sheet-foot">
      <button type="button" class="btn btn-ghost" data-manual>Elle ekle</button>
      ${file ? '<button type="button" class="btn btn-primary" data-retry>Tekrar dene</button>' : '<button type="button" class="btn btn-primary" data-back>Başka dosya seç</button>'}
    </footer>
  </div>`, (d) => {
    d.querySelector("[data-manual]").addEventListener("click", () => openCourseForm());
    d.querySelector("[data-retry]")?.addEventListener("click", () => run(file));
    d.querySelector("[data-back]")?.addEventListener("click", () => openImport());
  });
}

async function run(file) {
  if (!file) return;
  if (!navigator.onLine) return showError("Syllabus okumak için internet bağlantısı gerekiyor. Uygulamanın geri kalanı internetsiz de çalışır.");

  const stop = showProgress();
  let payload;
  try {
    payload = await prepareFile(file);
  } catch (err) {
    stop();
    return showError(err.message);
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 75_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, fileName: file.name }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    stop();
    if (res.status === 404 || res.status === 405) {
      return showError("Syllabus okuma bu önizleme sürümünde henüz açık değil. Şimdilik dersleri elle ekleyebilirsin.");
    }
    if (!res.ok || !body.result) {
      const retryable = res.status >= 500 || res.status === 504;
      return showError(body.error || "Syllabus okunamadı. Lütfen tekrar dene.", retryable ? file : null);
    }
    openReview(body.result);
  } catch (err) {
    stop();
    showError(err.name === "AbortError" ? "Okuma çok uzun sürdü. Tekrar dene ya da daha kısa bir dosya yükle." : "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.", file);
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/* 3) Kontrol et ve kaydet                                             */
/* ------------------------------------------------------------------ */

function itemRow(it, i) {
  const hasDate = DATE.test(it.date);
  const hint = hasDate ? "" : it.week ? `Tarih yazmıyor (${it.week}. hafta). Tarihi girersen eklenir.` : "Tarih bulunamadı. Tarihi girersen eklenir.";
  return `<li class="irow ${hasDate ? "" : "no-date"}">
    <label class="irow-check"><input type="checkbox" data-f="on" ${hasDate ? "checked" : ""} aria-label="Bu tarihi ekle"></label>
    <div class="irow-body">
      <div class="irow-top">
        <select data-f="type" aria-label="Tür">${Object.entries(TASK_TYPES).map(([k, l]) => `<option value="${k}" ${k === it.type ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input data-f="title" value="${esc(it.title)}" maxlength="120" aria-label="Başlık">
      </div>
      <div class="irow-when">
        <input type="date" data-f="due" value="${hasDate ? esc(it.date) : ""}" aria-label="Tarih">
        <input type="time" data-f="time" value="${TIME.test(it.time) ? esc(it.time) : ""}" aria-label="Saat">
      </div>
      ${hint ? `<small class="irow-hint">${hint}</small>` : ""}
      ${it.source ? `<small class="irow-src">“${esc(it.source)}”</small>` : ""}
      <input type="hidden" data-f="source" value="${esc(it.source)}">
    </div>
  </li>`;
}

function openReview(r) {
  const { courses } = store.get();
  const code = (r.course.code || "").trim().toLowerCase();
  const existing = code ? courses.find((c) => c.code.trim().toLowerCase() === code) : null;
  const color = existing?.color || COLORS[courses.length % COLORS.length];
  const sessions = r.sessions.filter((s) => TIME.test(s.start) && TIME.test(s.end));
  const found = [
    sessions.length && `${sessions.length} ders saati`,
    r.items.length && `${r.items.length} tarih`,
    r.grading.length && `${r.grading.length} not bileşeni`,
  ].filter(Boolean).join(", ");

  openSheet(
    `<form class="sheet-form" novalidate>
      ${head("Kontrol et ve kaydet")}
      <div class="sheet-body">
        <p class="lead-text">KPR ${found ? `<b>${found}</b> buldu` : "bu dosyada tarih veya saat bulamadı"}. Yanlış bir şey varsa düzelt, sonra kaydet.</p>
        ${existing ? `<p class="info-box">${esc(existing.name)} dersin zaten kayıtlı. Kaydedince bu dersin bilgileri güncellenir, yeni tarihler eklenir.</p>` : ""}
        ${r.warnings.length ? `<ul class="warn-box">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}

        <h3 class="mini-title">Ders</h3>
        <label class="field"><span>Ders adı</span><input name="name" value="${esc(r.course.name)}" required maxlength="80"></label>
        <div class="row2">
          <label class="field"><span>Ders kodu</span><input name="code" value="${esc(r.course.code)}" maxlength="20"></label>
          <label class="field"><span>Hoca</span><input name="instructor" value="${esc(r.course.instructor)}" maxlength="60"></label>
        </div>
        <div class="row2">
          <label class="field"><span>E-posta</span><input name="email" value="${esc(r.course.email)}" maxlength="80"></label>
          <label class="field"><span>Ofis</span><input name="office" value="${esc(r.course.office)}" maxlength="60"></label>
        </div>
        <label class="field"><span>Ofis saatleri</span><input name="officeHours" value="${esc(r.course.office_hours)}" maxlength="80"></label>
        <div class="row2">
          <label class="field"><span>AKTS</span><input name="akts" type="number" inputmode="decimal" min="0" max="60" step="0.5" value="${credit(r.course.akts) ?? existing?.akts ?? ""}" placeholder="Bulunamadı"></label>
          <label class="field"><span>Ulusal kredi</span><input name="kredi" type="number" inputmode="decimal" min="0" max="60" step="0.5" value="${credit(r.course.national_credit) ?? existing?.kredi ?? ""}" placeholder="Bulunamadı"></label>
        </div>
        ${r.course.credit_source ? `<small class="irow-src">“${esc(r.course.credit_source)}”</small>` : (credit(r.course.akts) || credit(r.course.national_credit) ? "" : '<small class="irow-hint">Syllabus\'ta AKTS/kredi bulunamadı. Biliyorsan kendin yaz.</small>')}
        <fieldset class="field"><legend>Renk</legend>${swatches(color)}</fieldset>

        <h3 class="mini-title">Haftalık ders saatleri</h3>
        <div class="srows" data-rows="sessions">${sessions.map(sessionRow).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="sessions">${icon.plus}Saat ekle</button>

        <h3 class="mini-title">Sınav ve ödev tarihleri</h3>
        ${r.items.length ? `<ul class="irows">${r.items.map(itemRow).join("")}</ul>` : '<p class="calc-note">Tarih bulunamadı. Kaydettikten sonra elle ekleyebilirsin.</p>'}

        <h3 class="mini-title">Not dağılımı</h3>
        <div class="srows" data-rows="grading">${r.grading.map(gradeRow).join("")}</div>
        <button type="button" class="btn btn-ghost" data-add="grading">${icon.plus}Bileşen ekle</button>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-close>Vazgeç</button>
        <button type="submit" class="btn btn-primary">Kaydet</button>
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
          nameInput.setCustomValidity("Ders adı gerekli.");
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
            get("due").setCustomValidity("Eklemek için tarih gir ya da işareti kaldır.");
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
            akts: fd.get("akts") === "" ? null : Number(fd.get("akts")),
            kredi: fd.get("kredi") === "" ? null : Number(fd.get("kredi")),
          },
          tasks
        );
        closeSheet();
        toast(res ? `${res.course.code || res.course.name} eklendi · ${res.count} tarih` : "Kaydedilemedi");
      });
    }
  );
}
