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

const LEVEL_ORDER = { danger: 0, warn: 1, info: 2 };
const courseName = (c) => (c ? c.code || c.name : "");
const label = (t, courses) => {
  const c = courses.find((x) => x.id === t.courseId);
  return c ? `${courseName(c)} · ${t.title}` : t.title;
};

export function buildAlerts(state) {
  const { courses, tasks, settings } = state;
  const open = tasks.filter((t) => !t.done);
  const out = [];

  // 1) Gecikenler
  const overdue = open.filter((t) => daysUntil(t.due) < 0);
  if (overdue.length) {
    out.push({
      id: `overdue:${overdue.map((t) => t.id).join(",")}`,
      level: "danger",
      title: overdue.length === 1 ? `Gecikti: ${label(overdue[0], courses)}` : `${overdue.length} görevin gecikti`,
      text: "Bitirdiysen işaretle; bitirmediysen hocana ya da syllabus'taki geç teslim kuralına bak.",
      route: "gorevler",
    });
  }

  // 2) Yaklaşan sınavlar (7 gün)
  for (const t of open.filter(isExam)) {
    const n = daysUntil(t.due);
    if (n < 0 || n > 7) continue;
    out.push({
      id: `exam:${t.id}:${n}`,
      level: n <= 1 ? "danger" : n <= 3 ? "warn" : "info",
      // "Quiz 2 · 5 gün sonra": başlıktaki sayı ile gün sayısı yan yana gelip karışmasın
      title: `${label(t, courses)} · ${n === 0 ? "bugün" : n === 1 ? "yarın" : `${n} gün sonra`}${t.time ? ` · ${t.time}` : ""}`,
      text: n <= 1 ? "Son tekrar zamanı. Sınıfını ve saatini kontrol et." : "Çalışma planını şimdi yap; son güne kalmasın.",
      taskId: t.id,
    });
  }

  // 3) Yakın teslimler (2 gün)
  for (const t of open.filter((x) => !isExam(x))) {
    const n = daysUntil(t.due);
    if (n < 0 || n > 2) continue;
    out.push({
      id: `due:${t.id}:${n}`,
      level: n === 0 ? "danger" : "warn",
      title: `${TASK_TYPES[t.type]}: ${label(t, courses)} · ${relLabel(n).toLocaleLowerCase("tr-TR")}${t.time ? ` · ${t.time}` : ""}`,
      text: "Teslim saatini ve yükleme yerini kontrol et.",
      taskId: t.id,
    });
  }

  // 4) Yoğun hafta (önümüzdeki 7 gün)
  // Okuma ve kişisel işler haftayı "yoğun" yapmaz
  const week = open.filter((t) => !isLight(t) && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 6);
  const weekExams = week.filter(isExam).length;
  if (weekExams >= 2 || week.length >= 4) {
    out.push({
      id: `busy:${toISO(new Date())}:${week.length}`,
      level: "info",
      title: `Yoğun hafta: ${weekExams ? `${weekExams} sınav, ` : ""}${week.length - weekExams} teslim`,
      text: "Önümüzdeki 7 gün dolu. En yakın ve en ağır olandan başla.",
      route: "gorevler",
    });
  }

  // 5) Devamsızlık
  for (const c of courses) {
    const a = attendance(c, settings.termWeeks);
    if (a.level === "over" || a.level === "last" || a.level === "warn") {
      out.push({
        id: `abs:${c.id}:${a.used}`,
        level: a.level === "warn" ? "warn" : "danger",
        title:
          a.level === "over" ? `${courseName(c)}: devamsızlık sınırı aşıldı`
            : a.level === "last" ? `${courseName(c)}: devamsızlık hakkın bitti`
              : `${courseName(c)}: 1 devamsızlık hakkın kaldı`,
        text:
          a.level === "over" ? "Devam şartını sağlamayan öğrenci NA alır ve finale giremez. Hocanla hemen konuş."
            : a.level === "last" ? "Bir devamsızlık daha NA (finale girememe) demek."
              : `Bu derste ${a.used}/${a.limit} kullandın.`,
        courseId: c.id,
      });
    }
  }

  // 6) Not hedefi
  for (const c of courses) {
    if (!c.grading.length || !c.grading.some((g) => g.score !== null)) continue;
    const r = calcGrades(c.grading, c.target);
    if (r.needed === null || r.needed < 85) continue;
    out.push({
      id: `grade:${c.id}:${Math.round(r.needed)}`,
      level: r.needed > 100 ? "danger" : "warn",
      title: r.needed > 100 ? `${courseName(c)}: hedef ${c.target} artık zor` : `${courseName(c)}: kalanlardan ${Math.round(r.needed)} gerekiyor`,
      text: r.needed > 100 ? "Kalanlardan 100 alsan da yetmiyor. Hedefini güncelle ya da bütünleme kuralına bak." : "Hedefe ulaşmak için kalan sınavlar çok önemli.",
      courseId: c.id,
    });
  }

  // 7) GNO durumu
  const p = projection(state);
  const g = p.after ?? p.prev.avg;
  const st = standing(g);
  if (st && st.level !== "ok") {
    out.push({
      id: `gpa:${fmtGpa(g)}`,
      level: st.level,
      title: `${p.after != null ? "GNO tahminin" : "GNO'n"} ${fmtGpa(g)}: ${st.label.toLocaleLowerCase("tr-TR")}`,
      text: st.level === "danger" ? "GNO 1,80'in altında kalırsa sınamalı öğrenci sayılırsın." : "Mezuniyet için GNO en az 2,00 olmalı.",
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
        title: `${diff <= 1 ? "Şimdi" : `${diff} dk sonra`}: ${c.name}`,
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

  for (const t of tasks.filter((x) => !x.done)) {
    const name = label(t, courses);
    if (isExam(t)) {
      const exam = at(t.due, t.time || "09:00");
      push({ id: `r:${t.id}:7d`, fireAt: at(toISO(addDays(exam, -7)), "09:00"), title: `1 hafta kaldı: ${name}`, body: "Çalışma planını bugün yap.", url: "#/gorevler" });
      push({ id: `r:${t.id}:1d`, fireAt: at(toISO(addDays(exam, -1)), "20:00"), title: `Yarın sınav: ${name}`, body: t.time ? `Saat ${t.time}. Son tekrar zamanı.` : "Son tekrar zamanı.", url: "#/gorevler" });
      push({ id: `r:${t.id}:2h`, fireAt: t.time ? addMin(exam, -120) : at(t.due, "08:00"), title: `Bugün sınav: ${name}`, body: t.time ? `Başlangıç ${t.time}.` : "Bugün sınavın var.", url: "#/gorevler" });
    } else {
      const due = at(t.due, t.time || "23:59");
      push({ id: `r:${t.id}:3d`, fireAt: quiet(addDays(due, -3)), title: `3 gün kaldı: ${name}`, body: `${TASK_TYPES[t.type]} teslimi ${t.time || "gün sonu"}.`, url: "#/gorevler" });
      push({ id: `r:${t.id}:1d`, fireAt: quiet(addDays(due, -1)), title: `Yarın teslim: ${name}`, body: `${TASK_TYPES[t.type]} · ${t.time || "gün sonu"}`, url: "#/gorevler" });
      push({ id: `r:${t.id}:3h`, fireAt: quiet(addMin(due, -180)), title: `3 saat kaldı: ${name}`, body: `${TASK_TYPES[t.type]} teslimi ${t.time || "bu gece"}.`, url: "#/gorevler" });
    }
  }

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const iso = toISO(day);
    const idx = (day.getDay() + 6) % 7;
    const classes = courses.flatMap((c) => c.sessions.filter((s) => s.day === idx).map((s) => ({ c, s })));
    const due = tasks.filter((t) => !t.done && t.due === iso);
    if (classes.length || due.length) {
      const parts = [];
      if (classes.length) parts.push(`${classes.length} ders`);
      const exams = due.filter(isExam).length;
      if (exams) parts.push(`${exams} sınav`);
      if (due.length - exams) parts.push(`${due.length - exams} teslim`);
      const first = classes.sort((a, b) => toMin(a.s.start) - toMin(b.s.start))[0];
      push({
        id: `r:day:${iso}`,
        fireAt: at(iso, "08:00"),
        title: `Bugün: ${parts.join(", ")}`,
        body: first ? `İlk ders ${first.s.start} · ${first.c.name}${first.s.room ? ` · ${first.s.room}` : ""}` : due.map((t) => label(t, courses)).join(", "),
        url: "#/bugun",
      });
    }
    if (settings.notifyClasses) {
      for (const { c, s } of classes) {
        push({
          id: `r:class:${c.id}:${iso}:${s.start}`,
          fireAt: addMin(at(iso, s.start), -15),
          title: `15 dk sonra: ${c.name}`,
          body: [s.start, s.room].filter(Boolean).join(" · "),
          url: "#/program",
        });
      }
    }
  }

  return out.sort((a, b) => a.fireAt - b.fireAt);
}
