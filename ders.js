/**
 * KPR — Ders ekranı (sheet). Yukarıdan aşağıya; 1–5 kaydırmadan görünür:
 *   1. Başlık: ad, kod · hoca
 *   2. Sıradaki değerlendirme: tür · kalan gün · ağırlık %
 *   3. Bilgi kartı (2 sütun): saat + derslik, kredi/AKTS, e-posta, ofis + ofis saati
 *   4. Dikkat edilecekler: en kritik 2 kural (kaynak cümlesi dokununca), "Tümü (N)"
 *   5. "Bu hafta: H5 · konu" satırı → dokununca tüm haftalık plan; plan yoksa yeniden yükleme çağrısı
 *   6. Değerlendirme: bileşen satırları (ad · ağırlık rozeti · not), dokununca not girişi
 *   7. Hedef harf
 * Altta: "Bilgiler syllabus'tan alındı · Düzenle".
 *
 * Hesap yok: notlar ve hedef harf ders-calc.js, harf listesi gpa.neededByLetter, ağırlık weights.taskWeight.
 */

import { store, TASK_TYPES } from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { DAYS_SHORT, todayISO, toMin, daysUntil, fmtShort, relLabel, byDue } from "./dates.js";
import { icon } from "./icons.js";
import { attendance, attendanceText } from "./attendance.js";
import { sortFlags, SEV_LABEL } from "./components.js";
import { POLICY_KINDS } from "./store.js";
import { openImport } from "./importer.js";
import { SAMPLE_SCALE, neededByLetter } from "./gpa.js";
import { openCourseForm, openTaskForm } from "./forms.js";
import { calcGrades, targetResult, currentWeekOf, fmtNum } from "./ders-calc.js";
import { taskWeight, labelOf } from "./weights.js";

const ONLINE = /teams|zoom|online|cevrimici|çevrimiçi|uzaktan|meet\b/i;

// Oturum boyunca hatırlanan açık/kapalı durumları (ders başına)
const ui = new Map();
const uiOf = (id) => ui.get(id) || ui.set(id, { allFlags: false, plan: false, allLetters: false }).get(id);

/* ------------------------------------------------------------------ */
/* 2. Sıradaki değerlendirme                                           */
/* ------------------------------------------------------------------ */

