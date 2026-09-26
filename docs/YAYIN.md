# KPR'yi yayına alma (syllabus okuma dahil)

Site şu an GitHub Pages'te duruyor; orada sunucu çalışmadığı için syllabus okuma kapalı.
Çözüm: aynı repoyu **Cloudflare Pages**'e bağlamak. Hem siteyi yayınlar hem de
`functions/api/syllabus.js` dosyasını `/api/syllabus` adresinde sunucu olarak çalıştırır.
Ücretsiz plan yeterli. Toplam süre ~20 dakika.

İnsan adımları (hesap ve ödeme gerektirir, Claude yapamaz) **[SEN]**, Claude Code'un yapabilecekleri **[CC]** ile işaretli.

## 1. Anthropic API anahtarı **[SEN]**
1. https://console.anthropic.com adresinde giriş yap / hesap aç.
2. Settings → Billing: kredi yükle (başlangıç için 5–10 $ yeter; bir syllabus okuması yaklaşık 1–5 sent).
3. Settings → API Keys → Create Key. Adı: `kpr-syllabus`. Anahtarı kopyala.
4. **Anahtarı hiçbir sohbete, dosyaya, commit'e yapıştırma.** Sadece 3. adımda Cloudflare'e girilecek.

## 2. Cloudflare Pages projesi **[SEN]**
1. https://dash.cloudflare.com → hesap aç (ücretsiz).
2. Workers & Pages → Create application → **Pages** → **Connect to Git**.
3. GitHub'a izin ver, `erim-cmd/kpr-cgw8njug` repo'sunu seç → Begin setup.
4. Ayarlar:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **boş**
   - Build output directory: `/`
5. Save and Deploy. Adres `https://<proje-adı>.pages.dev` olur.

## 3. Gizli anahtar ve günlük sınır **[SEN]**
1. Pages projesi → Settings → **Variables and Secrets** → Add:
   - `ANTHROPIC_API_KEY` = 1. adımdaki anahtar → **Encrypt** seç (Production ve Preview).
   - (İsteğe bağlı) `KPR_MODEL` = `claude-sonnet-5` (varsayılan zaten bu; daha ucuzu `claude-haiku-4-5-20251001`).
2. Workers & Pages → **KV** → Create namespace: `kpr-limits`.
3. Pages projesi → Settings → **Bindings** → Add → KV namespace → Variable name: `KPR_LIMITS`, namespace: `kpr-limits`.
   (Bu olmazsa sınırsız okuma açık kalır; maliyet riski.)
4. Deployments → son dağıtım → **Retry deployment** (ayarların devreye girmesi için).

## 4. Kontrol **[SEN + CC]**
1. `https://<proje>.pages.dev/app.html` aç → Dersler → "Syllabus'tan ekle" → gerçek bir syllabus PDF'i yükle.
2. 10–40 saniyede "Kontrol et ve kaydet" ekranı gelmeli; kredi, AKTS, devam şartı, tarihler dolu olmalı.
3. Kaydet → "Tabloda gör" → Ortalama sekmesinde UMIS tablosunda ders görünmeli.
4. Hata alırsan: Pages projesi → Functions → **Real-time logs** (içerik loglanmaz, sadece hata kodu).

## 5. Sonra
- Canlıya açarken `app.html` ve `index.html`'deki `<meta name="robots" content="noindex, nofollow">` satırını sil.
- GitHub Pages'i kapat (Settings → Pages → None) ki iki ayrı adres olmasın.
- Özel alan adı: Pages projesi → Custom domains.

## Yerel deneme **[CC]**
```bash
npx wrangler pages dev . --kv KPR_LIMITS
# .dev.vars dosyasına ANTHROPIC_API_KEY=... yaz (git'e girmez)
```
