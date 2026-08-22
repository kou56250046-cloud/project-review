/* =========================================================================
   ファイルを開いたときの画面
   種類ごとに表示を振り分け、共通の見出し帯とレビュー操作を付ける。
   ========================================================================= */
import { S, emit } from "../core/state.js";
import { esc, fmtSize } from "../core/util.js";
import { roleOfFile } from "../core/roles.js";
import { isDone, toggleDone, notesOf } from "../core/review.js";
import { renderCode } from "./code.js";
import { renderMarkdown } from "./markdown.js";
import { renderCSV } from "./csv.js";
import { renderPDF, renderDocx, renderImage, renderUnsupported } from "./media.js";

/** path -> ビューアが返した操作（行ジャンプなど） */
export const controllers = new Map();

export function buildFilePane(pane, f) {
  const head = document.createElement("div");
  head.className = "editor-head";
  const role = roleOfFile(f.path);
  const outs = S.outMap.get(f.path) || [];
  const ins = S.inMap.get(f.path) || [];
  head.innerHTML =
    '<div class="crumb">' + esc(f.dir ? f.dir + " / " : "") + "<b>" + esc(f.name) + "</b></div>" +
    '<span class="chip">' + esc(role) + "</span>" +
    '<span class="chip dim">' + fmtSize(f.size) + "</span>" +
    (outs.length ? '<span class="chip dim" title="このファイルが参照している数">参照 ' + outs.length + "</span>" : "") +
    (ins.length ? '<span class="chip dim" title="このファイルを参照している数">被参照 ' + ins.length + "</span>" : "") +
    '<span class="head-sp"></span>';
  pane.appendChild(head);

  // レビューの「確認済み」
  const doneBtn = document.createElement("button");
  doneBtn.className = "hbtn";
  const syncDone = () => {
    const d = isDone(f.path);
    doneBtn.textContent = d ? "✓ 確認済み" : "確認済みにする";
    doneBtn.classList.toggle("on", d);
    doneBtn.setAttribute("aria-pressed", String(d));
  };
  doneBtn.onclick = () => { toggleDone(f.path); syncDone(); };
  doneBtn.title = "レビューの進捗に反映されます (Ctrl+Enter)";
  syncDone();
  head.appendChild(doneBtn);

  const body = document.createElement("div");
  body.className = "editor-body";
  pane.appendChild(body);

  let ctl = null;
  switch (f.kind) {
    case "markdown": renderMarkdown(f, body, head); break;
    case "csv": renderCSV(f, body, head); break;
    case "pdf": renderPDF(f, body, head); break;
    case "docx": renderDocx(f, body, head); break;
    case "image": renderImage(f, body, head); break;
    case "text": ctl = renderCode(f, body, head); break;
    default: renderUnsupported(f, body); break;
  }
  if (ctl) controllers.set(f.path, ctl);

  const n = notesOf(f.path).length;
  if (n) {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = "メモ " + n;
    head.insertBefore(c, head.querySelector(".head-sp"));
  }

  pane._syncDone = syncDone;
  emit("pane-built", { path: f.path });
}

/** 指定行へ飛ぶ（検索結果や関係パネルから使う） */
export function jumpToLine(path, line) {
  const ctl = controllers.get(path);
  if (ctl && ctl.goto) { ctl.goto(line, false); return true; }
  return false;
}
