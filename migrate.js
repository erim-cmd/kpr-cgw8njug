/**
 * KPR — Veri göçleri (cihazdaki kayıtlı veri yeni biçime). Her göç bir kez çalışır: state.version.
 *
 * v2 (2.11): "Geçmiş dönemler" arayüzden kalktı. GNO artık iki sayıdan: gpaBase = { credits, gno }.
 *   - Ders ders girilmiş transkript varsa ve gpaBase yoksa, gpaBase gpa.js'in kendi hesabıyla bir kez üretilir.
 *   - Bu dönem tekrar alınan dersler (transkriptte de olan) için eski not "önceki not"a yazılır;
 *     böylece GNO göçten önce ve sonra aynı çıkar (bkz. test/migrate.mjs).
 *   - Transkript SİLİNMEZ: archive.transcript'e taşınır (restoreTranscript() ile geri alınır).
 *
 * store.js gpa.js'i içe aktaramaz (gpa.js store.js'i kullanıyor, döngü olur); göç bu yüzden ayrı dosyada.
 */

import { store } from "./store.js";
import { projection, effective, courseKey, counts } from "./gpa.js";

export const SCHEMA = 2;

/** Saf fonksiyon: eski veriyi v2'ye çevirir (test edilebilir, store'a dokunmaz). */
export function toV2(state) {
  if (state.version >= 2) return state;
  let { transcript, gpaBase, courses } = state;
  const archive = { transcript: [...(state.archive?.transcript || [])] };
  if (transcript.length) {
    if (!gpaBase) {
      const p = projection({ transcript, courses: [], gpaBase: null });
      if (p.prev.avg !== null && p.prev.credits > 0) gpaBase = { credits: p.prev.credits, gno: p.prev.avg };
    }
    // Tekrar alınan ders: transkriptteki son not "önceki not" olur (gpaBase'ten düşülsün)
    const last = new Map(effective(transcript).map((e) => [courseKey(e), e.grade]));
    courses = courses.map((c) => {
      const g = last.get(courseKey(c));
      return !c.prevGrade && g && counts(g) ? { ...c, prevGrade: g } : c;
    });
    archive.transcript = [...archive.transcript, ...transcript];
    transcript = [];
  }
  return { ...state, version: 2, gpaBase, courses, transcript, archive };
}

/** Uygulama açılışında ve yedek yüklenince çağrılır. */
export function runMigrations() {
  const s = store.get();
  if (s.version >= SCHEMA) return false;
  store.replace(toV2(s));
  return true;
}

/** Geri dönüş: arşivdeki transkripti geri koyar (geliştirici konsolundan; arayüzde yok). */
export function restoreTranscript() {
  const s = store.get();
  if (!s.archive.transcript.length) return false;
  // Sürüm aynı kalır (tekrar göç olmasın); projection() transkript varken onu kullanır
  store.replace({ ...s, transcript: s.archive.transcript, archive: { transcript: [] } });
  return true;
}
