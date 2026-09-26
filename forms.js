/** KPR — Ders ve görev ekleme/düzenleme formları, ders detayı ve not hesaplayıcı (alttan açılan sayfa). */

import { store, COLORS, TASK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet, toast, armDelete } from "./ui.js";
import { DAYS, todayIdx, todayISO, toMin, daysUntil, fmtShort, relLabel, byDue } from "./dates.js";
import { icon } from "./icons.js";
import { attendance, attendanceText } from "./attendance.js";
import { canAsk, enableNotifications } from "./notify.js";
import { flagItem, sortFlags } from "./components.js";
import { SAMPLE_SCALE, letterFor, neededByLetter, COEF } from "./gpa.js";

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
/* Ders detayı + not hesaplayıcı                                       */
/* ------------------------------------------------------------------ */

const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString("tr-TR");

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

function calcSummary(course) {
  if (!course.grading.length) {
    return `<p class="calc-note">Not dağılımı eklenmemiş. <b>Düzenle</b>'ye dokunup vize, final gibi bileşenleri ve yüzdelerini ekle.</p>`;
  }
  const r = calcGrades(course.grading, course.target);
  const lines = [];
  if (r.average !== null) lines.push(`Şu ana kadarki ortalaman <b>${fmtNum(r.average)}</b> (notların %${fmtNum(r.doneWeight)}'lik kısmı girildi).`);
  if (r.needed === null) {
    lines.push(r.earned >= course.target ? `Dönem sonu notun <b>${fmtNum(r.earned)}</b>. Hedefine ulaştın 🎉` : `Dönem sonu notun <b>${fmtNum(r.earned)}</b>.`);
  } else if (r.needed <= 0) {
    lines.push(`Hedefin olan <b>${fmtNum(course.target)}</b>'a zaten ulaştın 🎉`);
  } else if (r.needed > 100) {
    lines.push(`Kalan bileşenlerden 100 alsan da <b>${fmtNum(course.target)}</b>'a ulaşmak mümkün görünmüyor.`);
  } else {
    lines.push(`<b>${fmtNum(course.target)}</b> ile bitirmek için kalanlardan ortalama <b class="need">${fmtNum(r.needed)}</b> alman gerekiyor.`);
  }
  if (Math.abs(r.total - 100) > 0.01) lines.push(`<span class="warn-text">Ağırlıkların toplamı %${fmtNum(r.total)}, 100 değil. Düzenle'den kontrol et.</span>`);
  return lines.map((l) => `<p>${l}</p>`).join("");
}

/** Final bileşeni: adında final/bütünleme geçen ilk bileşen. */
const finalIndex = (grading) => grading.findIndex((g) => /final|bütünleme|butunleme|yarıyıl sonu/i.test(g.name));

/** Harf tahmini sonucu (sadece metin; girişler ayrı çizilir ki odak bozulmasın). */
function letterResult(c) {
  if (!c.grading.length) return "";
  if (!c.scale.length) return `<p class="calc-note">BAU'da harf eşikleri hocaya göre değişir. Hocanın açıkladığı tabloyu gir ya da örnek tabloyla başlayıp düzelt.</p>`;
  const r = calcGrades(c.grading, c.target);
  const lines = [];
  const fi = finalIndex(c.grading);
  const fin = fi >= 0 ? c.grading[fi] : null;
  const underBar = c.finalMin !== null && fin && fin.score !== null && fin.score < c.finalMin;

  if (r.remaining <= 0.01 && r.doneWeight > 0) {
    const letter = underBar ? "F" : letterFor(r.earned, c.scale);
    lines.push(`<p>Ders puanın <b>${fmtNum(r.earned)}</b> → tahmini harfin <b class="need">${letter}</b>${letter in COEF ? ` (${COEF[letter].toFixed(2)})` : ""}.</p>`);
    if (letter !== c.letter) lines.push(`<p><button type="button" class="btn btn-ghost" data-apply-letter="${letter}">Ortalama tablosuna ${letter} olarak aktar</button></p>`);
    else lines.push(`<p class="fine">Ortalama tablosunda bu ders ${letter} olarak kayıtlı.</p>`);
  } else {
    const rows = neededByLetter(c.scale, r.earned, r.remaining);
    const best = rows.find((x) => x.status !== "no");
    const shown = rows.filter((x) => x.status === "need").slice(0, 5);
    if (!best) lines.push(`<p>Kalanlardan 100 alsan da tablodaki en düşük harfe (${rows[rows.length - 1].letter}) ulaşmak zor görünüyor.</p>`);
    else {
      const ok = rows.find((x) => x.status === "ok");
      if (ok) lines.push(`<p>Şimdiden en az <b>${ok.letter}</b> garanti.</p>`);
      if (shown.length) lines.push(`<ul class="kv need-list">${shown.map((x) => `<li><b>${x.letter}</b><span>kalanlardan ort. <b class="need">${fmtNum(Math.max(0, x.need))}</b></span></li>`).join("")}</ul>`);
      if (rows[0].status === "no") lines.push(`<p class="fine">${rows[0].letter} bu noktadan sonra mümkün görünmüyor.</p>`);
    }
    if (c.finalMin !== null && fin && fin.score === null) lines.push(`<p class="fine">Finalden en az <b>${fmtNum(c.finalMin)}</b> alman şart; altında kalırsan diğer notlardan bağımsız F olabilir.</p>`);
  }
  if (underBar) lines.push(`<p class="warn-text">Final notun (${fmtNum(fin.score)}) barajın (${fmtNum(c.finalMin)}) altında. Bütünlemeye girersen final satırına bütünleme notunu yaz.</p>`);
  return lines.join("");
}

