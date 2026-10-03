# İzlence formatları kataloğu ve okuyucu test şartnamesi

3 Eki 2026. Web araştırması: 17 devlet + 4 vakıf üniversitesi belgesi. BAU sitelerine girilmedi; belgelerde hoca adı/iletişim bilgisi bu dosyaya alınmadı.

Amaç: Köprü'nün syllabus okuyucusu formatı ne olursa olsun her izlenceyi okusun ve bilgiyi her yerde eksiksiz kullansın. Bu dosya okuyucunun karşılaşacağı yapıları ve "kusursuz"un ölçüsünü tanımlar.

## 1. "Kusursuz" ne demek

Hiçbir okuyucu her alanı %100 bulamaz, çünkü bazı izlencelerde bilgi hiç yok. Kusursuz okuyucu şudur:

1. **Uydurma sıfır.** İzlencede olmayan tarih, yüzde, eşik ya da kural üretmez. En kritik ölçüt bu: yanlış sınav tarihi, hiç tarih vermemekten kötüdür.
2. **Yokluğu doğru söyler.** Her alan için dört durumdan birini döner: `bulundu`, `belirtilmemiş`, `LMS'de / sonra duyurulacak`, `okunamadı`.
3. **Bulunan alanlarda doğruluk ≥ %95** (test setinin tamamında, alan bazında).
4. **Her değerin kaynağı gösterilir** (sayfa ve ilgili cümle), öğrenci düzeltebilir.

## 2. Çıkarılacak alanlar

| Alan | Not |
|---|---|
| Ders kodu, adı | Aynı ders "GKS-103" / "GKS103" gibi farklı yazılabilir; normalize et |
| Kredi, AKTS | Ayrı alanlarda, tek hücrede ("2/3"), biri eksik ya da ikisi de yok olabilir |
| Ders saati, derslik | Bologna bilgi paketlerinde hiç yok; sadece hoca izlencelerinde |
| Değerlendirme bileşenleri ve ağırlıkları | İç içe olabilir, %100 etmeyebilir, %0 olabilir |
| Sınav/teslim tarihleri | Kesin tarih, hafta no, tarih aralığı, göreli ya da yok |
| Haftalık plan | 14 / 15 / 16 / 28 hafta; tıpta gün × saat ızgarası |
| Devam şartı ve sonucu | Yüzde, saat ya da hafta sayısı; sonuç NA / VF / U / FZ |
| Not kuralları | En düşük not atılır, bileşen barajı, bütünleme yok, eksik sınav = 0 |

## 3. Format türleri

| Tür | Nasıl görünür | Örnek |
|---|---|---|
| A. Bologna HTML bilgi paketi | Sabit şablon: "Sayısı / Katkı Payı %" tablosu, haftalık konu, AKTS iş yükü. Tarih, saat, derslik yok | Uludağ HUK1043 |
| B. PDF ders tanıtım formu | Kurum şablonu (ör. FR.348), tablolu; çoğu zaman tarih yerine hafta no | ALKÜ, Nevşehir, Gaziantep, ESOGÜ |
| C. Hoca izlencesi (serbest metin) | PDF ya da HTML; kesin tarih, saat, derslik, kurallar; çoğu İngilizce | İTÜ MAK 210E, Boğaziçi POLS 246, Bilkent CS 202 |
| D. Tıp ders kurulu | Haftalık plan yok; gün × saat ızgarası, kurul sınav tarihleri, yüzde ve AKTS yok | Gazi Tıp Dönem I |
| E. Toplu belge | Tek PDF'te çok ders ya da sayfalara bölünmüş tek tablo | ALKÜ (11 ders), Ege Diş (14 sayfa) |
| F. İzlence olmayan belge | Sınav programı, boş şablon, müfredat planı | ODTÜ/Marmara sınav programları, Ardahan boş şablon |

## 4. Zor kalıplar ve beklenen davranış

