# Claude Code görevi: PWA'yı yayına hazır hale getir (sunucu ve API anahtarı sonra)

Claude Code'a şunu yaz: **"docs/CLAUDE_CODE_PWA.md dosyasındaki görevi yap. Başlamadan önce bana soru sor, aynı yerde olduğumuzdan emin olalım."**

---

Hedef: KPR'nin PWA'sı sunucu ve API anahtarı olmadan da eksiksiz, hatasız ve yatırımcıya gösterilebilir olsun. Sunucu (syllabus okuma, push) sonradan takılacak; kod ona hazır kalacak.

Neden: Ocak 2027 TÜBİTAK sunumunda çalışan ürünü göstermek ve ilk 50 kullanıcıyı toplamak. Öğrenci ilk 30 saniyede "bu benim sorunumu çözüyor" demeli; yatırımcı demoda hiçbir kırık yer görmemeli.

Elindekiler: repo'daki `CLAUDE.md`, `Backlog.md`, `docs/`. Uygulamanın v2.2 hali (Bugün, Program, Görevler, Dersler, Ortalama, Ayarlar). Kuluçka Dosyası (CLAUDE.md ilk satırı): DormWay incelemesi ve BAU not kuralları orada.

## İşler (öncelik sırasıyla)

1. **Demo modu (en önemli).** Sunucu yokken syllabus yükleme ölü kalıyor. `/api/syllabus` 404/503 dönerse "Örnek syllabus ile dene" seçeneği çıksın: gerçekçi bir BAU dersi (ör. MCH 2016) kontrol ekranına dolsun, öğrenci akışın tamamını görsün. Ayrıca Ayarlar'da "Örnek dönemi yükle": 5 ders, sınavlar, ödevler, devamsızlıklar, geçmiş notlar (sunum için). Tek tuşla temizlenebilsin.
2. **İlk açılış (onboarding).** Şu an sadece ad soruyor. 3 kısa adım: ad → "syllabus yükle / örnekle başla / elle ekle" → bildirim izni (sadece anlamlıysa). Atlanabilir olsun.
3. **Bugün ekranı = DormWay'in "Şimdi yap / Sıradaki / Yaklaşan" mantığı.** Görevler aciliyete ve not ağırlığına göre sıralansın; yoğun hafta göstergesi. Uyarılar en fazla 3 kalsın.
4. **Program ekranı.** Gün seçicinin yanında haftalık ızgara görünümü (Pzt–Cum, saat saat). Ders çakışmaları işaretlensin.
5. **Görevler.** Derse göre filtre, türüne göre filtre, tamamlananları gizle/göster. Görev düzenlerken ders değişince renk güncellensin.
6. **Tanıtım sayfası (`index.html`).** Yeni özellikleri anlatsın: proaktif uyarı, UMIS gibi GNO, devamsızlık, takvime aktarma. Syllabus okuma "yakında"/demo diye dürüst yazılsın. Bekleme listesi için e-posta alanı (şimdilik Google Form linki: https://docs.google.com/forms/d/1NTSBg3UotVX0IrMBuv9vWuxD7bINEtNL5SNvqoDKPrU).
7. **Cila.** Tüm boş durumlar, hata mesajları, yükleniyor durumları Türkçe ve yönlendirici olsun. Silme işlemlerinde "Geri al". iOS'ta kurulum yönergesi doğru çalışsın.
8. **Kalite kontrolü.** Aşağıdaki "Bitti" listesinin her maddesini tek tek test et.

## Bitti (hepsi sağlanmalı)
- Lighthouse (mobil): PWA kurulabilir, Performans ≥ 90, Erişilebilirlik ≥ 95, En iyi uygulamalar ≥ 95.
- 390 px, 768 px ve masaüstünde hiçbir ekranda yatay taşma yok; her ekranın ekran görüntüsünü `reports/ekranlar/` klasörüne koy.
- İnternet kapalıyken uygulama açılıyor, tüm ekranlar çalışıyor (syllabus okuma hariç, o da açık bir mesaj veriyor).
- Tarayıcı konsolunda hiçbir ekranda hata yok.
- Boş veriyle ve örnek dönemle her ekran mantıklı görünüyor.
- Yedek al → her şeyi sil → yedekten yükle: veri birebir geri geliyor.
- GNO: `gpa.js` için küçük bir test dosyası (`tests/gpa.test.mjs`, `node` ile çalışır): tekrar edilen ders, 0 kredili staj, NA, W, yuvarlama.

## Sınırlar
- Hesap sistemi, sunucu, analitik/izleme kodu ekleme. Veriler cihazda kalır.
- `gpa.js` katsayılarına doğrulanmamış değer ekleme (D-, E, R hâlâ doğrulanmadı).
- `functions/api/syllabus.js`'e ve sunucu tasarımına dokunma.
- Renk paleti ve `tokens.css` aynı kalır; yeni kütüphane ekleme (düz JS kalır).
- Dosya değişince `sw.js` VERSION artır, yeni dosyayı `SHELL`'e ekle.
- Her iş ayrı commit; bitince `Backlog.md`'yi güncelle.
- Talimatta hata görürsen uygulamadan önce söyle.

Teslimde: "Bitti" listesine göre kontrol listesini ve ekran görüntülerini göster.
