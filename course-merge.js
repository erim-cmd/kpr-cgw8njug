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
    added.push(`haftalık plan (${parsed.weeks.length} hafta)`);
  }
  fill("code", pc.code, "ders kodu");
  fill("instructor", pc.instructor, "hoca");
  fill("email", pc.email, "e-posta");
  fill("office", pc.office, "ofis");
  fill("officeHours", pc.office_hours, "ofis saati");
  fill("credit", pc.credit ?? null, "kredi");
  fill("ects", pc.ects ?? null, "AKTS");
  fill("sessions", parsed.sessions || [], "ders saatleri");
  fill("grading", (parsed.grading || []).map((g) => ({ name: g.name, weight: g.weight, score: null })), "not dağılımı");
  fill("policies", parsed.policies || [], "dikkat edilecekler");
  fill("finalMin", parsed.final_min ?? null, "final barajı");
  // Devam şartı: ikisinden biri girilmişse dokunma
  const att = parsed.attendance || {};
  if (empty(out.attendPct) && empty(out.absLimit)) {
    if (!empty(att.percent)) {
      out.attendPct = att.percent;
      added.push("devam şartı");
    } else if (!empty(att.max_absences)) {
      out.absLimit = att.max_absences;
      added.push("devam şartı");
    }
  }
  return { course: out, added };
}
