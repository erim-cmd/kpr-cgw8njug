# Köprü — Gerçek syllabus testi: MCH 2016

**Tarih:** 26 Eylül 2026 · **Syllabus:** MCH 2016 – Materials and Manufacturing Processes, Spring 2026 (BAU, İngilizce, 2 sayfa PDF)
**Test edilen:** Köprü'nün **cihaz içi okuyucusu** (`doc-text.js` + `syllabus-local.js`), dal `syllabus/mch2016-api-testi`, v2.9.1
**Ortam:** `npm run dev` (wrangler 4.141.0) ile `localhost:8788`; uygulamaya tarayıcıdan PDF yüklendi, kontrol ekranı → kaydet → Ortalama.

## Sonuç

- **Tarih ve not bileşenleri: 6/6 doğru (%100). Uydurma kayıt: 0.** Hedef (≥ %90, uydurma yok) sağlandı.
- Test başında (düzeltmeden önce) sonuç **5/6 (%83) ve 1 uydurma kayıt** idi: Vize 1'e syllabus'ta olmayan bir tarih (20 Nisan) yazılıyordu. Hata ayrıştırıcıda düzeltildi (commit `9a1e8a3`, `cec1cde`).
- Kredi, AKTS ve devam şartı **syllabus'ta yazmıyor**; okuyucu bunları doğru şekilde boş bıraktı ve öğrenciyi uyardı. Ders Ortalama tablosuna eklendi; kredi girilene kadar GNO'ya katılmıyor (BAU kuralı gereği).
- **Yapay zekâ (Anthropic API) ile okuma ölçülmedi** — ayrıntı aşağıda.

## Ne yazıyor, ne çıktı

Puanlanan satırlar (tarih + not bileşeni) **kalın**.

