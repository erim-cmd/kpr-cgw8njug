# KPR — Claude Code notları

Beyin: https://claude.ai/code/artifact/e2d9a831-7add-4734-891c-4f587776f336 (Köprü — Kuluçka Dosyası). Kararlar orada; önce onu oku.
AGENTS.md eklenirse: biri güncellenince diğeri de güncellenir.

## Ürün
- KPR: üniversite öğrencisi için syllabus → dönem planı PWA. Türkçe arayüz. Öğrenciye ücretsiz, hesapsız.
- Veriler cihazda (localStorage, `store.js`). Syllabus da cihazda okunur (`doc-text.js` + `syllabus-local.js`); dosya hiçbir yere gönderilmez.

## Yapı
- Düz HTML/CSS/ES modülleri, derleme yok. `app.html` uygulama, `index.html` tanıtım sitesi.
- Ekranlar: `today.js` (Bugün + uyarılar), `schedule.js`, `tasks.js`, `courses.js`, `term.js` (Dönem paneli: tek bakış özeti, hedef GNO, devamsızlık — kendi hesabı yok, gpa.js/attendance.js kullanır), `gpa-view.js` (Ortalama, UMIS tablosu), `settings.js`.
- Mantık: `gpa.js` (BAU not kuralları + ders puanı → harf), `density.js` (dönem haftaları, yoğun/vize/final haftası), `attendance.js`, `alerts.js` (uyarı + hatırlatma takvimi), `notify.js` (bildirim teslimi), `ics.js` (takvime aktarma), `importer.js` (syllabus yükleme ekranı), `doc-text.js` (bağımlılıksız PDF/DOCX metin okuyucu: tablolar tab ile), `syllabus-local.js` (kural tabanlı syllabus ayrıştırıcı).
- Yapay zekâ ile okuma (şimdilik bağlı değil): `functions/api/syllabus.js` → Cloudflare Pages Function, çıktısı `syllabus-local.js` ile aynı şekilde. Anahtar `ANTHROPIC_API_KEY` ortam değişkeninde; koda asla yazılmaz.

## Kurallar
- Herhangi bir dosya değişince `sw.js` içindeki `VERSION`'ı artır; yeni dosya eklenince `SHELL` listesine ekle.
- Dışarıdan gelen her veri `store.js` `normalize()` ile doğrulanır; yeni alan eklersen oraya da ekle.
- GNO kuralları BAU Yönetmeliği Md. 26/28'e dayanır (`gpa.js` başındaki not). Doğrulanmamış bir katsayı ekleme.
- API anahtarı, şifre, kişisel veri commit'lenmez. `.dev.vars` git dışında.
- CI: `.github/workflows/test.yml` her PR'da ve main'e her gönderimde sözdizimi + `test/shell.mjs` (sw.js SHELL listesi ↔ depodaki dosyalar) + ayrıştırıcı testlerini çalıştırır. Yerelde aynısı: `npm test`. Kırmızı CI ile birleştirme.
- Ayrıştırıcı testi: `node test/check.mjs` (test/syllabus/*.pdf|docx ↔ expected.json). Ayrıştırıcıya dokunan her değişiklikten sonra çalıştır; yeni format görülünce `make*.py`'ye örnek + beklenen değer ekle.
- Bitti tanımı: tarayıcıda gözle kontrol + konsolda hata yok + telefonda (390px) taşma yok.

## Tasarım kuralları
- Ürün adı arayüzde her yerde "Köprü". "KPR" sadece logoda ve kod/veri anahtarlarında (`kpr:*`) kalır.
- Logo: `logo-mark.svg` (işaret). Yazılı logo ve PNG'ler `docs/marka/` içinde. Logoyu elle yeniden çizme, bu dosyaları kullan. Logodaki "AI STUDY COMPANION" alt yazısı yapay zekâ özelliği gelince ürünle uyumlu olacak; kaldırma.
- Renkler `tokens.css`'ten gelir, yeni sabit renk yazma. Vurgu düz `--cyan`. Gradyan (`--gradient-brand`) sadece marka anında (`.grad`). Asistan mor (`--violet`).
- Renk anlamı: kırmızı (`--danger`) sadece sınav ve kritik kural; sarı (`--warn`) yaklaşan teslim; yeşil (`--ok`) tamamlandı/başarılı.
- Köşe: sadece `--r-sm`, `--r-md`, `--r-lg`, `--r-pill`. Yazı boyutu: sadece `--fs-2xs` … `--fs-3xl`. Yeni px/rem değeri ekleme.
- Tek kenarlı renkli şerit + yuvarlak köşe birlikte kullanılmaz.
- Türkçe biçim: ondalık virgüllü (`fmtGpa` → 3,12), tarih ay adı tam ("3 Ekim").
- Ekranda aynı bilgi iki kez gösterilmez (örn. Bugün kartında görünen sınav Dikkat listesinde tekrar etmez).
- Uzun açıklama/yönetmelik metni ekranda paragraf olarak değil, `components.js` `infoNote()` ile "ⓘ" altında.
- Gerçek veri olmayan örnek içerik "Önizleme" etiketiyle ve soluk/kesikli çizilir; gerçekmiş gibi gösterilmez.

## Yayın
Adım adım: `docs/YAYIN.md`. Yarım işler: `Backlog.md`.
