/** KPR — Ders ve görev ekleme/düzenleme formları, ders detayı ve not hesaplayıcı (alttan açılan sayfa). */

import { store, COLORS, TASK_TYPES, QUICK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet, toast, armDelete } from "./ui.js";
import { DAYS, todayIdx, todayISO, toMin } from "./dates.js";
import { icon } from "./icons.js";
import { canAsk, enableNotifications } from "./notify.js";

const head = (title) => `<header class="sheet-head">
  <h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button>
</header>`;

const foot = (canDelete) => `<footer class="sheet-foot">
  ${canDelete ? '<button type="button" class="btn btn-danger" data-delete>Sil</button>' : ""}
  <button type="submit" class="btn btn-primary">Kaydet</button>
</footer>`;

/* ------------------------------------------------------------------ */
/* Ortak parçalar (içe aktarma ekranı da kullanıyor)                   */
/* ------------------------------------------------------------------ */

export function sessionRow(s = { day: todayIdx(), start: "09:00", end: "10:50", room: "" }) {
  return `<div class="srow">
    <select data-f="day" aria-label="Gün">
      ${DAYS.map((d, i) => `<option value="${i}" ${i === s.day ? "selected" : ""}>${d}</option>`).join("")}
    </select>
    <input type="time" data-f="start" value="${esc(s.start)}" required aria-label="Başlangıç saati">
    <input type="time" data-f="end" value="${esc(s.end)}" required aria-label="Bitiş saati">
    <button type="button" class="icon-btn sm" data-remove-row aria-label="Bu saati kaldır">${icon.close}</button>
    <input data-f="room" value="${esc(s.room)}" maxlength="40" placeholder="Derslik (isteğe bağlı), ör. B-204" aria-label="Derslik">
  </div>`;
}

export function gradeRow(g = { name: "", weight: "" }) {
  return `<div class="grow">
    <input data-f="name" value="${esc(g.name)}" maxlength="40" placeholder="ör. Vize" aria-label="Bileşen adı" required>
    <label class="pct"><input type="number" data-f="weight" value="${esc(g.weight)}" min="0" max="100" step="any" inputmode="decimal" aria-label="Ağırlık yüzdesi" required><span>%</span></label>
    <button type="button" class="icon-btn sm" data-remove-row aria-label="Bu bileşeni kaldır">${icon.close}</button>
  </div>`;
}

export const swatches = (selected) => `<div class="swatches">
  ${COLORS.map((col, i) => `<label class="swatch">
    <input type="radio" name="color" value="${col}" ${col === selected ? "checked" : ""} aria-label="Renk ${i + 1}">
    <span style="--c:${col}"></span>
  </label>`).join("")}
</div>`;

/** Satır ekle/kaldır davranışını bir kapsayıcıya bağlar. */
export function bindRows(container, addBtn, makeRow) {
  addBtn?.addEventListener("click", () => container.insertAdjacentHTML("beforeend", makeRow(container)));
  container.addEventListener("click", (e) => {
    if (e.target.closest("[data-remove-row]")) e.target.closest(".srow, .grow").remove();
  });
  container.addEventListener("input", (e) => e.target.setCustomValidity?.(""));
}

/** .srow satırlarını okur; bitiş < başlangıç ise hatayı gösterip null döner. */
export function readSessions(container) {
  const out = [];
  for (const row of container.querySelectorAll(".srow")) {
    const get = (f) => row.querySelector(`[data-f="${f}"]`);
    const s = { day: Number(get("day").value), start: get("start").value, end: get("end").value, room: get("room").value };
    if (toMin(s.end) <= toMin(s.start)) {
      get("end").setCustomValidity("Bitiş saati başlangıçtan sonra olmalı.");
      get("end").reportValidity();
      return null;
    }
    out.push(s);
  }
  return out;
}

export function readGrading(container, previous = []) {
  return [...container.querySelectorAll(".grow")].map((row) => {
    const name = row.querySelector('[data-f="name"]').value.trim();
    const weight = Number(row.querySelector('[data-f="weight"]').value);
    const old = previous.find((g) => g.name === name);
    return { name, weight, score: old?.score ?? null };
  });
}

