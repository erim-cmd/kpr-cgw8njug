# Asistan'a yapay zekâ bağlama — az token tasarımı

Buğra'nın notu (7 Ekim 2026): "Yapay zekâ asistanı bağlarken fazla token yemeyen bir şekilde bağlayın."
Bu belge o bağlantının nasıl kurulacağını anlatır. Henüz kod yok; bağlamaya karar verildiğinde buna göre yapılır.

## Temel fikir: önce cihaz, sonra yapay zekâ

Asistan bugün internetsiz çalışıyor (`asistan-core.js`): tarih, kural, hedef harf, bu hafta ve iletişim
sorularını öğrencinin cihazındaki veriden **0 token** ile, kaynağıyla cevaplıyor (`test/asistan.mjs`: 113 kontrol).
Yapay zekâ bunun yerine geçmez, **arkasına** eklenir:

1. Soru önce `asistan-core.js`'e gider. Cevap bulunursa yapay zekâ hiç çağrılmaz.
2. Bulunamazsa cevabın altında "Yapay zekâya sor" düğmesi çıkar. Öğrenci dokunmadan istek gitmez.
3. Böylece en sık sorulan sorular (sınav ne zaman, devamsızlık hakkım, finalden kaç almalıyım) hiç token harcamaz.

## Token bütçesi (soru başına)

| Kalem | Sınır | Nasıl |
|---|---|---|
| Sistem talimatı | ~300 token | Kısa, sabit, Türkçe; "yalnızca verilen bağlamdan cevapla, yoksa söyle, kaynak göster" |
| Bağlam | ≤ 1.500 token | Syllabus'un tamamı değil: sorunun geçtiği **tek dersin** derli toplu JSON'u (tarihler, not dağılımı, kurallar, bu haftanın konusu). Ders cihazda, anahtar kelimeyle seçilir (`asistan-core.js`'teki eşleştirme). PDF asla tekrar gönderilmez; syllabus yüklenirken bir kez okunmuş, yapılandırılmış veri kullanılır. |
| Sohbet geçmişi | son 2 soru-cevap | Tüm sohbet gönderilmez |
| Cevap | `max_tokens` 300 | Kısa cevap + kaynak cümlesi; yazı dili kurallarına uygun |

## Model ve maliyet

- Sohbet için **Claude Haiku 4.5**: girdi $1, çıktı $5 / milyon token. Syllabus okuma (daha zor iş) Sonnet'te kalabilir.
- Soru başına ~1.800 girdi + ~300 çıktı token ≈ **0,3 sent**.
- Örnek: 50 öğrenci × günde 5 soru × 30 gün = 7.500 soru ≈ **20–25 $/ay**; sorulardan yarısı cihazda cevaplanırsa yaklaşık yarısı.
- Prompt caching bu boyutta işe yaramaz: Haiku 4.5'te önbelleğe alınabilen en kısa istem 4.096 token. Bağlamı önbelleğe sığsın diye şişirmek yerine küçük tutmak daha ucuz.

## Sınırlar ve güvenlik

- Cihaz başına günlük soru sınırı (syllabus okumadaki `DAILY_LIMIT` gibi, ör. 20), sunucu tarafında; sayaç IP özetiyle, içerik saklanmadan.
- Aynı soru + aynı bağlam özeti 24 saat içinde tekrar gelirse sunucu önbelleğindeki cevap döner (token yok).
- API anahtarı yalnızca sunucuda (`ANTHROPIC_API_KEY`, Cloudflare), uygulamada asla.
- Gönderilen bağlamda öğrencinin adı, notları dışındaki kişisel veri yok; açık rıza kutusu syllabus okumadaki gibi, varsayılan kapalı. Gizlilik metni bu özellik açılmadan önce güncellenir.
- Her istekte yalnızca token sayıları kaydedilir (içerik değil); aylık harcama bir bakışta görülür.

## Kapsam

Asistan yalnızca öğrencinin kendi dersleri hakkında konuşur (BAU idari süreçleri yok, genel sohbet yok).
Kapsam dışı soruya cevap: "Bunu derslerinin bilgilerinde bulamadım." — yapay zekâya gitmeden.

## Yapılacaklar (bağlanırken)

1. `functions/api/ask.js`: bağlam + soru al, Haiku 4.5'e gönder, `max_tokens` 300, günlük sınır, 24 saat cevap önbelleği.
2. `asistan.js`: yerel cevap yoksa "Yapay zekâya sor" düğmesi; rıza kutusu.
3. `asistan-core.js`: sorudan dersi ve ilgili alanları seçip ≤ 1.500 token bağlam üreten fonksiyon + testi.
4. Sahte cevapla test (gerçek ücretli çağrı yok — CLAUDE.md).

Kaynaklar: [Fiyatlar](https://platform.claude.com/docs/en/about-claude/pricing) · [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
