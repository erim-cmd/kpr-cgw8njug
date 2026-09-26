# Backlog

Yarım kalan ve sıradaki işler. Bitenler en alta "Yapıldı"ya taşınır.

## Açık
- [ ] **Yayın:** Cloudflare Pages kurulumu + `ANTHROPIC_API_KEY` + KV (`docs/YAYIN.md`). Syllabus okuma bu olmadan çalışmaz.
- [ ] **Syllabus doğruluk testi:** 10 gerçek BAU syllabus'u (MCH 2016 dahil) yükle; her biri için bulunan/kaçan alanları tabloya yaz. Hedef: tarihlerin ≥ %90'ı doğru.
- [ ] **UMIS notları:** D-, E, R'nin katsayısı/anlamı doğrulanmadı. UMIS not hesaplama ekranında bir derse D- verip HESAPLA'ya bas, çıkan ortalamadan katsayıyı bul; `gpa.js` → `COEF`'e ekle, `UNVERIFIED`'dan çıkar.
- [ ] **Push bildirim sunucusu:** Uygulama kapalıyken (özellikle iPhone) zamanında bildirim için Web Push. Önerilen: Cloudflare Worker + dakikalık cron + D1; `sw.js`'teki `push` işleyicisi hazır.
- [ ] **AI akademik asistan (Ace tarzı):** Tasarım Kuluçka'da. Aynı Cloudflare projesine `functions/api/ask.js`; öğrencinin kendi verisi + syllabus'u; her cevapta kaynak; değişiklikten önce onay.
- [ ] **Onur/yüksek onur eşikleri** ve yönetmeliğin 1.4.2026 değişikliği doğrulanmadı.

## Yapıldı
- [x] v2.2 (26 Eyl 2026): UMIS harf listesi (D-, E, R dahil), AKTS, UMIS tablosu + HESAPLA; syllabus okuma sunucusu (`functions/api/syllabus.js`); kredi/AKTS/devam şartı syllabus'tan
- [x] v2.1 (26 Eyl 2026): proaktif uyarılar, bildirimler, BAU GNO, devamsızlık, takvime aktarma
