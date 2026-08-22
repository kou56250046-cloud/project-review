/* =========================================================================
   ブックモード
   読む順番に沿って複数のファイルを 1 本につなぎ、記事のように通読する。
   ドキュメントを一気に読みたいときに向く。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, saveAs } from "../core/util.js";
import { mdToHtml } from "./markdown.js";
import { decorateProse } from "./prose.js";

export function buildBookPane(pane) {
  const tools = document.createElement("div");
  tools.className = "diff-tools";
  tools.innerHTML =
    '<label>対象: <select id="bkScope" aria-label="通読する範囲">' +
      '<option value="md">Markdown 文書だけ</option>' +
      '<option value="order">読む順番の上位 20 件</option>' +
      '<option value="all">テキストすべて（重い）</option>' +
    "</select></label>" +
    '<span class="head-sp"></span>' +
    '<span class="chip dim" id="bkInfo"></span>' +
    '<button class="hbtn" id="bkSave">1 つの Markdown で保存</button>';
  pane.appendChild(tools);

  const body = document.createElement("div");
  body.className = "editor-body";
  pane.appendChild(body);

  const sel = $("#bkScope", tools);
  sel.onchange = () => draw(sel.value, body, $("#bkInfo", tools));
  $("#bkSave", tools).onclick = () => {
    const list = pick(sel.value);
    const md = list.map(f => "\n\n# " + f.path + "\n\n" + (f.text || "")).join("\n\n---\n");
    saveAs("book-" + (S.rootName || "project").replace(/[^\w.-]+/g, "_") + ".md",
      "# " + S.rootName + "\n" + md, "text/markdown;charset=utf-8");
    actions.toast("まとめて書き出しました");
  };

  draw("md", body, $("#bkInfo", tools));
}

function pick(scope) {
  const files = [...S.files.values()];
  if (scope === "md") {
    return files.filter(f => f.kind === "markdown" && f.text)
      .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }
  if (scope === "order") {
    return S.readOrder.slice(0, 20).map(o => S.files.get(o.path)).filter(f => f && f.text);
  }
  return files.filter(f => f.text && (f.kind === "text" || f.kind === "markdown")).slice(0, 60);
}

/** README を先頭に持ってくる */
const rank = (p) => (/readme/i.test(p) ? 0 : 1);

function draw(scope, body, info) {
  const list = pick(scope);
  info.textContent = list.length + " ファイル";
  body.innerHTML = "";
  if (!list.length) {
    body.innerHTML = '<div class="center-note">通読できるファイルがありませんでした。</div>';
    return;
  }

  const art = document.createElement("div");
  art.className = "prose";
  body.appendChild(art);

  list.forEach((f, i) => {
    const sep = document.createElement("div");
    sep.className = "book-sep";
    sep.innerHTML =
      '<span class="no">' + String(i + 1).padStart(2, "0") + "</span>" +
      '<span class="nm">' + esc(f.name) + "</span>" +
      '<span class="pt">' + esc(f.path) + "</span>";
    sep.querySelector(".pt").style.cursor = "pointer";
    sep.querySelector(".pt").onclick = () => actions.openFile(f.path);
    art.appendChild(sep);

    const holder = document.createElement("div");
    if (f.kind === "markdown") {
      holder.innerHTML = mdToHtml(stripFrontMatter(f.text));
    } else {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-" + f.ext;
      code.textContent = f.text.length > 60000 ? f.text.slice(0, 60000) + "\n… 省略" : f.text;
      pre.appendChild(code);
      holder.appendChild(pre);
    }
    art.appendChild(holder);
    decorateProse(holder, f);
  });
}

function stripFrontMatter(t) {
  return String(t).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
