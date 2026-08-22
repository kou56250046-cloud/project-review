/* =========================================================================
   参照関係の解析と、そこから導ける気づき
     - どのファイルがどのファイルを参照しているか
     - リンク切れ（書かれているのに存在しないパス）
     - 循環参照
     - 孤立ファイル（どこからも参照されていない）
     - 読む順番の提案
   ========================================================================= */
import { S } from "./state.js";
import { normPath, dirOf, baseOf } from "./util.js";
import { isGenerated, roleOfFile } from "./roles.js";

const CAND_EXT = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".json", ".md", ".mdx",
  ".py", ".css", ".scss", ".less", ".html", "/index.js", "/index.ts", "/index.jsx", "/index.tsx",
  "/index.vue", "/index.md", "/README.md", "/__init__.py"];

export function resolveRef(spec, fromPath) {
  if (!spec) return null;
  if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(spec)) return null;
  const s = spec.split("#")[0].split("?")[0].trim();
  if (!s) return null;
  const bases = [];
  if (s.startsWith("/")) { bases.push(S.rootName + s, s.slice(1)); }
  else if (s.startsWith(".")) { bases.push(dirOf(fromPath) + "/" + s); }
  else { bases.push(dirOf(fromPath) + "/" + s, S.rootName + "/" + s); }
  for (const b of bases) {
    const base = normPath(b);
    for (const e of CAND_EXT) {
      const cand = normPath(base + e);
      if (S.files.has(cand)) return cand;
    }
  }
  return null;
}

/** 正規表現で拾いつつ、何行目だったかも覚えておく */
function collect(re, text, out) {
  let m; re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) continue;
    out.push({ spec: m[1], at: m.index });
  }
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

