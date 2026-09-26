# Claude Code'a verilecek görev (kopyala-yapıştır)

Aşağıdaki metni Claude Code'a olduğu gibi ver. Repo: `erim-cmd/kpr-cgw8njug`.

---

Hedef: KPR v2.2'yi yayına al; syllabus okuma, BAU GNO hesaplama ve proaktif uyarılar canlı adreste çalışsın.
Bitti = (1) `bildirim-gno-devamsizlik` dalı `main`'e birleşti ve push'landı; (2) Cloudflare Pages adresinde `app.html` açılıyor, konsolda hata yok; (3) gerçek bir syllabus PDF'i yüklenince "Kontrol et ve kaydet" ekranı kredi, AKTS, devam şartı ve tarihlerle doluyor; (4) kaydedilen ders Ortalama sekmesindeki UMIS tablosunda görünüyor ve HESAPLA doğru YNO/GNO veriyor; (5) Bugün ekranında uyarılar görünüyor, Ayarlar'dan bildirim açılıyor ve deneme bildirimi geliyor.

Neden: Ocak 2027 TÜBİTAK sunumunda yatırımcıya çalışan ürünü göstermek ve ilk 50 kullanıcıyı toplamaya başlamak. DormWay BAU syllabus'unu okuyamadı; KPR'nin okuyabildiğini kanıtlamamız lazım.

Elindekiler:
- Repo'daki `CLAUDE.md` (yapı ve kurallar), `docs/YAYIN.md` (Cloudflare kurulum adımları), `Backlog.md`.
- Dal `bildirim-gno-devamsizlik`: v2.1 (uyarılar, bildirimler, GNO, devamsızlık, takvim) + v2.2 (UMIS tablosu, syllabus sunucusu). Tarayıcıda uçtan uca test edildi; sunucu sahte Claude API'siyle test edildi, gerçek API ile henüz denenmedi.
- Kuluçka Dosyası (ilk satırdaki link) — BAU not kuralları ve kararlar.

Sırayla:
1. `git fetch` → dalı incele → `main`'e birleştir → push.
2. `docs/YAYIN.md`'deki [SEN] adımlarını bana tek tek, sırayla söylet ve her adımdan sonra beklet (Anthropic anahtarı, Cloudflare Pages, gizli değişken, KV). Anahtarı bana sorma, sohbete yazdırma; ben Cloudflare paneline kendim gireceğim.
3. Yayın bitince canlı adreste 4. adımdaki kontrolleri yap. Gerçek syllabus'la ilk okumada sorun çıkarsa `functions/api/syllabus.js`'teki talimatı (`instructions`) düzelt, şemaya dokunmadan.
4. Gerçek BAU syllabus'larıyla (ben vereceğim) doğruluk tablosunu `reports/syllabus-testi.md`'ye yaz: dosya, bulunan/kaçan alanlar, hatalar.
5. Bittiğinde "bitti tanımına göre kontrol listesi"ni göster; Backlog.md'yi güncelle.

Sınırlar:
- API anahtarı, şifre ya da kişisel veri hiçbir dosyaya, commit'e, loga girmez.
- `gpa.js`'teki katsayılara doğrulanmamış değer ekleme (D-, E, R doğrulanana kadar hesaba girmez).
- Öğrenci verisi cihazda kalır; sunucuya syllabus dışında veri gönderme, hesap sistemi ekleme.
- Tasarım dili (renkler, `tokens.css`) aynı kalır. Dosya değişince `sw.js` VERSION artar.
- Talimatta hata görürsen uygulamadan önce söyle.

Ölçü: 10 gerçek syllabus'ta tarihlerin en az %90'ı doğru; telefonda (390 px) hiçbir ekranda yatay taşma yok.
