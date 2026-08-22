/* =========================================================================
   クイックオープンとコマンドパレット
     Ctrl+P       … ファイルを名前で開く
     Ctrl+Shift+P … コマンドを名前で実行（先頭が ">" のときも同じ）
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, colorOf, baseOf, dirOf } from "../core/util.js";

let idx = 0;
let items = [];
let mode = "file";      // file | command
let commands = [];

export function registerCommands(list) { commands = list; }

export function openPalette(initial = "") {
  mode = initial.startsWith(">") ? "command" : "file";
  if (mode === "file" && !S.files.size) {
    // ファイルがないときはコマンド側を出したほうが役に立つ
    mode = "command";
    initial = ">";
  }
  $("#palette").classList.add("on");
  const input = $("#palInput");
  input.value = initial;
  input.placeholder = mode === "command" ? "コマンド名を入力" : "ファイル名を入力（> でコマンド）";
  fill(initial);
  input.focus();
  input.select();
}

export function closePalette() {
  $("#palette").classList.remove("on");
}

export function fill(q) {
  mode = q.startsWith(">") ? "command" : "file";
  const query = (mode === "command" ? q.slice(1) : q).trim().toLowerCase();
  const list = $("#palList");

  if (mode === "command") {
    items = commands
      .filter(c => !c.when || c.when())
      .filter(c => !query || (c.title + " " + (c.keywords || "")).toLowerCase().includes(query))
      .slice(0, 60);
    list.innerHTML = items.length
      ? items.map((c, i) =>
          '<div class="it' + (i === 0 ? " on" : "") + '" data-i="' + i + '" role="option">' +
          "<span>" + esc(c.title) + "</span>" +
          (c.key ? '<span class="key">' + esc(c.key) + "</span>" : "") + "</div>").join("")
      : '<div class="it dim" style="padding:10px 14px">一致するコマンドがありません</div>';
  } else {
    items = fuzzyFiles(query).slice(0, 60);
    list.innerHTML = items.length
      ? items.map((p, i) => {
          const f = S.files.get(p);
          return '<div class="it' + (i === 0 ? " on" : "") + '" data-i="' + i + '" role="option">' +
            '<span style="color:' + colorOf(f.ext) + '">◆</span>' +
            '<span class="nm">' + esc(baseOf(p)) + "</span>" +
            '<span class="dim">' + esc(dirOf(p)) + "</span></div>";
        }).join("")
      : '<div class="it dim" style="padding:10px 14px">一致するファイルがありません</div>';
  }

  idx = 0;
  $$("#palList .it").forEach(el => {
    el.onclick = () => { const i = +el.dataset.i; if (!Number.isNaN(i)) run(i); };
  });
}

/** 文字が順番に含まれていれば拾う（vscode ふうのあいまい一致） */
function fuzzyFiles(query) {
  const all = [...S.files.keys()];
  if (!query) return all.slice(0, 60);
  const scored = [];
  for (const p of all) {
    const low = p.toLowerCase();
    const base = baseOf(low);
    let score = -1;
    if (base.startsWith(query)) score = 1000 - base.length;
    else if (base.includes(query)) score = 700 - base.length;
    else if (low.includes(query)) score = 400 - p.length / 4;
    else {
      // 飛び飛びの一致
      let qi = 0;
      for (let i = 0; i < low.length && qi < query.length; i++) if (low[i] === query[qi]) qi++;
      if (qi === query.length) score = 100 - p.length / 8;
    }
    if (score >= 0) scored.push([score, p]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.map(x => x[1]);
}

export function move(d) {
  if (!items.length) return;
  idx = (idx + d + items.length) % items.length;
  $$("#palList .it").forEach((el, i) => el.classList.toggle("on", i === idx));
  const on = $("#palList .it.on");
  if (on) on.scrollIntoView({ block: "nearest" });
}

export function run(i = idx) {
  const it = items[i];
  if (!it) return;
  closePalette();
  if (mode === "command") it.run();
  else actions.openFile(it);
}

export function isOpen() {
  return $("#palette").classList.contains("on");
}
