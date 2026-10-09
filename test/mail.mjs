// Hocaya mail taslağı (mail.js): ders bilgileriyle dolu, bilinmeyeni uydurmuyor, bağlantılar doğru kodlanıyor.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { mailDraft, MAIL_TOPICS, outlookUrl, mailtoUrl, lastClassDate } = await import("../mail.js");

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log("  ✗ " + msg)); };

const now = new Date(2026, 9, 9); // Cuma
const course = { id: "c1", code: "MAN 3011", name: "Operations Management", instructor: "Dr. Deniz Örnek", email: "deniz.ornek@bau.edu.tr",
  officeHours: "Salı 10:30–12:30", sessions: [{ day: 2, start: "12:00", end: "14:20" }] };
const tasks = [{ id: "t1", courseId: "c1", title: "Video Project", type: "proje", due: "2026-10-20", done: false }];

for (const k of MAIL_TOPICS) {
  const m = mailDraft(k, { course, tasks, name: "Erim", studentNo: "2202101", now });
  ok(m.subject.includes("MAN 3011"), `${k}: konu ders kodu içermeli: ${m.subject}`);
  ok(m.body.startsWith("Sayın Dr. Deniz Örnek,"), `${k}: hitap: ${m.body.split("\n")[0]}`);
  ok(m.body.trimEnd().endsWith("Erim\nÖğrenci no: 2202101"), `${k}: imza: ${m.body.slice(-40)}`);
}
ok(lastClassDate(course, now) === "2026-10-07", `son ders günü ${lastClassDate(course, now)} ≠ 2026-10-07 (Çarşamba)`);
ok(mailDraft("devamsizlik", { course, now }).body.includes("[nedenini yaz]"), "neden uydurulmamalı, öğrenciye bırakılmalı");
ok(mailDraft("ofis", { course, now }).body.includes("Salı 10:30–12:30"), "ofis saati metne girmeli");
ok(mailDraft("uzatma", { course, tasks, now }).subject.includes("Video Project"), "sıradaki teslim konuya girmeli");
// Bilgi yoksa: hoca adı yok → "Merhaba Hocam", öğrenci adı yok → "[adın]", ofis saati yok → saat uydurulmaz
const bare = mailDraft("ofis", { course: { ...course, instructor: "", officeHours: "" }, now });
ok(bare.body.startsWith("Merhaba Hocam,") && bare.body.includes("[adın]") && !/\d{1,2}:\d{2}/.test(bare.body), `boş bilgiyle taslak: ${bare.body}`);
ok(!mailDraft("genel", { course, now }).body.includes("Öğrenci no"), "numara yoksa satır olmamalı");

const u = outlookUrl("a@b.edu.tr", "Konu & soru", "Satır 1\nSatır 2", false);
ok(u.startsWith("https://outlook.office.com/mail/deeplink/compose?to=a%40b.edu.tr&subject=Konu%20%26%20soru&body=Sat%C4%B1r%201%0ASat%C4%B1r%202"), u);
ok(outlookUrl("a@b.edu.tr", "x", "y", true).startsWith("ms-outlook://compose?to="), "telefonda Outlook uygulaması");
ok(mailtoUrl("a@b.edu.tr", "x y", "z").startsWith("mailto:a%40b.edu.tr?subject=x%20y&body=z"), "mailto kodlaması");

console.log(`\nmail\n\n${pass} doğru, ${fail} hata`);
process.exit(fail ? 1 : 0);
