from docx import Document
import json
def table(doc, rows):
    t = doc.add_table(rows=len(rows), cols=max(len(r) for r in rows)); t.style = "Table Grid"
    for i, r in enumerate(rows):
        for j, v in enumerate(r): t.cell(i, j).text = str(v)
exp = json.load(open("expected.json"))

# 4) BAU İngilizce Bologna: yatay başlıklı tablo
d = Document()
d.add_heading("COURSE SYLLABUS", 0)
d.add_paragraph("Academic Year 2026-2027, Fall Semester")
table(d, [["Course Code", "Course Name", "Semester", "Theory", "Practice", "Credit", "ECTS"],
          ["ME 3201", "Fluid Mechanics", "5", "3", "2", "4", "6"]])
table(d, [["Instructor", "Assoc. Prof. Dr. Elif Şahin"], ["Contact", "elif.sahin@bau.edu.tr, Room F-310"],
          ["Office Hours", "Monday 15:00-17:00"], ["Class Schedule", "Monday/Wednesday 10:00-11:50, Room A-201; Friday 13:00-14:50 (Lab: M-Lab 3)"]])
d.add_heading("Assessment Methods and Criteria", 2)
table(d, [["Semester Requirements", "Number of Activities", "Level of Contribution"],
          ["Quizzes", "4", "% 10"], ["Laboratory", "6", "% 15"], ["Midterms", "1", "% 25"], ["Final", "1", "% 50"],
          ["Total", "", "% 100"]])
table(d, [["PERCENTAGE OF SEMESTER WORK", "% 50"], ["PERCENTAGE OF FINAL WORK", "% 50"], ["TOTAL", "% 100"]])
d.add_heading("Course Schedule", 2)
table(d, [["Week", "Subject", "Notes"],
          ["1", "Introduction, fluid properties", ""], ["4", "Bernoulli equation", "Quiz 1 (Oct 16)"],
          ["7", "Momentum analysis", "Midterm Exam: Nov. 4, 2026, 18:30"], ["9", "Dimensional analysis", "Lab Report 1 due Nov 20"],
          ["14", "Review", ""]])
d.add_paragraph("Students who do not attend at least 70% of the classes and 80% of the laboratory sessions will be given NA and will not be allowed to take the final exam.")
d.add_paragraph("A student must get at least 35 points from the final exam to pass the course.")
d.add_paragraph("Make-up exams are given only for documented excuses approved by the faculty.")
d.save("en_bologna.docx")
exp["en_bologna"] = {"code": "ME 3201", "name": "Fluid Mechanics", "instructor": "Assoc. Prof. Dr. Elif Şahin",
  "email": "elif.sahin@bau.edu.tr", "office": "F-310", "credit": 4, "ects": 6,
  "sessions": [[0, "10:00", "11:50", "A-201"], [2, "10:00", "11:50", "A-201"], [4, "13:00", "14:50", "M-Lab 3"]],
  "grading": {"Quizzes": 10, "Laboratory": 15, "Midterms": 25, "Final": 50},
  "attendance": 70, "final_min": 35,
  "items": [["Quiz 1", "2026-10-16"], ["Midterm Exam", "2026-11-04", "18:30"], ["Lab Report 1", "2026-11-20"]],
  "policies": ["baraj", "devam", "telafi"]}