function nextSession(rows) {
  const last = rows.querySelector(".srow:last-child");
  if (!last) return sessionRow();
  return sessionRow({
    day: (Number(last.querySelector('[data-f="day"]').value) + 2) % 7,
    start: last.querySelector('[data-f="start"]').value || "09:00",
    end: last.querySelector('[data-f="end"]').value || "10:50",
    room: last.querySelector('[data-f="room"]').value,
  });
}

/* ------------------------------------------------------------------ */
/* Ders formu                                                          */
/* ------------------------------------------------------------------ */

export function openCourseForm(course = null) {
  const c = course || {
    name: "", code: "", instructor: "", email: "", office: "", officeHours: "",
    color: COLORS[store.get().courses.length % COLORS.length],
    sessions: [], grading: [], credit: null, attendPct: null, absLimit: null,
  };
  const optNum = (v) => (v === null || v === undefined ? "" : v);

  openSheet(
    `<form class="sheet-form">
      ${head(course ? "Dersi düzenle" : "Yeni ders")}
      <div class="sheet-body">
        <label class="field"><span>Ders adı</span>
          <input name="name" value="${esc(c.name)}" required maxlength="80" placeholder="ör. Diferansiyel Denklemler" ${course ? "" : "autofocus"}>
        </label>
        <div class="row2">
          <label class="field"><span>Ders kodu</span>
            <input name="code" value="${esc(c.code)}" maxlength="20" placeholder="MAT 204">
          </label>
          <label class="field"><span>Hoca</span>
            <input name="instructor" value="${esc(c.instructor)}" maxlength="60" placeholder="Dr. …">
          </label>
        </div>
        <fieldset class="field"><legend>Renk</legend>${swatches(c.color)}</fieldset>
        <fieldset class="field"><legend>Haftalık ders saatleri</legend>
          <div class="srows" data-rows="sessions">${c.sessions.map(sessionRow).join("")}</div>
          <button type="button" class="btn btn-ghost" data-add="sessions">${icon.plus}Saat ekle</button>
        </fieldset>
        <details class="more" ${c.credit !== null || c.attendPct !== null || c.absLimit !== null ? "open" : ""}>
          <summary>Kredi ve devam şartı</summary>
          <div class="more-body">
            <div class="row2">
              <label class="field"><span>Kredi <span class="hint">(ulusal, GNO için)</span></span>
                <input name="credit" type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${optNum(c.credit)}" placeholder="ör. 3">
              </label>
              <label class="field"><span>Devam zorunluluğu</span>
                <span class="pct"><input name="attendPct" type="number" min="0" max="100" step="1" inputmode="numeric" value="${optNum(c.attendPct)}" placeholder="ör. 70"><span>%</span></span>
              </label>
            </div>
            <label class="field"><span>ya da en fazla kaç derse gelmeyebilirsin? <span class="hint">(syllabus sayı veriyorsa)</span></span>
              <input name="absLimit" type="number" min="0" max="200" step="1" inputmode="numeric" value="${optNum(c.absLimit)}" placeholder="ör. 4">
            </label>
            <p class="fine">Devam oranı syllabus'ta yazar. Şartı sağlamayan öğrenci NA alır ve finale giremez; sağlık raporu devamsızlığı silmez. Hak, dönem ${store.get().settings.termWeeks} hafta kabul edilerek ders oturumu sayısından hesaplanır (Ayarlar'dan değiştirilebilir).</p>
          </div>
        </details>
        <details class="more" ${c.email || c.office || c.officeHours || c.grading.length ? "open" : ""}>
          <summary>Hoca iletişimi ve not dağılımı</summary>
          <div class="more-body">
            <div class="row2">
              <label class="field"><span>E-posta</span>
                <input name="email" type="email" value="${esc(c.email)}" maxlength="80" placeholder="hoca@universite.edu.tr">
              </label>
              <label class="field"><span>Ofis</span>
                <input name="office" value="${esc(c.office)}" maxlength="60" placeholder="ör. A-312">
              </label>
            </div>
            <label class="field"><span>Ofis saatleri</span>
              <input name="officeHours" value="${esc(c.officeHours)}" maxlength="80" placeholder="ör. Salı 14:00–16:00">
            </label>
            <fieldset class="field"><legend>Not dağılımı <span class="hint">(not hesaplayıcı için)</span></legend>
              <div class="srows" data-rows="grading">${c.grading.map(gradeRow).join("")}</div>
              <button type="button" class="btn btn-ghost" data-add="grading">${icon.plus}Bileşen ekle</button>
            </fieldset>
          </div>
        </details>
      </div>
      ${foot(!!course)}
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const sessions = form.querySelector('[data-rows="sessions"]');
      const grading = form.querySelector('[data-rows="grading"]');
      if (!course) sessions.insertAdjacentHTML("beforeend", sessionRow());
      bindRows(sessions, form.querySelector('[data-add="sessions"]'), nextSession);
      bindRows(grading, form.querySelector('[data-add="grading"]'), () => gradeRow());

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const list = readSessions(sessions);
        if (!list) return;
        const fd = new FormData(form);
        store.saveCourse({
          ...course,
          name: fd.get("name"),
          code: fd.get("code"),
          instructor: fd.get("instructor"),
          email: fd.get("email"),
          office: fd.get("office"),
          officeHours: fd.get("officeHours"),
          color: fd.get("color"),
          sessions: list,
          grading: readGrading(grading, course?.grading),
          credit: fd.get("credit") === "" ? null : Number(fd.get("credit")),
          attendPct: fd.get("attendPct") === "" ? null : Number(fd.get("attendPct")),
          absLimit: fd.get("absLimit") === "" ? null : Math.round(Number(fd.get("absLimit"))),
        });
        closeSheet();
        toast(course ? "Ders güncellendi" : "Ders eklendi");
      });

      armDelete(form.querySelector("[data-delete]"), () => {
        store.deleteCourse(course.id);
        closeSheet();
        toast("Ders silindi");
      });
    }
  );
}

/* ------------------------------------------------------------------ */
/* Not hesabı (ders ekranı: ders.js)                                   */
/* ------------------------------------------------------------------ */

/** Girilen notlara göre ağırlıklı ortalama ve hedef için gereken ortalama. */
export function calcGrades(grading, target) {
  const total = grading.reduce((s, g) => s + g.weight, 0);
  const done = grading.filter((g) => g.score !== null);
  const doneWeight = done.reduce((s, g) => s + g.weight, 0);
  const earned = done.reduce((s, g) => s + (g.score * g.weight) / 100, 0);
  const remaining = total - doneWeight;
  return {
    total,
    doneWeight,
    average: doneWeight ? (earned / doneWeight) * 100 : null,
    earned,
    remaining,
    needed: remaining > 0 ? ((target - earned) / remaining) * 100 : null,
  };
}

// Ders ekranı ve devamsızlık kayıtları ders.js'te (v2.11); eski içe aktarmalar bozulmasın diye buradan da verilir
export { openCourseDetail, openAbsences } from "./ders.js";

/* ------------------------------------------------------------------ */
/* Görev formu                                                         */
/* ------------------------------------------------------------------ */

const NOTE_HINT = {
  quiz: "Hoca derste duyurdu… (konular, süre)",
  okuma: "Hangi bölüm, kaç sayfa…",
  lab: "Deney adı, yükleme yeri…",
  sunum: "Grup, süre, konu…",
  kisisel: "Ne yapacaksın…",
};
const noteHint = (type) => NOTE_HINT[type] || "Konular, sınıf, getirilecekler…";

/**
 * Görev formu: üstte tür, altında en fazla 3 alan (ders, tarih + saat, not).
 * Başlık, diğer türler (Sınav/Proje/Diğer; syllabus bunları üretir) ve kaynak "Daha fazla"da.
 * Başlık boş bırakılırsa türden ve dersten üretilir ("Quiz · MCH 2016").
 */
export function openTaskForm(task = null, defaults = {}) {
  const { courses } = store.get();
  const t = task || { title: "", type: "odev", courseId: null, due: todayISO(), time: "", note: "", source: "", ...defaults };
  const quick = QUICK_TYPES.includes(t.type) ? QUICK_TYPES : [t.type, ...QUICK_TYPES];
  const others = Object.keys(TASK_TYPES).filter((k) => !quick.includes(k));
  const chip = (k) => `<div class="seg-item">
      <input type="radio" id="type-${k}" name="type" value="${k}" ${k === t.type ? "checked" : ""}>
      <label for="type-${k}">${TASK_TYPES[k]}</label>
    </div>`;

  openSheet(
    `<form class="sheet-form task-form">
      ${head(task ? "Görevi düzenle" : "Yeni görev")}
      <div class="sheet-body">
        <fieldset class="field"><legend>Tür</legend>
          <div class="type-chips">${quick.map(chip).join("")}</div>
        </fieldset>
        <label class="field"><span>Ders <span class="hint">(isteğe bağlı)</span></span>
          <select name="courseId">
            <option value="">Derse bağlı değil</option>
            ${courses.map((c) => `<option value="${esc(c.id)}" ${c.id === t.courseId ? "selected" : ""}>${esc(c.code ? `${c.code} — ${c.name}` : c.name)}</option>`).join("")}
          </select>
        </label>
        <div class="row2">
          <label class="field"><span>Tarih</span>
            <input type="date" name="due" value="${esc(t.due)}" required>
          </label>
          <label class="field"><span>Saat <span class="hint">(isteğe bağlı)</span></span>
            <input type="time" name="time" value="${esc(t.time)}">
          </label>
        </div>
        <label class="field"><span>Not <span class="hint">(isteğe bağlı)</span></span>
          <textarea name="note" maxlength="500" placeholder="${esc(noteHint(t.type))}">${esc(t.note)}</textarea>
        </label>
        <details class="more-fields" ${task ? "open" : ""}>
          <summary>Daha fazla</summary>
          <label class="field"><span>Başlık <span class="hint">(boşsa türden)</span></span>
            <input name="title" value="${esc(t.title)}" maxlength="120" placeholder="ör. Ödev 2">
          </label>
          <fieldset class="field"><legend>Diğer türler</legend>
            <div class="type-chips">${others.map(chip).join("")}</div>
          </fieldset>
          ${t.source ? `<p class="source-quote"><b>Syllabus'taki kaynağı</b>“${esc(t.source)}”</p>` : ""}
        </details>
      </div>
      ${foot(!!task)}
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      // Tür değişince not ipucu da değişsin (ör. Quiz → "Hoca derste duyurdu…")
      form.addEventListener("change", (e) => {
        if (e.target.name === "type") form.elements.note.placeholder = noteHint(e.target.value);
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const type = fd.get("type") || "odev";
        const course = courses.find((c) => c.id === fd.get("courseId"));
        const title = fd.get("title").trim() || `${TASK_TYPES[type]}${course ? ` · ${course.code || course.name}` : ""}`;
        store.saveTask({
          ...task,
          done: task?.done ?? false,
          title,
          type,
          courseId: fd.get("courseId") || null,
          due: fd.get("due"),
          time: fd.get("time"),
          note: fd.get("note"),
        });
        closeSheet();
        if (!task && (type === "sinav" || type === "quiz") && canAsk()) {
          toast(`${TASK_TYPES[type]} eklendi. Önceden hatırlatayım mı?`, { label: "Evet", onClick: () => enableNotifications() });
        } else {
          toast(task ? "Görev güncellendi" : "Görev eklendi");
        }
      });
      armDelete(form.querySelector("[data-delete]"), () => {
        store.deleteTask(task.id);
        closeSheet();
        toast("Görev silindi");
      });
    }
  );
}
