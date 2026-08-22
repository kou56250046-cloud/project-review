/* =========================================================================
   レビューレポート
   概要・気づき・レビューのメモを 1 枚にまとめて見せる。
   Markdown でも、単体で開ける HTML でも書き出せる。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, esc, saveAs } from "../core/util.js";
import { toMarkdown, reportFileName, progress } from "../core/review.js";
import { overviewMarkdown } from "../ui/overview.js";
import { mdToHtml } from "./markdown.js";
import { decorateProse } from "./prose.js";

export function buildReportPane(pane) {
  const tools = document.createElement("div");
  tools.className = "diff-tools";
  tools.innerHTML =
    '<span class="chip dim" id="rpInfo"></span>' +
    '<span class="head-sp"></span>' +
    '<button class="hbtn" id="rpMd">Markdown で保存</button>' +
    '<button class="hbtn" id="rpHtml">HTML で保存</button>' +
    '<button class="hbtn" id="rpCopy">本文をコピー</button>';
  pane.appendChild(tools);

  const body = document.createElement("div");
  body.className = "editor-body";
  pane.appendChild(body);

  const md = fullMarkdown();
  const art = document.createElement("div");
  art.className = "prose";
  art.innerHTML = mdToHtml(md);
  body.appendChild(art);
  decorateProse(art, { path: S.rootName + "/report.md" });

  const p = progress();
  $("#rpInfo", tools).textContent =
    "確認済み " + p.done + " / " + p.total + " · メモ " + p.notes + " 件";

  $("#rpMd", tools).onclick = () => {
    saveAs(reportFileName(), md, "text/markdown;charset=utf-8");
    actions.toast("レポートを書き出しました");
  };
  $("#rpHtml", tools).onclick = () => {
    saveAs(reportFileName().replace(/\.md$/, ".html"), standaloneHtml(art.innerHTML), "text/html;charset=utf-8");
    actions.toast("HTML で書き出しました");
  };
  $("#rpCopy", tools).onclick = () => {
    navigator.clipboard.writeText(md).then(() => actions.toast("コピーしました"));
  };
}

function fullMarkdown() {
  return overviewMarkdown().replace(/\n---\n\nFile Review Studio で作成\n?$/, "") +
    "\n\n---\n\n" +
    toMarkdown().replace(/^# /, "# ");
}

/** どこでも開ける 1 枚の HTML にする */
function standaloneHtml(inner) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(S.rootName)} レビュー記録</title>
<style>
:root{color-scheme:light dark;
  --bg:light-dark(#fff,#1e1e1e);--fg:light-dark(#24292f,#d4d4d4);
  --muted:light-dark(#5c6570,#9d9d9d);--border:light-dark(#d4d4d4,#3c3c3c);
  --code:light-dark(#f6f8fa,#1b1b1b);--link:light-dark(#0969da,#4daafc);--accent:light-dark(#0060c0,#4ec9b0)}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.85 "Segoe UI",-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 24px 100px}
h1,h2,h3{line-height:1.35;margin:1.8em 0 .6em}
h1{font-size:2em;border-bottom:1px solid var(--border);padding-bottom:.3em;margin-top:0}
h2{font-size:1.45em;border-bottom:1px solid var(--border);padding-bottom:.25em}
a{color:var(--link)}
code{font-family:Consolas,"SF Mono",monospace;font-size:.88em;background:var(--code);padding:.15em .4em;border-radius:3px}
pre{background:var(--code);border:1px solid var(--border);border-radius:6px;padding:14px;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:1.2em 0;font-size:.92em;display:block;overflow-x:auto}
th,td{border:1px solid var(--border);padding:7px 12px;text-align:left}
th{background:var(--code)}
blockquote{border-left:3px solid var(--accent);margin:1em 0;padding:.3em 1em;color:var(--muted)}
hr{border:none;border-top:1px solid var(--border);margin:2em 0}
.dgm-shell,.cb-head,.cb-copy,.anchor{display:none}
.cb-body,.mermaid-box{display:block}
</style></head>
<body><main>${inner}</main></body></html>`;
}
