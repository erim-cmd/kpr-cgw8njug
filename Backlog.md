# Backlog

Yarım kalan ve sıradaki işler. Bitenler en alta "Yapıldı"ya taşınır.

## Açık
- [ ] **Yayın:** Cloudflare Pages kurulumu + `ANTHROPIC_API_KEY` + KV (`docs/YAYIN.md`). Syllabus okuma bu olmadan çalışmaz.
- [ ] **Gerçek syllabus testi:** Gerçek BAU syllabus'larını (MCH 2016 dahil) `test/syllabus/`e ekle (kişisel bilgi olmadan), beklenen değerleri `expected.json`'a yaz, `node test/check.mjs` sıfır hata verene kadar ayrıştırıcıyı düzelt.
- [ ] **Fotoğraf / taranmış PDF:** Cihaz içi metin tanıma (OCR) yok; şimdilik açık hata mesajı veriyor.
- [ ] **UMIS notları:** D-, E, R'nin katsayısı/anlamı doğrulanmadı. UMIS not hesaplama ekranında bir derse D- verip HESAPLA'ya bas, çıkan ortalamadan katsayıyı bul; `gpa.js` → `COEF`'e ekle, `UNVERIFIED`'dan çıkar.
- [ ] **Push bildirim sunucusu:** Uygulama kapalıyken (özellikle iPhone) zamanında bildirim için Web Push. Önerilen: Cloudflare Worker + dakikalık cron + D1; `sw.js`'teki `push` işleyicisi hazır.
- [ ] **AI akademik asistan (Ace tarzı):** Tasarım Kuluçka'da. Aynı Cloudflare projesine `functions/api/ask.js`; öğrencinin kendi verisi + syllabus'u; her cevapta kaynak; değişiklikten önce onay.
- [ ] **Onur/yüksek onur eşikleri** ve yönetmeliğin 1.4.2026 değişikliği doğrulanmadı.

## Yapıldı
- [x] v2.8 (26 Eyl 2026): Cihaz içi syllabus okuma: PDF (Flate, nesne akışı, ToUnicode, Türkçe glifler, tablo çizgileriyle satır ayrımı) ve Word okuyucu, kural tabanlı ayrıştırıcı (ders bilgisi, yatay/dikey tablolar, ders saatleri + derslik, tarih/hafta/12 saat, not dağılımı + Bologna ölçekleme, devam %/sayı, final barajı, 8 tür kural Türkçe sonuçlu). 6 format × PDF/DOCX = 202 kontrol, 0 hata. İnternet ve rıza gerekmez.
- [x] v2.7 (26 Eyl 2026): Bugün sadeleşti: üstte sıradaki teslim kartı (geri sayım, 1 gün kala kırmızı, tek dokunuşla "Bitti"), altında en yakın sınava geri sayım; bu hafta/gelecek hafta satırı (Dönem akışına gider); 3 kutuluk istatistik kaldırıldı; liste 2 hafta → bu hafta; kartta gösterilen görev Dikkat'te tekrarlanmaz.
- [x] v2.6 (26 Eyl 2026): Dönem akışı: Dönem ekranında hafta hafta yoğunluk şeridi (sınav 2, proje 1,5, ödev 1 puan; vize/final/yoğun etiketi), haftaya dokununca o haftanın teslimleri, 1–2 hafta içinde yoğun hafta varsa "bu hafta başla" uyarısı. Dönem başlangıcı ayarlanabilir; girilmezse ilk teslimden tahmin.
- [x] v2.5 (26 Eyl 2026): Kırmızı bayraklar: syllabus okuyucu kuralları (devam, geç teslim, telafi, bütünleme, baraj, not kuralı, dürüstlük) Kritik/Dikkat/İpucu olarak ve kaynak cümlesiyle çıkarıyor; final barajını harf tahminine otomatik dolduruyor. Ders sayfasının en üstünde gösterilir, gizlenebilir; Dersler kartında kritik kural rozeti.
- [x] v2.4 (26 Eyl 2026): Ders puanı → harf tahmini (hocanın harf tablosu, örnek tablo "doğrula" uyarılı, her harf için kalanlardan gereken ortalama, final barajı + bütünleme uyarısı, tahmini harfi tek dokunuşla Ortalama tablosuna aktarma). Alt menü 5 sekme (Görevler Bugün'ün altında).
- [x] v2.3 (26 Eyl 2026): "Dönem" paneli BAU motoru üzerine (GNO/YNO özeti, en riskli ders, ortak hedef GNO, devamsızlık kartları, sınıra yaklaşınca uyarı); syllabus talimatına Türkçe kurallar (50 dk ders saati, hafta → tarih, bütünleme/mazeret, not ağırlığı ≠ 100, belge içi talimatlara uyma). Eski ayarlanabilir ölçek + saat bazlı devamsızlık `arsiv/donem-paneli` dalında.
- [x] v2.2 (26 Eyl 2026): UMIS harf listesi (D-, E, R dahil), AKTS, UMIS tablosu + HESAPLA; syllabus okuma sunucusu (`functions/api/syllabus.js`); kredi/AKTS/devam şartı syllabus'tan
- [x] v2.1 (26 Eyl 2026): proaktif uyarılar, bildirimler, BAU GNO, devamsızlık, takvime aktarma
