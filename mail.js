/**
 * KPR — Hocaya mail taslağı.
 *
 * Öğrenci konu seçer (devamsızlık, ofis saati, sınav/not, süre uzatma, genel); konu ve metin dersin
 * bilgileriyle dolar, öğrenci düzenler. "Outlook'ta aç" yeni bir mesaj penceresini dolu açar:
 * telefonda Outlook uygulaması (ms-outlook://), bilgisayarda Outlook web. Köprü maili GÖNDERMEZ;
 * gönderen her zaman öğrencidir. Ağ isteği, hesap bağlantısı ve yapay zekâ yok.
 *
 * Şablonlar DOM'suz (mailDraft) — Node testinde de çalışır.
 */

import { t } from "./i18n.js";
import { DAYS, toISO, fmtShort } from "./dates.js";

export const MAIL_TOPICS = ["devamsizlik", "ofis", "sinav", "uzatma", "genel"];
export const topicLabel = (k) =>
  ({
    devamsizlik: t("Derse katılamadım"),
    ofis: t("Ofis saati randevusu"),
    sinav: t("Sınav / not sorusu"),
    uzatma: t("Teslim süresi"),
    genel: t("Genel soru"),
  })[k];

/** Hocanın adı unvanıyla birlikte geliyorsa ("Dr. Öğr. Üyesi Ayşe Yılmaz") olduğu gibi; yoksa "Hocam". */
function greet(instructor) {
  return instructor ? t("Sayın {hoca},", { hoca: instructor }) : t("Merhaba Hocam,");
}

/** Dersin en son yapıldığı gün (bugün dahil) — devamsızlık mailindeki tarih. Ders saati yoksa bugün. */
export function lastClassDate(course, now = new Date()) {
  const days = new Set(course.sessions.map((s) => s.day));
  const d = new Date(now);
  for (let i = 0; i < 7 && days.size; i++) {
    if (days.has((d.getDay() + 6) % 7)) return toISO(d);
    d.setDate(d.getDate() - 1);
  }
  return toISO(now);
}

/** Sıradaki teslim (uzatma maili için). */
const nextDeadline = (course, tasks, today) =>
  tasks
    .filter((x) => x.courseId === course.id && !x.done && x.type !== "sinav" && x.type !== "kisisel" && x.due >= today)
    .sort((a, b) => a.due.localeCompare(b.due))[0] || null;

/**
 * { subject, body } — öğrencinin düzenleyeceği taslak. Bilinmeyen bilgi uydurulmaz; köşeli parantezle
 * öğrenciye bırakılır ("[nedenini yaz]").
 */
export function mailDraft(topic, { course, tasks = [], name = "", studentNo = "", now = new Date() }) {
  const label = [course.code, course.name].filter(Boolean).join(" ");
  const tag = course.code || course.name;
  const sign = [t("Saygılarımla,"), name || t("[adın]"), studentNo ? t("Öğrenci no: {no}", { no: studentNo }) : ""].filter(Boolean).join("\n");
  const today = toISO(now);
  let subject = "";
  let lines = [];
  if (topic === "devamsizlik") {
    const day = lastClassDate(course, now);
    subject = t("{ders} – {tarih} dersine katılamama", { ders: tag, tarih: fmtShort(day) });
    lines = [
      t("{ders} dersinin {tarih} tarihli dersine [nedenini yaz] nedeniyle katılamadım.", { ders: label, tarih: fmtShort(day) }),
      t("Kaçırdığım konuları nasıl telafi edebileceğim konusunda bilgi rica ederim."),
    ];
  } else if (topic === "ofis") {
    subject = t("{ders} – ofis saati görüşme talebi", { ders: tag });
    lines = [
      course.officeHours
        ? t("{ders} dersiyle ilgili ofis saatlerinizden birinde ({saat}) sizinle görüşmek istiyorum.", { ders: label, saat: course.officeHours })
        : t("{ders} dersiyle ilgili sizinle kısa bir görüşme yapmak istiyorum.", { ders: label }),
      t("Konu: [kısaca yaz]"),
      t("Size uygun bir zamanı öğrenebilir miyim?"),
    ];
  } else if (topic === "sinav") {
    subject = t("{ders} – sınav/not hakkında soru", { ders: tag });
    lines = [t("{ders} dersinin [sınavın adı] ile ilgili bir sorum var:", { ders: label }), t("[sorunu yaz]")];
  } else if (topic === "uzatma") {
    const d = nextDeadline(course, tasks, today);
    subject = d ? t("{ders} – {odev} teslim süresi", { ders: tag, odev: d.title }) : t("{ders} – teslim süresi hakkında", { ders: tag });
    lines = [
      d
        ? t("{ders} dersinin {tarih} tarihinde teslim edilecek “{odev}” çalışmasını [nedenini yaz] nedeniyle zamanında yetiştiremeyeceğim.", { ders: label, tarih: fmtShort(d.due), odev: d.title })
        : t("{ders} dersinin [ödevin adı] çalışmasını [nedenini yaz] nedeniyle zamanında yetiştiremeyeceğim.", { ders: label }),
      t("Teslim süresinin uzatılması mümkün olabilir mi?"),
    ];
  } else {
    subject = t("{ders} hakkında soru", { ders: tag });
    lines = [t("{ders} dersiyle ilgili bir sorum var:", { ders: label }), t("[sorunu yaz]")];
  }
  const body = [greet(course.instructor), "", ...lines, "", sign].join("\n");
  return { subject, body };
}

