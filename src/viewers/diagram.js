/* =========================================================================
   図の表示
     - 罫線・矢印で描かれた図（等幅グリッドを補正して線をつなげる）
     - 「┌─ … ┐」で描かれた層構造をカードに組み直す
     - Mermaid 記法は実際に図として描く（必要になったときだけ読み込む）
   ========================================================================= */
import { esc } from "../core/util.js";

export const BOX_RE = /[─-╿▲▼◀▶←-↓⇄⇢⟶⟵]/;
export const MERMAID_HEAD = /^\s*(graph\s+(TB|TD|BT|RL|LR)|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie\s|mindmap|timeline|gitGraph)\b/;

export function looksLikeDiagram(t) {
  const lines = String(t).split("\n");
  if (lines.length < 3) return false;
  let box = 0, ascii = 0;
  for (const l of lines) {
    if (BOX_RE.test(l)) box++;
    else if (/[|+]/.test(l) && /^[\s|+\-<>v^*=]+$/.test(l) && l.trim().length > 1) ascii++;
  }
  return box >= 2 || ascii >= 2;
}

/* 全角として描画される文字（東アジアの文字幅 W / F） */
const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const BOXCHAR_RE = /[─-╿]/;
const ARROW_RE = /[←-↓⇄⇢⟶⟵▲▼◀▶]/;

function diagramHTML(raw) {
  const text = String(raw).replace(/\s+$/, "");
  let out = "", run = "", cls = null;
  const flush = () => {
    if (!run) return;
    out += cls ? '<span class="' + cls + '">' + esc(run) + "</span>" : esc(run);
    run = "";
  };
  for (const ch of text) {
    let c = null;
    if (ch !== "\n") {
      if (WIDE_RE.test(ch)) c = "fw";
      else if (BOXCHAR_RE.test(ch)) c = "bx";
      else if (ARROW_RE.test(ch)) c = "arw";
    }
    if (c !== cls) { flush(); cls = c; }
    run += ch;
  }
  flush();
  return out.replace(/(--?&gt;|&lt;--?|==&gt;)/g, '<span class="arw">$1</span>');
}

/** 実際に描画される文字幅を測り、全角＝半角2文字ぶんになるよう字間を補正する */
export function calibrateGrid(pre) {
  const cs = getComputedStyle(pre);
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;letter-spacing:0;padding:0;margin:0;border:0";
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontSize = cs.fontSize;
  document.body.appendChild(probe);
  const w = (s, n) => { probe.textContent = s.repeat(n); return probe.getBoundingClientRect().width / n; };
  const half = w("M", 60);
  const set = (name, ch) => {
    if (!half) return;
    const d = half * (name === "--fw" ? 2 : 1) - w(ch, 30);
    pre.style.setProperty(name, (Math.abs(d) < 0.05 ? 0 : d).toFixed(3) + "px");
  };
  set("--fw", "あ");
  set("--bx", "─");
  set("--aw", "→");
  probe.remove();
}

/** 「┌─ … ┐」で囲まれた層構造をカードの並びとして解釈する */
function parseLayerDiagram(raw) {
  const lines = String(raw).replace(/\s+$/, "").split("\n");
  const blocks = [];
  let cur = null;
  const edge = (s) => s.replace(/[┌╭┏└╰┗┐╮┓┘╯┛─━═╌]+/g, " ").replace(/\s+/g, " ").trim();
  const bars = (s) => s.replace(/^\s*[│┃|]\s?/, "").replace(/\s*[│┃|]\s*$/, "").trimEnd();
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[┌╭┏]/.test(t)) { if (cur) blocks.push(cur); cur = { type: "box", title: edge(t), lines: [] }; continue; }
    if (/^[└╰┗]/.test(t)) { if (cur) { const f = edge(t); if (f) cur.footer = f; blocks.push(cur); cur = null; } continue; }
    if (cur) { const b = bars(t); if (b.trim()) cur.lines.push(b); continue; }
    const c = t.replace(/^[\s│┃|]+/, "").replace(/[\s│┃|]+$/, "").trim();
    if (c) blocks.push({ type: "arrow", text: c });
  }
  if (cur) blocks.push(cur);
  return blocks.filter(b => b.type === "box").length >= 2 ? blocks : null;
}

