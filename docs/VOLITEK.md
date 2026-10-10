# Köprü — Volitek teslim notu (TestFlight)

Teslim sürümü: **v2.25.0** (git etiketi `v2.25.0`). Köprü düz HTML/CSS/ES modülleri; derleme adımı yok. Öğrenci verisi cihazda, hesap yok, sunucu yok. Syllabus cihaz içinde ve internetsiz okunur. Asistan (yapay zekâ) bu teslimin parçası değil; ayrı iş olarak gelecek.

## Sizin işiniz

1. **Capacitor iOS kabuğu.** Uygulamanın giriş sayfası `app.html` (`index.html` tanıtım sitesidir). Capacitor `index.html` açtığı için `webDir`'e kopyalarken `app.html`'i `index.html` olarak koyan bir kopyalama adımı kullanın; repodaki dosya adlarını değiştirmeyin. Kopyalanacaklar: `sw.js` içindeki `SHELL` listesi (uygulamanın tüm dosyaları orada; `test/shell.mjs` listeyi denetler).
2. **Yerel bildirimler** (`@capacitor/local-notifications`). WKWebView'da Notification API ve service worker bildirimi yok. Takvim hazır: `alerts.js` → `buildReminders(state)` her hatırlatma için `id`, `fireAt` (planlanan an), `title`/`body` (o an için doğru metin: "MAT 1001 · Ödev 1 · teslim yarın 10:00") döndürür. Veri her değiştiğinde (`store.subscribe`; `notify.js` → `sync()` aynı yerde çağrılıyor) bekleyenleri iptal edip bu listeyi yeniden zamanlayın. `notify.js` web teslimidir; kabukta bu yolu sizin eklentiniz devralır.
3. **Verinin iOS'ta silinmemesi.** Tüm veri `localStorage`'da; iOS WebView depolamayı garanti etmez. Bu anahtarları kalıcı depoya (`@capacitor/preferences` ya da dosya) yansıtın: yazınca kopyala, açılışta `localStorage` boşsa geri yükle. `kpr:data:v1` (asıl veri — tek kritik anahtar), `kpr:target-gno`, `kpr:dismissed`, `kpr:notified`, `kpr:install-dismissed`. Okuma/yazma yalnızca `store.js` üzerinden; yansıtma bir adaptör olarak eklenmeli, `store.js`'in biçimi ve `normalize()` değişmemeli.
4. **Web'e özgü yönergeler.** Bayrak hazır: `install.js` → `isNativeApp()` (`window.Capacitor.isNativePlatform()`); Capacitor çalışınca kendiliğinden doğru döner. Şunları gizler: "Köprü'yü telefonuna kur" kartı, Ayarlar → "Telefonuna kur", iPhone'da "Ana Ekrana Ekle" bildirim yönergesi, Ayarlar → "Uygulama" bölümü. Yeni gizleme gerekirse aynı bayrağı kullanın.
5. **Dosya indirme/paylaşma.** Ayarlar → "Yedek al" (`settings.js` `export`, `<a download>`) ve "Takvime aktar" (`ics.js` `deliverICS`, `navigator.share`) WKWebView'da dosya kaydetmez. `@capacitor/share` / `@capacitor/filesystem` ile aynı dosyayı (aynı ad, aynı içerik) paylaştırın. "Yedekten yükle" (dosya seçici) olduğu gibi çalışır.
6. Service worker kabukta kaydedilmez (`app.js`: `isNativeApp()` ise atlanır; güncelleme mağazadan gelir). Bir şey yapmanız gerekmez.

## Dokunmayacağınız şeyler

- **Mimari:** düz ES modülleri, derleme yok, `store.js` (tek veri kapısı + `normalize()`), `sw.js` sürüm/önbellek kuralı.
- **Syllabus okuyucu:** `syllabus-local.js`, `doc-text.js` ve testleri (`test/check.mjs`, `test/syllabus/`).
- **Tasarım:** `tokens.css`, `app.css`, logo dosyaları (`logo-mark.svg`, `docs/marka/`; ikonlar SVG'den üretilir).
- **Metinler:** tüm Türkçe/İngilizce metinler (`lang/*.js`, `docs/yazi-dili.md`). Kabuk için metin gerekirse Köprü ekibine sorun.
- **Hesaplar:** GNO (`gpa.js`), devamsızlık (`attendance.js`), bildirim takvimi (`alerts.js`) mantığı.
- `functions/api/syllabus.js` (kullanılmayan, isteğe bağlı sunucu yolu) ve içindeki `DAILY_LIMIT`.

## Sırlar

Repoda şifre, API anahtarı, sertifika yok. Denetim: `node test/secrets.mjs` (CI'da her PR'da çalışır; takip edilen tüm dosyalarda anahtar/şifre kalıplarını ve `.dev.vars`'ın git dışında olduğunu kontrol eder). Apple sertifikalarını, provisioning profillerini, `.p12`/`.mobileprovision` dosyalarını repoya koymayın; test bunları da yakalar.

## Teslim öncesi

`npm test` yeşil olmalı (CI aynısını çalıştırır). Değişiklikler PR ile; kırmızı CI ile birleştirme yok.
