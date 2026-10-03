Beyin: https://claude.ai/code/artifact/e2d9a831-7add-4734-891c-4f587776f336 (Köprü — Kuluçka Dosyası). Kararlar orada; önce onu oku.

# Köprü — Claude Code notları
AGENTS.md eklenirse: biri güncellenince diğeri de güncellenir.

## Dokunma / sorup yap
- Deploy, Cloudflare, alan adı yok. `robots.txt` ve sayfalardaki `noindex` olduğu gibi kalır.
- `test-syllabus/`: gerçek syllabus'lar (hoca adı, e-posta). Commit'lenmez, ekran görüntüsüne girmez; PR görselleri sentetik veriyle.
- `functions/api/syllabus.js` `DAILY_LIMIT` (5) düşürülmez/kaldırılmaz; test için gerekirse yalnızca yerelde, söyleyerek.
- GNO, devamsızlık ve bildirim mantığını değiştirirken önce o davranışı yakalayan bir test ekle; test geçmeden commit yok. `gpa.js`'e doğrulanmamış katsayı girmez (D-, E, R doğrulanana kadar).
- BAU sistemlerinden ve sitesinden veri kazınmaz (AKTS kataloğu dahil). Öğrencinin kendi yüklediği veri serbest.
- Logo: `logo-mark.svg` ve `docs/marka/` kullanılır, elle yeniden çizilmez. "AI STUDY COMPANION" alt yazısı kalır.
- Gerçek API çağrısı (ücretli) yapılmaz; sahte cevapla test edilir.

## Sırlar
- `ANTHROPIC_API_KEY` yalnızca ortam değişkeninde (yerelde `.dev.vars`, git dışında; anahtar alanı boş, kullanıcı kendi girer). Anahtarı sorma, sohbete/dosyaya/loga yazma.
- Öğrenci verisi cihazda kalır; hesap sistemi yok, sunucuya syllabus dışında veri gitmez.

## Süreç
- Uygulama dosyası değişince `sw.js` `VERSION` ve `settings.js` `APP_VERSION` birlikte artar.
- Kırmızı CI ile birleştirme. Ayrıştırıcıda yeni format görülünce `test/syllabus/make*.py`'ye örnek + `expected.json`'a beklenen değer.
- Bitti: tarayıcıda gözle kontrol + konsolda hata yok + 390px'te taşma yok.

## Tasarım kuralları
- Arayüzde ad her yerde "Köprü"; "KPR" yalnızca logoda ve kod/veri anahtarlarında (`kpr:*`).
- Renk yalnızca `tokens.css` token'ı; yeni sabit renk yok. Asistan mor (`--violet`).
- Renk anlamı: kırmızı (`--danger`) yalnızca sınav ve kritik kural; sarı (`--warn`) yaklaşan teslim; yeşil (`--ok`) tamamlandı.
- Köşe yalnızca `--r-*`, yazı boyutu yalnızca `--fs-*`; yeni px/rem yok.
- Tek kenarlı renkli şerit + yuvarlak köşe birlikte kullanılmaz.
- Türkçe biçim: ondalık virgül (`fmtGpa` → 3,12), ay adı tam ("3 Ekim").
- Aynı bilgi ekranda iki kez gösterilmez.
- Uzun açıklama paragraf değil, `components.js` `infoNote()` ile "ⓘ" altında.
- Gerçek olmayan örnek içerik "Önizleme" etiketli, soluk/kesikli.

## Tekrar eden hatalar
- `node -e '…'` Türkçe kesme işaretinde (Bugün'ün) kırılır → betiği .mjs dosyasına yaz.
- PowerShell 5.1 BOM'suz .ps1'i ANSI okur → .ps1 ASCII kalsın, Türkçe metin parametreyle.
- Yerel testte service worker eski dosyayı verir → kaydı sil + `caches.delete` + yenile.
- Regex `\b` "-"yi sınır sayar (`.chip\b` `.chip-btn`'i de yakalar); global regex'te `lastIndex` kalır → tek seferlik kopya kullan.
- Flex çocuğunda `overflow: hidden` öğeyi sıfıra büzer → `flex: none`.
- Port 8090 Windows'ta ayrılmış; önizleme 8092'de.
- Tarihe bağlı ekran görüntüleri gün değişince farklılaşır → önce/sonra aynı gün çekilir.
- Bu bilgisayarda Python yok; dosya düzenlemesini Edit aracıyla ya da Node ile yap ve commit'ten önce git diff ile sonucu kontrol et.
