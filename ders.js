/**
 * KPR — Ders ekranı (sheet). Yukarıdan aşağıya; 1–5 kaydırmadan görünür:
 *   1. Başlık: ad, kod · hoca
 *   2. Sıradaki değerlendirme: tür · kalan gün · ağırlık %
 *   3. Bilgi kartı (2 sütun): saat + derslik, kredi/AKTS, e-posta, ofis + ofis saati
 *   4. Dikkat edilecekler: en kritik 2 kural (kaynak cümlesi dokununca), "Tümü (N)"
 *   5. "Bu hafta: H5 · konu" satırı → dokununca tüm haftalık plan; plan yoksa bölüm gösterilmez
 *      (syllabus yeniden yükleme Düzenle formunda: ders açılırken zaten yükleniyor)
 *   6. Değerlendirme: bileşen satırları (ad · ağırlık rozeti · not), dokununca not girişi
 *   7. Hedef harf
 * Altta: "Bilgiler syllabus'tan alındı · Düzenle".
 *
 * Hesap yok: notlar ve hedef harf ders-calc.js, harf listesi gpa.neededByLetter, ağırlık weights.taskWeight.
 */

import { store, TASK_TYPES, isLight } from "./store.js";
import { esc, openSheet, closeSheet, toast } from "./ui.js";
import { DAYS_SHORT, todayISO, toMin, daysUntil, fmtShort, relLabel, byDue } from "./dates.js";
import { icon } from "./icons.js";
import { attendance, attendanceText } from "./attendance.js";
import { sortFlags, SEV_LABEL, infoNote } from "./components.js";
import { POLICY_KINDS } from "./store.js";
import { SAMPLE_SCALE, neededByLetter } from "./gpa.js";
import { openCourseForm, openTaskForm } from "./forms.js";
import { calcGrades, targetResult, currentWeekOf, fmtNum, impactLine, letterNeedLine } from "./ders-calc.js";
import { openNumberSheet, openLetterSheet } from "./grade-sheet.js";
import { taskWeight, labelOf } from "./weights.js";
import { openMailSheet } from "./mail.js";
import { t, pct, locale } from "./i18n.js";

const ONLINE = /teams|zoom|online|cevrimici|çevrimiçi|uzaktan|meet\b/i;

// Oturum boyunca hatırlanan açık/kapalı durumları (ders başına)
const ui = new Map();
const uiOf = (id) => ui.get(id) || ui.set(id, { allFlags: false, plan: false, allLetters: false }).get(id);

/* ------------------------------------------------------------------ */
/* 2. Sıradaki değerlendirme                                           */
/* ------------------------------------------------------------------ */

/** Dersin sıradaki değerlendirmesi (okuma ve kişisel işler değerlendirme değildir). */
const nextTask = (c, tasks) => tasks.filter((t) => t.courseId === c.id && !t.done && !isLight(t) && daysUntil(t.due) >= 0).sort(byDue)[0] || null;