function letterBlock(c) {
  if (!c.grading.length) return "";
  const inputs = c.scale.length
    ? `<div class="scale-grid">${c.scale.map((x, i) => `<label><span>${x.letter}</span>
        <input type="number" min="0" max="100" step="any" inputmode="decimal" data-scale-i="${i}" value="${x.min}" aria-label="${x.letter} için en düşük puan"></label>`).join("")}
        <label><span>Final barajı</span><input type="number" min="0" max="100" step="any" inputmode="decimal" data-final-min value="${c.finalMin ?? ""}" placeholder="yok" aria-label="Final barajı"></label>
      </div>
      <p class="fine gap-t">Kutular o harf için gereken en düşük ders puanı. Hocanın tablosuyla aynı olduğundan emin ol. <button type="button" class="link" data-scale-clear>Tabloyu kaldır</button></p>`
    : `<div class="empty-actions"><button type="button" class="btn btn-ghost" data-scale-sample>Örnek tabloyla başla</button></div>`;
  return `<div data-letter-block>${inputs}<div class="calc-result" data-letter-result aria-live="polite">${letterResult(c)}</div></div>`;
}

/** Ders sayfasının en üstü: syllabus'taki kurallar, kritik olan önce. */
function flagsBlock(c) {
  if (!c.policies.length) return "";
  const shown = sortFlags(c.policies.filter((p) => !p.hidden));
  const hidden = c.policies.length - shown.length;
  return `<section data-flags-block><h3 class="mini-title">Dikkat edilecekler</h3>
    ${shown.length ? `<ul class="flags">${shown.map((p) => flagItem(p, true)).join("")}</ul>` : ""}
    ${hidden ? `<button type="button" class="link gap-t" data-show-policies>Gizlenen ${hidden} kuralı göster</button>` : ""}
  </section>`;
}

