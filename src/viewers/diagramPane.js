/* =========================================================================
   図タブ
   コードから組み立てた図（レイヤー依存マップ / ER 図 / データフロー / API）を
   描いて、記法のコピーと SVG・Markdown での書き出しまでを引き受ける。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, baseOf, saveAs } from "../core/util.js";
import { roleOfFile } from "../core/roles.js";
import { analyzeLayers, layersToMermaid, layerById } from "../core/layers.js";
import { extractSchema, schemaToMermaid } from "../core/schema.js";
import { traceFlow, flowToMermaid, findEndpoints, endpointsToMermaid } from "../core/dataflow.js";
import { buildMermaid } from "../core/analyze.js";
import { mermaidBlock } from "./diagram.js";

export const DIAGRAM_KINDS = {
  layers: { label: "レイヤー依存マップ", lead: "フォルダ名から層を推し量り、層をまたぐ依存を数えます。下の層が上の層を参照している箇所は逆流として拾います。" },
  er: { label: "ER 図", lead: "SQL・Prisma・Django・SQLAlchemy・TypeORM の定義からテーブルと関係を組み立てます。" },
  flow: { label: "データフロー図", lead: "起点のファイルから参照をたどり、処理が広がる経路を描きます。変数の流れまでは追えません。" },
  endpoints: { label: "API の入口", lead: "ルート定義とファイル配置から、外から呼ばれる入口を集めます。" },
  folders: { label: "フォルダ間の依存", lead: "フォルダ単位でまとめた依存関係です。" },
};

export function buildDiagramPane(pane, kind) {
  const meta = DIAGRAM_KINDS[kind] || DIAGRAM_KINDS.layers;

  const tools = document.createElement("div");
  tools.className = "diff-tools";
  pane.appendChild(tools);

  const body = document.createElement("div");
  body.className = "editor-body";
  pane.appendChild(body);

  const state = { kind, code: "", extra: null };

  /** 図と補足を描き直す */
  function render() {
    body.innerHTML = "";
    const head = document.createElement("div");
    head.className = "ov";
    head.style.paddingBottom = "0";
    head.innerHTML = "<h1>" + esc(meta.label) + "</h1>" +
      '<div class="lead">' + esc(meta.lead) + "</div>";
    body.appendChild(head);

    const built = build(state);
    state.code = built.code;

    if (!built.code) {
      head.insertAdjacentHTML("beforeend",
        '<div class="center-note" style="align-items:flex-start;padding:30px 0"><div class="big">' +
        esc(built.empty || "材料が見つかりませんでした") + "</div>" +
        (built.hint ? "<div>" + esc(built.hint) + "</div>" : "") + "</div>");
      syncButtons(false);
      return;
    }

    const box = document.createElement("div");
    box.className = "ov";
    box.style.paddingTop = "12px";
    box.appendChild(mermaidBlock(built.code));
    if (built.extra) box.appendChild(built.extra);
    body.appendChild(box);
    syncButtons(true);
  }

  /* ---------- 上部の操作 ---------- */
  const optionsWrap = document.createElement("span");
  optionsWrap.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap";
  tools.appendChild(optionsWrap);
  tools.appendChild(Object.assign(document.createElement("span"), { className: "head-sp" }));

  const btnCopy = mkBtn("記法をコピー", () => {
    navigator.clipboard.writeText(state.code).then(() => actions.toast("Mermaid 記法をコピーしました"));
  });
  const btnSvg = mkBtn("SVG で保存", () => {
    const svg = body.querySelector(".mermaid-box svg");
    if (!svg) { actions.toast("まだ図が描けていません"); return; }
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    saveAs(fileName("svg"), new XMLSerializer().serializeToString(clone), "image/svg+xml;charset=utf-8");
    actions.toast("SVG で書き出しました");
  });
  const btnMd = mkBtn("Markdown で保存", () => {
    saveAs(fileName("md"),
      "# " + meta.label + "（" + S.rootName + "）\n\n" + meta.lead + "\n\n```mermaid\n" + state.code + "\n```\n",
      "text/markdown;charset=utf-8");
    actions.toast("Markdown で書き出しました");
  });

  function mkBtn(label, fn) {
    const b = document.createElement("button");
    b.className = "hbtn"; b.textContent = label; b.onclick = fn;
    tools.appendChild(b);
    return b;
  }
  function syncButtons(on) {
    for (const b of [btnCopy, btnSvg, btnMd]) b.disabled = !on;
    for (const b of [btnCopy, btnSvg, btnMd]) b.style.opacity = on ? "" : ".45";
  }
  const fileName = (ext) =>
    (S.rootName || "project").replace(/[^\w.-]+/g, "_") + "-" + kind + "." + ext;

  /* ---------- 図ごとの設定 ---------- */
  if (kind === "layers") {
    addCheck(optionsWrap, "ファイル数を出す", true, (v) => { state.showCounts = v; render(); });
    state.showCounts = true;
  } else if (kind === "er") {
    addCheck(optionsWrap, "列を表示する", true, (v) => { state.withColumns = v; render(); });
    state.withColumns = true;
  } else if (kind === "flow") {
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "起点のファイル");
    sel.style.cssText = "background:var(--bg-input);color:var(--fg);border:1px solid var(--border);padding:4px 6px;border-radius:3px;max-width:340px";
    const candidates = flowCandidates();
    state.root = defaultFlowRoot(candidates);
    sel.innerHTML = candidates.map(p =>
      '<option value="' + esc(p) + '"' + (p === state.root ? " selected" : "") + ">" + esc(p) + "</option>").join("");
    sel.onchange = () => { state.root = sel.value; render(); };
    const lab = document.createElement("label");
    lab.style.cssText = "display:flex;gap:6px;align-items:center";
    lab.append("起点: ", sel);
    optionsWrap.appendChild(lab);

    const dep = document.createElement("select");
    dep.setAttribute("aria-label", "たどる深さ");
    dep.style.cssText = sel.style.cssText;
    dep.innerHTML = [1, 2, 3, 4, 5].map(d => '<option value="' + d + '"' + (d === 3 ? " selected" : "") + ">" + d + " 階層</option>").join("");
    dep.onchange = () => { state.depth = +dep.value; render(); };
    state.depth = 3;
    const lab2 = document.createElement("label");
    lab2.style.cssText = lab.style.cssText;
    lab2.append("深さ: ", dep);
    optionsWrap.appendChild(lab2);

    const dir = document.createElement("select");
    dir.setAttribute("aria-label", "たどる向き");
    dir.style.cssText = sel.style.cssText;
    dir.innerHTML =
      '<option value="out">この先を追う（参照している側）</option>' +
      '<option value="in">手前を追う（参照している元）</option>' +
      '<option value="both">両方向</option>';
    dir.onchange = () => { state.direction = dir.value; render(); };
    state.direction = "out";
    const lab3 = document.createElement("label");
    lab3.style.cssText = lab.style.cssText;
    lab3.append("向き: ", dir);
    optionsWrap.appendChild(lab3);
  }

  render();
}

