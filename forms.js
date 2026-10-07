/** KPR — Ders ve görev ekleme/düzenleme formları, ders detayı ve not hesaplayıcı (alttan açılan sayfa). */

import { store, COLORS, TASK_TYPES, QUICK_TYPES, QUICK_LABEL } from "./store.js";
import { esc, openSheet, closeSheet, toast, armDelete } from "./ui.js";
import { DAYS, todayIdx, todayISO, toMin, toISO, fmtShort } from "./dates.js";
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

// Not hesabı ders-calc.js'te (DOM'suz; Asistan ve testler de kullanıyor)
export { calcGrades } from "./ders-calc.js";

// Ders ekranı ve devamsızlık kayıtları ders.js'te (v2.11); eski içe aktarmalar bozulmasın diye buradan da verilir
export { openCourseDetail, openAbsences } from "./ders.js";

/* ------------------------------------------------------------------ */
/* Görev formu                                                         */
/* ------------------------------------------------------------------ */

const NOTE_HINT = {
  quiz: "Hoca derste duyurdu… (konular, süre)",
  lab: "Deney adı, yükleme yeri…",
  sunum: "Grup, süre, konu…",
  kisisel: "Ne yapacaksın…",
};
const noteHint = (type) => NOTE_HINT[type] || "Not ekle (isteğe bağlı)";

/** Tarih çipleri: Bugün, Yarın ve bu haftanın kalan günleri (pazara kadar). */
function dateChips() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    const iso = toISO(d);
    const label = i === 0 ? "Bugün" : i === 1 ? "Yarın" : DAYS[(d.getDay() + 6) % 7];
    out.push({ iso, label });
    if (i >= 1 && d.getDay() === 0) break; // pazar: hafta bitti
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const radio = (name, value, label, checked, extra = "") => `<label class="pchip">
    <input type="radio" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""} ${extra}><span>${esc(label)}</span></label>`;

/**
 * Görev formu, hepsi ilk ekranda: tür (tek satır) → Başlık → Ders → Tarih → Not; Kaydet altta yapışık.
 * Elle sadece ödev/quiz/lab/sunum/kişisel eklenir; sınav/proje/diğer syllabus'tan gelir ve
 * düzenlenirken türü değişmez (etiket olarak görünür). Başlık boşsa "Quiz · MCH 2016" gibi önerilen kullanılır.
 */
export function openTaskForm(task = null, defaults = {}) {
  const { courses } = store.get();
  const t = task || { title: "", type: "odev", courseId: null, due: todayISO(), time: "", note: "", source: "", ...defaults };
  const fixedType = !QUICK_TYPES.includes(t.type);
  const chips = dateChips();
  const onChip = chips.some((c) => c.iso === t.due);
  const suggest = (type, courseId) => {
    const c = courses.find((x) => x.id === courseId);
    return `${TASK_TYPES[type]}${c ? ` · ${c.code || c.name}` : ""}`;
  };
  // Yer tutucu dolu bir değer gibi görünmesin: ne olduğunu ve boş kalırsa ne yazılacağını söyler
  const hint = (type, courseId) => `Başlık · boş kalırsa ${suggest(type, courseId)}`;

  openSheet(
    `<form class="sheet-form task-form">
      ${head(task ? "Görevi düzenle" : "Yeni görev")}
      <div class="sheet-body">
        ${fixedType
          ? `<p class="fixed-type"><span class="tag tag-${t.type}">${TASK_TYPES[t.type]}</span> <small>syllabus'tan</small></p>
             <input type="hidden" name="type" value="${esc(t.type)}">`
          : `<div class="pchips one-row" role="radiogroup" aria-label="Tür">${QUICK_TYPES.map((k) => radio("type", k, QUICK_LABEL[k], k === t.type)).join("")}</div>`}
        <label class="field title-field"><span class="visually-hidden">Başlık</span>
          <input name="title" value="${esc(t.title)}" maxlength="120" placeholder="${esc(hint(t.type, t.courseId))}" autofocus autocomplete="off" enterkeyhint="done">
        </label>
        <div class="field"><span class="field-label">Ders</span>
          <div class="pchips scroll-row" role="radiogroup" aria-label="Ders">
            ${radio("courseId", "", "Derssiz", !t.courseId)}
            ${courses.map((c) => radio("courseId", c.id, c.code || c.name, c.id === t.courseId)).join("")}
          </div>
        </div>
        <div class="field"><span class="field-label">Tarih</span>
          <div class="pchips scroll-row" role="radiogroup" aria-label="Tarih">
            ${chips.map((c) => radio("dueQuick", c.iso, c.label, c.iso === t.due)).join("")}
            ${radio("dueQuick", "pick", onChip ? "Tarih seç" : fmtShort(t.due), !onChip)}
          </div>
          <input type="date" name="due" value="${esc(t.due)}" class="due-pick" ${onChip ? "hidden" : ""} aria-label="Tarih seç">
          ${t.time ? "" : '<button type="button" class="link time-link" data-time>+ Saat ekle</button>'}
          <input type="time" name="time" value="${esc(t.time)}" class="time-pick" ${t.time ? "" : "hidden"} aria-label="Saat">
        </div>
        <label class="field"><span class="visually-hidden">Not</span>
          <textarea name="note" rows="1" maxlength="500" placeholder="${esc(noteHint(t.type))}" class="grow">${esc(t.note)}</textarea>
        </label>
        ${t.source ? `<p class="source-quote"><b>Syllabus'taki kaynağı</b>“${esc(t.source)}”</p>` : ""}
      </div>
      ${foot(!!task)}
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const due = form.elements.due;
      const grow = (el) => {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      };
      grow(form.elements.note);
      form.elements.note.addEventListener("input", (e) => grow(e.target));
      const refreshHints = () => {
        const type = form.elements.type.value;
        form.elements.note.placeholder = noteHint(type);
        form.elements.title.placeholder = hint(type, form.elements.courseId.value || null);
      };
      form.addEventListener("change", (e) => {
        if (e.target.name === "type" || e.target.name === "courseId") refreshHints();
        if (e.target.name === "dueQuick") {
          const pick = e.target.value === "pick";
          due.hidden = !pick;
          if (pick) {
            due.focus();
            due.showPicker?.();
          } else due.value = e.target.value;
        }
      });
      form.querySelector("[data-time]")?.addEventListener("click", (e) => {
        e.target.remove();
        form.elements.time.hidden = false;
        form.elements.time.focus();
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const type = fd.get("type") || "odev";
        const courseId = fd.get("courseId") || null;
        if (!fd.get("due")) {
          due.hidden = false;
          due.setCustomValidity("Tarih seç.");
          due.reportValidity();
          due.addEventListener("input", () => due.setCustomValidity(""), { once: true });
          return;
        }
        store.saveTask({
          ...task,
          done: task?.done ?? false,
          title: fd.get("title").trim() || suggest(type, courseId),
          type,
          courseId,
          due: fd.get("due"),
          time: fd.get("time"),
          note: fd.get("note"),
        });
        closeSheet();
        if (!task && type === "quiz" && canAsk()) {
          toast("Quiz eklendi. Önceden hatırlatalım mı?", { label: "Evet", onClick: () => enableNotifications() });
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