| Alan | Syllabus'ta yazan | Köprü'nün çıkardığı | Sonuç |
|---|---|---|---|
| Ders kodu | MCH 2016 | MCH 2016 | Doğru |
| Ders adı | Materials and Manufacturing Processes | Materials and Manufacturing Processes | Doğru |
| Dönem | Spring 2026 | 2025–2026 Bahar; tarihler 2026 | Doğru |
| Hoca | (syllabus'taki ad) | aynı | Doğru |
| E-posta | (kurum adresi) | aynı | Doğru |
| Ofis | yazmıyor | boş | Doğru |
| Ofis saati | Mondays, 11:30 – 12:30 | Mondays, 11:30 – 12:30 | Doğru |
| Kredi | yazmıyor | boş + "Kredi bulunamadı" uyarısı | Doğru |
| AKTS | yazmıyor | boş | Doğru |
| Devam şartı | yazmıyor | boş + "Devam şartı bulunamadı" uyarısı | Doğru |
| Ders saatleri | Şube 1: Pzt 12:30–15:20 B403 · Şube 2: Pzt 08:30–11:20 B201 | ikisi de + "Birden fazla şube… kendi şubeni bırak" uyarısı | Doğru (öğrenci birini siler) |
| **Not: Mid-term Exam 1** | %40 | %40 | **Doğru** |
| **Not: Mid-term Exam 2** | %40 | %40 | **Doğru** |
| **Not: Final Project** | %20 | %20 | **Doğru** |
| **Vize 1 tarihi** | "TBA (Midterms Week) – No class Apr 20" | tarihsiz, işaretsiz; "Tarih bulunamadı" ipucu | **Doğru** (önceden ✗: 20 Nisan uyduruluyordu) |
| **Vize 2 tarihi** | "Jun 15 · Mid Term Exam 2 during class time" | 15 Haziran 2026, saat boş + "saatini şubene göre gir" uyarısı | **Doğru** |
| **Final Project teslimi** | tarih yok | görev oluşturulmadı | **Doğru** (uydurmadı) |
| Ders olmayan günler | "No class Apr 20", "May 25 HOLIDAY BREAK" | görev oluşturulmadı | Doğru |
| Haftalık konular | Mar 2 … Jun 8 (konu başlıkları) | görev oluşturulmadı | Doğru |
| Kural: kopya | "Cheating … referred to the college administration" | "Kopya ve intihal kesinlikle yasak" (Dikkat) | Doğru |
| Harf tablosu | 90–100 A · 80–89 B · 70–79 C · 60–69 D · <60 F | çıkarılmadı | **Eksik** (ölçüte dahil değil) |
| Diğer kurallar | e-posta iletişimi, CMS, "syllabus sözleşmedir" | çıkarılmadı | Eksik, önemsiz |

**Puan:** 3 not bileşeni + 3 değerlendirme tarihi = 6 kalem → 6 doğru. Tarihli görev olarak yalnız Vize 2 kaydedilir; Vize 1 öğrenci tarihi girince eklenir.

## Bulunan ve düzeltilen hatalar

| # | Hata | Tür | Durum |
|---|---|---|---|
| 1 | Vize 1'e 20 Nisan yazıldı: sınavın kendi hücresinde tarih yokken yan hücredeki "No class Apr 20" ödünç alındı. Kontrol ekranında **işaretli** geliyordu. | Uydurma kayıt | Düzeltildi |
| 2 | İki şubenin saati birden ders saati olarak geldi, uyarı yoktu (takvimde haftada 2 ders görünür). | Eksik uyarı | Düzeltildi (uyarı) |
| 3 | "Mid Term Exam 2 during class time" başlığında ek kalıyordu; saatin şubeye bağlı olduğu söylenmiyordu. | Küçük | Düzeltildi |
| 4 | Final sınavı olmayan derste "Final tarihi bulunamadı" uyarısı çıkıyordu. | Yanıltıcı uyarı | Düzeltildi |

Hepsi için kalıcı test eklendi. Senin PDF'in depoya konmadı; aynı yapıyı taklit eden kurgusal bir örnek (`test/syllabus/en_sube_tba.txt`) var. Eski ayrıştırıcı bu örnekte 4 hata veriyor, yenisi geçiyor. Tüm paket: **280 doğru, 0 hata** (`node test/check.mjs`).

## Kalan eksikler

1. **Harf tablosu okunmuyor.** Bu syllabus'ta hocanın kendi tablosu var (A/B/C/D/F, artı-eksisiz). Ders puanından harf tahmini için değerli; ayrıştırıcıya eklenebilir.
2. **Şube seçimi elle.** Okuyucu uyarıyor ama öğrenci yanlış şubeyi silmezse takvimde iki ders görünür. İyileştirme: kontrol ekranında "hangi şubedesin?" seçimi.
3. **Dönem geçmişte.** Spring 2026 bittiği için bu dersi şimdi yükleyen öğrenci Vize 2'yi "gecikti" olarak görür. Doğru ama demoda şaşırtabilir; sunumda güncel dönem syllabus'u kullanılmalı.

## Yapay zekâ ile okuma (API): ölçülmedi

- `functions/api/syllabus.js` wrangler ile localhost'ta çalıştı:
  - Anahtarsızken 503 döndü, anahtarla boş isteğe 400 döndü.
  - **Günlük 5 sınırı doğrulandı:** Sayaç 5'e getirildi; 6. istek Claude'a gitmeden 0,27 sn'de 429 aldı. Sayaç sonra sıfırlandı; kodda sınır değişmedi.
- Girilen API anahtarı Anthropic tarafından reddedildi (401 `authentication_error`); bu yüzden gerçek yapay zekâ okuması yapılamadı ve ücret doğmadı. Sonrasında kullanıcı API harcaması yapılmamasını istedi; test cihaz içi okuyucuyla tamamlandı.
- Uygulamada yapay zekâ **isteğe bağlı** kaldı: yükleme ekranında açık rıza kutusu varsayılan kapalı; seçilmezse dosya cihazdan çıkmaz. Sunucu yoksa (GitHub Pages) seçenek görünmez.

## Karşılaştırma notu: DormWay

Kullanıcı gözlemi (26 Eylül 2026): DormWay'in telefon uygulamasında internet kapatıldığında syllabus yükleme çalışmıyor, bazı özellikler "inaktif" oluyor. Köprü'nün cihaz içi okuyucusu bu testte **internet gerektirmeden** çalıştı. Kanıt için DormWay'in çevrimdışı ekranının görüntüsü bu rapora eklenmeli.

"DormWay bu syllabus'la program oluşturamadı" iddiası bu testte **doğrulanmadı**; sadece Köprü tarafı ölçüldü. Sunumdan önce aynı PDF'i iki uygulamaya da, internet açıkken ve kapalıyken yükleyip ekran kaydı alınması önerilir.
