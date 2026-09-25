import { store } from "./store.js";
import { icon } from "./icons.js";

export function view() {
  return `<section class="welcome">
    <div class="hero-mark">K</div>
    <h1>Derslerinle arandaki <span class="grad">köprü</span>.</h1>
    <p>Ders programın, sınavların ve ödevlerin tek yerde. İnternet olmasa bile.</p>
    <ul class="features">
      <li>${icon.calendar}Haftalık ders programın hep cebinde</li>
      <li>${icon.tasks}Sınav ve ödevlerin için geri sayım</li>
      <li>${icon.wifiOff}Verilerin sadece senin cihazında</li>
    </ul>
    <form data-submit="onboard">
      <label class="field"><span>Sana nasıl hitap edelim?</span>
        <input name="name" required maxlength="40" autocomplete="given-name" placeholder="Adın">
      </label>
      <button class="btn btn-primary btn-block" type="submit">Başlayalım</button>
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
