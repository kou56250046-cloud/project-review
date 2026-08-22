/* =========================================================================
   画面下のお知らせと、上端の進捗バー
   ========================================================================= */
import { $ } from "../core/util.js";
import { on } from "../core/state.js";

let hideTimer = null;

export function toast(msg, ms = 2400) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => t.classList.remove("on"), ms);
}

export function initProgress() {
  const bar = $("#loading");
  const fill = bar.querySelector("i");
  let hide = null;
  on("progress", ({ done, total, label }) => {
    if (!total) {
      // 総数がわからない走査中は、控えめに動かし続ける
      bar.classList.add("on");
      fill.style.width = Math.min(90, (done % 400) / 4) + "%";
      setStatus(label ? label + "… " + done.toLocaleString() : "");
      return;
    }
    if (done >= total) {
      fill.style.width = "100%";
      clearTimeout(hide);
      hide = setTimeout(() => { bar.classList.remove("on"); fill.style.width = "0"; }, 260);
      return;
    }
    bar.classList.add("on");
    fill.style.width = Math.round(done / total * 100) + "%";
    setStatus(label + "… " + done.toLocaleString() + " / " + total.toLocaleString());
  });
}

export function setStatus(s) {
  const el = $("#stCount");
  if (el) el.textContent = s;
}
