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
- Ayrıştırıcı testi: `node test/check.mjs` (test/syllabus/*.pdf|docx ↔ expected.json). Ayrıştırıcıya dokunan her değişiklikten sonra çalıştır; yeni format görülünce `make*.py`'ye örnek + beklenen değer ekle.
- Bitti tanımı: tarayıcıda gözle kontrol + konsolda hata yok + telefonda (390px) taşma yok.

## Yayın
Adım adım: `docs/YAYIN.md`. Yarım işler: `Backlog.md`.
