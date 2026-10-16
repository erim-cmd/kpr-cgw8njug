// Syllabus okuyucunun (syllabus-local.js, kurul.js) ürettiği Türkçe metinler → İngilizce.
// Okuyucu sonucu derse Türkçe kaydedilir (veri dilden bağımsız); bu tablo yalnız ekranda çevirir (i18n.js readerText).
// Sabit metinler birebir; değişken içerenler kalıpla. Tabloda olmayan metin (ör. yapay zekâ ile okunmuş kural) olduğu gibi kalır.
// test/i18n.mjs: okuyucudaki her sabit metnin burada karşılığı olduğunu denetler.

export const EXACT = {
  // Uyarılar
  "Bazı teslimler başka bir tarihe göre verilmiş (ör. \"finalden 1 hafta önce\"); tarihini sen hesaplayıp gir.": "Some deadlines are given relative to another date (e.g. \"1 week before the final\"); work out the date and enter it.",
  "Final tarihi bulunamadı; akademik takvimden kontrol et.": "Final date not found; check the academic calendar.",
  "Final tarihi syllabus'ta yazmıyor (akademik takvimde ilan edilecek).": "The final date isn't in the syllabus (it will be announced in the academic calendar).",
  "Bazı sınav/ödevler sadece hafta numarasıyla verilmiş; tarihini sen seç.": "Some exams/assignments are given only by week number; pick the date yourself.",
  "Bu belge bir syllabus'a benzemiyor; bulunanları dikkatle kontrol et.": "This document doesn't look like a syllabus; check what was found carefully.",
  "Dersin adı bulunamadı.": "Course name not found.",
  "Ders kodu bulunamadı.": "Course code not found.",
  "Kredi bulunamadı; GNO için UMIS'teki kredisini gir.": "Credits not found; enter the credits from UMIS for your GPA.",
  "Ders çevrimiçi, saati yazmıyor; UMIS'teki saatini gir.": "The course is online and has no time listed; enter the time from UMIS.",
  "Ders saatleri bulunamadı.": "Class times not found.",
  "Birden fazla şube listelenmiş; aşağıda kendi şubeni seç.": "Several sections are listed; pick yours below.",
  "Birden fazla şube listelenmiş; sadece kendi şubenin ders saatini bırak, diğerlerini sil.": "Several sections are listed; keep only your section's class time and delete the others.",
  "Not dağılımı bulunamadı.": "Grade breakdown not found.",
  "Yoklama alınıyor ama devam oranı yazmıyor; hocana sorup gir.": "Attendance is taken but the required rate isn't stated; ask your instructor and enter it.",
  "Devam şartı bulunamadı.": "Attendance requirement not found.",
  "Devamsızlık saat olarak verilmiş; Köprü ders sayısıyla sayar, kontrol et.": "Absences are given in hours; Köprü counts classes, so check it.",
  "Devamsızlık hafta olarak verilmiş; haftada birden çok ders varsa sayıyı ona göre düzelt.": "Absences are given in weeks; if there's more than one class a week, adjust the number.",
  "Bu bir tıp ders kurulu rehberi: birden çok kurulun sınavları listelendi. Yalnız kendi kurulunun sınavlarını işaretli bırak; not dağılımını kurul rehberinden kontrol et.": "This is a medical block guide: exams of several blocks are listed. Keep only your block's exams checked; check the grade breakdown in the block guide.",
  "Sınav veya ödev tarihi bulunamadı.": "No exam or assignment dates found.",
  "Bu dosyanın metni bozuk okunuyor (yazı tipi kodlaması); bulunanlara güvenme. Syllabus'un başka bir sürümünü (ör. Word) yükle veya bilgileri elle gir.": "This file's text reads garbled (font encoding); don't trust what was found. Upload another version of the syllabus (e.g. Word) or enter the details by hand.",

  // Kurallar
  "Yoklama alınıyor; devam oranı syllabus'ta yazmıyor.": "Attendance is taken; the required rate isn't in the syllabus.",
  "Oranı hocana sor ve Dönem panelinde gir.": "Ask your instructor and enter it on the Term screen.",
  "Derse devam notlandırılıyor; gelmediğin her ders notunu düşürebilir.": "Attendance is graded; every class you miss can lower your grade.",
  "Geç gelir ya da erken çıkarsan o ders devamsız sayılabilir.": "Arriving late or leaving early can count as an absence.",
  "Devamsızlık hakkından düşer.": "It counts against your absence allowance.",
  "Altında kalırsan diğer notlarından bağımsız F alabilirsin.": "Below that you can get an F regardless of your other grades.",
  "Ara sınava girmezsen finale giremezsin.": "If you miss the midterm, you can't take the final.",
  "Altında kalırsan finale giremezsin.": "Below that you can't take the final.",
  "Sınava/quize girmezsen o not 0 olur.": "If you miss an exam/quiz, that grade is 0.",
  "Mazeret sınavı yok; o günü boş tut.": "There's no make-up exam; keep that day free.",
  "Finali kaçırırsan telafisi bütünleme sınavı.": "If you miss the final, the make-up is the resit exam.",
  "Bütünleme notu final notunun yerine geçer.": "The resit grade replaces the final grade.",
  "Bütünleme sınavı var.": "There is a resit exam.",
  "Geç teslim kabul edilmiyor.": "Late work is not accepted.",
  "Geç teslim edilen iş 0 alır.": "Late work gets 0.",
  "Geç teslim için puan kesintisi var.": "Late work loses points.",
  "Sağlık raporu ya da mazeret devamsızlığını silmiyor.": "A medical report or excuse doesn't erase an absence.",
  "Raporlu günler de devamsızlık hakkından düşer.": "Days with a medical report also count against your allowance.",
  "İnternet, bilgisayar ya da elektrik arızası mazeret sayılmıyor.": "Internet, computer or power failures don't count as excuses.",
  "Teslimleri son dakikaya bırakma, yedek cihaz/yer planla.": "Don't leave submissions to the last minute; plan a backup device/place.",
  "Ara sınav için mazeret sınavı yok; giremezsen final notun o sınavın yerine sayılır.": "There's no make-up for the midterm; if you miss it, your final grade counts in its place.",
  "Finalin ağırlığı artar; ikisini birden kaçırma.": "The final weighs more; don't miss both.",
  "Mazeret/telafi sınavı yapılmıyor.": "There are no make-up exams.",
  "Mazeret sınavı sadece belgeli mazeretle (ör. sağlık raporu) veriliyor.": "Make-up exams are only given with a documented excuse (e.g. a medical report).",
  "Mazeret/telafi sınavı için kurallar var.": "There are rules for make-up exams.",
  "Sınavı kaçırırsan o not 0 olur.": "If you miss the exam, that grade is 0.",
  "Belge yoksa kaçırdığın sınav 0 sayılır.": "Without a document, a missed exam counts as 0.",
  "Biri kötü geçse de telafi şansın var.": "If one goes badly, you still have a chance to make up for it.",
  "Quiz notu için o derste yoklamada olman gerekiyor.": "You must be on the attendance list in that class to get the quiz grade.",
  "Yoklama kaydın yoksa o quiz 0 sayılır.": "Without an attendance record, that quiz counts as 0.",
  "Emin olmadığın soruyu boş bırakmak daha iyi olabilir.": "Leaving a question you're unsure about blank may be better.",
  "Final teslimi zorunlu.": "The final submission is mandatory.",
  "Teslim etmezsen dersi geçemezsin.": "If you don't submit it, you can't pass the course.",
  "Ek puan (bonus) imkânı var.": "There's a chance for bonus points.",
  "Harf notları bağıl (sınıfa göre) veriliyor.": "Letter grades are curved (relative to the class).",
  "Harf notları mutlak sistemle veriliyor.": "Letter grades are absolute.",
  "Habersiz quiz yapılabiliyor.": "There can be pop quizzes.",
  "Derse hazırlıksız gelirsen puan kaybedebilirsin.": "Coming unprepared can cost you points.",
  "Aynı ödev ya da sınav cevabını veren herkes başarısız sayılıyor.": "Everyone who hands in the same homework or exam answer fails.",
  "Ödevini paylaşma; benzer çıkarsa iki taraf da kaybeder.": "Don't share your homework; if it matches, both sides lose.",
  "Üstündeyse ödevin intihal sayılabilir.": "Above that, your work can count as plagiarism.",
  "Yapay zekâ ile ödev yazmak intihal sayılıyor.": "Writing assignments with AI counts as plagiarism.",
  "Yapay zekâ kullanımı için kurallar var.": "There are rules for using AI.",
  "Kopya ve intihal kesinlikle yasak.": "Cheating and plagiarism are strictly forbidden.",
  "Tespit edilirse F ve disiplin cezası alabilirsin.": "If caught, you can get an F and a disciplinary penalty.",
  "Sınava öğrenci kimliğinle gelmen gerekiyor.": "You must bring your student ID to exams.",
  "Kimliksiz sınava alınmayabilirsin.": "Without ID you may not be allowed into the exam.",
};