function addCheck(host, label, initial, onChange) {
  const l = document.createElement("label");
  l.style.cssText = "display:flex;gap:6px;align-items:center;cursor:pointer";
  const c = document.createElement("input");
  c.type = "checkbox";
  c.checked = initial;
  c.onchange = () => onChange(c.checked);
  l.append(c, label);
  host.appendChild(l);
}

/**
 * 最初に見せる起点を決める。
 * 開いているファイルがあればそれ、なければ参照を多く持つコードを選ぶ
 * （説明文書より、処理が広がる様子が見えるほうが図の役に立つため）。
 */
function defaultFlowRoot(candidates) {
  // 開いているのがコードなら、それを起点にするのが自然
  if (S.active && S.active.kind === "file") {
    const f = S.files.get(S.active.path);
    if (f && f.kind === "text" && (S.outMap.get(S.active.path) || []).length) return S.active.path;
  }
  const code = candidates.filter(p => {
    const f = S.files.get(p);
    return f && f.kind === "text" && (S.outMap.get(p) || []).length;
  });
  code.sort((a, b) => (S.outMap.get(b) || []).length - (S.outMap.get(a) || []).length);
  return code[0] || candidates[0] || "";
}

/** データフロー図の起点になりそうなファイル */
function flowCandidates() {
  const order = S.readOrder.map(o => o.path);
  const rest = [...S.files.keys()].filter(p => {
    const f = S.files.get(p);
    return f.text && (f.kind === "text" || f.kind === "markdown") && !order.includes(p);
  });
  const active = S.active && S.active.kind === "file" ? [S.active.path] : [];
  return [...new Set([...active, ...order, ...rest])].slice(0, 300);
}