export function extractRefs(f) {
  const t = f.text || "";
  const refs = [];
  const ext = f.ext;
  if (f.kind === "markdown") {
    collect(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)/g, t, refs);
    collect(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi, t, refs);
    collect(/\[\[([^\]|#]+)/g, t, refs);
  } else if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte"].includes(ext)) {
    collect(/import\s+(?:[\w*\s{},$]*?\s+from\s+)?["']([^"']+)["']/g, t, refs);
    collect(/export\s+(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g, t, refs);
    collect(/require\(\s*["']([^"']+)["']\s*\)/g, t, refs);
    collect(/import\(\s*["']([^"']+)["']\s*\)/g, t, refs);
  } else if (ext === "py") {
    const pyRefs = [];
    collect(/^\s*from\s+([.\w]+)\s+import/gm, t, pyRefs);
    collect(/^\s*import\s+([.\w]+)/gm, t, pyRefs);
    for (const r of pyRefs) {
      const spec = r.spec;
      if (spec.startsWith(".")) {
        const up = spec.match(/^\.+/)[0].length;
        const rest = spec.slice(up).replace(/\./g, "/");
        refs.push({ spec: "../".repeat(Math.max(0, up - 1)) + "./" + rest, at: r.at, raw: spec });
      } else refs.push({ spec: "./" + spec.replace(/\./g, "/"), at: r.at, raw: spec });
    }
  } else if (["css", "scss", "less", "styl"].includes(ext)) {
    collect(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/g, t, refs);
    collect(/url\(\s*["']?([^"')]+)["']?\s*\)/g, t, refs);
  } else if (["html", "htm"].includes(ext)) {
    collect(/(?:src|href)\s*=\s*["']([^"']+)["']/gi, t, refs);
  } else if (ext === "json" && /^(package|tsconfig)/i.test(f.name)) {
    return [];
  }
  return refs;
}

export function analyze() {
  S.edges = []; S.outMap = new Map(); S.inMap = new Map();
  S.externals = new Map(); S.missing = [];
  const seen = new Set();

  for (const f of S.files.values()) {
    if (!f.text) continue;
    const refs = extractRefs(f);
    for (const r of refs) {
      const spec = r.spec;
      const target = resolveRef(spec, f.path);
      if (target && target !== f.path) {
        const key = f.path + "→" + target;
        if (seen.has(key)) continue;
        seen.add(key);
        const kind = f.kind === "markdown" ? "link" : "import";
        S.edges.push({ from: f.path, to: target, kind });
        if (!S.outMap.has(f.path)) S.outMap.set(f.path, []);
        S.outMap.get(f.path).push({ to: target, kind });
        if (!S.inMap.has(target)) S.inMap.set(target, []);
        S.inMap.get(target).push({ from: f.path, kind });
      } else if (!target) {
        const isRelative = /^[./]/.test(spec);
        const isExternalPkg = /^[a-z@]/i.test(spec) && !/^(https?|mailto|data|tel|#)/i.test(spec) &&
          ["js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "py"].includes(f.ext);
        if (isRelative) {
          // 書かれているのに実体が見つからない参照＝リンク切れの疑い
          S.missing.push({
            from: f.path, spec: r.raw || spec, line: lineAt(f.text, r.at),
            kind: f.kind === "markdown" ? "link" : "import",
          });
        } else if (isExternalPkg) {
          const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          if (!S.externals.has(f.path)) S.externals.set(f.path, new Set());
          S.externals.get(f.path).add(pkg);
        }
      }
    }
  }

  S.cycles = findCycles();
  S.orphans = findOrphans();
  S.readOrder = buildReadOrder();
}

/* ---------- 循環参照 ---------- */
function findCycles() {
  const color = new Map();   // 0=未訪問 1=探索中 2=完了
  const stack = [];
  const found = [];
  const seenKey = new Set();

  const visit = (p) => {
    color.set(p, 1);
    stack.push(p);
    for (const e of (S.outMap.get(p) || [])) {
      const q = e.to;
      const c = color.get(q) || 0;
      if (c === 0) visit(q);
      else if (c === 1) {
        const i = stack.indexOf(q);
        if (i >= 0) {
          const cyc = stack.slice(i).concat(q);
          const key = [...cyc].slice(0, -1).sort().join("|");
          if (!seenKey.has(key)) { seenKey.add(key); found.push(cyc); }
        }
      }
    }
    stack.pop();
    color.set(p, 2);
  };

  for (const p of S.files.keys()) if (!(color.get(p) || 0)) visit(p);
  return found.slice(0, 40);
}

/* ---------- 孤立ファイル ---------- */
function findOrphans() {
  const out = [];
  for (const f of S.files.values()) {
    if (isGenerated(f.path)) continue;
    // データや画像は参照されていなくて当たり前なので数えない
    if (["binary", "office", "csv", "image", "pdf", "docx"].includes(f.kind)) continue;
    const ins = (S.inMap.get(f.path) || []).length;
    const outs = (S.outMap.get(f.path) || []).length;
    if (ins > 0) continue;
    // 入口や設定ファイルは参照されていなくて当たり前なので除く
    if (isEntryLike(f.path)) continue;
    out.push({ path: f.path, outs, role: roleOfFile(f.path) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200);
}

const ENTRY_RE = /^(readme|license|licence|changelog|contributing|index|main|app|package\.json|tsconfig|dockerfile|makefile|requirements|pyproject|setup|vite\.config|\.env|\.gitignore)/i;
export function isEntryLike(path) {
  const b = baseOf(path).toLowerCase();
  if (ENTRY_RE.test(b)) return true;
  if (/\.(config|conf)\.[a-z]+$/i.test(b)) return true;
  if (/^\./.test(b)) return true;                      // ドットファイル
  if (/(^|\/)\.github\//i.test(path)) return true;
  return false;
}

/* ---------- 読む順番の提案 ----------
   1. プロジェクトの説明（README）
   2. 全体像がわかる設定
   3. 実行の起点
   4. 起点から辿れるもの（多く参照される基盤を先に）
   5. それ以外                                        */
function buildReadOrder() {
  const files = [...S.files.values()].filter(f => !isGenerated(f.path) && f.text != null);
  if (!files.length) return [];
  const picked = new Set();
  const order = [];
  const add = (path, why) => {
    if (!path || picked.has(path)) return;
    picked.add(path);
    order.push({ path, why });
  };

  const byName = (re) => files.filter(f => re.test(f.name)).sort((a, b) => a.path.length - b.path.length);

  for (const f of byName(/^readme\./i)) add(f.path, "プロジェクトの説明。まずここで全体像をつかむ");
  for (const f of byName(/^(architecture|design|overview|spec|仕様|設計)/i)) add(f.path, "設計や仕様の説明");
  for (const f of byName(/^package\.json$/i)) add(f.path, "使っている道具と実行コマンドがわかる");
  for (const f of byName(/^(pyproject\.toml|requirements.*\.txt|go\.mod|cargo\.toml|composer\.json|gemfile)$/i))
    add(f.path, "依存パッケージの一覧");
  for (const f of byName(/^(index|main|app)\.(js|ts|jsx|tsx|py|go|rs|java|html)$/i))
    add(f.path, "実行の起点。ここから処理が始まる");

  // 起点から幅優先で辿る。ただし多く参照されている基盤ファイルを優先する。
  const degree = (p) => (S.inMap.get(p) || []).length;
  const queue = order.map(o => o.path);
  while (queue.length) {
    const cur = queue.shift();
    const next = (S.outMap.get(cur) || [])
      .map(e => e.to)
      .filter(p => !picked.has(p) && !isGenerated(p))
      .sort((a, b) => degree(b) - degree(a));
    for (const p of next) {
      add(p, baseOf(cur) + " から参照されている");
      queue.push(p);
    }
    if (order.length > 60) break;
  }

  // まだ拾えていない中で、よく参照されているものを足す
  const rest = files
    .filter(f => !picked.has(f.path))
    .sort((a, b) => degree(b.path) - degree(a.path));
  for (const f of rest) {
    if (order.length >= 60) break;
    const d = degree(f.path);
    if (d === 0) break;
    add(f.path, d + " 個のファイルから参照されている基盤");
  }
  return order;
}

/* ---------- Mermaid のアーキテクチャ図を組み立てる ---------- */
export function buildMermaid({ maxNodes = 60, byFolder = true } = {}) {
  if (byFolder) {
    // フォルダ単位にまとめると全体像が見やすい
    const group = (p) => {
      const parts = p.split("/");
      if (parts.length <= 1) return "(ルート)";
      return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    };
    const counts = new Map();
    for (const f of S.files.keys()) counts.set(group(f), (counts.get(group(f)) || 0) + 1);
    const links = new Map();
    for (const e of S.edges) {
      const a = group(e.from), b = group(e.to);
      if (a === b) continue;
      const k = a + " " + b;
      links.set(k, (links.get(k) || 0) + 1);
    }
    const ids = new Map();
    let n = 0;
    const idOf = (name) => {
      if (!ids.has(name)) ids.set(name, "n" + (n++));
      return ids.get(name);
    };
    const lines = ["graph LR"];
    const used = new Set();
    for (const [k, w] of [...links.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)) {
      const [a, b] = k.split(" ");
      used.add(a); used.add(b);
      lines.push("  " + idOf(a) + " -->|" + w + "| " + idOf(b));
    }
    for (const name of used) {
      lines.push("  " + idOf(name) + '["' + name.replace(/"/g, "") + "<br/>" + (counts.get(name) || 0) + ' files"]');
    }
    if (used.size === 0) lines.push("  empty[参照関係が見つかりませんでした]");
    return lines.join("\n");
  }

  const deg = (p) => (S.inMap.get(p) || []).length + (S.outMap.get(p) || []).length;
  const top = [...new Set(S.edges.flatMap(e => [e.from, e.to]))]
    .sort((a, b) => deg(b) - deg(a)).slice(0, maxNodes);
  const set = new Set(top);
  const ids = new Map(top.map((p, i) => [p, "n" + i]));
  const lines = ["graph LR"];
  for (const e of S.edges) {
    if (!set.has(e.from) || !set.has(e.to)) continue;
    lines.push("  " + ids.get(e.from) + " --> " + ids.get(e.to));
  }
  for (const p of top) lines.push("  " + ids.get(p) + '["' + baseOf(p).replace(/"/g, "") + '"]');
  return lines.join("\n");
}