const UNIT = { ders: "class", saat: "hour", hafta: "week" };
const unitEn = (u, n) => { const w = UNIT[u] || u; return Number(n) === 1 ? w : w === "class" ? "classes" : w + "s"; };
const WHAT = { quiz: "quizzes", ödev: "assignments", lab: "labs" };

// [kalıp, İngilizce] — kalıp tüm metni karşılar
export const PATTERNS = [
  [/^Bazı tarihlerde yıl yazmıyor; (\d{4}) varsayıldı\.$/, (m) => `Some dates have no year; ${m[1]} was assumed.`],
  [/^(.+) ders saatinde; saatini kendi şubenin ders saatine göre gir\.$/, (m) => `${m[1]} is during class time; enter the time of your own section.`],
  [/^(.+) tarihi syllabus'ta yazmıyor; ilan edilince gir\.$/, (m) => `The date of ${m[1]} isn't in the syllabus; enter it once announced.`],
  [/^(.+) tarihleri syllabus'ta yazmıyor; ilan edilince gir\.$/, (m) => `The dates of ${m[1]} aren't in the syllabus; enter them once announced.`],
  [/^Hocanın e-posta adresi eksik okunmuş olabilir \((.+)\); kontrol et\.$/, (m) => `The instructor's email may have been read incompletely (${m[1]}); check it.`],
  [/^Not ağırlıklarının toplamı %([\d.,]+), 100 değil; kontrol et\.$/, (m) => `The grade weights add up to ${m[1]}%, not 100; check them.`],
  [/^Bu belgede (\d+) ders var; sadece (.+?) okundu\. (.+) için o dersin sayfalarını ayrı yükle\.$/, (m) => `This document has ${m[1]} courses; only ${m[2]} was read. For ${m[3]}, upload that course's pages separately.`],
  [/^Not oranları kurula göre değişiyor \((.+)\); ilk kurulunki getirildi\. Kendi kurulununkini kontrol et\.$/, (m) => `Grade weights differ by block (${m[1]}); the first block's were used. Check your own block's.`],
  [/^Derslerin en az %(\d+)'\S+ devam zorunlu\.$/, (m) => `You must attend at least ${m[1]}% of classes.`],
  [/^En fazla (\d+) (\S+) devamsızlık hakkın var\.$/, (m) => `You can miss at most ${m[1]} ${unitEn(m[2], m[1])}.`],
  [/^Sınırı aşarsan (\w+) alırsın ve finale giremezsin\.$/, (m) => `Go over the limit and you get ${m[1]} and can't take the final.`],
  [/^Finalden en az ([\d.,]+) alman gerekiyor\.$/, (m) => `You need at least ${m[1]} on the final.`],
  [/^Dönem içi notun en az ([\d.,]+) olmalı\.$/, (m) => `Your in-term grade must be at least ${m[1]}.`],
  [/^Ara sınav ortalaman en az ([\d.,]+) olmalı\.$/, (m) => `Your midterm average must be at least ${m[1]}.`],
  [/^Finale girebilmek için dönem içi notlarından en az ([\d.,]+) alman gerekiyor\.$/, (m) => `To take the final you need at least ${m[1]} from your in-term grades.`],
  [/^Finale giremeyen (\w+) alır\.$/, (m) => `Anyone who can't take the final gets ${m[1]}.`],
  [/^Geç teslimde her gün için %([\d.,]+) kesinti var\.$/, (m) => `Late work loses ${m[1]}% per day.`],
  [/^(?:(Quiz|Ödev|Lab)lerden e|E)n iyi (\d+)(?:\/(\d+))? tanesi sayılıyor\.$/, (m) => `Only your best ${m[2]}${m[3] ? ` of ${m[3]}` : ""} ${m[1] ? WHAT[m[1].toLocaleLowerCase("tr-TR")] : "scores"} count.`],
  [/^En düşük (?:(quiz|ödev|lab) )?notun hesaba katılmıyor\.$/, (m) => `Your lowest ${m[1] ? ({ quiz: "quiz", ödev: "assignment", lab: "lab" })[m[1]] + " " : ""}grade is dropped.`],
  [/^Sınavda (\d+) yanlış 1 doğruyu götürüyor\.$/, (m) => `In exams, ${m[1]} wrong answers cancel 1 right answer.`],
  [/^Benzerlik \(Turnitin\) oranı en fazla %([\d.,]+) olmalı\.$/, (m) => `The similarity (Turnitin) score must be at most ${m[1]}%.`],
  [/^Sınava\/derse (\d+) dakikadan fazla geç gelen alınmıyor\.$/, (m) => `Anyone more than ${m[1]} minutes late isn't let into the exam/class.`],
];

export function readerEn(s) {
  if (typeof s !== "string" || !s) return s;
  if (s in EXACT) return EXACT[s];
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(s);
    if (m) return fn(m);
  }
  return s;
}
