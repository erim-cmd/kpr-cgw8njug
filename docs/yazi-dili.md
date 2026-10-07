# Köprü — Yazı dili (UX dili)

Arayüzdeki her metin için tek kaynak. Uygulamadaki mevcut metinlerden çıkarıldı; yeni ekran, bildirim
ve App Store metinleri buna göre yazılır. Kontrol edilebilen kurallar `test/copy.mjs`'te (CI'da).

## Ses

Köprü, işini bilen bir **üst dönem arkadaşı** gibi konuşur: kısa, net, sakin. Öğrenciyi korkutmaz,
övmez, ders vermez; ne olduğunu ve ne yapacağını söyler.

| Yap | Yapma |
|---|---|
| "Yarın sınav: MCH 2016. Saat 10:00." | "Dikkat!!! Yarın çok önemli bir sınavınız var!" |
| "Bitirdiysen işaretle." | "Lütfen görevinizi tamamlandı olarak işaretleyiniz." |
| "Kalanlardan 100 alsan da yetmiyor. Hedefini güncelle." | "Maalesef hedefinize ulaşamayacaksınız." |
| "Bu dosyadan metin okunamadı. Word ya da metin içeren PDF dene." | "Hata oluştu." |

## Kurallar

1. **Hitap "sen", konuşan "biz".** Öğrenciye "sen" denir; siz, -sınız/-siniz, "Lütfen" yok. Arayüz kendinden "biz" diye söz eder ("haber verelim mi?", "hesaplayalım"). Yalnız Asistan sohbette "ben" der ("Bunu derslerinin bilgilerinde bulamadım."). (`test/copy.mjs`)
2. **Önce bilgi, sonra eylem.** "3 gün kaldı: Proje raporu" → gövde: "Teslim saatini kontrol et."
3. **Bir cümle bir iş.** Açıklama uzarsa paragraf değil `infoNote()` ("ⓘ") altına.
4. **Fiil ile biten düğme.** "Kaydet", "Sil", "Aktar", "Gir". Kapatan düğme: "Vazgeç" (İptal değil), bilgi penceresi: "Kapat".
5. **Geri alınabilir işte onay sorma, geri al ver.** Toast + "Geri al" (5 sn). Geri alınamazsa ikinci dokunuşta onay ("Emin misin?").
6. **Hata metni = ne oldu + ne yapmalı.** Genel "Hata oluştu" yok.
7. **Ünlem ve emoji yok.** Tek istisna: görev bitince "Tamamlandı 🎉".
8. **Sayılar Türkçe biçimde.** Ondalık virgül (`fmtGpa` → 3,12; eşikler 1,80 / 2,00), ay adı tam ("3 Ekim"), saat 24 saat ("14:30").
9. **Uydurma yok.** Emin olunmayan değer "?" ya da "bilinmiyor"; örnek içerik "Önizleme" etiketli.
10. **Korkutma, ama yumuşatma da.** Risk açıkça söylenir ("sınamalı öğrenci sayılırsın"), yanına ne yapılacağı yazılır.
11. **Değişken değere ek getirme.** Türkçe ek sayının okunuşuna göre değişir (%40'ı, %35'i, %30'u; 10:00'da, 09:15'te); koddan gelen değerin arkasına kesme işaretli ek yazılmaz. Cümle eksiz kurulur: "Notunun %35 kadarı belli oldu", "Başlangıç 14:30.", "GNO'n 3,00 ya da üstünde kalıyor". Sabit sözcüklere ek serbest ("Köprü'yü", "Düzenle'den").

## Terim sözlüğü

| Kullan | Kullanma | Not |
|---|---|---|
| Köprü | KPR, Kopru | KPR yalnızca logoda ve kod anahtarlarında |
| syllabus | izlence (tek başına) | İlk geçtiği yerde bir kez "syllabus (izlence)" olabilir |
| GNO | genel ortalama, CGPA | Dönemlik: YNO. Gündelik "ortalama" yalnız ders/not bağlamında |
| vize, final | ara sınav (karışık) | Syllabus'tan gelen ad ("Ara sınav") olduğu gibi gösterilir |
| teslim | deadline | Ödev/proje/lab için zamanı söylerken |
| görev | todo, iş | Öğrencinin kendi eklediği ve syllabus'tan gelenler |
| devamsızlık | yoklama (arayüzde) | Asistan "yoklama" sorusunu anlar |
| devam zorunluluğu / devam şartı | katılım zorunluluğu | "Derslerin en az %70'ine devam zorunlu" |
| ders harfleri tablosu | Ortalama tablosu | UMIS benzeri tablo (`#/ortalama`); ekran başlığı "Ders harfleri", Dönem'deki bağlantısı "Ders harfleri ve kredi" |
| internetsiz | çevrimdışı, offline | |
| Otomatik (tema) | Sistem | "Telefonun açık/koyu ayarını izler" |
| yapay zekâ | yapay zeka, AI (metinde) | Logodaki "AI STUDY COMPANION" kalır |
| AKTS | ECTS | |
| hoca | eğitmen, öğretim üyesi | |

## Kalıplar

**Bildirim** (iOS'ta yerel bildirim olacak; başlık ~40, gövde ~90 karakteri geçmesin)
- Başlık: `<ne kaldı>: <ders/görev>` → "Yarın sınav: MCH 2016", "3 saat kaldı: Proje raporu"
- Gövde: tek eylem → "Son tekrar zamanı.", "Teslim saatini ve yükleme yerini kontrol et."
- Sabah özeti: "Bugün: 2 ders, 1 teslim" / "İlk ders 10:00 · MCH 2016 · D301"

**Boş ekran:** ne olacağı + tek eylem → "Henüz ders yok. Syllabus'unu yükle, dönemin kendiliğinden kurulsun." + [Syllabus ekle]

**Toast:** geçmiş zaman, kısa → "Kaydedildi", "Yedek indirildi", "Bildirimler açıldı"

**Uyarı kartı:** başlık durumu söyler, metin eylemi → "Yoğun hafta: 2 sınav, 1 teslim" / "En yakın ve en ağır olandan başla."

## App Store metinleri (taslak)

- **Alt başlık (≤ 30):** Syllabus'tan dönem planı
- **Tanıtım cümlesi:** Syllabus'unu yükle; sınavların, teslimlerin, devamsızlığın ve GNO hedefin tek ekranda. Hepsi telefonunda, internetsiz.