# 5) Türkçe, iki ara sınav, parantez içi tarihler, "Ekim 13" gibi yazımlar
d = Document()
d.add_paragraph("ENM 2004 – Olasılık ve İstatistik")
d.add_paragraph("2026-2027 Güz Yarıyılı")
d.add_paragraph("Dersi Veren: Doç. Dr. Hakan Aydın")
d.add_paragraph("İletişim: hakan.aydin@bau.edu.tr")
d.add_paragraph("Kredi: 3   AKTS: 5")
d.add_paragraph("Ders Saatleri: Çarşamba 13.00-15.50 (B-104)")
d.add_heading("Başarı Değerlendirme", 2)
d.add_paragraph("1. Ara Sınav (%20) – 21 Ekim 2026 Çarşamba, 13.00")
d.add_paragraph("2. Ara Sınav (%20) – 25 Kasım 2026")
d.add_paragraph("Ödevler (%20): Her ödev teslim tarihi Moodle'da ilan edilir.")
d.add_paragraph("Final (%40): Final haftasında, tarih akademik takvimde ilan edilecektir.")
d.add_paragraph("Her iki ara sınavdan birine giremeyen öğrenciye mazeret sınavı yapılmaz; final notu o ara sınavın yerine sayılır.")
d.add_paragraph("En düşük ödev notu hesaba katılmaz.")
d.add_paragraph("Derse %70 devam zorunludur.")
d.save("tr_ikivize.docx")
exp["tr_ikivize"] = {"code": "ENM 2004", "name": "Olasılık ve İstatistik", "instructor": "Doç. Dr. Hakan Aydın",
  "email": "hakan.aydin@bau.edu.tr", "office": "", "credit": 3, "ects": 5,
  "sessions": [[2, "13:00", "15:50", "B-104"]],
  "grading": {"1. Ara Sınav": 20, "2. Ara Sınav": 20, "Ödevler": 20, "Final": 40},
  "attendance": 70, "final_min": None,
  "items": [["1. Ara Sınav", "2026-10-21", "13:00"], ["2. Ara Sınav", "2026-11-25"], ["Final", ""]],
  "policies": ["devam", "not_kurali", "telafi"]}

# 6) Bologna Türkçe: yarıyıl içi tablo + özet katkı satırları, hafta planında sadece hafta
d = Document()
d.add_heading("DERS BİLGİ FORMU", 0)
table(d, [["Dersin Kodu", "Dersin Adı", "Yarıyıl", "T+U Saat", "Kredi", "AKTS"],
          ["MAT 1001", "Matematik I", "1", "4+0", "4", "6"]])
table(d, [["Dersin Öğretim Elemanı", "Prof. Dr. Zeynep Koç"], ["Ders Gün ve Saatleri", "Salı 09:00-10:50 / Perşembe 09:00-10:50, Derslik: A-110"]])
d.add_heading("Değerlendirme Sistemi", 2)
table(d, [["Yarıyıl İçi Çalışmaları", "Sayısı", "Katkı Payı (%)"],
          ["Ara Sınav", "1", "70"], ["Kısa Sınav", "2", "30"], ["Toplam", "", "100"]])
table(d, [["Yarıyıl İçinin Başarıya Oranı", "60"], ["Finalin Başarıya Oranı", "40"], ["Toplam", "100"]])
d.add_heading("Haftalık Konular", 2)
table(d, [["Hafta", "Konular"], ["1", "Fonksiyonlar"], ["5", "Kısa Sınav 1"], ["8", "Ara Sınav"], ["11", "Kısa Sınav 2"], ["14", "Genel tekrar"]])
d.add_paragraph("Öğrencinin devamsızlığı derslerin %30'unu geçemez. Geçen öğrenci devamsızlıktan kalır.")
d.save("tr_bologna.docx")
exp["tr_bologna"] = {"code": "MAT 1001", "name": "Matematik I", "instructor": "Prof. Dr. Zeynep Koç",
  "email": "", "office": "", "credit": 4, "ects": 6,
  "sessions": [[1, "09:00", "10:50", "A-110"], [3, "09:00", "10:50", "A-110"]],
  "grading": {"Ara Sınav": 42, "Kısa Sınav": 18, "Final": 40},
  "attendance": 70, "final_min": None,
  "items": [["Kısa Sınav 1", "", None, 5], ["Ara Sınav", "", None, 8], ["Kısa Sınav 2", "", None, 11]],
  "policies": ["devam"]}
json.dump(exp, open("expected.json", "w"), ensure_ascii=False, indent=1)
