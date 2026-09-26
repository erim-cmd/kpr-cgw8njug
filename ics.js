/**
 * KPR — Takvime aktarma (.ics)
 *
 * Sunucusuz en garanti hatırlatma: sınav ve teslimler alarmlarıyla birlikte
 * telefonun kendi takvimine gider; uygulama kapalıyken de çalar.
 * Saatler "yerel" (saat dilimi etiketsiz) yazılır; takvim cihazın saatini kullanır.
 * Not: Apple Takvim alarmları korur. Google Takvim içe aktarımda alarmları
 * çoğu zaman atar ve kendi varsayılan hatırlatmasını kullanır.
 */

import { TASK_TYPES } from "./store.js";
import { parseISO, toISO, todayISO } from "./dates.js";

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const dateOnly = (iso) => iso.replaceAll("-", "");
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545: satırlar 75 bayttan uzun olmamalı; devam satırı bir boşlukla başlar. */
function fold(line) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const alarm = (trigger, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${esc(text)}`, "END:VALARM"];

function at(iso, hhmm) {
  const d = parseISO(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function taskEvent(t, course, now) {
  const summary = `${course ? `${course.code || course.name} · ` : ""}${t.title}`;
  const lines = ["BEGIN:VEVENT", `UID:${t.id}@kpr`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${esc(summary)}`];
  const desc = [TASK_TYPES[t.type], t.note].filter(Boolean).join(" — ");
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);

  if (t.time) {
    const start = at(t.due, t.time);
    const end = new Date(start.getTime() + (t.type === "sinav" ? 120 : 30) * 60000);
    lines.push(`DTSTART:${local(start)}`, `DTEND:${local(end)}`);
    if (t.type === "sinav") lines.push(...alarm("-P7D", `1 hafta kaldı: ${summary}`), ...alarm("-P1D", `Yarın: ${summary}`), ...alarm("-PT2H", `2 saat sonra: ${summary}`));
    else lines.push(...alarm("-P1D", `Yarın teslim: ${summary}`), ...alarm("-PT3H", `3 saat kaldı: ${summary}`));
  } else {
    // Tüm gün: tetikleyici günün 00:00'ına göre. -PT4H = önceki gün 20:00, PT8H = aynı gün 08:00
    const next = new Date(parseISO(t.due).getTime() + 86400000);
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(t.due)}`, `DTEND;VALUE=DATE:${dateOnly(toISO(next))}`);
    if (t.type === "sinav") lines.push(...alarm("-P6DT15H", `1 hafta kaldı: ${summary}`), ...alarm("-PT4H", `Yarın: ${summary}`), ...alarm("PT8H", `Bugün: ${summary}`));
    else lines.push(...alarm("-P2DT4H", `3 gün kaldı: ${summary}`), ...alarm("-PT4H", `Yarın teslim: ${summary}`));
  }
  lines.push("END:VEVENT");
  return lines;
}

/** Her ders saati için haftalık tekrar eden etkinlik, dönemin kalan haftaları kadar. */
function classEvents(course, weeks, now) {
  const out = [];
  const today = parseISO(todayISO());
  course.sessions.forEach((s, i) => {
    const first = new Date(today);
    const delta = (s.day - ((today.getDay() + 6) % 7) + 7) % 7;
    first.setDate(first.getDate() + delta);
    const start = at(toISO(first), s.start);
    const end = at(toISO(first), s.end);
    out.push(
      "BEGIN:VEVENT",
      `UID:${course.id}-${i}-${s.day}-${s.start.replace(":", "")}@kpr`,
      `DTSTAMP:${stamp(now)}`,
      `SUMMARY:${esc(course.code ? `${course.code} · ${course.name}` : course.name)}`,
      ...(s.room ? [`LOCATION:${esc(s.room)}`] : []),
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      ...alarm("-PT15M", `15 dk sonra: ${course.name}${s.room ? ` · ${s.room}` : ""}`),
      "END:VEVENT"
    );
  });
  return out;
}

export function buildICS(state, { classes = false } = {}) {
  const now = new Date();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KPR//Ogrenci Asistani//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:KPR"];
  const today = todayISO();
  for (const t of state.tasks.filter((x) => !x.done && x.due >= today)) {
    lines.push(...taskEvent(t, state.courses.find((c) => c.id === t.courseId), now));
  }
  if (classes) for (const c of state.courses) lines.push(...classEvents(c, state.settings.termWeeks, now));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export const countExportable = (state) => state.tasks.filter((t) => !t.done && t.due >= todayISO()).length;

/** Önce paylaşım menüsü (iOS'ta Takvim'e en kısa yol), olmazsa dosya indirme. */
export async function deliverICS(text, filename = "kpr-takvim.ics") {
  const file = new File([text], filename, { type: "text/calendar" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "KPR takvimi" });
      return "shared";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