const isPhone = () => /iphone|ipad|ipod|android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Outlook bağlantısı: telefonda uygulama, bilgisayarda Outlook web (Microsoft 365 okul hesabı). */
export function outlookUrl(to, subject, body, phone = isPhone()) {
  const q = `to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return phone ? `ms-outlook://compose?${q}` : `https://outlook.office.com/mail/deeplink/compose?${q}`;
}

export const mailtoUrl = (to, subject, body) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/* ------------------------------------------------------------------ */
/* Ekran (alt sayfa)                                                   */
/* ------------------------------------------------------------------ */

export async function openMailSheet(course) {
  const [{ openSheet, esc, toast }, { store }, { icon }, { infoNote }] = await Promise.all([
    import("./ui.js"), import("./store.js"), import("./icons.js"), import("./components.js"),
  ]);
  const st = store.get();
  let topic = "genel";
  const draftFor = (k) => mailDraft(k, { course, tasks: st.tasks, name: st.profile.name, studentNo: store.get().settings.studentNo });

  openSheet(
    `<form class="sheet-form mail-form">
      <header class="sheet-head">
        <h2>${t("Hocaya mail")}</h2>
        <button type="button" class="icon-btn sm" data-close aria-label="${t("Kapat")}">${icon.close}</button>
      </header>
      <div class="sheet-body">
        <p class="fine">${t("Alıcı:")} <b>${esc(course.email)}</b></p>
        <fieldset class="field"><legend>${t("Konu ne?")}</legend>
          <div class="pick-chips" role="radiogroup">
            ${MAIL_TOPICS.map((k) => `<button type="button" class="pick-chip" data-topic="${k}" role="radio" aria-checked="${k === topic}" aria-pressed="${k === topic}">${topicLabel(k)}</button>`).join("")}
          </div>
        </fieldset>
        <label class="field"><span>${t("Öğrenci numaran")} <span class="hint">${t("(isteğe bağlı, imzaya eklenir)")}</span></span>
          <input name="no" value="${esc(st.settings.studentNo)}" maxlength="20" inputmode="numeric" autocomplete="off">
        </label>
        <label class="field"><span>${t("Konu satırı")}</span><input name="subject" maxlength="200" required></label>
        <label class="field"><span>${t("Mesaj")}</span><textarea name="body" rows="9" maxlength="3000" required></textarea></label>
        ${infoNote(t("Mail nasıl gönderilir?"), t("Köprü maili göndermez. “Outlook'ta aç” yeni bir mesajı bu metinle açar; köşeli parantezli yerleri doldur, kontrol et ve Outlook'tan sen gönder. Telefonda Outlook uygulaması yoksa “Başka uygulama” telefonundaki mail uygulamasını açar."))}
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn btn-ghost" data-mailto>${t("Başka uygulama")}</button>
        <button type="submit" class="btn btn-primary">${t("Outlook'ta aç")}</button>
      </footer>
    </form>`,
    (d) => {
      const form = d.querySelector("form");
      const fill = () => {
        const m = draftFor(topic);
        form.subject.value = m.subject;
        form.body.value = m.body;
        d.querySelectorAll("[data-topic]").forEach((b) => {
          const on = b.dataset.topic === topic;
          b.setAttribute("aria-pressed", on);
          b.setAttribute("aria-checked", on);
        });
      };
      fill();
      d.querySelectorAll("[data-topic]").forEach((b) =>
        b.addEventListener("click", () => {
          topic = b.dataset.topic;
          fill();
        }),
      );
      form.no.addEventListener("change", () => {
        const before = draftFor(topic);
        store.setSettings({ studentNo: form.no.value });
        // Metin hiç düzenlenmediyse imzayı yeni numarayla yenile
        if (form.body.value.trim() === before.body.trim()) fill();
      });
      // Outlook web yeni sekmede (uygulama kapanmasın); uygulama ve mailto bağlantıları aynı pencerede
      const open = (url) => {
        if (url.startsWith("https:")) window.open(url, "_blank", "noopener");
        else window.location.href = url;
        toast(t("Taslak açıldı; kontrol edip kendin gönder."));
      };
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        open(outlookUrl(course.email, form.subject.value, form.body.value));
      });
      d.querySelector("[data-mailto]").addEventListener("click", () => {
        if (!form.reportValidity()) return;
        open(mailtoUrl(course.email, form.subject.value, form.body.value));
      });
    },
  );
}
