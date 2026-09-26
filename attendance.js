/**
 * KPR — Devamsızlık takibi
 *
 * BAU yönetmeliği (Md. 19) devam oranını derse bırakır; oran syllabus'ta yazar.
 * Devam şartını sağlamayan öğrenci NA alır: final ve bütünlemeye giremez,
 * NA ortalamaya 0.00 olarak girer. Sağlık raporu devamsızlığı silmez.
 *
 * Birim "ders oturumu"dur (programdaki bir satır). Hak iki yoldan gelir:
 *   - Elle girilen hak (absLimit): "en fazla 4 derse gelmeyebilirsin"
 *   - Devam zorunluluğu (attendPct): toplam oturum × (100 − %) ÷ 100, aşağı yuvarlanır
 */

export function attendance(course, weeks) {
  const perWeek = course.sessions.length;
  const total = perWeek * weeks;
  const used = course.absences.length;
  let limit = null;
  let basis = null;
  if (course.absLimit !== null && course.absLimit !== undefined) {
    limit = course.absLimit;
    basis = "elle";
  } else if (course.attendPct !== null && course.attendPct !== undefined && total) {
    limit = Math.floor((total * (100 - course.attendPct)) / 100 + 1e-9);
    basis = "oran";
  }
  const left = limit === null ? null : limit - used;
  let level = "none";
  if (left !== null) level = left < 0 ? "over" : left === 0 ? "last" : left === 1 ? "warn" : "ok";
  return { used, limit, left, total, perWeek, basis, level };
}

export function attendanceText(a) {
  if (a.limit === null) return a.used ? `${a.used} devamsızlık` : "Devam şartı girilmedi";
  if (a.level === "over") return `Sınır aşıldı: ${a.used}/${a.limit}. NA riski var, hocanla konuş.`;
  if (a.level === "last") return `Hakkın bitti (${a.used}/${a.limit}). Bir devamsızlık daha NA demek.`;
  return `${a.left} devamsızlık hakkın kaldı (${a.used}/${a.limit})`;
}