function nextBlock(c, tasks) {
  const mine = tasks.filter((t) => t.courseId === c.id);
  const next = mine.filter((t) => !t.done && daysUntil(t.due) >= 0).sort(byDue)[0];
  if (!next) return "";
  const w = taskWeight(next, c, mine);
  const n = daysUntil(next.due);
  const when = n === 0 ? "bugün" : n === 1 ? "yarın" : `${n} gün`;
  const kind = labelOf(next) || TASK_TYPES[next.type] || "Teslim";
  return `<section class="cd-next" style="--c:${c.color}">
    <p class="cd-next-line"><b>${esc(kind)}</b> · ${when}${w !== null ? ` · %${fmtNum(w)}` : ""}</p>
    <p class="cd-next-title">${esc(next.title)} <small>${fmtShort(next.due)}${next.time ? ` ${esc(next.time)}` : ""}</small></p>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 3. Bilgi kartı                                                      */
/* ------------------------------------------------------------------ */

function infoBlock(c) {
  const times = [...c.sessions]
    .sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start))
    .map((s) => `<span>${DAYS_SHORT[s.day]} ${esc(s.start)}–${esc(s.end)}${s.room ? ` · ${ONLINE.test(s.room) ? '<em class="tag-online">Online</em>' : esc(s.room)}` : ""}</span>`)
    .join("");
  const cells = [
    times && `<div class="cd-cell"><small>Ders saati</small>${times}</div>`,
    (c.credit !== null || c.ects !== null) && `<div class="cd-cell"><small>Kredi / AKTS</small><span>${c.credit ?? "—"} / ${c.ects ?? "—"}</span></div>`,
    c.email && `<div class="cd-cell"><small>E-posta</small><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`,
    (c.office || c.officeHours) && `<div class="cd-cell"><small>Ofis</small>${c.office ? `<span>${esc(c.office)}</span>` : ""}${c.officeHours ? `<span class="muted">${esc(c.officeHours)}</span>` : ""}</div>`,
  ].filter(Boolean);
  return cells.length ? `<section class="cd-info">${cells.join("")}</section>` : "";
}

/* ------------------------------------------------------------------ */
/* 4. Dikkat edilecekler                                               */
/* ------------------------------------------------------------------ */

function flagsBlock(c, st) {
  if (!c.policies.length) return "";
  const shown = sortFlags(c.policies.filter((p) => !p.hidden));
  const hidden = c.policies.length - shown.length;
  const list = st.allFlags ? shown : shown.slice(0, 2);
  const item = (p) => `<li class="flag ${p.severity}">
      <span class="flag-tag">${SEV_LABEL[p.severity]} · ${POLICY_KINDS[p.kind]}</span>
      <p class="flag-rule">${esc(p.rule)}</p>
      ${p.consequence ? `<p class="flag-cons">→ ${esc(p.consequence)}</p>` : ""}
      ${p.source ? `<details class="flag-src"><summary>Syllabus'ta ne yazıyor?</summary><small class="irow-src">“${esc(p.source)}”</small></details>` : ""}
      <button type="button" class="link flag-hide" data-hide-policy="${esc(p.id)}">Gizle</button>
    </li>`;
  return `<section class="cd-sec"><h3 class="mini-title">Dikkat edilecekler</h3>
    ${list.length ? `<ul class="flags">${list.map(item).join("")}</ul>` : ""}
    ${shown.length > 2 ? `<button type="button" class="link" data-toggle="allFlags">${st.allFlags ? "Daha az" : `Tümü (${shown.length})`}</button>` : ""}
    ${hidden ? `<button type="button" class="link" data-show-policies>Gizlenen ${hidden} kuralı göster</button>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 5. Değerlendirme                                                    */
/* ------------------------------------------------------------------ */

function gradingBlock(c, tasks) {
  if (!c.grading.length) {
    return `<section class="cd-sec"><h3 class="mini-title">Değerlendirme</h3>
      <p class="calc-note">Not dağılımı eklenmemiş. Alttaki <b>Düzenle</b>'den vize, final gibi bileşenleri ekle.</p></section>`;
  }
  const total = c.grading.reduce((s, g) => s + g.weight, 0) || 1;
  const bar = c.grading
    .map((g) => `<i class="${g.score !== null ? "done" : ""}" style="flex:${g.weight}" title="${esc(g.name)} %${fmtNum(g.weight)}"><span>%${fmtNum(g.weight)}</span></i>`)
    .join("");
  const r = calcGrades(c.grading, c.target);
  const mine = tasks.filter((t) => t.courseId === c.id && !t.done && daysUntil(t.due) >= 0).sort(byDue);
  return `<section class="cd-sec"><h3 class="mini-title">Değerlendirme</h3>
    <div class="grade-bar" role="img" aria-label="Not dağılımı">${bar}</div>
    <form class="calc" data-calc>
      ${c.grading.map((g, i) => `<label class="calc-row">
        <span>${esc(g.name)} <small>%${fmtNum(g.weight)}</small></span>
        <input type="number" min="0" max="100" step="any" inputmode="decimal" data-i="${i}" value="${g.score ?? ""}" placeholder="not" aria-label="${esc(g.name)} notun">
      </label>`).join("")}
    </form>
    <p class="fine gap-t" data-avg>${r.average !== null ? `Şu ana kadarki ortalaman <b>${fmtNum(r.average)}</b> (notun %${fmtNum(r.doneWeight)}'lik kısmı girildi).` : "Aldığın notları gir; hedef harf hesabı buna göre güncellenir."}</p>
    ${Math.abs(total - 100) > 0.01 ? `<p class="warn-text fine">Ağırlıkların toplamı %${fmtNum(total)}, 100 değil. Düzenle'den kontrol et.</p>` : ""}
    ${mine.length ? `<ul class="kv gap-t">${mine.map((t) => `<li><b>${esc(t.title)}</b><span>${relLabel(daysUntil(t.due))} · ${fmtShort(t.due)}</span></li>`).join("")}</ul>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 6. Haftalık plan                                                    */
/* ------------------------------------------------------------------ */

const EXAM_RE = /sinav|sınav|exam|midterm|vize|final|quiz/i;

function planBlock(c, st, state) {
  // Plan yoksa bölüm gizlenmez: yeniden yükleme çağrısı (sadece eksikler eklenir, girdiler ezilmez)
  if (!c.weeks.length) {
    return `<section class="cd-sec cd-noplan">
      <p class="calc-note">Haftalık plan yok. Syllabus'u yeniden yükle, her haftanın konusu eklensin.</p>
      <button type="button" class="btn btn-ghost btn-sm" data-reimport>${icon.upload}Syllabus yükle</button>
    </section>`;
  }
  const cur = currentWeekOf(c, state);
  const now = c.weeks.find((w) => w.n === cur);
  const summary = now ? `<b>Bu hafta:</b> H${now.n} · ${esc(now.topic)}` : cur && cur > c.weeks[c.weeks.length - 1].n ? "Haftalık plan bitti" : `<b>Haftalık plan</b> · ${c.weeks.length} hafta`;
  const rows = c.weeks.map((w) => {
    const exam = EXAM_RE.test(w.topic) || EXAM_RE.test(w.note || "");
    return `<li class="${w.n === cur ? "now" : ""}"><b>H${w.n}</b>
      <span>${esc(w.topic)}${w.date || w.note ? `<small>${[w.date && fmtShort(w.date), w.note && esc(w.note)].filter(Boolean).join(" · ")}</small>` : ""}</span>
      ${exam ? '<em class="tag-exam">Sınav</em>' : ""}</li>`;
  }).join("");
  return `<section class="cd-sec">
    <button type="button" class="cd-plan-sum" data-toggle="plan" aria-expanded="${st.plan}"><span>${summary}</span>${st.plan ? "▴" : "▾"}</button>
    ${st.plan ? `<ul class="cd-plan">${rows}</ul>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 7. Hedef harf                                                       */
/* ------------------------------------------------------------------ */

function targetInner(c) {
  if (!c.grading.length) return '<p class="calc-note">Önce not dağılımını ekle.</p>';
  if (!c.scale.length) {
    return `<p class="calc-note">BAU'da harf eşikleri hocaya göre değişir. Hocanın tablosunu gir ya da örnekle başlayıp düzelt.</p>
      <div class="empty-actions"><button type="button" class="btn btn-ghost" data-scale-sample>Örnek tabloyla başla</button></div>`;
  }
  const res = targetResult(c);
  const letters = [...c.scale].sort((a, b) => b.min - a.min).map((x) => x.letter);
  const pick = res.done
    ? ""
    : `<label class="tl-row"><span>Hedef harfin</span><select data-target-letter aria-label="Hedef harf">${letters.map((l) => `<option ${l === res.letter ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const apply = res.done && res.letter !== c.letter ? `<button type="button" class="btn btn-ghost gap-t" data-apply-letter="${esc(res.letter)}">Ortalama tablosuna ${esc(res.letter)} olarak aktar</button>` : "";
  const applied = res.done && res.letter === c.letter ? `<p class="fine">Ortalama tablosunda bu ders ${esc(res.letter)} olarak kayıtlı.</p>` : "";
  return `${pick}<div class="calc-result tl-res" aria-live="polite">${res.lines.map((l, i) => `<p class="${i ? "fine" : ""}">${esc(l)}</p>`).join("")}${applied}${apply}</div>`;
}

function allLettersBlock(c, st) {
  if (!c.scale.length || !c.grading.length) return "";
  if (!st.allLetters) return `<button type="button" class="link gap-t" data-toggle="allLetters">Tüm harfleri gör</button>`;
  const r = calcGrades(c.grading, c.target);
  const rows = neededByLetter(c.scale, r.earned, r.remaining);
  return `<div class="gap-t" data-letter-block>
    <ul class="kv need-list">${rows.map((x) => `<li><b>${esc(x.letter)}</b><span>${x.status === "ok" ? "garanti" : x.status === "no" ? "mümkün değil" : `kalanlardan ort. ${fmtNum(Math.max(0, x.need))}`}</span></li>`).join("")}</ul>
    <p class="mini-title gap-t">Harf eşikleri</p>
    <div class="scale-grid">${c.scale.map((x, i) => `<label><span>${esc(x.letter)}</span>
      <input type="number" min="0" max="100" step="any" inputmode="decimal" data-scale-i="${i}" value="${x.min}" aria-label="${esc(x.letter)} için en düşük puan"></label>`).join("")}
      <label><span>Final barajı</span><input type="number" min="0" max="100" step="any" inputmode="decimal" data-final-min value="${c.finalMin ?? ""}" placeholder="yok" aria-label="Final barajı"></label>
    </div>
    <p class="fine gap-t">Kutular o harf için gereken en düşük ders puanı; hocanın tablosuyla aynı olmalı. <button type="button" class="link" data-scale-clear>Tabloyu kaldır</button> · <button type="button" class="link" data-toggle="allLetters">Kapat</button></p>
  </div>`;
}

function targetBlock(c, st) {
  return `<section class="cd-sec"><h3 class="mini-title">Hedef harf</h3>
    <div data-target>${targetInner(c)}</div>
    ${allLettersBlock(c, st)}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Ekran                                                               */
/* ------------------------------------------------------------------ */

function inner(c, state) {
  const st = uiOf(c.id);
  const sub = [c.code, c.instructor].filter(Boolean).map(esc).join(" · ");
  return `<header class="sheet-head detail-head" style="--c:${c.color}">
      <div><h2>${esc(c.name)}</h2>${sub ? `<p class="detail-code">${sub}</p>` : ""}</div>
      <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button>
    </header>
    <div class="sheet-body">
      ${nextBlock(c, state.tasks)}
      ${infoBlock(c)}
      ${flagsBlock(c, st)}
      ${planBlock(c, st, state)}
      ${gradingBlock(c, state.tasks)}
      ${targetBlock(c, st)}
      <p class="fine cd-src">Bilgiler syllabus'tan alındı · <button type="button" class="link" data-edit>Düzenle</button></p>
    </div>
    <footer class="sheet-foot">
      <button type="button" class="btn btn-primary" data-new-task>${icon.plus}Görev ekle</button>
    </footer>`;
}

export function openCourseDetail(courseId) {
  const get = () => store.get().courses.find((x) => x.id === courseId);
  if (!get()) return;
  openSheet(`<div class="sheet-form cd">${inner(get(), store.get())}</div>`, (d) => {
    // Dinleyicileri dialog'a değil içeriğe bağla: dialog diğer formlarca da kullanılıyor
    const root = d.firstElementChild;
    const redraw = () => {
      const c = get();
      if (!c) return closeSheet();
      const y = root.querySelector(".sheet-body")?.scrollTop || 0;
      root.innerHTML = inner(c, store.get());
      root.querySelector(".sheet-body").scrollTop = y;
    };
    const refreshTarget = () => {
      const box = root.querySelector("[data-target]");
      if (box) box.innerHTML = targetInner(get());
    };

    root.addEventListener("click", (e) => {
      const course = get();
      if (!course) return;
      const tog = e.target.closest("[data-toggle]");
      if (tog) {
        const st = uiOf(courseId);
        st[tog.dataset.toggle] = !st[tog.dataset.toggle];
        return redraw();
      }
      if (e.target.closest("[data-edit]")) return openCourseForm(course);
      if (e.target.closest("[data-new-task]")) return openTaskForm(null, { courseId });
      if (e.target.closest("[data-reimport]")) return openImport({ into: courseId });
      const hide = e.target.closest("[data-hide-policy]");
      if (hide || e.target.closest("[data-show-policies]")) {
        const policies = course.policies.map((p) => (hide ? (p.id === hide.dataset.hidePolicy ? { ...p, hidden: true } : p) : { ...p, hidden: false }));
        store.saveCourse({ ...course, policies });
        return redraw();
      }
      if (e.target.closest("[data-scale-sample]")) {
        store.saveCourse({ ...course, scale: SAMPLE_SCALE });
        return redraw();
      }
      if (e.target.closest("[data-scale-clear]")) {
        store.saveCourse({ ...course, scale: [], finalMin: null });
        return redraw();
      }
      const apply = e.target.closest("[data-apply-letter]");
      if (apply) {
        store.saveCourse({ ...course, letter: apply.dataset.applyLetter });
        toast(`${course.code || course.name}: ${apply.dataset.applyLetter} olarak Ortalama'ya aktarıldı`, {
          label: "Tabloda gör",
          onClick: () => {
            closeSheet();
            location.hash = "#/donem?bolum=ortalama";
          },
        });
        refreshTarget();
      }
    });

    root.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-target-letter]");
      if (!sel) return;
      const course = get();
      // Hedef harfin eşiği dersin sayısal hedefi olur (uyarılar calcGrades(target) ile aynı hedefi kullansın)
      const min = course.scale.find((x) => x.letter === sel.value)?.min;
      store.saveCourse({ ...course, targetLetter: sel.value, target: min ?? course.target });
      refreshTarget();
    });

    // Not ve eşik girişleri: yazdıkça kaydet, sadece sonucu yenile (odak kaybolmasın)
    root.addEventListener("input", (e) => {
      const course = get();
      const val = (el) => (el.value === "" ? null : Math.min(100, Math.max(0, Number(el.value))));
      const lb = e.target.closest("[data-letter-block]");
      if (lb) {
        const scale = course.scale.map((x, i) => ({ ...x, min: val(lb.querySelector(`[data-scale-i="${i}"]`)) ?? x.min }));
        store.saveCourse({ ...course, scale, finalMin: val(lb.querySelector("[data-final-min]")) });
        return refreshTarget();
      }
      const form = e.target.closest("[data-calc]");
      if (!form) return;
      const grading = course.grading.map((g, i) => ({ ...g, score: val(form.querySelector(`[data-i="${i}"]`)) }));
      const saved = store.saveCourse({ ...course, grading });
      const r = calcGrades(saved.grading, saved.target);
      root.querySelectorAll(".grade-bar i").forEach((el, i) => el.classList.toggle("done", saved.grading[i]?.score !== null));
      const avg = root.querySelector("[data-avg]");
      if (avg) avg.innerHTML = r.average !== null ? `Şu ana kadarki ortalaman <b>${fmtNum(r.average)}</b> (notun %${fmtNum(r.doneWeight)}'lik kısmı girildi).` : "Aldığın notları gir; hedef harf hesabı buna göre güncellenir.";
      refreshTarget();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Devamsızlık kayıtları (Dönem → Devamsızlık kartından)               */
/* ------------------------------------------------------------------ */

function absenceBody(c) {
  const a = attendance(c, store.get().settings.termWeeks);
  const pct = a.limit ? Math.min(100, (a.used / a.limit) * 100) : a.used ? 100 : 0;
  const list = [...c.absences].sort((x, y) => y.date.localeCompare(x.date));
  const times = [...new Set(c.sessions.map((s) => s.start))].sort();
  return `<p class="abs-text ${a.level}">${attendanceText(a)}</p>
    ${a.limit !== null ? `<div class="bar ${a.level}" role="img" aria-label="${a.used} / ${a.limit} devamsızlık"><i style="width:${pct}%"></i></div>` : '<p class="calc-note">Devam şartını dersin <b>Düzenle</b> ekranından gir; kalan hakkını hesaplayayım.</p>'}
    <h3 class="mini-title gap-t">Geçmiş gün ekle</h3>
    <div class="abs-add">
      <input type="date" data-abs-date value="${todayISO()}" max="${todayISO()}" aria-label="Devamsızlık tarihi">
      ${times.length > 1 ? `<select data-abs-start aria-label="Ders saati">${times.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>` : times.length ? `<input type="hidden" data-abs-start value="${esc(times[0])}">` : ""}
      <button type="button" class="btn btn-ghost" data-add-abs>${icon.plus}Ekle</button>
    </div>
    ${list.length ? `<ul class="kv abs-list gap-t">${list.map((x) => `<li><b>${fmtShort(x.date)}${x.start ? ` · ${esc(x.start)}` : ""}</b>
      <button type="button" class="link" data-remove-abs="${esc(x.id)}">Kaldır</button></li>`).join("")}</ul>` : '<p class="fine gap-t">Kayıtlı devamsızlık yok.</p>'}`;
}

export function openAbsences(courseId) {
  const get = () => store.get().courses.find((x) => x.id === courseId);
  const c = get();
  if (!c) return;
  openSheet(`<div class="sheet-form">
      <header class="sheet-head"><h2>Devamsızlık · ${esc(c.code || c.name)}</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>
      <div class="sheet-body" data-abs-body>${absenceBody(c)}</div>
    </div>`, (d) => {
    const root = d.firstElementChild;
    const refresh = () => {
      const now = get();
      if (now) root.querySelector("[data-abs-body]").innerHTML = absenceBody(now);
    };
    root.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-remove-abs]");
      if (rm) {
        store.removeAbsence(courseId, rm.dataset.removeAbs);
        refresh();
      }
      if (e.target.closest("[data-add-abs]")) {
        const date = root.querySelector("[data-abs-date]").value;
        const start = root.querySelector("[data-abs-start]")?.value || "";
        if (!date) return;
        if (!store.addAbsence(courseId, date, start)) return toast("Bu ders için o gün zaten kayıtlı");
        toast("Devamsızlık kaydedildi");
        refresh();
      }
    });
  });
}
