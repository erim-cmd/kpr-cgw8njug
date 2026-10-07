# iOS görselleri

`logo-mark.svg` (v2, düz) dosyasından üretildi; işaret yeniden çizilmedi. Zemin rengi = `tokens.css` `--bg`.

iOS'un renkli (tinted) ikon modu ve bildirim simgesi için tek renk işaret: `../kpr-isaret-tek-renk-beyaz.svg`.

| Dosya | Ne için |
|---|---|
| `AppIcon-1024-koyu.png` | **Ana uygulama ikonu** (App Store + Xcode `AppIcon`). 1024×1024, saydamlık yok, köşeler kare — iOS kendisi yuvarlar. İşaret yüksekliği tuvalin %70'i (web ikonuyla aynı oran). |
| `AppIcon-1024-acik.png` | Açık zeminli seçenek (şimdilik kullanılmıyor). |
| `Splash-2732-koyu.png` / `-acik.png` | Capacitor açılış ekranı (`@capacitor/splash-screen`), işaret %18. Koyu/açık temaya göre. |

Logo değişirse bu dosyalar aynı betikle yeniden üretilir; elle düzenlenmez.
