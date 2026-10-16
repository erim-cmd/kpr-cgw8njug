// Hesap + bulut eşitleme: sunucu mantığı (server/account-core.js, bellek deposuyla) ve birleştirme (sync-merge.js).
// Gerçek sunucuya / D1'e gidilmez.
import { readFileSync } from "node:fs";
const { handle, memoryRepo, hashPassword, checkPassword, MAX_BLOB, SESSION_DAYS } = await import("../server/account-core.js");
const { mergeData } = await import("../sync-merge.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };
const bearer = (tok) => `Bearer ${tok}`;

console.log("\nhesap — sunucu");
const repo = memoryRepo();
const T0 = Date.UTC(2026, 9, 16);

// Şifre özeti
const h = await hashPassword("gizli-sifre-1");
ok(h.startsWith("pbkdf2$100000$") && !h.includes("gizli"), "şifre PBKDF2 ile özetlenir, açık yazılmaz");
ok(await checkPassword("gizli-sifre-1", h) && !(await checkPassword("gizli-sifre-2", h)), "şifre doğrulama");
ok((await hashPassword("x".repeat(8))) !== (await hashPassword("x".repeat(8))), "her özet farklı tuzla");

// Kayıt doğrulamaları
const reg = (p) => handle(repo, { action: "register", ...p }, null, T0);
ok((await reg({ email: "abc", password: "12345678", consent: true })).body.error === "bad_email", "geçersiz e-posta");
ok((await reg({ email: "a@b.co", password: "1234567", consent: true })).body.error === "weak_password", "8 karakterden kısa şifre");
ok((await reg({ email: "a@b.co", password: "12345678" })).body.error === "consent", "açık rıza olmadan kayıt yok");
const r1 = await reg({ email: " Deniz@Ornek.com ", password: "12345678", consent: true });
ok(r1.status === 200 && r1.body.token && r1.body.email === "deniz@ornek.com" && r1.body.rev === 0, "kayıt: e-posta küçük harfe, oturum anahtarı");
ok((await reg({ email: "deniz@ornek.com", password: "abcdefgh", consent: true })).body.error === "exists", "aynı e-postayla ikinci hesap yok");

// Giriş
const login = (email, password, now = T0) => handle(repo, { action: "login", email, password }, null, now);
ok((await login("deniz@ornek.com", "yanlis123")).body.error === "wrong", "yanlış şifre");
ok((await login("yok@ornek.com", "12345678")).body.error === "wrong", "olmayan e-posta da aynı hata");
const l1 = await login("DENIZ@ornek.com", "12345678");
ok(l1.status === 200 && l1.body.token && l1.body.token !== r1.body.token, "giriş yeni oturum açar");
const tok = l1.body.token;

// Yetki
ok((await handle(repo, { action: "pull" }, null, T0)).status === 401, "anahtarsız eşitleme yok");
ok((await handle(repo, { action: "pull" }, bearer("A".repeat(43)), T0)).status === 401, "uydurma anahtar geçmez");
const later = T0 + (SESSION_DAYS + 1) * 864e5;
ok((await handle(repo, { action: "pull" }, bearer(tok), later)).status === 401, "süresi dolan oturum geçmez");
const tok2 = (await login("deniz@ornek.com", "12345678")).body.token;

// Eşitleme
const pull = async (t = tok2) => (await handle(repo, { action: "pull" }, bearer(t), T0)).body;
ok((await pull()).data === null && (await pull()).rev === 0, "boş hesap: veri yok");
const push = (data, baseRev, t = tok2) => handle(repo, { action: "push", data, baseRev }, bearer(t), T0);
const A = { courses: [{ id: "c1", name: "Fizik" }], tasks: [] };
const p1 = await push(A, 0);
ok(p1.status === 200 && p1.body.rev === 1, "ilk gönderim rev 1");
ok(JSON.stringify((await pull()).data) === JSON.stringify(A) && (await pull()).rev === 1, "geri çekilen veri aynı");
const stale = await push({ courses: [], tasks: [] }, 0);
ok(stale.status === 409 && stale.body.error === "conflict" && stale.body.rev === 1 && stale.body.data.courses.length === 1, "eski sürüm üstüne yazamaz; sunucudaki hâl döner");
ok((await push(A, 1)).body.rev === 2, "doğru sürümle yazılır");
ok((await push({ x: "y".repeat(MAX_BLOB) }, 2)).body.error === "too_big", "çok büyük veri reddedilir");
ok((await push([1, 2], 2)).body.error === "bad_request", "dizi veri olarak kabul edilmez");

// Başka kullanıcı ötekinin verisini göremez
const other = (await reg({ email: "elif@ornek.com", password: "87654321", consent: true })).body.token;
ok((await pull(other)).data === null, "kullanıcılar birbirinin verisini görmez");

// Çıkış ve silme
ok((await handle(repo, { action: "logout" }, bearer(other), T0)).status === 200 && (await handle(repo, { action: "pull" }, bearer(other), T0)).status === 401, "çıkış oturumu kapatır");
ok((await handle(repo, { action: "delete", password: "yanlis123" }, bearer(tok2), T0)).body.error === "wrong", "silme için doğru şifre gerekir");
ok((await handle(repo, { action: "delete", password: "12345678" }, bearer(tok2), T0)).status === 200, "hesap silinir");
ok((await login("deniz@ornek.com", "12345678")).body.error === "wrong" && (await handle(repo, { action: "pull" }, bearer(tok2), T0)).status === 401, "silinen hesapla giriş yok, oturumlar kapalı");
ok(repo._sizes().data === 0, "silinen hesabın verisi kalmaz");
ok((await handle(repo, { action: "bilinmeyen" }, bearer(tok2), T0)).status === 401 && (await handle(repo, { action: "x" }, null, T0)).status === 401, "bilinmeyen eylem yetkisiz");

// Uç: D1 yoksa kapalı, CORS authorization başlığına izin
const ep = readFileSync(new URL("../functions/api/account.js", import.meta.url), "utf8");
ok(/ready: Boolean\(env\.KPR_DB\)/.test(ep) && /overLimit\(request, env, "acc"/.test(ep), "uç: KPR_DB yoksa kapalı, giriş denemesi sınırlı");
ok(/authorization/.test(readFileSync(new URL("../functions/api/_middleware.js", import.meta.url), "utf8")), "CORS: authorization başlığı");
ok(!/console\.(log|error)\([^)]*(email|password|blob)/.test(ep + readFileSync(new URL("../server/account-core.js", import.meta.url), "utf8")), "e-posta/şifre/veri loglanmaz");

console.log("\nhesap — birleştirme");
const C = (id, name, extra = {}) => ({ id, name, ...extra });
const T = (id, title, courseId = null) => ({ id, title, courseId, due: "2026-11-01" });
const S = (courses, tasks, extra = {}) => ({ courses, tasks, electives: [], transcript: [], profile: { name: "Deniz" }, settings: { theme: "acik" }, gpaBase: null, version: 2, archive: { transcript: [] }, ...extra });

// İlk giriş (base yok): hiçbir şey silinmez, çakışmada bulut
const local0 = S([C("a", "Fizik"), C("b", "Kimya-yerel")], [T("t1", "Ödev")], { settings: { theme: "koyu" } });
const remote0 = S([C("b", "Kimya-bulut"), C("c", "Tarih")], [T("t2", "Quiz", "c")]);
const m0 = mergeData(null, local0, remote0);
ok(m0.courses.map((c) => c.id).join() === "a,b,c" && m0.tasks.length === 2, "ilk giriş: iki cihazın dersleri ve görevleri birleşir");
ok(m0.courses.find((c) => c.id === "b").name === "Kimya-bulut" && m0.settings.theme === "acik", "ilk giriş: çakışmada hesaptaki kazanır");
ok(mergeData(null, local0, null) === local0, "hesapta veri yoksa bu cihazınki");

// Üç yönlü: silme, ekleme, değiştirme
const base = S([C("a", "Fizik"), C("b", "Kimya")], [T("t1", "Ödev", "b"), T("t2", "Quiz")]);
const local = S([C("a", "Fizik II"), C("b", "Kimya")], [T("t1", "Ödev", "b"), T("t2", "Quiz"), T("t3", "Yeni yerel")]);
const remote = S([C("a", "Fizik")], [T("t1", "Ödev", "b"), T("t4", "Yeni bulut")], { profile: { name: "Deniz Y." } });
const m = mergeData(base, local, remote);
ok(m.courses.length === 1 && m.courses[0].name === "Fizik II", "bu cihazda değişen ders kalır, başka cihazda silinen ders silinir");
ok(!m.tasks.some((t) => t.id === "t2"), "başka cihazda silinen (bu cihazda değişmemiş) görev silinir");
ok(m.tasks.some((t) => t.id === "t3") && m.tasks.some((t) => t.id === "t4"), "iki tarafta yeni eklenenler kalır");
ok(m.tasks.find((t) => t.id === "t1").courseId === null, "silinen derse bağlı görev derssiz kalır");
ok(m.profile.name === "Deniz Y.", "bu cihaz değiştirmediyse profil buluttan");
const m2 = mergeData(base, { ...base, profile: { name: "Yerel Ad" } }, remote);
ok(m2.profile.name === "Yerel Ad", "bu cihaz değiştirdiyse profil bu cihazdan");
const edited = S([C("a", "Fizik"), C("b", "Kimya düzenli")], base.tasks);
const m3 = mergeData(base, base, S([C("a", "Fizik")], base.tasks));
ok(m3.courses.length === 1, "başka cihazda silinen, burada dokunulmamış ders silinir");
const m4 = mergeData(base, edited, S([C("a", "Fizik")], base.tasks));
ok(m4.courses.some((c) => c.name === "Kimya düzenli"), "başka cihazda silinse de burada düzenlenen ders korunur");

console.log(`\n${pass} doğru, ${fail} hata`);
if (fail) process.exit(1);