function inlineTokens(s) {
  return esc(s)
    .replace(/([\w@.{}/\-]*\.(?:md|json|py|mjs|cjs|js|jsx|ts|tsx|ya?ml|html|css|csv|txt|toml|sh))\b/g, "<code>$1</code>")
    .replace(/(^|[\s（(])([\w-]+\/[\w{}-]*\/?)(?=$|[\s）)、。,])/g, "$1<code>$2</code>");
}

function layerCards(blocks) {
  const wrap = document.createElement("div");
  wrap.className = "layers";
  let n = 0;
  for (const b of blocks) {
    if (b.type === "arrow") {
      const a = document.createElement("div");
      a.className = "lc-ar";
      const label = b.text.replace(/^[↓→⇢⟶▼\s]+/, "").trim();
      a.innerHTML = '<i class="rule"></i>' +
        (label ? '<span class="t">' + inlineTokens(label) + "</span>" : "") +
        '<i class="rule"></i><span class="cap">▼</span>';
      wrap.appendChild(a);
      continue;
    }
    n++;
    const card = document.createElement("div");
    card.className = "lcard";
    const m = b.title.match(/^(.*?)\s*([（(].*)$/);
    const head = '<div class="lc-t"><span class="lc-i">' + String(n).padStart(2, "0") + "</span>" +
      "<span>" + esc(m ? m[1] : b.title) + "</span>" +
      (m ? '<span class="lc-meta">' + esc(m[2]) + "</span>" : "") + "</div>";
    let body = "";
    for (const raw of b.lines) {
      const line = raw.trim();
      const bullet = line.match(/^([→⇢⟶▶•\-*]|-&gt;|->)\s*(.*)$/);
      if (bullet) body += '<div class="lc-line"><span class="m">▸</span><span>' + inlineTokens(bullet[2]) + "</span></div>";
      else if (/^[\w@./-]+$/.test(line)) body += '<div class="lc-line key">' + esc(line) + "</div>";
      else body += '<div class="lc-line">' + inlineTokens(line) + "</div>";
    }
    if (b.footer) body += '<div class="lc-line foot">' + inlineTokens(b.footer) + "</div>";
    card.innerHTML = head + '<div class="lc-b">' + body + "</div>";
    wrap.appendChild(card);
  }
  return wrap;
}

/* ---------- 縦に流れる罫線図（枠なし）をフロー図に組み直す ---------- */

/* 横の受け渡し: 「──▶」「──ラベル──▶」「─(ラベル)→」「-->」「A → B」（D→C のような詰めた矢印は文の一部とみなす） */
const FLOW_EDGE_RE = /\s*(?:(?:[─━]+|-{2,})\s*(?:([^─━▶►→]+?)\s*(?:[─━]+|-{2,})|[(（]([^()（）]*)[)）]\s*[─━]*)?\s*(?:[▶►→]|>)|\s[→⇢⟶]\s)\s*/g;
/* 縦のつなぎ: 「▼ ラベル」「↓(ラベル)」「│」 */
const FLOW_VERT_RE = /^(?:[│┃|]\s*)*[▼↓]\s*(.*)$|^[│┃]+$/;
const CIRCLED_RE = /^([①-⑳])\s*/;

/**
 * 枠を使わず「行＝工程、▼＝つなぎ、──▶＝横の受け渡し」で書かれた図を解釈する。
 * ツリーや2次元の配置など、この形に当てはまらない図には null を返す。
 */
export function parseFlowDiagram(raw) {
  const lines = String(raw).replace(/\s+$/, "").split("\n");
  // 枠・ツリー・交差を含む図は対象外
  if (lines.some(l => /[┌┐┘╭╮╯┏┓┛├┤┬┴┼]|└[─━]|\+-/.test(l))) return null;

  const rows = [];
  let lastRow = null;
  let edgeCount = 0;
  let prevIndent = -1, deeper = 0;
  for (const original of lines) {
    if (!original.trim()) continue;
    const t = original.trim();

    const v = t.match(FLOW_VERT_RE);
    if (v) {
      prevIndent = -1;
      const label = (v[1] || "").trim();
      const prev = rows[rows.length - 1];
      if (prev && prev.type === "conn") { if (label) prev.label = label; }
      else rows.push({ type: "conn", label });
      continue;
    }

    // 直前の工程からの分岐・補足（「└ …」「→ …」「（…）」だけの行）
    const br = t.match(/^[└→⇢]\s*(.+)$/) || t.match(/^([（(][^）)]*[）)])$/);
    if (br) {
      if (!lastRow) return null;
      lastRow.nodes[lastRow.nodes.length - 1].notes.push(br[1].trim());
      continue;
    }

    // つなぎを挟まずに字下げが深くなる行が続くなら、入れ子を表した文章（擬似コードなど）
    const indent = original.length - original.trimStart().length;
    if (prevIndent >= 0 && indent >= prevIndent + 2 && ++deeper >= 2) return null;
    prevIndent = indent;

    // 行末の「│」は下の流れへの合流を指す。罫線の文字幅は環境で変わるため、桁から合流先の箱は決めない
    const line = original.replace(/\s*[│┃|]?\s*$/, "");
    // 行の途中に縦線が残るなら2次元の図
    if (/[│┃]/.test(line.trim())) return null;

    const nodes = [], edges = [];
    let last = 0, m;
    FLOW_EDGE_RE.lastIndex = 0;
    while ((m = FLOW_EDGE_RE.exec(line))) {
      nodes.push({ text: line.slice(last, m.index), start: last });
      edges.push((m[1] || m[2] || "").trim().replace(/^[(（]([^()（）]*)[)）]$/, "$1"));
      last = m.index + m[0].length;
    }
    nodes.push({ text: line.slice(last), start: last });

    const parsed = [];
    for (const n of nodes) {
      // 矢じりの無い「──」の後ろは工程の補足
      const parts = n.text.trim().split(/\s*[─━]{2,}\s*/).filter(Boolean);
      // 文の間に大きな空白があるなら列が並んだ図
      if (parts.some(p => /\S\s{4,}\S/.test(p))) return null;
      parsed.push({ text: parts[0] || "", notes: parts.slice(1) });
    }

    const row = { type: "row", nodes: parsed, edges, merge: null };
    // 相手のいない矢印は、下の流れへの合流
    if (parsed[parsed.length - 1].text === "" && edges.length > 0) {
      parsed.pop();
      row.merge = { label: edges.pop() };
    }
    if (parsed.some(n => !n.text)) return null;
    edgeCount += edges.length + (row.merge ? 1 : 0);
    rows.push(row);
    lastRow = row;
  }

  const steps = rows.filter(r => r.type === "row");
  const nodeCount = steps.reduce((a, r) => a + r.nodes.length, 0);
  const conns = rows.filter(r => r.type === "conn").length;
  // 縦のつなぎが無いものは「A → B」の対応表や計算例であることが多いので対象外
  if (steps.length < 3 || nodeCount < 4 || conns < 1 || conns + edgeCount < 2) return null;
  return rows;
}

