# Gerçek izlence ölçümü — 11 Eki 2026 (v2.26.0)

44 halka açık izlence, 23 üniversite (BAU yok). Dosyalar `test-syllabus/web/` (git dışı); belge başına doğru cevap ve hata listesi `test-syllabus/web/_dogru-cevaplar.json` (hoca bilgisi yok). Okuyucu değiştirilmeden çalıştırıldı (`now = 2026-10-11`).

## Sonuç (PDF + Word, 33 belge)
- 24/33 dosyada en az bir uydurma/yanlış kayıt (toplam 94). Hedef "uydurma sıfır" tutmuyor.
- Not dağılımı tam doğru 5/28, kısmen 11/28. Tarih 47/84. Devam şartı 16/19. Ders kodu 18/24.
- BAU'nun 9 gerçek syllabus'unda not toplamı 100; sorun BAU dışı biçimlerde.
- Hoca izlencesi en iyi tür; tıp ders kurulu (9) ve çok dersli belgeler (5) en zayıf.

## Düzeltme sırası (etkilenen dosya / hatalı kayıt)
1. **Not bölümünün dışındaki sayıları not sanma (19 / 77).** Yalnız not tablosu veya "Değerlendirme/Grading/Assessment" başlığı altı. Hafta no, ders saati, AKTS iş yükü tablosu, sayfa no, madde no ve devam yüzdesi bileşen olmaz. Toplam ≠ 100 ise: "Total/Toplam 100" satırıyla biten bloğu seç; yoksa bileşenleri işaretsiz getir ve uyar.
2. **Cümle, formül, puan (12 / 45).** "midterm (30%), projects (10%) and final (60%)"; "0.50*F + 0.35*MT + 0.15*HW" + açıklaması; puan üzerinden not (400 → %); "Details" paragrafındaki alt kırılım tablodakini çoğaltmasın; "%80–82" aralık.
3. **Sınav öğesi yalnız sınav satırından (13 / 40).** "To be announced" → tarihsiz öğe; telafi (makeup) tarihi finale yazılmaz; cümle parçası/tablo başlığı öğe olmaz.
4. **Hafta numaralı sınav (9 / 25).** Haftalık planda "Ara Sınav/Midterm" satırı → o hafta.
5. **Çok dersli belge, tıp kurulu (14 / 45).** Birden çok ders kodu/kurul → birleştirme yok, "hangi ders?" seçimi. Tıp ızgarası ayrı mod (Ocak sonrası).
6. **Boş şablon, bozuk metin (4 / 3).**

## Test için
Her düzeltmede ilgili belgelerin yapısını taklit eden sentetik `test/syllabus/real_*.txt` + `expected.json` girdisi (gerçek dosya repoya girmez). Ölçüm betiği: her dosyada `extractText` → `parseSyllabus`, sonucu `_dogru-cevaplar.json`'daki `truth` ile karşılaştır.

## Uygulanan düzeltmeler (11 Eki 2026)
**1. Not bölümü dışı sayılar.** Toplam 100'ü aşınca belgede art arda gelen ve tam 100 eden blok seçilir (bloğun 5 satır yakınındaki fazlalık, ör. ÇOMÜ %130, korunur ve uyarı kalır). AKTS / iş yükü tablosunda not bölümü biter. Adı devam/attendance olan ≥ %50 satır ve "minimal requirement" cümlesi bileşen değil.
**2. Cümle ve yerleşim biçimleri.** "midterm exam (30%), projects (10%) and final exam (60%)"; "taking 40% of the midterm exam and 60% of the final exam" (tablo hücresinde de); önce değer ("40% Midterm exam", "60% | Final exam"); yatay tablo (adlar bir satırda, yüzdeler altında); uzun cümlenin sonundaki "ad + yüzde".
**3. Sınav öğeleri.** Telafi/makeup finalden önce tanınır (telafi tarihi finale yazılmaz). "30.03-07.04.2024" aralığında "07" yıl sanılmaz. Tarihsiz ve haftasız öğe yalnız sınav/teslim adı taşıyorsa kalır ("Your exam dates", "You must take…", "Exam Feedback" öğe değil).

| Ölçü (PDF + Word) | Önce | Sonra |
|---|---|---|
| Not dağılımı tam doğru | 5 / 28 | 16 / 28 |
| Tarih bulundu | 47 / 84 | 50 / 84 |
| Fazla/yanlış öğe (otomatik sayım) | 58 | 47 |

BAU'nun 9 gerçek syllabus'unda not ve öğe çıktısı değişmedi. `test/real-grading.mjs` (9 kontrol) eski kodda 8 hata veriyor; `npm test` yeşil.

**Kalan (sıradaki):** tıp ders kurulları (7 belge; ayrı okuma modu), puanla verilen not (400 puan → %, Esenyurt), satıra bölünmüş cümle (Toros güz), boş şablon tespiti (Ardahan), yönerge belgesi (TOBB), hafta numaralı sınavın haftalık plandan okunması (ALKÜ).
