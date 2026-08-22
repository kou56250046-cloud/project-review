/* =========================================================================
   プロジェクト概要
   数字だけでなく「どこから読むか」「どこが要か」がわかる作りにしている。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, colorOf, fmtSize, baseOf, dirOf, saveAs } from "../core/util.js";
import { roleOfDir, roleOfFile } from "../core/roles.js";
import { buildMermaid } from "../core/analyze.js";
import { isDone, progress } from "../core/review.js";
import { mermaidBlock } from "../viewers/diagram.js";

export function buildOverviewPane(pane) {
  const body = document.createElement("div");
  body.className = "editor-body";
  pane.appendChild(body);
  const ov = document.createElement("div");
  ov.className = "ov";
  body.appendChild(ov);

  const files = [...S.files.values()];
  const totalSize = files.reduce((a, b) => a + b.size, 0);
  const dirs = new Set();
  files.forEach(f => { let d = f.dir; while (d) { dirs.add(d); d = dirOf(d); } });
  const byExt = new Map();
  files.forEach(f => byExt.set(f.ext || "(なし)", (byExt.get(f.ext || "(なし)") || 0) + 1));
  const extList = [...byExt.entries()].sort((a, b) => b[1] - a[1]);
  const rv = progress();

  const card = (v, k, title) =>
    '<div class="card"' + (title ? ' title="' + esc(title) + '"' : "") + '><div class="v">' + v +
    '</div><div class="k">' + k + "</div></div>";

  ov.innerHTML =
    "<h1>" + esc(S.rootName) + "</h1>" +
    '<div class="sub">' + files.length.toLocaleString() + " ファイル · " + dirs.size +
      " フォルダ · " + fmtSize(totalSize) + "</div>" +
    '<div class="cards">' +
      card(files.length.toLocaleString(), "ファイル") +
      card(dirs.size, "フォルダ") +
      card(S.edges.length, "検出した参照関係") +
      card(rv.pct + "%", "レビュー進捗", rv.done + " / " + rv.total + " ファイル") +
      card(S.missing.length, "見つからない参照") +
      card(S.orphans.length, "参照されていないファイル") +
    "</div>";

  const sections = [];

  /* ---------- 読む順番 ---------- */
  if (S.readOrder.length) {
    let h = "<h2>この順に読むと分かりやすい</h2>" +
      '<div class="lead">依存関係をたどって、理解の足場になる順に並べました。クリックで開きます。</div>' +
      '<div class="readorder">';
    S.readOrder.slice(0, 30).forEach((o, i) => {
      h += '<div class="ro-item' + (isDone(o.path) ? " done" : "") + '" data-open="' + esc(o.path) + '">' +
        '<span class="no">' + (i + 1) + "</span>" +
        '<span class="body"><span class="nm">' + esc(o.path) + "</span>" +
        '<span class="why">' + esc(o.why) + "</span></span></div>";
    });
    h += "</div>";
    sections.push(h);
  }

  /* ---------- フォルダ構成 ---------- */
  const topDirs = new Map();
  files.forEach(f => {
    const segs = f.path.split("/");
    const top = segs.length > 1 ? segs.slice(0, Math.min(2, segs.length - 1)).join("/") : "(ルート直下)";
    if (!topDirs.has(top)) topDirs.set(top, { n: 0, size: 0 });
    const e = topDirs.get(top);
    e.n++; e.size += f.size;
  });
  const dirRows = [...topDirs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  const maxN = Math.max(...dirRows.map(r => r[1].n), 1);
  {
    let h = "<h2>フォルダの構成と役割</h2><table class='ovt'><tr>" +
      "<th>場所</th><th>推定される役割</th><th>ファイル数</th><th style='width:130px'></th></tr>";
    for (const [d, e] of dirRows) {
      h += "<tr><td class='p'>" + esc(d) + "</td><td>" + esc(roleOfDir(baseOf(d)) || "—") +
        "</td><td class='n'>" + e.n + "</td>" +
        '<td><div class="bar"><i style="width:' + Math.round(e.n / maxN * 100) + '%"></i></div></td></tr>';
    }
    sections.push(h + "</table>");
  }

  /* ---------- ハブ ---------- */
  const hubs = [...S.inMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  if (hubs.length) {
    let h = "<h2>多くのファイルから参照されているファイル</h2>" +
      '<div class="lead">ここを直すと影響が広い、という意味でも要注意の箇所です。</div>' +
      "<table class='ovt'><tr><th>ファイル</th><th>役割</th><th>被参照数</th></tr>";
    for (const [p, list] of hubs) {
      h += "<tr><td class='p' data-open='" + esc(p) + "'>" + esc(p) + "</td><td>" +
        esc(roleOfFile(p)) + "</td><td class='n'>" + list.length + "</td></tr>";
    }
    sections.push(h + "</table>");
  }

  /* ---------- 気づき ---------- */
  if (S.missing.length || S.cycles.length || S.orphans.length) {
    let h = "<h2>気づいた点</h2>";
    if (S.missing.length) {
      h += "<h3 style='font-size:12.5px;color:var(--red);margin:14px 0 6px'>見つからない参照 " +
        S.missing.length + " 件</h3><table class='ovt'><tr><th>書かれているパス</th><th>場所</th></tr>";
      for (const m of S.missing.slice(0, 20)) {
        h += "<tr><td>" + esc(m.spec) + "</td><td class='p' data-open='" + esc(m.from) +
          "' data-line='" + m.line + "'>" + esc(m.from) + ":" + m.line + "</td></tr>";
      }
      h += "</table>";
    }
    if (S.cycles.length) {
      h += "<h3 style='font-size:12.5px;color:var(--yellow);margin:14px 0 6px'>循環参照 " +
        S.cycles.length + " 件</h3><table class='ovt'><tr><th>経路</th></tr>";
      for (const cy of S.cycles.slice(0, 12)) {
        h += "<tr><td>" + esc(cy.map(baseOf).join(" → ")) + "</td></tr>";
      }
      h += "</table>";
    }
    if (S.orphans.length) {
      h += "<h3 style='font-size:12.5px;color:var(--fg-muted);margin:14px 0 6px'>どこからも参照されていない " +
        S.orphans.length + " 件</h3><div style='display:flex;flex-wrap:wrap;gap:7px'>" +
        S.orphans.slice(0, 40).map(o =>
          '<span class="chip dim" data-open="' + esc(o.path) + '" style="cursor:pointer">' +
          esc(baseOf(o.path)) + "</span>").join("") + "</div>";
    }
    sections.push(h);
  }

  /* ---------- 外部パッケージ ---------- */
  const pkgs = new Map();
  for (const set of S.externals.values()) for (const p of set) pkgs.set(p, (pkgs.get(p) || 0) + 1);
  if (pkgs.size) {
    const top = [...pkgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    sections.push("<h2>よく使われている外部パッケージ</h2>" +
      "<div style='display:flex;flex-wrap:wrap;gap:7px'>" +
      top.map(([p, n]) => '<span class="chip dim">' + esc(p) + " · " + n + "</span>").join("") + "</div>");
  }

  /* ---------- 種別内訳 ---------- */
  sections.push("<h2>ファイル種別の内訳</h2><div style='display:flex;flex-wrap:wrap;gap:7px'>" +
    extList.slice(0, 40).map(([e, n]) =>
      '<span class="chip" style="color:' + colorOf(e) + '">' + esc(e) + " · " + n + "</span>").join("") +
    "</div>");

  ov.insertAdjacentHTML("beforeend", sections.join(""));

  /* ---------- 依存関係の図（重いので押されたときだけ描く） ---------- */
  const dgmWrap = document.createElement("div");
  dgmWrap.innerHTML = "<h2>フォルダ間の依存関係</h2>" +
    '<div class="lead">フォルダ単位でまとめた図です。Mermaid 記法なので、そのまま資料に貼れます。</div>';
  const dgmBtn = document.createElement("button");
  dgmBtn.className = "hbtn";
  dgmBtn.textContent = "図を描く";
  dgmBtn.onclick = () => {
    dgmBtn.remove();
    dgmWrap.appendChild(mermaidBlock(buildMermaid({ byFolder: true })));
  };
  dgmWrap.appendChild(dgmBtn);
  ov.appendChild(dgmWrap);

  /* ---------- 書き出し ---------- */
  const foot = document.createElement("div");
  foot.style.cssText = "margin-top:34px;display:flex;gap:10px;flex-wrap:wrap";
  const mk = (label, fn) => {
    const b = document.createElement("button");
    b.className = "hbtn"; b.textContent = label; b.onclick = fn;
    foot.appendChild(b);
  };
  mk("Mermaid 図をコピー", () => {
    navigator.clipboard.writeText(buildMermaid({ byFolder: true }))
      .then(() => actions.toast("Mermaid 記法をコピーしました"));
  });
  mk("概要を Markdown で保存", () => {
    saveAs("overview-" + (S.rootName || "project").replace(/[^\w.-]+/g, "_") + ".md",
      overviewMarkdown(), "text/markdown;charset=utf-8");
    actions.toast("概要を書き出しました");
  });
  ov.appendChild(foot);

  /* ---------- クリックで開く ---------- */
  $$("[data-open]", ov).forEach(el => {
    el.style.cursor = "pointer";
    el.onclick = () => actions.openFile(el.dataset.open,
      el.dataset.line ? { line: +el.dataset.line } : undefined);
  });
  $$(".ovt .p", ov).forEach(el => {
    if (el.dataset.open) return;
    const t = el.textContent.trim();
    if (S.files.has(t)) { el.style.cursor = "pointer"; el.onclick = () => actions.openFile(t); }
  });
}

/* ---------- サイドバーの小さな概要 ---------- */
export function renderOverviewPanel() {
  const files = [...S.files.values()];
  const host = $("#ovBody");
  if (!files.length) {
    host.innerHTML = '<div class="empty-note">まだ何も読み込まれていません。</div>';
    return;
  }
  const rows = [
    ["ファイル数", files.length.toLocaleString()],
    ["合計サイズ", fmtSize(files.reduce((a, b) => a + b.size, 0))],
    ["Markdown", files.filter(f => f.kind === "markdown").length],
    ["コード・テキスト", files.filter(f => f.kind === "text").length],
    ["表データ (CSV)", files.filter(f => f.kind === "csv").length],
    ["PDF / Word", files.filter(f => ["pdf", "docx", "office"].includes(f.kind)).length],
    ["画像", files.filter(f => f.kind === "image").length],
    ["参照関係", S.edges.length],
    ["見つからない参照", S.missing.length],
    ["循環参照", S.cycles.length],
  ];
  host.innerHTML = rows.map(([k, v]) =>
    '<div class="stat-line"><span>' + k + "</span><span>" + v + "</span></div>").join("");
}

/* ---------- 概要の Markdown ---------- */
export function overviewMarkdown() {
  const files = [...S.files.values()];
  const out = [];
  out.push("# " + S.rootName + " の概要", "");
  out.push("- ファイル数: " + files.length);
  out.push("- 合計サイズ: " + fmtSize(files.reduce((a, b) => a + b.size, 0)));
  out.push("- 検出した参照関係: " + S.edges.length);
  out.push("");

  if (S.readOrder.length) {
    out.push("## 読む順番", "");
    S.readOrder.slice(0, 30).forEach((o, i) => {
      out.push((i + 1) + ". `" + o.path + "` — " + o.why);
    });
    out.push("");
  }

  const hubs = [...S.inMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  if (hubs.length) {
    out.push("## 多くから参照されているファイル", "");
    out.push("| ファイル | 役割 | 被参照数 |", "| --- | --- | --- |");
    for (const [p, l] of hubs) out.push("| `" + p + "` | " + roleOfFile(p) + " | " + l.length + " |");
    out.push("");
  }

  if (S.missing.length) {
    out.push("## 見つからない参照", "");
    for (const m of S.missing.slice(0, 40)) out.push("- `" + m.from + ":" + m.line + "` → `" + m.spec + "`");
    out.push("");
  }
  if (S.cycles.length) {
    out.push("## 循環参照", "");
    for (const cy of S.cycles.slice(0, 20)) out.push("- " + cy.map(baseOf).join(" → "));
    out.push("");
  }
  if (S.orphans.length) {
    out.push("## どこからも参照されていないファイル", "");
    for (const o of S.orphans.slice(0, 60)) out.push("- `" + o.path + "` — " + o.role);
    out.push("");
  }

  out.push("## フォルダ間の依存関係", "", "```mermaid", buildMermaid({ byFolder: true }), "```", "");
  out.push("---", "", "File Review Studio で作成");
  return out.join("\n");
}