| # | Kalıp | Gerçek örnek | Okuyucu ne yapmalı |
|---|---|---|---|
| 1 | Bozuk karakter kodlaması | Uludağ: ders adı anlamsız karakterler olarak çıkıyor | Metin katmanı anlamsızsa görüntüden oku (OCR/vision); okunamazsa `okunamadı` |
| 2 | Ağırlıklar %100 etmiyor | ÇOMÜ: Vize 40 + Final 60, altında üç ayrı %10 (toplam 130) | Toplamı kontrol et; tutarsızsa uyar, tahminle düzeltme |
| 3 | Ağırlık satırı boş | ALKÜ: quiz/proje satırı var, yüzde yok | Bileşeni listele, ağırlık `belirtilmemiş` |
| 4 | Ağırlık %0 | Bilkent GE 308: ödev var, ağırlığı 0 | `%0` ile `belirtilmemiş`i ayır |
| 5 | İç içe ağırlıklar | Ege Diş: yıl içi %40 → 1. ara %45 → gerçek etki %18 | Düzleştir; GNO hesabına gerçek etkiyi ver |
| 6 | Hafta no, kesin tarih yok | "8. hafta Ara Sınav" (çoğunluk) | Akademik takvimle tarihe çevir; çevrildiğini işaretle |
| 7 | Tarih aralığı, yıl yok | ESOGÜ: "03-07 Şubat" | Yılı dönem bilgisinden al |
| 8 | Göreli tarih | TOBB ETÜ: "finaller bitmeden 7 gün önce" | Takvim varsa hesapla, yoksa metni olduğu gibi göster |
| 9 | Belirsiz / LMS'de | "TBA", "announced later", "Moodle'dan duyurulur" | `LMS'de / sonra duyurulacak`; asla tarih uydurma |
| 10 | Hiç tarih yok | Uludağ, Munzur, Muğla | `belirtilmemiş`; öğrenciden ekleme iste |
| 11 | Birden çok tarih yazımı | "13.01.2025", "7 Nisan 2025 Pazartesi", "24-Mar-26 TUE", "Nov 01, 2018" | Hepsini tek formata çevir |
| 12 | Tek PDF'te çok ders | ALKÜ 11 ders | Ders sınırlarını ayır, öğrenciye hangisi diye sor |
| 13 | Sayfalara bölünmüş tablo | Ege Diş 14 sayfa | Başlığı sayfadan sayfaya taşı |
| 14 | Birleşik hücreler | Gazi Tıp, Marmara | Birleşik değeri kapsadığı her satıra uygula |
| 15 | Kredi/AKTS belirsiz | ESOGÜ "2/3"; Gaziantep "8 kredi" (muhtemelen saat) | Emin değilse sor; kredi ↔ AKTS'yi karıştırma (BAU GNO'su ulusal krediyle) |
| 16 | Devam şartı farklı birimlerde | %70 / uygulamada %80; "4 haftadan fazla"; saat | Devamsızlık sayacına aynı birimde aktar |
| 17 | Devam kaydı var, nota etkisi yok | Bilkent CS 202 | Sayaç kurma; "kayıt tutuluyor" diye göster |
| 18 | Devamsızlığın sonucu harf notu | İTÜ "VF", TOBB "U" | NA/FZ dışındaki kodları da tanı |
| 19 | En düşük not atılır, kaçırılan = 0 | Bilkent GE 308 | Not hesaplayıcıya kural olarak aktar |
| 20 | Bileşen barajı | Bilkent CS 202: her ödev ve vizeden ≥%30; İTÜ ara sınav ort. <35 kalır | Kural tuzağı uyarısına aktar |
| 21 | Bütünleme yok | TOBB ETÜ | Açıkça `yok` |
| 22 | Harf notu tablosu değerlendirmeye karışıyor | "AA=90 … DD=60" | Ağırlık sanma; ayrı alan |
| 23 | İki dil karışık | ALKÜ (TR etiket, DE/EN içerik), Boğaziçi, Marmara | Dil fark etmeksizin aynı alanlara eşle |
| 24 | Yazım hataları, çelişkili sayılar | ESOGÜ "10.30-1.00"; Muğla "1 hafta" ama ~39 saat | Düzeltme önerme; uyar ve kaynağı göster |
| 25 | Boş şablon | Ardahan, ÇOMÜ Eğitim | "Bu belge doldurulmamış" de; %0 ya da %100 üretme |
| 26 | İzlence değil | Sınav programı PDF'i | Tanı; sınav programıysa sadece tarihleri al |
| 27 | Taranmış (görüntü) PDF | Bu turda gerçek örnek bulunamadı | Görüntüden oku; test için örnek gerekli (bkz. 6) |

## 5. Test seti

Her belge için beklenen değerler elle yazılır, `test-syllabus/` düzenine eklenir. Dosyaları test setine almadan önce bir kez elle aç ve beklenenleri doğrula.