/* =========================================================================
   図の組み立て
   ========================================================================= */
function build(state) {
  switch (state.kind) {
    case "layers": return buildLayers(state);
    case "er": return buildER(state);
    case "flow": return buildFlow(state);
    case "endpoints": return buildEndpoints(state);
    default: return { code: buildMermaid({ byFolder: true }) };
  }
}

function buildLayers(state) {
  const result = analyzeLayers();
  if (!result.layers.length) {
    return { code: "", empty: "層に割り当てられるファイルがありませんでした",
      hint: "src / components / api / models のようなフォルダ名から層を判定しています。" };
  }
  if (!result.links.length) {
    return { code: layersToMermaid(result, { showCounts: state.showCounts }),
      extra: layerTables(result) };
  }
  return {
    code: layersToMermaid(result, { showCounts: state.showCounts }),
    extra: layerTables(result),
  };
}

function layerTables(result) {
  const box = document.createElement("div");
  let h = "<h2>層の内訳</h2><table class='ovt'><tr><th>層</th><th>ファイル数</th><th>役割の目安</th></tr>";
  for (const L of result.layers) {
    h += "<tr><td><span style='color:" + L.color + "'>■</span> " + esc(L.name) + "</td>" +
      "<td class='n'>" + L.count + "</td><td>" + esc(layerHint(L.id)) + "</td></tr>";
  }
  h += "</table>";

  if (result.violationTotal) {
    h += "<h2 style='color:var(--red)'>層の逆流 " + result.violationTotal + " 件</h2>" +
      '<div class="lead">下の層が上の層を参照しています。依存の向きが逆なので、共通化の見直し候補です。</div>' +
      "<table class='ovt'><tr><th>参照元</th><th>参照先</th><th>向き</th></tr>";
    for (const v of result.violations.slice(0, 40)) {
      h += "<tr><td class='p' data-open='" + esc(v.from) + "'>" + esc(v.from) + "</td>" +
        "<td class='p' data-open='" + esc(v.to) + "'>" + esc(v.to) + "</td>" +
        "<td>" + esc(v.fromLayer.name) + " → " + esc(v.toLayer.name) + "</td></tr>";
    }
    h += "</table>";
  } else {
    h += "<h2>層の逆流</h2><div class='lead'>見つかりませんでした。依存の向きは揃っています。</div>";
  }

  if (result.links.length) {
    h += "<h2>層をまたぐ依存</h2><table class='ovt'><tr><th>経路</th><th>本数</th><th>例</th></tr>";
    for (const l of result.links.slice(0, 20)) {
      const a = layerById(l.from), b = layerById(l.to);
      const sample = l.samples[0];
      h += "<tr><td>" + esc(a.name) + " → " + esc(b.name) + "</td><td class='n'>" + l.n + "</td>" +
        "<td class='p' data-open='" + esc(sample ? sample.from : "") + "'>" +
        esc(sample ? baseOf(sample.from) + " → " + baseOf(sample.to) : "") + "</td></tr>";
    }
    h += "</table>";
  }

  box.className = "ov";
  box.style.padding = "0";
  box.innerHTML = h;
  wireOpen(box);
  return box;
}

const LAYER_HINTS = {
  ui: "pages / views / components / screens など",
  route: "routes / controllers / api / handlers など",
  domain: "services / store / hooks / usecases など",
  data: "models / entities / repositories / migrations など",
  base: "utils / lib / config / types など",
  other: "上のどれにも当てはまらなかったもの",
  test: "tests / __tests__ / *.test.* など",
};
const layerHint = (id) => LAYER_HINTS[id] || "";

