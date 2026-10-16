/**
 * KPR — Bulut eşitlemede iki cihazın verisini birleştirme (saf fonksiyon; test/account.mjs).
 *
 * Üç yönlü: base = iki tarafın en son ortak hâli (son başarılı eşitleme), local = bu cihaz, remote = bulut.
 *  - Listeler (ders, görev, seçmeli, geçmiş) kimliğe göre birleşir. Bir tarafta silinip diğer tarafta
 *    değişmemiş öğe silinir; bir tarafta yeni eklenen öğe kalır; iki tarafta da varsa değiştiren taraf kazanır
 *    (ikisi de değiştirdiyse bu cihaz).
 *  - Tek alanlar (profil, ayarlar, GNO tabanı): bu cihaz değiştirdiyse bu cihaz, değilse bulut.
 *  - base yoksa (bu cihazda ilk giriş): listeler birleşir (hiçbir şey silinmez), çakışmada bulut kazanır.
 */

const LISTS = ["courses", "tasks", "electives", "transcript"];
const SCALARS = ["profile", "settings", "gpaBase", "version"];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id).map((x) => [x.id, x]));

function mergeList(base, local, remote, first) {
  const B = byId(base), L = byId(local), R = byId(remote);
  const out = [];
  const seen = new Set();
  // Bu cihazın sırası korunur, buluttan gelen yeniler sona eklenir
  for (const id of [...L.keys(), ...R.keys()]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const l = L.get(id), r = R.get(id), b = B.get(id);
    if (l && r) {
      if (first) out.push(r);
      else out.push(!eq(l, b) ? l : r);
    } else if (l) {
      // Bulutta yok: ya bu cihazda yeni (base'de yok) ya da başka cihazda silindi
      if (first || !b || !eq(l, b)) out.push(l);
    } else if (r) {
      if (first || !b || !eq(r, b)) out.push(r);
    }
  }
  return out;
}

export function mergeData(base, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const first = !base;
  const out = { ...remote };
  for (const k of LISTS) out[k] = mergeList(base?.[k], local[k], remote[k], first);
  for (const k of SCALARS) {
    const localChanged = !first && !eq(local[k], base[k]);
    out[k] = localChanged ? local[k] : remote[k] ?? local[k];
  }
  const archive = mergeList(base?.archive?.transcript, local.archive?.transcript, remote.archive?.transcript, first);
  out.archive = { ...(remote.archive || local.archive || {}), transcript: archive };
  // Silinen derse bağlı görev "derssiz" kalır (store.deleteCourse ile aynı kural)
  const ids = new Set(out.courses.map((c) => c.id));
  out.tasks = out.tasks.map((t) => (t.courseId && !ids.has(t.courseId) ? { ...t, courseId: null } : t));
  return out;
}
