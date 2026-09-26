/** KPR — "Ortalama" ekranı: BAU kurallarıyla YNO/GNO, dönem simülasyonu, geçmiş dönemler. */

import { store, SEASONS } from "./store.js";
import { esc, openSheet, closeSheet, toast, armDelete } from "./ui.js";
import { icon } from "./icons.js";
import { COEF, LETTERS, OTHER, projection, terms, standing, fmtGpa, nearestLetter, passStatus, termKey } from "./gpa.js";

const TARGET_KEY = "kpr:target-gno";
const readTarget = () => {
  try {
    const v = Number(localStorage.getItem(TARGET_KEY));
    return v > 0 && v <= 4 ? v : 3;
  } catch {
    return 3;
  }
};

const gradeOptions = (selected, { blank = "—", withOther = true } = {}) =>
  `<option value="">${blank}</option>` +
  LETTERS.map((l) => `<option value="${l}" ${l === selected ? "selected" : ""}>${l} · ${COEF[l].toFixed(2)}</option>`).join("") +
  (withOther ? Object.entries(OTHER).map(([k, v]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${k} · ${v}</option>`).join("") : "");

const gradeTag = (g) => {
  const st = passStatus(g);
  return `<span class="gtag ${st || ""}">${esc(g)}</span>`;
};

function summary(p) {
  const main = p.after ?? p.prev.avg;
  const st = standing(main);
  const lines = [];
  if (p.prev.avg !== null) lines.push(`<li><b>Geçmiş GNO</b><span>${fmtGpa(p.prev.avg)} · ${p.prev.credits.toLocaleString("tr-TR")} kredi</span></li>`);
  if (p.term.total) {
    lines.push(`<li><b>Bu dönem (YNO)</b><span>${p.term.graded ? fmtGpa(p.term.avg) : "—"} · ${p.term.graded}/${p.term.total} derste harf seçildi</span></li>`);
    if (p.after !== null) lines.push(`<li><b>Dönem sonu GNO</b><span>${fmtGpa(p.after)}</span></li>`);
  }
  return `<div class="gpa-card">
    <div class="gpa-top">
      <div>
        <p class="eyebrow">${p.after !== null && p.term.graded ? "Dönem sonu tahmini" : "Genel not ortalaman"}</p>
        <div class="gpa-big">${fmtGpa(main)}<small>/ 4.00</small></div>
      </div>
      ${st ? `<span class="standing ${st.level}">${st.label}</span>` : ""}
    </div>
    ${lines.length ? `<ul class="kv">${lines.join("")}</ul>` : '<p class="calc-note">Geçmiş notlarını ve bu dönemin kredilerini gir; ortalaman burada hesaplanır.</p>'}
  </div>`;
}

function targetBlock(p) {
  if (!p.term.total) return "";
  const target = readTarget();
  const need = p.needed(target);
  let text;
  if (need === null) text = "";
  else if (need > 4) text = `Bu dönem hepsinden A alsan da GNO <b>${target.toFixed(2)}</b> olmuyor. Daha düşük bir hedef dene ya da not yükseltmek için ders tekrarını düşün.`;
  else if (need <= 0) text = `Bu dönem ne alırsan al GNO'n <b>${target.toFixed(2)}</b>'nin üstünde kalıyor.`;
  else text = `GNO'n <b>${target.toFixed(2)}</b> olsun istiyorsan bu dönem en az <b class="need">${need.toFixed(2)}</b> ortalama gerekiyor (yaklaşık ${nearestLetter(need)} ortalaması).`;
  return `<section class="section">
    <div class="section-head"><h2>Hedef</h2></div>
    <div class="group">
      <label class="group-row"><div><strong>Hedef GNO</strong><p>Dönem sonunda ulaşmak istediğin ortalama</p></div>
        <input type="number" min="0" max="4" step="0.01" inputmode="decimal" value="${target.toFixed(2)}" data-change="target" aria-label="Hedef GNO" class="num-in">
      </label>
    </div>
    ${text ? `<div class="calc-result"><p>${text}</p></div>` : ""}
  </section>`;
}

function currentBlock(state, p) {
  const { courses } = state;
  if (!courses.length) {
    return `<section class="section"><div class="section-head"><h2>Bu dönem</h2></div>
      <p class="muted-note">Önce derslerini ekle; burada her dersin kredisini ve beklediğin harf notunu seçeceksin.</p></section>`;
  }
  const base = p.source === "base";
  const rows = courses.map((c) => `<li class="crow" style="--c:${c.color}">
      <span class="crow-name"><b>${esc(c.code || c.name)}</b>${c.code ? `<small>${esc(c.name)}</small>` : ""}</span>
      <label class="crow-f"><span>Kredi</span>
        <input type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${c.credit ?? ""}" placeholder="—" data-change="credit" data-id="${esc(c.id)}" aria-label="${esc(c.name)} kredisi">
      </label>
      <label class="crow-f"><span>Beklenen harf</span>
        <select data-change="letter" data-id="${esc(c.id)}" aria-label="${esc(c.name)} beklenen harf">${gradeOptions(c.letter, { withOther: false })}</select>
      </label>
      ${base ? `<label class="crow-f wide"><span>Tekrar alıyorsan önceki notun</span>
        <select data-change="prev" data-id="${esc(c.id)}" aria-label="${esc(c.name)} önceki not">${gradeOptions(c.prevGrade, { blank: "İlk kez alıyorum", withOther: false })}</select>
      </label>` : ""}
    </li>`).join("");
  return `<section class="section">
    <div class="section-head"><h2>Bu dönem</h2></div>
    ${p.missingCredit ? `<p class="fine gap-b">Kredisi girilmeyen ${p.missingCredit} ders hesaba katılmıyor. Kredi = ulusal (yerel) kredi, AKTS değil.</p>` : ""}
    <ul class="list">${rows}</ul>
  </section>`;
}

function historyBlock(state, p) {
  const groups = terms(state.transcript);
  let body = "";
  if (!groups.length && !state.gpaBase) {
    body = `<div class="empty">
      <strong>Geçmiş notların</strong>
      <p>En hızlısı: UMIS'teki toplam krediyi ve GNO'yu gir. Tekrar edilen dersleri de hesaplamak istersen dersleri tek tek ekle.</p>
      <div class="empty-actions">
        <button class="btn btn-primary" type="button" data-action="edit-base">UMIS özetini gir</button>
        <button class="btn btn-ghost" type="button" data-action="new-entry">${icon.plus}Ders ekle</button>
      </div>
    </div>`;
  } else if (!groups.length) {
    body = `<div class="group">
      <div class="group-row"><div><strong>UMIS özeti</strong><p>${state.gpaBase.credits.toLocaleString("tr-TR")} kredi · GNO ${fmtGpa(state.gpaBase.gno)}</p></div>
        <button class="btn btn-ghost" type="button" data-action="edit-base">Düzenle</button></div>
    </div>
    <p class="fine gap-t">Dersleri tek tek eklersen özet yerine onlar kullanılır ve tekrar edilen dersler otomatik hesaplanır.</p>
    <button class="btn btn-ghost gap-t" type="button" data-action="new-entry">${icon.plus}Ders ekle</button>`;
  } else {
    body = groups.map((g) => `<div class="term">
        <div class="term-head"><strong>${esc(g.label)}</strong><span>YNO ${fmtGpa(g.yno)}</span></div>
        <ul class="term-list">${g.entries.map((e) => `<li><button type="button" data-action="edit-entry" data-id="${esc(e.id)}">
          <span class="term-name"><b>${esc(e.code || e.name)}</b>${e.code && e.name ? `<small>${esc(e.name)}</small>` : ""}</span>
          <span class="term-cr">${e.credit.toLocaleString("tr-TR")} kr</span>${gradeTag(e.grade)}
        </button></li>`).join("")}</ul>
      </div>`).join("") + `<button class="btn btn-ghost gap-t" type="button" data-action="new-entry">${icon.plus}Ders ekle</button>`;
  }
  return `<section class="section"><div class="section-head"><h2>Geçmiş dönemler</h2></div>${body}</section>`;
}

export function view() {
  const state = store.get();
  const p = projection(state);
  return `
    <header class="page-head">
      <h1 class="page-title">Ortalama</h1>
      <p class="page-sub">BAU not sistemi · A–F, 4.00 üzerinden</p>
    </header>
    ${summary(p)}
    ${currentBlock(state, p)}
    ${targetBlock(p)}
    ${historyBlock(state, p)}
    <p class="footnote">Hesap BAU Eğitim-Öğretim ve Sınav Yönetmeliği'ne göre (Md. 26, 28): ders puanı = ulusal kredi × katsayı, tekrar edilen derste son not geçerli, sonuç iki haneye yuvarlanır. NA ve F ortalamaya 0.00 girer; S, U, EX, W ortalamaya girmez. BAU bağıl değerlendirme kullandığı için harfi sen seçersin. Sonucu UMIS'teki ile karşılaştır.</p>`;
}

/* ------------------------------------------------------------------ */
/* Formlar                                                             */
/* ------------------------------------------------------------------ */

const head = (title) => `<header class="sheet-head"><h2>${title}</h2>
  <button type="button" class="icon-btn sm" data-close aria-label="Kapat">${icon.close}</button></header>`;

function defaultTerm() {
  const last = [...store.get().transcript].sort((a, b) => termKey(b) - termKey(a))[0];
  if (last) return { year: last.year, season: last.season };
  // Son biten dönem: Eylül–Ocak arasıysak geçen yılın Baharı, Şubat–Ağustos arasıysak bu yılın Güzü
  const d = new Date();
  const m = d.getMonth();
  const start = m >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return m >= 8 || m === 0 ? { year: start - 1, season: "bahar" } : { year: start, season: "guz" };
}

function openEntryForm(entry = null, term = null) {
  const e = entry || { ...(term || defaultTerm()), code: "", name: "", credit: "", grade: "" };
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 8; y--) years.push(y);
  openSheet(
    `<form class="sheet-form">
      ${head(entry ? "Dersi düzenle" : "Geçmiş ders ekle")}
      <div class="sheet-body">
        <div class="row2">
          <label class="field"><span>Akademik yıl</span>
            <select name="year">${years.map((y) => `<option value="${y}" ${y === e.year ? "selected" : ""}>${y}–${y + 1}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Dönem</span>
            <select name="season">${Object.entries(SEASONS).map(([k, v]) => `<option value="${k}" ${k === e.season ? "selected" : ""}>${v}</option>`).join("")}</select>
          </label>
        </div>
        <div class="row2">
          <label class="field"><span>Ders kodu</span><input name="code" value="${esc(e.code)}" maxlength="20" placeholder="MCH 2016" ${entry ? "" : "autofocus"}></label>
          <label class="field"><span>Kredi <span class="hint">(ulusal)</span></span><input name="credit" type="number" min="0" max="30" step="0.5" inputmode="decimal" value="${e.credit}" required></label>
        </div>
        <label class="field"><span>Ders adı <span class="hint">(isteğe bağlı)</span></span><input name="name" value="${esc(e.name)}" maxlength="80"></label>
        <label class="field"><span>Harf notu</span><select name="grade" required>${gradeOptions(e.grade, { blank: "Seç" })}</select></label>
        <p class="fine">Aynı dersi birden fazla kez aldıysan her denemeyi kendi dönemine ekle; ortalamaya son not girer.</p>
      </div>
      <footer class="sheet-foot">
        ${entry ? '<button type="button" class="btn btn-danger" data-delete>Sil</button>' : ""}
        ${entry ? "" : '<button type="submit" class="btn btn-ghost" name="more" value="1">Kaydet, yenisini ekle</button>'}
        <button type="submit" class="btn btn-primary">Kaydet</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        if (!fd.get("code").trim() && !fd.get("name").trim()) {
          form.elements.code.setCustomValidity("Ders kodu ya da adı gerekli.");
          form.elements.code.reportValidity();
          return;
        }
        const saved = store.saveEntry({
          ...entry,
          year: Number(fd.get("year")),
          season: fd.get("season"),
          code: fd.get("code"),
          name: fd.get("name"),
          credit: Number(fd.get("credit")),
          grade: fd.get("grade"),
        });
        if (!saved) return toast("Kayıt eksik: kredi ve harf notu gerekli");
        toast(entry ? "Ders güncellendi" : "Ders eklendi");
        closeSheet();
        if (ev.submitter?.name === "more") openEntryForm(null, { year: saved.year, season: saved.season });
      });
      form.elements.code.addEventListener("input", () => form.elements.code.setCustomValidity(""));
      armDelete(form.querySelector("[data-delete]"), () => {
        store.deleteEntry(entry.id);
        closeSheet();
        toast("Ders silindi");
      });
    }
  );
}

