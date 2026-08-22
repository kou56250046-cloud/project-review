/* =========================================================================
   2 つのファイルを見比べる
   似た名前のファイル（コピーや別バージョン）を最初の候補として出す。
   ========================================================================= */
import { S } from "../core/state.js";
import { $, esc, baseOf } from "../core/util.js";
import { diffLines, collapseSame } from "../core/diff.js";

export function buildDiffPane(pane, preset = {}) {
  const textFiles = [...S.files.values()]
    .filter(f => f.text != null && f.text !== "")
    .sort((a, b) => a.path.localeCompare(b.path));

  const tools = document.createElement("div");
  tools.className = "diff-tools";
  const opt = (sel) => textFiles.map(f =>
    '<option value="' + esc(f.path) + '"' + (f.path === sel ? " selected" : "") + ">" +
    esc(f.path) + "</option>").join("");

  const a0 = preset.a || (textFiles[0] && textFiles[0].path) || "";
  const b0 = preset.b || guessPair(a0) || (textFiles[1] && textFiles[1].path) || a0;

  tools.innerHTML =
    '<label>元: <select id="dfA" aria-label="比較元">' + opt(a0) + "</select></label>" +
    '<label>先: <select id="dfB" aria-label="比較先">' + opt(b0) + "</select></label>" +
    '<button class="hbtn" id="dfSwap">入れ替え</button>' +
    '<label style="display:flex;gap:6px;align-items:center;cursor:pointer">' +
      '<input type="checkbox" id="dfCollapse" checked> 変化のない行をたたむ</label>' +
    '<span class="head-sp"></span>' +
    '<span class="diff-stat" id="dfStat"></span>';
  pane.appendChild(tools);

  const body = document.createElement("div");
  body.className = "diff-body";
  pane.appendChild(body);

  const selA = $("#dfA", tools), selB = $("#dfB", tools);
  const run = () => draw(selA.value, selB.value, $("#dfCollapse", tools).checked, body, $("#dfStat", tools));
  selA.onchange = run;
  selB.onchange = run;
  $("#dfCollapse", tools).onchange = run;
  $("#dfSwap", tools).onclick = () => {
    const t = selA.value; selA.value = selB.value; selB.value = t; run();
  };
  run();
}

/** 名前が近いファイルを相方の候補にする */
function guessPair(path) {
  if (!path) return "";
  const base = baseOf(path).replace(/\.(bak|old|orig|copy|v\d+)\./i, ".");
  let best = "", bestScore = 0;
  for (const p of S.files.keys()) {
    if (p === path) continue;
    const b = baseOf(p);
    if (b === baseOf(path)) return p;                  // 別フォルダの同名ファイル
    const s = similarity(base, b);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore > 0.72 ? best : "";
}

function similarity(a, b) {
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  if (!len) return 0;
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
  return same / len;
}

function draw(pa, pb, collapse, body, statEl) {
  const fa = S.files.get(pa), fb = S.files.get(pb);
  if (!fa || !fb) { body.innerHTML = '<div class="center-note">比較するファイルを選んでください。</div>'; return; }
  if (pa === pb) {
    body.innerHTML = '<div class="center-note">同じファイルどうしは比較できません。</div>';
    statEl.textContent = "";
    return;
  }

  const res = diffLines(fa.text, fb.text);
  if (!res.ok) {
    body.innerHTML = '<div class="center-note"><div class="big">比較できませんでした</div><div>' +
      esc(res.reason) + "</div></div>";
    statEl.textContent = "";
    return;
  }

  statEl.innerHTML = '<span class="a">+' + res.added + '</span><span class="d">−' + res.removed + "</span>";
  if (!res.added && !res.removed) {
    body.innerHTML = '<div class="center-note">中身は同じです。</div>';
    return;
  }

  const rows = collapse ? collapseSame(res.rows, 3) : res.rows;
  const MAX = 8000;
  const shown = rows.slice(0, MAX);

  body.innerHTML = shown.map(r => {
    if (r.t === "gap") return '<div class="dl-gap">… 変化のない ' + r.n + " 行</div>";
    return '<div class="dl-row ' + r.t + '">' +
      '<span class="n a">' + (r.a ?? "") + "</span>" +
      '<span class="n b">' + (r.b ?? "") + "</span>" +
      '<span class="c">' + esc(r.s || " ") + "</span></div>";
  }).join("") +
  (rows.length > MAX ? '<div class="dl-gap">表示できるのはここまでです（' + (rows.length - MAX) + " 行を省略）</div>" : "");
}
