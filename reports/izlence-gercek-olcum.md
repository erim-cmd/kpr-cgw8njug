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

## Düzeltme 1 uygulandı (11 Eki 2026, akşam)
`syllabus-local.js`: (a) toplam 100'ü aşınca belgede art arda gelen ve tam 100 eden bileşen bloğu seçilir; bloğun 5 satır yakınında fazlalık varsa (ÇOMÜ %130) dokunulmaz, uyarı kalır. (b) AKTS / iş yükü tablosunda not bölümü biter. (c) Adı devam/attendance olan ve ≥ %50 görünen satır bileşen değil (devam şartı). (d) "minimal requirement" cümlesi bileşen değil.
Sonuç: not dağılımı tam doğru PDF/Word 5/28 → 11/28 (Çankaya ×2, Çağ ×2, ODTÜ, Ege Hemşirelik). BAU'nun 9 gerçek syllabus'unda çıktı değişmedi. `npm test` yeşil; yeni `test/real-grading.mjs` eski kodda 3 hata veriyor.
Açık: `sw.js` VERSION ve `settings.js` APP_VERSION artırılmadı (v2.27.0 bildirim işiyle birlikte artacak). Sıradaki: düzeltme 2 (cümle/formül/puan) ve 3 (sınav öğeleri).