function openBaseForm() {
  const b = store.get().gpaBase || { credits: "", gno: "" };
  openSheet(
    `<form class="sheet-form">
      ${head("UMIS özeti")}
      <div class="sheet-body">
        <p class="lead-text">UMIS'teki transkriptinde en alttaki <b>toplam kredi</b> ve <b>genel not ortalaması</b> değerlerini gir.</p>
        <div class="row2">
          <label class="field"><span>Toplam kredi</span><input name="credits" type="number" min="1" max="1000" step="0.5" inputmode="decimal" value="${b.credits}" required autofocus></label>
          <label class="field"><span>GNO</span><input name="gno" type="number" min="0" max="4" step="0.01" inputmode="decimal" value="${b.gno}" required></label>
        </div>
        <p class="fine">Bu dönem tekrar aldığın bir ders varsa "Bu dönem" listesinde o dersin önceki notunu seç; eski not ortalamadan düşülür.</p>
      </div>
      <footer class="sheet-foot">
        ${store.get().gpaBase ? '<button type="button" class="btn btn-danger" data-delete>Sil</button>' : ""}
        <button type="submit" class="btn btn-primary">Kaydet</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        store.setBase({ credits: Number(fd.get("credits")), gno: Number(fd.get("gno")) });
        closeSheet();
        toast("Kaydedildi");
      });
      armDelete(form.querySelector("[data-delete]"), () => {
        store.setBase(null);
        closeSheet();
        toast("Özet silindi");
      });
    }
  );
}

/* ------------------------------------------------------------------ */
/* Olaylar                                                             */
/* ------------------------------------------------------------------ */

const course = (id) => store.get().courses.find((c) => c.id === id);

export const actions = {
  "new-entry": () => openEntryForm(),
  "edit-entry": (el) => openEntryForm(store.get().transcript.find((e) => e.id === el.dataset.id)),
  "edit-base": () => openBaseForm(),
};

export const changes = {
  credit(el) {
    const c = course(el.dataset.id);
    if (!c) return;
    const v = el.value === "" ? null : Number(el.value);
    store.saveCourse({ ...c, credit: v });
  },
  letter(el) {
    const c = course(el.dataset.id);
    if (c) store.saveCourse({ ...c, letter: el.value });
  },
  prev(el) {
    const c = course(el.dataset.id);
    if (c) store.saveCourse({ ...c, prevGrade: el.value });
  },
  target(el, { render }) {
    const v = Math.min(4, Math.max(0, Number(el.value)));
    try {
      localStorage.setItem(TARGET_KEY, String(v));
    } catch {}
    render();
  },
};
