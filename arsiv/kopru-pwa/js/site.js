/** KPR — Tanıtım sitesi: service worker kaydı, kurulum butonu, örnek animasyonu. */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.error("[KPR] SW:", err));
  });
}

// "KPR'yi bu cihaza kur" butonu: sadece tarayıcı kuruluma izin verdiğinde görünür
let deferred = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = false;
});
window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("install-btn");
  if (btn) btn.hidden = true;
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("install-btn")?.addEventListener("click", async (e) => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    e.currentTarget.hidden = true;
  });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Örnek syllabus görünür olunca vurgulama animasyonu başlasın
  const demo = document.querySelector(".demo");
  if (demo && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        demo.classList.add("visible");
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(demo);
  } else {
    demo?.classList.add("visible");
  }
});
