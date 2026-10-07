/**
 * KPR — Syllabus'u var olan dersin üzerine yeniden yükleme: sadece EKSİK olanı ekler.
 *
 * Eklenen: haftalık plan (yoksa) ve boş alanlar (kod, hoca, e-posta, ofis, ofis saati, kredi, AKTS,
 * ders saatleri, not dağılımı, devam şartı, kurallar, final barajı).
 * Dokunulmayan (öğrencinin girdiği ya da düzelttiği): ad, renk, notlar (score), harf, harf tablosu,
 * hedef, devamsızlık kayıtları, gizlenen kurallar, dolu olan her alan. Görevler eklenmez.
 *
 * mergeIntoCourse(course, parsed) → { course, added: ["haftalık plan (12 hafta)", "e-posta", …] }
 * parsed: parseSyllabus / yapay zekâ sanitize() çıktısı. Saf fonksiyon; test/merge.mjs.
 */

import { t } from "./i18n.js";

const empty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

export function mergeIntoCourse(course, parsed) {
  const out = { ...course };
  const added = [];
  const pc = parsed.course || {};
  const fill = (key, value, label) => {
    if (empty(out[key]) && !empty(value)) {
      out[key] = value;
      added.push(label);
    }
  };
  if (empty(out.weeks) && parsed.weeks?.length) {
    out.weeks = parsed.weeks;
    added.push(t("haftalık plan ({n} hafta)", { n: parsed.weeks.length }));
  }
  fill("code", pc.code, t("ders kodu"));
  fill("instructor", pc.instructor, t("hoca"));
  fill("email", pc.email, t("e-posta"));
  fill("office", pc.office, t("ofis"));
  fill("officeHours", pc.office_hours, t("ofis saati"));
  fill("credit", pc.credit ?? null, t("kredi"));
  fill("ects", pc.ects ?? null, t("AKTS"));
  fill("sessions", parsed.sessions || [], t("ders saatleri"));
  fill("grading", (parsed.grading || []).map((g) => ({ name: g.name, weight: g.weight, score: null })), t("not dağılımı"));
  fill("policies", parsed.policies || [], t("dikkat edilecekler"));
  fill("finalMin", parsed.final_min ?? null, t("final barajı"));
  // Devam şartı: ikisinden biri girilmişse dokunma
  const att = parsed.attendance || {};
  if (empty(out.attendPct) && empty(out.absLimit)) {
    if (!empty(att.percent)) {
      out.attendPct = att.percent;
      added.push(t("devam şartı"));
    } else if (!empty(att.max_absences)) {
      out.absLimit = att.max_absences;
      added.push(t("devam şartı"));
    }
  }
  return { course: out, added };
}