function nextBlock(c, tasks) {
  const mine = tasks.filter((t) => t.courseId === c.id);
  const next = nextTask(c, tasks);
  if (!next) return "";
  const w = taskWeight(next, c, mine);
  const n = daysUntil(next.due);
  const when = n === 0 ? t("bugün") : n === 1 ? t("yarın") : t("{n} gün", { n });
  const kind = labelOf(next) || TASK_TYPES[next.type] || t("Teslim");
  // Tür adı başlıkta zaten geçiyorsa ("Ödev 2") ikinci kez yazılmaz
  const tr = (s) => s.toLocaleLowerCase(locale());
  const label = tr(next.title).includes(tr(kind)) ? t("Sıradaki") : kind;
  return `<section class="cd-next" style="--c:${c.color}">
    <p class="cd-next-line"><b>${esc(label)}</b> · ${when}${w !== null ? ` · ${pct(fmtNum(w))}` : ""}</p>
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
    times && `<div class="cd-cell"><small>${t("Ders saati")}</small>${times}</div>`,
    (c.credit !== null || c.ects !== null) && `<div class="cd-cell"><small>${t("Kredi / AKTS")}</small><span>${c.credit ?? "—"} / ${c.ects ?? "—"}</span></div>`,
    c.email && `<div class="cd-cell"><small>${t("E-posta")}</small><span>${esc(c.email)}</span><button type="button" class="link cd-mail" data-mail>${t("Mail taslağı yaz")}</button></div>`,
    (c.office || c.officeHours) && `<div class="cd-cell"><small>${t("Ofis")}</small>${c.office ? `<span>${esc(c.office)}</span>` : ""}${c.officeHours ? `<span class="muted">${esc(c.officeHours)}</span>` : ""}</div>`,
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
      ${p.source ? `<details class="flag-src"><summary>${t("Syllabus'ta ne yazıyor?")}</summary><small class="irow-src">“${esc(p.source)}”</small></details>` : ""}
      <button type="button" class="link flag-hide" data-hide-policy="${esc(p.id)}">${t("Gizle")}</button>
    </li>`;
  // "Tümü (N)" başlık satırında: ilk görünümde "Bu hafta" satırına yer kalsın
  return `<section class="cd-sec"><div class="section-head cd-flags-head"><h3 class="mini-title">${t("Dikkat edilecekler")}</h3>
      ${shown.length > 2 ? `<button type="button" class="link" data-toggle="allFlags">${st.allFlags ? t("Daha az") : t("Tümü ({n})", { n: shown.length })}</button>` : ""}</div>
    ${list.length ? `<ul class="flags">${list.map(item).join("")}</ul>` : ""}
    ${hidden ? `<button type="button" class="link" data-show-policies>${t("Gizlenen {n} kuralı göster", { n: hidden })}</button>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 5. Değerlendirme                                                    */
/* ------------------------------------------------------------------ */

function gradingBlock(c, tasks) {
  if (!c.grading.length) {
    return `<section class="cd-sec"><h3 class="mini-title">${t("Değerlendirme")}</h3>
      <p class="calc-note">${t("Not dağılımı eklenmemiş. Alttaki <b>Düzenle</b>'den vize, final gibi bileşenleri ekle.")}</p></section>`;
  }
  const total = c.grading.filter((g) => !g.bonus).reduce((s, g) => s + g.weight, 0) || 1;
  const r = calcGrades(c.grading, c.target);
  // Üstteki "sıradaki" kartında görünen görev burada tekrar etmez
  const top = nextTask(c, tasks);
  const mine = tasks.filter((t) => t.courseId === c.id && !t.done && daysUntil(t.due) >= 0 && t.id !== top?.id).sort(byDue);
  // Her bileşen bir satır: ad · ağırlık rozeti · (varsa) not. Dokununca ortak not girişi açılır.
  const rows = c.grading.map((g, i) => `<li><button type="button" class="grade-row ${g.score !== null ? "has" : ""}" data-grade-i="${i}"
      aria-label="${g.score !== null ? t("{name}, ağırlık yüzde {w}, notun {score}", { name: esc(g.name), w: fmtNum(g.weight), score: fmtNum(g.score) }) : t("{name}, ağırlık yüzde {w}, not girilmedi", { name: esc(g.name), w: fmtNum(g.weight) })}">
      <span class="gr-n">${esc(g.name)}</span>
      ${g.score !== null ? `<b class="gr-score">${fmtNum(g.score)}</b>` : `<span class="gr-add">${t("not gir")}</span>`}
      <b class="gr-w">${g.bonus ? `+${pct(fmtNum(g.weight))} <small>${t("bonus")}</small>` : pct(fmtNum(g.weight))}</b>
    </button></li>`).join("");
  return `<section class="cd-sec"><h3 class="mini-title">${t("Değerlendirme")}</h3>
    <ul class="grade-rows">${rows}</ul>
    <p class="cd-note">${r.average !== null ? t("Şu ana kadarki ortalaman {avg} (notunun {p} kadarı girildi).", { avg: `<b>${fmtNum(r.average)}</b>`, p: pct(fmtNum(r.doneWeight)) }) : t("Aldığın notu girmek için satıra dokun; hedef harf hesabı buna göre güncellenir.")}</p>
    ${Math.abs(total - 100) > 0.01 ? `<p class="cd-note warn-text">${t("Ağırlıkların toplamı {p}, 100 değil. Düzenle'den kontrol et.", { p: pct(fmtNum(total)) })}</p>` : ""}
    ${mine.length ? `<ul class="kv">${mine.map((t) => `<li><b>${esc(t.title)}</b><span>${relLabel(daysUntil(t.due))} · ${fmtShort(t.due)}</span></li>`).join("")}</ul>` : ""}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* 6. Haftalık plan                                                    */
/* ------------------------------------------------------------------ */

const EXAM_RE = /sinav|sınav|exam|midterm|vize|final|quiz/i;

function planBlock(c, st, state) {
  // Syllabus'ta okunabilir haftalık plan yoksa bölüm yok: öğrenciden yeniden yükleme istemek okuma hatasını ona yükler
  if (!c.weeks.length) return "";
  const cur = currentWeekOf(c, state);
  const now = c.weeks.find((w) => w.n === cur);
  const summary = now
    ? `<b>${t("Bu hafta:")}</b> ${t("H{n}", { n: now.n })} · ${esc(now.topic)}`
    : cur && cur > c.weeks[c.weeks.length - 1].n
      ? t("Haftalık plan bitti")
      : `<b>${t("Haftalık plan")}</b> · ${t("{n} hafta", { n: c.weeks.length })}`;
  const rows = c.weeks.map((w) => {
    const exam = EXAM_RE.test(w.topic) || EXAM_RE.test(w.note || "");
    return `<li class="${w.n === cur ? "now" : ""}"><b>${t("H{n}", { n: w.n })}</b>
      <span>${esc(w.topic)}${w.date || w.note ? `<small>${[w.date && fmtShort(w.date), w.note && esc(w.note)].filter(Boolean).join(" · ")}</small>` : ""}</span>
      ${exam ? `<em class="tag-exam">${t("Sınav")}</em>` : ""}</li>`;
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
  if (!c.grading.length) return `<p class="calc-note">${t("Önce not dağılımını ekle.")}</p>`;
  if (!c.scale.length) {
    return `<p class="calc-note">${t("Hocanın harf tablosunu gir ya da örnekle başlayıp düzelt.")}</p>
      ${infoNote(t("Neden tablo gerekiyor?"), t("BAU'da harf eşikleri hocaya göre değişir; hedef harf hesabı hocanın açıkladığı tabloya göre yapılır."))}
      <div class="empty-actions"><button type="button" class="btn btn-ghost" data-scale-sample>${t("Örnek tabloyla başla")}</button></div>`;
  }
  const res = targetResult(c);
  const pick = res.done
    ? ""
    : `<button type="button" class="tl-row" data-target-letter><span>${t("Hedef harfin")}</span><b class="tl-letter">${esc(res.letter)} ▾</b></button>`;
  const apply = res.done && res.letter !== c.letter ? `<button type="button" class="btn btn-ghost gap-t" data-apply-letter="${esc(res.letter)}">${t("Ders harfleri tablosuna {letter} olarak aktar", { letter: esc(res.letter) })}</button>` : "";
  const applied = res.done && res.letter === c.letter ? `<p class="fine">${t("Ders harfleri tablosunda bu ders {letter} olarak kayıtlı.", { letter: esc(res.letter) })}</p>` : "";
  return `${pick}<div class="calc-result tl-res" aria-live="polite">${res.lines.map((l, i) => `<p class="${i ? "fine" : ""}">${esc(l)}</p>`).join("")}${applied}${apply}</div>`;
}

function allLettersBlock(c, st) {
  if (!c.scale.length || !c.grading.length) return "";
  if (!st.allLetters) return `<button type="button" class="link" data-toggle="allLetters">${t("Tüm harfleri gör")}</button>`;
  const r = calcGrades(c.grading, c.target);
  const rows = neededByLetter(c.scale, r.earned, r.remaining);
  return `<div>
    <ul class="kv need-list">${rows.map((x) => `<li><b>${esc(x.letter)}</b><span>${x.status === "ok" ? t("garanti") : x.status === "no" ? t("mümkün değil") : t("kalanlardan ort. {n}", { n: fmtNum(Math.max(0, x.need)) })}</span></li>`).join("")}</ul>
    <p class="mini-title gap-t">${t("Harf eşikleri")} <small>${t("(dokun, düzelt)")}</small></p>
    <div class="scale-grid">${c.scale.map((x, i) => `<button type="button" class="scale-cell" data-scale-i="${i}" aria-label="${t("{letter} için en düşük puan {n}", { letter: esc(x.letter), n: fmtNum(x.min) })}"><span>${esc(x.letter)}</span><b>${fmtNum(x.min)}</b></button>`).join("")}
      <button type="button" class="scale-cell" data-final-min aria-label="${t("Final barajı")}"><span>${t("Final barajı")}</span><b>${c.finalMin !== null ? fmtNum(c.finalMin) : t("yok")}</b></button>
    </div>
    ${infoNote(t("Harf eşikleri nedir?"), t("Kutular o harf için gereken en düşük ders puanı; hocanın tablosuyla aynı olmalı."))}
    <p class="cd-note gap-t"><button type="button" class="link" data-scale-clear>${t("Tabloyu kaldır")}</button> · <button type="button" class="link" data-toggle="allLetters">${t("Kapat")}</button></p>
  </div>`;
}

function targetBlock(c, st) {
  return `<section class="cd-sec"><h3 class="mini-title">${t("Hedef harf")}</h3>
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
      <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button>
    </header>
    <div class="sheet-body">
      ${nextBlock(c, state.tasks)}
      ${infoBlock(c)}
      ${flagsBlock(c, st)}
      ${planBlock(c, st, state)}
      ${gradingBlock(c, state.tasks)}
      ${targetBlock(c, st)}
      <p class="fine cd-src">${t("Bilgiler syllabus'tan alındı")} · <button type="button" class="link" data-edit>${t("Düzenle")}</button></p>
    </div>
    <footer class="sheet-foot">
      <button type="button" class="btn btn-primary" data-new-task>${icon.plus}${t("Görev ekle")}</button>
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
      if (e.target.closest("[data-mail]")) return openMailSheet(course);
      if (e.target.closest("[data-new-task]")) return openTaskForm(null, { courseId });
      const label = course.code || course.name;
      // Bileşen notu: ortak not girişi (hızlı çip tek dokunuşta kaydeder)
      const row = e.target.closest("[data-grade-i]");
      if (row) {
        const i = Number(row.dataset.gradeI);
        const g = course.grading[i];
        return openNumberSheet({
          context: `${label} · ${g.name} · ${pct(fmtNum(g.weight))}`,
          value: g.score,
          quick: [60, 70, 80, 90, 100],
          impact: (v) => impactLine(course, i, v),
          onSave: (v) => {
            const now = get();
            store.saveCourse({ ...now, grading: now.grading.map((x, k) => (k === i ? { ...x, score: v } : x)) });
            redraw();
          },
        });
      }
      // Hedef harf: harf ızgarası; seçilen harfin eşiği dersin sayısal hedefi olur (uyarılar aynı hedefi kullansın)
      if (e.target.closest("[data-target-letter]")) {
        const letters = [...course.scale].sort((a, b) => b.min - a.min).map((x) => x.letter);
        return openLetterSheet({
          context: `${label} · ${t("Hedef harfin")}`,
          letters,
          value: targetResult(course)?.letter || "",
          impact: (l) => letterNeedLine(course, l),
          onSave: (l) => {
            const now = get();
            const min = now.scale.find((x) => x.letter === l)?.min;
            store.saveCourse({ ...now, targetLetter: l, target: min ?? now.target });
            redraw();
          },
        });
      }
      const cell = e.target.closest("[data-scale-i]");
      if (cell) {
        const i = Number(cell.dataset.scaleI);
        const x = course.scale[i];
        return openNumberSheet({
          context: `${label} · ${t("{letter} için en düşük puan", { letter: x.letter })}`,
          value: x.min,
          clearLabel: "",
          onSave: (v) => {
            const now = get();
            const scale = now.scale.map((y, k) => (k === i ? { ...y, min: v } : y));
            const target = now.targetLetter ? scale.find((y) => y.letter === now.targetLetter)?.min ?? now.target : now.target;
            store.saveCourse({ ...now, scale, target });
            redraw();
          },
        });
      }
      if (e.target.closest("[data-final-min]")) {
        return openNumberSheet({
          context: `${label} · ${t("Final barajı")}`,
          value: course.finalMin,
          clearLabel: t("Barajı kaldır"),
          onSave: (v) => {
            store.saveCourse({ ...get(), finalMin: v });
            redraw();
          },
        });
      }
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
        toast(t("{course}: {letter} olarak ders harfleri tablosuna aktarıldı", { course: course.code || course.name, letter: apply.dataset.applyLetter }), {
          label: t("Tabloda gör"),
          onClick: () => {
            closeSheet();
            location.hash = "#/ortalama";
          },
        });
        refreshTarget();
      }
    });

  });
}

