import { store } from "./store.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

export function view() {
  return `<section class="welcome">
    <div class="hero-mark"><img src="logo-mark.svg" alt="Köprü" width="88" height="88"></div>
    <h1>${t("Derslerinle arandaki {k}.", { k: `<span class="grad">${t("köprü")}</span>` })}</h1>
    <p>${t("Ders programın, sınavların ve ödevlerin tek yerde. İnternet olmasa bile.")}</p>
    <ul class="features">
      <li>${icon.calendar}${t("Haftalık ders programın hep cebinde")}</li>
      <li>${icon.tasks}${t("Sınav ve ödevlerin için geri sayım")}</li>
      <li>${icon.wifiOff}${t("Verilerin sadece senin cihazında")}</li>
    </ul>
    <form data-submit="onboard">
      <label class="field"><span>${t("Sana nasıl hitap edelim?")}</span>
        <input name="name" required maxlength="40" autocomplete="given-name" placeholder="${t("Adın")}">
      </label>
      <button class="btn btn-primary btn-block" type="submit">${t("Başlayalım")}</button>
    </form>
  </section>`;
}

export const submits = {
  onboard(form) {
    store.setName(new FormData(form).get("name"));
    // Tarayıcıdan verileri kendiliğinden silmemesini iste (destekliyorsa)
    navigator.storage?.persist?.().catch(() => {});
    location.hash = "#/bugun";
  },
};
