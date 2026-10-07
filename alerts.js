/**
 * KPR — Proaktif uyarılar
 *
 * İki çıktı üretir, ikisi de sadece cihazdaki veriden:
 *   buildAlerts()    → "Bugün" ekranındaki uyarı kartları (şu an önemli olanlar)
 *   buildReminders() → zamanı gelince gösterilecek bildirimler (notify.js teslim eder)
 *
 * Tasarım ilkesi: seri, rozet, "%X tamamlandı" yok. Uyarı bir sonraki adımı söyler ve çekilir.
 */

import { TASK_TYPES, isExam, isLight } from "./store.js";
import { daysUntil, parseISO, toISO, todayIdx, toMin, nowMin, relLabel } from "./dates.js";
import { attendance } from "./attendance.js";
import { calcGrades } from "./ders-calc.js";
import { projection, fmtGpa, standing } from "./gpa.js";
import { t, locale } from "./i18n.js";

const LEVEL_ORDER = { danger: 0, warn: 1, info: 2 };
const courseName = (c) => (c ? c.code || c.name : "");
const label = (task, courses) => {
  const c = courses.find((x) => x.id === task.courseId);
  return c ? `${courseName(c)} · ${task.title}` : task.title;
};
/** "bugün" / "yarın" / "5 gün sonra" */
const inDays = (n) => (n === 0 ? t("bugün") : n === 1 ? t("yarın") : t("{n} gün sonra", { n }));