/* ------------------------------------------------------------------ */
/* Devamsızlık kayıtları  });
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
    ${a.limit !== null ? `<div class="bar ${a.level}" role="img" aria-label="${t("{used} / {limit} devamsızlık", { used: a.used, limit: a.limit })}"><i style="width:${pct}%"></i></div>` : `<p class="calc-note">${t("Devam şartını dersin {edit} ekranından gir; kalan hakkını hesaplayalım.", { edit: `<b>${t("Düzenle")}</b>` })}</p>`}
    <h3 class="mini-title gap-t">${t("Geçmiş gün ekle")}</h3>
    <div class="abs-add">
      <input type="date" data-abs-date value="${todayISO()}" max="${todayISO()}" aria-label="${t("Devamsızlık tarihi")}">
      ${times.length > 1 ? `<select data-abs-start aria-label="${t("Ders saati")}">${times.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>` : times.length ? `<input type="hidden" data-abs-start value="${esc(times[0])}">` : ""}
      <button type="button" class="btn btn-ghost" data-add-abs>${icon.plus}${t("Ekle")}</button>
    </div>
    ${list.length ? `<ul class="kv abs-list gap-t">${list.map((x) => `<li><b>${fmtShort(x.date)}${x.start ? ` · ${esc(x.start)}` : ""}</b>
      <button type="button" class="link" data-remove-abs="${esc(x.id)}">${t("Kaldır")}</button></li>`).join("")}</ul>` : `<p class="fine gap-t">${t("Kayıtlı devamsızlık yok.")}</p>`}`;
}

export function openAbsences(courseId) {
  const get = () => store.get().courses.find((x) => x.id === courseId);
  const c = get();
  if (!c) return;
  openSheet(`<div class="sheet-form">
      <header class="sheet-head"><h2>${t("Devamsızlık · {name}", { name: esc(c.code || c.name) })}</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button></header>
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
        if (!store.addAbsence(courseId, date, start)) return toast(t("Bu ders için o gün zaten kayıtlı"));
        toast(t("Devamsızlık kaydedildi"));
        refresh();
      }
    });
  });
}