function buildER(state) {
  const schema = extractSchema();
  if (!schema.tables.length) {
    return {
      code: "", empty: "テーブルの定義が見つかりませんでした",
      hint: "SQL の CREATE TABLE、Prisma の model、Django / SQLAlchemy の models、TypeORM の @Entity を探しています。",
    };
  }
  const code = schemaToMermaid(schema, { withColumns: state.withColumns });

  const box = document.createElement("div");
  box.className = "ov";
  box.style.padding = "0";
  let h = "<h2>拾えたテーブル " + schema.tables.length + " 件</h2>" +
    '<div class="lead">どのファイルから読み取ったかを載せています。取りこぼしがあれば元のファイルを確認してください。</div>' +
    "<table class='ovt'><tr><th>テーブル</th><th>列数</th><th>出どころ</th><th>定義箇所</th></tr>";
  for (const t of schema.tables.slice(0, 60)) {
    h += "<tr><td>" + esc(t.name) + "</td><td class='n'>" + t.columns.length + "</td>" +
      "<td>" + esc(t.source) + "</td>" +
      "<td class='p' data-open='" + esc(t.file) + "' data-line='" + t.line + "'>" +
      esc(t.file) + ":" + t.line + "</td></tr>";
  }
  h += "</table>";

  if (schema.rels.length) {
    h += "<h2>関係 " + schema.rels.length + " 件</h2><table class='ovt'><tr><th>元</th><th>先</th><th>種類</th><th>項目</th></tr>";
    for (const r of schema.rels.slice(0, 60)) {
      h += "<tr><td>" + esc(r.from) + "</td><td>" + esc(r.to) + "</td>" +
        "<td>" + esc(RE_LABEL[r.kind] || r.kind) + "</td><td>" + esc(r.label || "—") + "</td></tr>";
    }
    h += "</table>";
  } else {
    h += "<h2>関係</h2><div class='lead'>テーブル間の関係は見つかりませんでした（外部キーの記述がない可能性があります）。</div>";
  }
  box.innerHTML = h;
  wireOpen(box);
  return { code, extra: box };
}

const RE_LABEL = {
  "many-to-one": "多対一", "one-to-many": "一対多",
  "many-to-many": "多対多", "one-to-one": "一対一",
};

function buildFlow(state) {
  if (!state.root) {
    return { code: "", empty: "起点にできるファイルがありません" };
  }
  const flow = traceFlow(state.root, { depth: state.depth, direction: state.direction });
  if (!flow.edges.length) {
    return {
      code: "", empty: baseOf(state.root) + " からたどれる参照がありませんでした",
      hint: "import / require / Markdown のリンクをたどっています。向きを変えるか、別のファイルを起点にしてみてください。",
    };
  }
  const code = flowToMermaid(flow, { showRole: false });

  const box = document.createElement("div");
  box.className = "ov";
  box.style.padding = "0";
  let h = "<h2>経路に出てきたファイル " + flow.nodes.length + " 件</h2>" +
    (flow.truncated ? '<div class="lead">数が多いため途中で打ち切りました。深さを浅くすると全体が見やすくなります。</div>' : "") +
    "<table class='ovt'><tr><th>ファイル</th><th>起点からの距離</th><th>役割</th></tr>";
  for (const n of [...flow.nodes].sort((a, b) => a.dist - b.dist).slice(0, 60)) {
    h += "<tr><td class='p' data-open='" + esc(n.path) + "'>" + esc(n.path) + "</td>" +
      "<td class='n'>" + (n.dist === 0 ? "起点" : n.dist) + "</td>" +
      "<td>" + esc(roleOfFile(n.path)) + "</td></tr>";
  }
  h += "</table>";
  box.innerHTML = h;
  wireOpen(box);
  return { code, extra: box };
}

function buildEndpoints(state) {
  const eps = findEndpoints();
  if (!eps.length) {
    return {
      code: "", empty: "API の入口が見つかりませんでした",
      hint: "Express・FastAPI・Flask・NestJS・Django の書き方と、Next.js / SvelteKit のファイル配置を探しています。",
    };
  }
  const code = endpointsToMermaid(eps);

  const box = document.createElement("div");
  box.className = "ov";
  box.style.padding = "0";
  let h = "<h2>見つかった入口 " + eps.length + " 件</h2>" +
    "<table class='ovt'><tr><th>メソッド</th><th>パス</th><th>定義箇所</th><th>拾い方</th></tr>";
  for (const e of eps.slice(0, 120)) {
    h += "<tr><td><code>" + esc(e.method) + "</code></td><td>" + esc(e.path) + "</td>" +
      "<td class='p' data-open='" + esc(e.file) + "' data-line='" + e.line + "'>" +
      esc(baseOf(e.file)) + ":" + e.line + "</td><td>" + esc(e.kind) + "</td></tr>";
  }
  h += "</table>";
  box.innerHTML = h;
  wireOpen(box);
  return { code, extra: box };
}

function wireOpen(box) {
  $$("[data-open]", box).forEach(el => {
    el.style.cursor = "pointer";
    el.onclick = () => actions.openFile(el.dataset.open,
      el.dataset.line ? { line: +el.dataset.line } : undefined);
  });
}
