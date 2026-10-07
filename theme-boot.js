// KPR — Tema ön yükleyici (klasik betik, <head>'de CSS'ten önce).
// Sayfa çizilmeden <html data-theme> ayarlanır ki açık temada koyu ekran yanıp sönmesin.
// Karar mantığı theme.js resolveTheme() ile aynı; tercih store'daki settings.theme.
(function () {
  var pref = "sistem";
  try {
    var data = JSON.parse(localStorage.getItem("kpr:data:v1") || "null");
    var t = data && data.settings && data.settings.theme;
    if (t === "acik" || t === "koyu") pref = t;
  } catch (e) { /* bozuk veri / gizli sekme: sistem */ }
  var light = pref === "acik" || (pref === "sistem" && window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
})();