function flowNode(n) {
  const el = document.createElement("div");
  el.className = "fl-node";
  let text = n.text;
  let badge = "";
  const c = text.match(CIRCLED_RE);
  if (c) { badge = '<span class="fl-n">' + c[1] + "</span>"; text = text.slice(c[0].length); }
  // 「名前（補足）」は補足を2行目に回す
  const m = text.match(/^([^（(]+?)\s*([（(][^（()）]*[）)])$/);
  let title = inlineTokens(text), meta = "";
  if (m) { title = inlineTokens(m[1]); meta = '<div class="fl-meta">' + inlineTokens(m[2]) + "</div>"; }
  const notes = n.notes.map(s => '<div class="fl-note"><span class="m">↳</span><span>' + inlineTokens(s) + "</span></div>").join("");
  el.innerHTML = '<div class="fl-t">' + badge + "<span>" + title + "</span></div>" + meta + notes;
  if (c) el.classList.add("step");
  return el;
}

function flowEdge(label) {
  const el = document.createElement("div");
  el.className = "fl-h";
  el.innerHTML = (label ? '<span class="t" title="' + esc(label) + '">' + esc(label) + "</span>" : "") + '<span class="ln"><i></i><b>▶</b></span>';
  return el;
}

function flowChart(rows) {
  const wrap = document.createElement("div");
  wrap.className = "flow";
  let prev = null;
  for (const r of rows) {
    if (r.type === "conn") {
      const a = document.createElement("div");
      a.className = "lc-ar fl-v";
      a.innerHTML = '<i class="rule"></i>' + (r.label ? '<span class="t">' + inlineTokens(r.label) + "</span>" : "") +
        '<i class="rule"></i><span class="cap">▼</span>';
      wrap.appendChild(a);
      prev = r;
      continue;
    }
    // 工程が続くときは短い矢印でつなぐ。合流の行は上の行と並べて置く
    if (prev && prev.type === "row" && !r.merge) {
      const a = document.createElement("div");
      a.className = "lc-ar fl-v short";
      a.innerHTML = '<i class="rule"></i><span class="cap">▼</span>';
      wrap.appendChild(a);
    }
    const row = document.createElement("div");
    row.className = "fl-row" + (r.nodes.length > 1 || r.merge ? " chain" : "") + (r.merge ? " merge" : "");
    r.nodes.forEach((n, i) => {
      if (i > 0) row.appendChild(flowEdge(r.edges[i - 1]));
      row.appendChild(flowNode(n));
    });
    if (r.merge) {
      row.appendChild(flowEdge(r.merge.label));
      const g = document.createElement("div");
      g.className = "fl-node ghost";
      g.innerHTML = '<div class="fl-t"><span>下の流れへ合流</span></div>';
      row.appendChild(g);
    }
    wrap.appendChild(row);
    prev = r;
  }
  return wrap;
}

function shellWithHead(labelText, rawForCopy) {
  const shell = document.createElement("div");
  shell.className = "dgm-shell";
  const head = document.createElement("div");
  head.className = "cb-head";
  head.innerHTML = '<span class="cb-lang">' + esc(labelText) + "</span>";
  const ctl = document.createElement("span");
  ctl.className = "dgm-ctl";
  head.appendChild(ctl);
  const cp = document.createElement("button");
  cp.className = "cb-copy"; cp.textContent = "コピー";
  cp.onclick = () => navigator.clipboard.writeText(rawForCopy)
    .then(() => { cp.textContent = "コピーしました"; setTimeout(() => { cp.textContent = "コピー"; }, 1400); });
  shell.appendChild(head);
  return { shell, head, ctl, cp };
}

export function diagramBlock(raw) {
  const layers = parseLayerDiagram(raw);
  const flow = layers ? null : parseFlowDiagram(raw);
  const { shell, ctl, cp } = shellWithHead(
    layers ? "図（レイヤー構造）" : flow ? "図（フロー）" : "図（テキスト）", raw);

  const scroll = document.createElement("div");
  scroll.className = "dgm-scroll";
  const pre = document.createElement("pre");
  pre.className = "dgm";
  pre.innerHTML = diagramHTML(raw);
  scroll.appendChild(pre);

  const mk = (t, fn, title) => {
    const b = document.createElement("button");
    b.className = "mini-b"; b.textContent = t; b.title = title; b.onclick = fn;
    return b;
  };
  let size = 13;
  const label = document.createElement("span");
  label.className = "sz"; label.textContent = size + "px";
  const apply = () => { pre.style.fontSize = size + "px"; label.textContent = size + "px"; calibrateGrid(pre); };
  const zoomCtl = document.createElement("span");
  zoomCtl.className = "dgm-ctl";
  zoomCtl.appendChild(mk("−", () => { size = Math.max(9, size - 1); apply(); }, "文字を小さく"));
  zoomCtl.appendChild(label);
  zoomCtl.appendChild(mk("＋", () => { size = Math.min(24, size + 1); apply(); }, "文字を大きく"));
  const lh = mk("↕", () => {
    const loose = pre.style.lineHeight === "1.6";
    pre.style.lineHeight = loose ? "1.18" : "1.6";
    lh.classList.toggle("on", !loose);
  }, "行間を切り替える");
  zoomCtl.appendChild(lh);

  if (layers || flow) {
    const cards = layers ? layerCards(layers) : flowChart(flow);
    shell.appendChild(cards);
    shell.appendChild(scroll);
    scroll.style.display = "none";
    const seg = document.createElement("span");
    seg.className = "seg";
    const bCard = document.createElement("button"); bCard.textContent = layers ? "カード" : "フロー"; bCard.className = "on";
    const bText = document.createElement("button"); bText.textContent = "原文";
    const set = (card) => {
      cards.style.display = card ? "flex" : "none";
      scroll.style.display = card ? "none" : "block";
      zoomCtl.style.display = card ? "none" : "flex";
      bCard.classList.toggle("on", card); bText.classList.toggle("on", !card);
      if (!card) calibrateGrid(pre);
    };
    bCard.onclick = () => set(true);
    bText.onclick = () => set(false);
    seg.appendChild(bCard); seg.appendChild(bText);
    ctl.appendChild(seg);
    zoomCtl.style.display = "none";
  } else {
    shell.appendChild(scroll);
  }
  ctl.appendChild(zoomCtl);
  ctl.appendChild(cp);
  calibrateGrid(pre);
  return shell;
}

/* ---------- Mermaid（必要になったときだけ読み込む） ---------- */
let mmdSeq = 0;
let mermaidMod = null;

async function getMermaid() {
  if (mermaidMod) return mermaidMod;
  const m = await import("mermaid");
  mermaidMod = m.default || m;
  return mermaidMod;
}

/**
 * 現在のテーマに合わせて Mermaid の色を決める。
 * トークンは light-dark() を含むため、いったん要素に当てて
 * 実際に採用された色（rgb 表記）を取り出す。
 */
function resolveColor(varName, fallback) {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;left:-9999px;color:var(" + varName + ")";
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c && c !== "rgba(0, 0, 0, 0)" ? c : fallback;
}

function mermaidTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => (n === "--ui"
    ? ((cs.getPropertyValue(n) || "").trim() || d)
    : resolveColor(n, d));
  const attr = document.documentElement.getAttribute("data-theme");
  const isDark = attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    theme: isDark ? "dark" : "default",
    themeVariables: {
      background: v("--bg-code", "#1b1b1b"),
      primaryColor: v("--bg-select", "#264f78"),
      primaryBorderColor: v("--focus", "#4daafc"),
      lineColor: v("--fg-muted", "#7aa2c4"),
      textColor: v("--fg", "#d4d4d4"),
      fontFamily: v("--ui", "sans-serif"),
    },
  };
}

export function mermaidBlock(raw) {
  const { shell, ctl, cp } = shellWithHead("図（Mermaid）", raw);
  ctl.appendChild(cp);
  const box = document.createElement("div");
  box.className = "mermaid-box";
  box.textContent = "図を描画しています…";
  shell.appendChild(box);

  const fallback = (msg) => {
    const alt = diagramBlock(raw).querySelector(".dgm-scroll");
    if (box.isConnected) box.replaceWith(alt || document.createTextNode(raw));
    const lang = shell.querySelector(".cb-lang");
    lang.textContent = "図（Mermaid・描画できませんでした）";
    if (msg) lang.title = msg;
  };

  getMermaid().then(mermaid => {
    const cfg = mermaidTheme();
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", ...cfg });
    return Promise.resolve(mermaid.render("frs-mmd-" + (++mmdSeq), raw))
      .then(r => { box.innerHTML = (r && r.svg) ? r.svg : String(r); box.style.color = "inherit"; });
  }).catch(e => fallback(e && e.message));

  return shell;
}