export function buildAlerts(state) {
  const { courses, tasks, settings } = state;
  const open = tasks.filter((x) => !x.done);
  const out = [];

  // 1) Gecikenler
  const overdue = open.filter((x) => daysUntil(x.due) < 0);
  if (overdue.length) {
    out.push({
      id: `overdue:${overdue.map((x) => x.id).join(",")}`,
      level: "danger",
      title: overdue.length === 1 ? t("Gecikti: {ad}", { ad: label(overdue[0], courses) }) : t("{n} görevin gecikti", { n: overdue.length }),
      text: t("Bitirdiysen işaretle; bitirmediysen hocana ya da syllabus'taki geç teslim kuralına bak."),
      route: "gorevler",
    });
  }

  // 2) Yaklaşan sınavlar (7 gün)
  for (const task of open.filter(isExam)) {
    const n = daysUntil(task.due);
    if (n < 0 || n > 7) continue;
    out.push({
      id: `exam:${task.id}:${n}`,
      level: n <= 1 ? "danger" : n <= 3 ? "warn" : "info",
      // "Quiz 2 · 5 gün sonra": başlıktaki sayı ile gün sayısı yan yana gelip karışmasın
      title: `${label(task, courses)} · ${inDays(n)}${task.time ? ` · ${task.time}` : ""}`,
      text: n <= 1 ? t("Son tekrar zamanı. Sınıfını ve saatini kontrol et.") : t("Çalışma planını şimdi yap; son güne kalmasın."),
      taskId: task.id,
    });
  }

  // 3) Yakın teslimler (2 gün)
  for (const task of open.filter((x) => !isExam(x))) {
    const n = daysUntil(task.due);
    if (n < 0 || n > 2) continue;
    out.push({
      id: `due:${task.id}:${n}`,
      level: n === 0 ? "danger" : "warn",
      title: `${TASK_TYPES[task.type]}: ${label(task, courses)} · ${relLabel(n).toLocaleLowerCase(locale())}${task.time ? ` · ${task.time}` : ""}`,
      text: t("Teslim saatini ve yükleme yerini kontrol et."),
      taskId: task.id,
    });
  }

  // 4) Yoğun hafta (önümüzdeki 7 gün)
  // Okuma ve kişisel işler haftayı "yoğun" yapmaz
  const week = open.filter((x) => !isLight(x) && daysUntil(x.due) >= 0 && daysUntil(x.due) <= 6);
  const weekExams = week.filter(isExam).length;
  if (weekExams >= 2 || week.length >= 4) {
    const parts = [];
    if (weekExams) parts.push(t("{n} sınav", { n: weekExams }));
    parts.push(t("{n} teslim", { n: week.length - weekExams }));
    out.push({
      id: `busy:${toISO(new Date())}:${week.length}`,
      level: "info",
      title: t("Yoğun hafta: {liste}", { liste: parts.join(", ") }),
      text: t("Önümüzdeki 7 gün dolu. En yakın ve en ağır olandan başla."),
      route: "gorevler",
    });
  }

  // 5) Devamsızlık
  for (const c of courses) {
    const a = attendance(c, settings.termWeeks);
    if (a.level === "over" || a.level === "last" || a.level === "warn") {
      const ders = courseName(c);
      out.push({
        id: `abs:${c.id}:${a.used}`,
        level: a.level === "warn" ? "warn" : "danger",
        title:
          a.level === "over" ? t("{ders}: devamsızlık sınırı aşıldı", { ders })
            : a.level === "last" ? t("{ders}: devamsızlık hakkın bitti", { ders })
              : t("{ders}: 1 devamsızlık hakkın kaldı", { ders }),
        text:
          a.level === "over" ? t("Devam şartını sağlamayan öğrenci NA alır ve finale giremez. Hocanla hemen konuş.")
            : a.level === "last" ? t("Bir devamsızlık daha NA (finale girememe) demek.")
              : t("Bu derste {used}/{limit} kullandın.", { used: a.used, limit: a.limit }),
        courseId: c.id,
      });
    }
  }

  // 6) Not hedefi
  for (const c of courses) {
    if (!c.grading.length || !c.grading.some((g) => g.score !== null)) continue;
    const r = calcGrades(c.grading, c.target);
    if (r.needed === null || r.needed < 85) continue;
    const ders = courseName(c);
    out.push({
      id: `grade:${c.id}:${Math.round(r.needed)}`,
      level: r.needed > 100 ? "danger" : "warn",
      title: r.needed > 100 ? t("{ders}: hedef {hedef} artık zor", { ders, hedef: c.target }) : t("{ders}: kalanlardan {puan} gerekiyor", { ders, puan: Math.round(r.needed) }),
      text: r.needed > 100 ? t("Kalanlardan 100 alsan da yetmiyor. Hedefini güncelle ya da bütünleme kuralına bak.") : t("Hedefe ulaşmak için kalan sınavlar çok önemli."),
      courseId: c.id,
    });
  }

  // 7) GNO durumu
  const p = projection(state);
  const g = p.after ?? p.prev.avg;
  const st = standing(g);
  if (st && st.level !== "ok") {
    const vars = { gno: fmtGpa(g), durum: st.label.toLocaleLowerCase(locale()) };
    out.push({
      id: `gpa:${g.toFixed(2)}`,
      level: st.level,
      title: p.after != null ? t("GNO tahminin {gno}: {durum}", vars) : t("GNO'n {gno}: {durum}", vars),
      text: st.level === "danger" ? t("GNO 1,80'in altında kalırsa sınamalı öğrenci sayılırsın.") : t("Mezuniyet için GNO en az 2,00 olmalı."),
      route: "ortalama",
    });
  }

  // 8) Yaklaşan ders (30 dk)
  const now = nowMin();
  for (const c of courses) {
    for (const s of c.sessions) {
      if (s.day !== todayIdx()) continue;
      const diff = toMin(s.start) - now;
      if (diff < 0 || diff > 30) continue;
      out.push({
        id: `class:${c.id}:${toISO(new Date())}:${s.start}`,
        level: "info",
        title: diff <= 1 ? t("Şimdi: {ders}", { ders: c.name }) : t("{n} dk sonra: {ders}", { n: diff, ders: c.name }),
        text: [s.start, s.room].filter(Boolean).join(" · "),
        courseId: c.id,
      });
    }
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/* ------------------------------------------------------------------ */
/* Hatırlatma takvimi                                                  */
/* ------------------------------------------------------------------ */

const at = (iso, hhmm) => {
  const d = parseISO(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const addMin = (d, n) => new Date(d.getTime() + n * 60000);

/** Gece yarısı ile 08:00 arası bildirim gönderme; bir önceki akşam 20:00'ye çek. */
function quiet(d) {
  const h = d.getHours();
  if (h >= 23) { const x = new Date(d); x.setHours(20, 0, 0, 0); return x; }
  if (h < 8) { const x = addDays(d, -1); x.setHours(20, 0, 0, 0); return x; }
  return d;
}

/**
 * Önümüzdeki `days` gün içindeki bildirimler.
 * Sınav: 7 gün önce, 1 gün önce 20:00, sınavdan 2 saat önce (saat yoksa 08:00).
 * Ödev/proje: 3 gün önce, 1 gün önce, teslimden 3 saat önce (saat yoksa 23:59 kabul).
 * Her sabah 08:00: bugünün özeti. İsteğe bağlı: dersten 15 dk önce.
 */
export function buildReminders(state, from = new Date(), days = 8) {
  const { courses, tasks, settings } = state;
  const until = addDays(from, days);
  const out = [];
  const push = (r) => { if (r.fireAt > addDays(from, -1) && r.fireAt <= until) out.push(r); };

  for (const task of tasks.filter((x) => !x.done)) {
    const ad = label(task, courses);
    if (isExam(task)) {
      const exam = at(task.due, task.time || "09:00");
      push({ id: `r:${task.id}:7d`, fireAt: at(toISO(addDays(exam, -7)), "09:00"), title: t("1 hafta kaldı: {ad}", { ad }), body: t("Çalışma planını bugün yap."), url: "#/gorevler" });
      push({ id: `r:${task.id}:1d`, fireAt: at(toISO(addDays(exam, -1)), "20:00"), title: t("Yarın sınav: {ad}", { ad }), body: task.time ? t("Saat {saat}. Son tekrar zamanı.", { saat: task.time }) : t("Son tekrar zamanı."), url: "#/gorevler" });
      push({ id: `r:${task.id}:2h`, fireAt: task.time ? addMin(exam, -120) : at(task.due, "08:00"), title: t("Bugün sınav: {ad}", { ad }), body: task.time ? t("Başlangıç {saat}.", { saat: task.time }) : t("Bugün sınavın var."), url: "#/gorevler" });
    } else {
      const due = at(task.due, task.time || "23:59");
      const tur = TASK_TYPES[task.type];
      push({ id: `r:${task.id}:3d`, fireAt: quiet(addDays(due, -3)), title: t("3 gün kaldı: {ad}", { ad }), body: t("{tur} teslimi {saat}.", { tur, saat: task.time || t("gün sonu") }), url: "#/gorevler" });
      push({ id: `r:${task.id}:1d`, fireAt: quiet(addDays(due, -1)), title: t("Yarın teslim: {ad}", { ad }), body: `${tur} · ${task.time || t("gün sonu")}`, url: "#/gorevler" });
      push({ id: `r:${task.id}:3h`, fireAt: quiet(addMin(due, -180)), title: t("3 saat kaldı: {ad}", { ad }), body: t("{tur} teslimi {saat}.", { tur, saat: task.time || t("bu gece") }), url: "#/gorevler" });
    }
  }

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const iso = toISO(day);
    const idx = (day.getDay() + 6) % 7;
    const classes = courses.flatMap((c) => c.sessions.filter((s) => s.day === idx).map((s) => ({ c, s })));
    const due = tasks.filter((x) => !x.done && x.due === iso);
    if (classes.length || due.length) {
      const parts = [];
      if (classes.length) parts.push(t("{n} ders", { n: classes.length }));
      const exams = due.filter(isExam).length;
      if (exams) parts.push(t("{n} sınav", { n: exams }));
      if (due.length - exams) parts.push(t("{n} teslim", { n: due.length - exams }));
      const first = classes.sort((a, b) => toMin(a.s.start) - toMin(b.s.start))[0];
      push({
        id: `r:day:${iso}`,
        fireAt: at(iso, "08:00"),
        title: t("Bugün: {ad}", { ad: parts.join(", ") }),
        body: first ? t("İlk ders {saat} · {ders}", { saat: first.s.start, ders: `${first.c.name}${first.s.room ? ` · ${first.s.room}` : ""}` }) : due.map((x) => label(x, courses)).join(", "),
        url: "#/bugun",
      });
    }
    if (settings.notifyClasses) {
      for (const { c, s } of classes) {
        push({
          id: `r:class:${c.id}:${iso}:${s.start}`,
          fireAt: addMin(at(iso, s.start), -15),
          title: t("{n} dk sonra: {ders}", { n: 15, ders: c.name }),
          body: [s.start, s.room].filter(Boolean).join(" · "),
          url: "#/program",
        });
      }
    }
  }

  return out.sort((a, b) => a.fireAt - b.fireAt);
}
