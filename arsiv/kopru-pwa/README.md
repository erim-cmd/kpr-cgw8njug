# KPR — Derslerinle arandaki köprü

Üniversite öğrencileri için PWA. Syllabus'u yükle; ders saatleri, sınav tarihleri ve not dağılımı otomatik gelsin.

## Yapı

| Yol | Ne |
|---|---|
| `/` (`index.html`) | Tanıtım sitesi |
| `/app/` | Uygulama (PWA, veriler cihazda) |
| `/gizlilik` (`gizlilik.html`) | KVKK aydınlatma metni |
| `/api/syllabus` (`netlify/functions/syllabus.mjs`) | Syllabus okuyan yapay zekâ fonksiyonu (Claude) |
| `sw.js` | Service worker: internetsiz çalışma + güncelleme |

Derleme adımı yok: saf HTML/CSS/JS. Sunucu tarafında yalnızca Netlify Function var.

## Netlify ayarları (ortam değişkenleri)

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `ANTHROPIC_API_KEY` | Evet | console.anthropic.com'dan alınan API anahtarı. **Koda asla yazma.** |
| `KPR_HASH_SALT` | Önerilir | Rastgele uzun bir metin; IP özetlerini tuzlamak için |
| `KPR_DAILY_LIMIT` | Hayır | Kişi başı günlük yükleme sınırı (varsayılan 5) |
| `KPR_DAILY_TOTAL` | Hayır | Tüm site için günlük yükleme sınırı (varsayılan 300) |

## Güncelleme yayınlarken

Herhangi bir dosyayı değiştirdiğinde `sw.js` içindeki `VERSION` değerini artır. Yeni dosya eklediysen `SHELL` listesine de ekle. Kullanıcılara "Yeni sürüm hazır → Yenile" uyarısı çıkar.
