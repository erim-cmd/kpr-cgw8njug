// KPR — Sabit sayfaların dili (gizlilik.html). Klasik betik, <head>'de CSS'ten önce.
// Öncelik: adresteki ?lang=en|tr, sonra uygulamadaki dil ayarı (settings.lang), yoksa Türkçe.
// Sayfa iki dili de taşır; site.css html[lang] değerine göre öbürünü gizler.
(function () {
  var lang = "tr";
  try {
    var q = new URLSearchParams(location.search).get("lang");
    var data = JSON.parse(localStorage.getItem("kpr:data:v1") || "null");
    var s = data && data.settings && data.settings.lang;
    lang = q === "en" || q === "tr" ? q : s === "en" ? "en" : "tr";
  } catch (e) { /* gizli sekme / bozuk veri: Türkçe */ }
  document.documentElement.lang = lang;
})();