| # | Belge | Neyi test eder | URL |
|---|---|---|---|
| 1 | Uludağ HUK1043 | Tür A, 28 hafta, yalnız AKTS, bozuk kodlama | https://bilgipaketi.uludag.edu.tr/DersProgramiRapor/DersIcerikRaporTekHftIcerik/1381398?Dil=0 |
| 2 | ALKÜ Beslenme | Tür E, 11 ders, boş ağırlıklar, yabancı dil | https://saglikbf.alanya.edu.tr/media/nhmefcy5/2024-2025_gu-z_i-zlence_bes.pdf |
| 3 | Gazi Tıp Dönem I | Tür D, ızgara, birleşik hücre, kurul sınavları | https://webupload.gazi.edu.tr/upload/46/2022/9/13/8930b06e-2d57-4a67-9829-6633da1b51d3-2022-2023-di-tibba-giris-ders-kurulu-tr.pdf |
| 4 | Ege Diş ağırlıklar | İç içe ağırlık, 14 sayfa tablo | https://dent.ege.edu.tr/files/dent/icerik/2025-2026%20TUM%20DERS%20YUZDELER.pdf |
| 5 | İTÜ MAK 210E | Tür C, kesin tarih + TBA, VF, ara sınav barajı, saat/derslik | https://web.itu.edu.tr/hoksuzoglu/semester/syllabus/HO_MAK%20210E-Engineering_Mathematics-Fall_2019.pdf |
| 6 | ÇOMÜ Ayvacık | %130 toplam, hafta cinsinden devamsızlık | https://cdn.comu.edu.tr/cms/ayvacik/files/488-ders-bilgi-formu.pdf |
| 7 | ESOGÜ Tecvid II | "2/3" kredi, yılsız tarih aralığı | https://ilahiyat.ogu.edu.tr/Storage/IlahiyatFakultesi/Uploads/Kur'an-Okuma-ve-Tecvid-II.pdf |
| 8 | Bilkent CS 202 | Bileşen barajı, nota etkisiz yoklama, LMS'de tarihler | https://www.cs.bilkent.edu.tr/~adayanik/cs202 |
| 9 | Bilkent GE 308 | En düşük quiz atılır, kaçırılan = 0, %0 ağırlık | https://kilyos.ee.bilkent.edu.tr/~aytur/courses/ge308/grading.html |
| 10 | TOBB ETÜ İktisat | U notu, göreli tarih, bütünleme yok | https://www.etu.edu.tr/files/dosyalar/2025/02/25/bf15f22bc2a08e40387d27490d787158.pdf |
| 11 | Ardahan şablon | Negatif test: boş belge | https://gsf.ardahan.edu.tr/Files/ckFiles/gsf-ardahan-edu-tr/Ders%20%C4%B0zlence%20Raporu.pdf |
| 12 | Boğaziçi POLS 246 | "Week 1 (Feb 23)", EN/TR karışık | https://mediastore.cc.bogazici.edu.tr/web/userfiles/files/POLS24601-2.pdf |
| + | `test-syllabus/` içindeki gerçek BAU syllabus'ları | Asıl kullanıcı formatı | (yerel, commit'e girmez) |

## 6. Eksikler

- **Taranmış PDF:** Gerçek örnek bulunamadı. En kolay yol: bir syllabus'u yazdırıp telefonla fotoğrafla ve PDF'e çevir; öğrenciler de çoğu zaman böyle yükleyecek. Bir de fotoğraf (JPG) versiyonu ekle.
- **Sentetik vakalar:** Gerçek örneği bulunamayan kalıplar için elle yazılmış kısa izlenceler: günlük % geç teslim cezası, "en iyi N quiz sayılır", bonus puan, eğri notlama, katılım puanı, "Week of Oct 14".
- **Resmi katalog sayfaları:** ODTÜ, Ankara, Ege, Marmara, Hacettepe katalogları bu ortamdan açılmadı; tarayıcıdan elle kaydedilip eklenebilir.

## 7. Durum (3 Eki 2026, v2.16)

Cihaz içi ayrıştırıcı (`syllabus-local.js`) bu kalıplarla test edildi. Kalıplar birebir taklit eden sentetik örneklerle `test/syllabus/web_*.txt` olarak eklendi (gerçek belgeler, hoca bilgisi içerdiği için repo'ya girmedi).

**Düzeltildi ve testte:**
- "Vize %40 - Final %60" ve "Sınav dışı: Derse devam %10" gibi tek satırlık not dağılımları (#2); devam kuralı cümlesi artık not bileşeni sanılmıyor
- İç içe ağırlıklar düzleştiriliyor: "Yıl içi %40: 1. Ara %45…" → 18 / 18 / 4 (#5); numaralı her sınav takvime ayrı düşüyor
- Açık %0 ağırlık korunuyor; Bologna'nın kullanılmayan "0 | 0" satırları bileşen sayılmıyor (#4)
- Tek PDF'te birden çok ders: ilki okunuyor, diğerleri uyarıyla adlandırılıyor (#12)
- Bozuk karakter kodlaması tespit ediliyor ve öğrenciye söyleniyor; metin onarılmıyor (#1)
- "24-Mar-26" tarih biçimi (#11); "Yıl sonu sınavı" final, "Paper/essay" bileşen olarak tanınıyor
- Finale giriş şartı ("ara sınav ortalaması 35'in altındaysa finale giremez", "her ödevden en az %30") finalin barajıyla karıştırılmıyor (#20)
- Devam oranı, not satırıyla birleşmiş cümleden de okunuyor; "en fazla üç hafta" gibi yazıyla sayılar (#16)
- "Sağlık raporu devamsızlığı silmez" artık devam uyarısı (önceden yanlışlıkla mazeret sınavı kuralı sayılıyordu)
- Ders adı bir sonraki başlığı yutmuyor ("Thermodynamics Grading" → "Thermodynamics")

**Açık:**
- Göreli tarih ("finaller bitmeden 7 gün önce") öğe olarak çıkmıyor (#8)
- Tıp ders kurulu ızgarasında ders saatleri oturum olarak okunmuyor (#14, D türü)
- Taranmış/fotoğraf syllabus: cihaz içi okuyucu metin katmanı olmayan dosyayı okuyamaz; bu yol AI sunucusuna bağlı (#27)
- AI sunucusu (`functions/api/syllabus.js`) gerçek API ile hiç ölçülmedi