function absenceBlock(c) {
  const a = attendance(c, store.get().settings.termWeeks);
  const pct = a.limit ? Math.min(100, (a.used / a.limit) * 100) : a.used ? 100 : 0;
  const list = [...c.absences].sort((x, y) => y.date.localeCompare(x.date));
  const times = [...new Set(c.sessions.map((s) => s.start))].sort();
  return `<div class="abs" data-abs-block>
    <p class="abs-text ${a.level}">${attendanceText(a)}</p>
    ${a.limit !== null ? `<div class="bar ${a.level}" role="img" aria-label="${a.used} / ${a.limit} devamsızlık"><i style="width:${pct}%"></i></div>` : ""}
    ${a.limit === null ? '<p class="calc-note">Devam şartını <b>Düzenle → Kredi ve devam şartı</b>\'ndan gir; kalan hakkını hesaplayayım.</p>' : ""}
    <div class="abs-add">
      <input type="date" data-abs-date value="${todayISO()}" max="${todayISO()}" aria-label="Devamsızlık tarihi">
      ${times.length > 1 ? `<select data-abs-start aria-label="Ders saati">${times.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>` : times.length ? `<input type="hidden" data-abs-start value="${esc(times[0])}">` : ""}
      <button type="button" class="btn btn-ghost" data-add-abs>${icon.plus}Ekle</button>
    </div>
    ${list.length ? `<ul class="kv abs-list">${list.map((x) => `<li><b>${fmtShort(x.date)}${x.start ? ` · ${esc(x.start)}` : ""}</b>
      <button type="button" class="link" data-remove-abs="${esc(x.id)}">Kaldır</button></li>`).join("")}</ul>` : ""}
  </div>`;
}

export function openCourseDetail(courseId) {
  const render = () => {
    const { courses, tasks } = store.get();
    const c = courses.find((x) => x.id === courseId);
    if (!c) return closeSheet();
    const open = tasks.filter((t) => t.courseId === c.id && !t.done).sort(byDue);
    const times = [...c.sessions]
      .sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start))
      .map((s) => `<li><b>${DAYS[s.day]}</b><span>${esc(s.start)}–${esc(s.end)}${s.room ? ` · ${esc(s.room)}` : ""}</span></li>`)
      .join("");
    const info = [
      c.instructor && `<li><b>Hoca</b><span>${esc(c.instructor)}</span></li>`,
      c.email && `<li><b>E-posta</b><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`,
      c.office && `<li><b>Ofis</b><span>${esc(c.office)}</span></li>`,
      c.officeHours && `<li><b>Ofis saatleri</b><span>${esc(c.officeHours)}</span></li>`,
      c.credit !== null && `<li><b>Kredi</b><span>${c.credit.toLocaleString("tr-TR")}</span></li>`,
    ].filter(Boolean).join("");

    return `<div class="sheet-form">
      <header class="sheet-head detail-head" style="--c:${c.color}">
        <div><h2>${esc(c.name)}</h2>${c.code ? `<p class="detail-code">${esc(c.code)}</p>` : ""}</div>
        <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button>
      </header>
      <div class="sheet-body">
        ${flagsBlock(c)}
        ${info ? `<ul class="kv">${info}</ul>` : ""}
        <section><h3 class="mini-title">Haftalık saatler</h3>
          ${times ? `<ul class="kv">${times}</ul>` : '<p class="calc-note">Ders saati eklenmemiş.</p>'}
        </section>
        <section><h3 class="mini-title">Not hesaplayıcı</h3>
          ${c.grading.length ? `<form class="calc" data-calc>
            ${c.grading.map((g, i) => `<label class="calc-row">
              <span>${esc(g.name)} <small>%${fmtNum(g.weight)}</small></span>
              <input type="number" min="0" max="100" step="any" inputmode="decimal" data-i="${i}" value="${g.score ?? ""}" placeholder="—" aria-label="${esc(g.name)} notun">
            </label>`).join("")}
            <label class="calc-row target"><span>Hedef not</span>
              <input type="number" min="0" max="100" step="any" inputmode="decimal" name="target" value="${c.target}" aria-label="Hedef not">
            </label>
          </form>` : ""}
          <div class="calc-result" data-calc-result aria-live="polite">${calcSummary(c)}</div>
        </section>
        ${c.grading.length ? `<section><h3 class="mini-title">Harf tahmini</h3>${letterBlock(c)}</section>` : ""}
        <section><h3 class="mini-title">Devamsızlık</h3>
          ${absenceBlock(c)}
        </section>
        <section><h3 class="mini-title">Açık görevler</h3>
          ${open.length ? `<ul class="kv">${open.map((t) => `<li><b>${esc(t.title)}</b><span>${relLabel(daysUntil(t.due))} · ${fmtShort(t.due)}</span></li>`).join("")}</ul>` : '<p class="calc-note">Bu derse ait açık görev yok.</p>'}
        </section>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-edit>Düzenle</button>
        <button type="button" class="btn btn-primary" data-new-task>${icon.plus}Görev ekle</button>
      </footer>
    </div>`;
  };

  openSheet(render(), (d) => {
    // Dinleyicileri dialog'a değil içeriğe bağla: dialog diğer formlarca da kullanılıyor
    const root = d.firstElementChild;
    root.addEventListener("click", (e) => {
      const course = store.get().courses.find((x) => x.id === courseId);
      if (e.target.closest("[data-edit]")) openCourseForm(course);
      const hide = e.target.closest("[data-hide-policy]");
      if (hide || e.target.closest("[data-show-policies]")) {
        const policies = course.policies.map((p) => (hide ? (p.id === hide.dataset.hidePolicy ? { ...p, hidden: true } : p) : { ...p, hidden: false }));
        const saved = store.saveCourse({ ...course, policies });
        const blk = root.querySelector("[data-flags-block]");
        if (blk) blk.outerHTML = flagsBlock(saved) || "<span data-flags-block hidden></span>";
      }
      if (e.target.closest("[data-scale-sample]")) {
        store.saveCourse({ ...course, scale: SAMPLE_SCALE });
        refreshLetter(true);
      }
      if (e.target.closest("[data-scale-clear]")) {
        store.saveCourse({ ...course, scale: [], finalMin: null });
        refreshLetter(true);
      }
      const apply = e.target.closest("[data-apply-letter]");
      if (apply) {
        store.saveCourse({ ...course, letter: apply.dataset.applyLetter });
        toast(`${course.code || course.name}: ${apply.dataset.applyLetter} olarak Ortalama'ya aktarıldı`);
        refreshLetter(false);
      }
      if (e.target.closest("[data-new-task]")) openTaskForm(null, { courseId });
      const rm = e.target.closest("[data-remove-abs]");
      if (rm) {
        store.removeAbsence(courseId, rm.dataset.removeAbs);
        refreshDetail();
      }
      if (e.target.closest("[data-add-abs]")) {
        const date = root.querySelector("[data-abs-date]").value;
        const start = root.querySelector("[data-abs-start]")?.value || "";
        if (!date) return;
        if (!store.addAbsence(courseId, date, start)) return toast("Bu ders için o gün zaten kayıtlı");
        toast("Devamsızlık kaydedildi");
        refreshDetail();
      }
    });
    // Devamsızlık eklenince/silinince sadece o bölümü yenile (not girişi odağı bozulmasın)
    const refreshDetail = () => {
      const c = store.get().courses.find((x) => x.id === courseId);
      if (c) root.querySelector("[data-abs-block]").outerHTML = absenceBlock(c);
    };
    // Harf bloğu: full=true ise girişler de yeniden çizilir, değilse sadece sonuç
    const refreshLetter = (full) => {
      const c = store.get().courses.find((x) => x.id === courseId);
      const block = root.querySelector("[data-letter-block]");
      if (!c || !block) return;
      if (full) block.outerHTML = letterBlock(c);
      else block.querySelector("[data-letter-result]").innerHTML = letterResult(c);
    };
    // Notlar yazıldıkça kaydet ve sadece sonuç kutusunu güncelle (odak kaybolmasın)
    root.addEventListener("input", (e) => {
      const lb = e.target.closest("[data-letter-block]");
      if (lb) {
        const course = store.get().courses.find((x) => x.id === courseId);
        const v = (el) => (el.value === "" ? null : Math.min(100, Math.max(0, Number(el.value))));
        const scale = course.scale.map((x, i) => ({ ...x, min: v(lb.querySelector(`[data-scale-i="${i}"]`)) ?? x.min }));
        store.saveCourse({ ...course, scale, finalMin: v(lb.querySelector("[data-final-min]")) });
        refreshLetter(false);
        return;
      }
      const form = e.target.closest("[data-calc]");
      if (!form) return;
      const course = store.get().courses.find((x) => x.id === courseId);
      const val = (el) => (el.value === "" ? null : Math.min(100, Math.max(0, Number(el.value))));
      const grading = course.grading.map((g, i) => ({ ...g, score: val(form.querySelector(`[data-i="${i}"]`)) }));
      const target = val(form.elements.namedItem("target")) ?? 50;
      const saved = store.saveCourse({ ...course, grading, target });
      root.querySelector("[data-calc-result]").innerHTML = calcSummary(saved);
      refreshLetter(false);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Görev formu (sınav / ödev / proje)                                  */
/* ------------------------------------------------------------------ */

export function openTaskForm(task = null, defaults = {}) {
  const { courses } = store.get();
  const t = task || { title: "", type: "sinav", courseId: null, due: todayISO(), time: "", note: "", source: "", ...defaults };

  openSheet(
    `<form class="sheet-form">
      ${head(task ? "Görevi düzenle" : "Yeni görev")}
      <div class="sheet-body">
        <fieldset class="field"><legend>Tür</legend>
          <div class="seg in-form">
            ${Object.entries(TASK_TYPES).map(([k, label]) => `<div class="seg-item">
              <input type="radio" id="type-${k}" name="type" value="${k}" ${k === t.type ? "checked" : ""}>
              <label for="type-${k}">${label}</label>
            </div>`).join("")}
          </div>
        </fieldset>
        <label class="field"><span>Başlık</span>
          <input name="title" value="${esc(t.title)}" required maxlength="120" placeholder="ör. Vize sınavı" ${task ? "" : "autofocus"}>
        </label>
        <label class="field"><span>Ders</span>
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
          <textarea name="note" maxlength="500" placeholder="Konular, sınıf, getirilecekler…">${esc(t.note)}</textarea>
        </label>
        ${t.source ? `<p class="source-quote"><b>Syllabus'taki kaynağı</b>“${esc(t.source)}”</p>` : ""}
      </div>
      ${foot(!!task)}
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        store.saveTask({
          ...task,
          done: task?.done ?? false,
          title: fd.get("title"),
          type: fd.get("type"),
          courseId: fd.get("courseId") || null,
          due: fd.get("due"),
          time: fd.get("time"),
          note: fd.get("note"),
        });
        closeSheet();
        if (!task && fd.get("type") === "sinav" && canAsk()) {
          toast("Sınav eklendi. Önceden hatırlatayım mı?", { label: "Evet", onClick: () => enableNotifications() });
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
