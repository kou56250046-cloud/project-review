/* =========================================================================
   データフロー図（依存の流れ）
     - 起点のファイルから参照をたどって、処理が広がる経路を図にする
     - API のエンドポイント定義を拾って、入口の一覧を作る

   変数がどう流れるかまでは追えない（構文解析が要る）。
   ここで描くのは「どのファイルからどのファイルへ処理が渡るか」の経路。
   ========================================================================= */
import { S } from "./state.js";
import { baseOf } from "./util.js";
import { roleOfFile, isGenerated } from "./roles.js";
import { layerOf } from "./layers.js";

/**
 * 起点から参照をたどる。
 * @param {string} root 起点のパス
 * @param {{depth:number, direction:"out"|"in"|"both", maxNodes:number}} opts
 */
export function traceFlow(root, { depth = 3, direction = "out", maxNodes = 60 } = {}) {
  if (!S.files.has(root)) return { nodes: [], edges: [], truncated: false };

  const nodes = new Map([[root, { path: root, dist: 0 }]]);
  const edges = [];
  let frontier = [root];
  let truncated = false;

  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const cur of frontier) {
      const outs = direction !== "in" ? (S.outMap.get(cur) || []).map(e => ({ to: e.to, kind: e.kind })) : [];
      const ins = direction !== "out" ? (S.inMap.get(cur) || []).map(e => ({ to: e.from, kind: e.kind, rev: true })) : [];
      for (const e of [...outs, ...ins]) {
        if (isGenerated(e.to)) continue;
        const from = e.rev ? e.to : cur;
        const to = e.rev ? cur : e.to;
        if (!edges.some(x => x.from === from && x.to === to)) edges.push({ from, to, kind: e.kind });
        if (!nodes.has(e.to)) {
          if (nodes.size >= maxNodes) { truncated = true; continue; }
          nodes.set(e.to, { path: e.to, dist: d });
          next.push(e.to);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  return { nodes: [...nodes.values()], edges, truncated, root };
}

/** たどった結果を Mermaid の flowchart にする */
export function flowToMermaid(flow, { showRole = false } = {}) {
  const { nodes, edges, root } = flow;
  if (!nodes.length) return "graph LR\n  empty[たどれる参照がありませんでした]";

  const ids = new Map(nodes.map((n, i) => [n.path, "n" + i]));
  const lines = ["graph LR"];

  for (const e of edges) {
    const a = ids.get(e.from), b = ids.get(e.to);
    if (!a || !b) continue;
    lines.push("  " + a + (e.kind === "link" ? " -.-> " : " --> ") + b);
  }
  for (const n of nodes) {
    const label = baseOf(n.path) + (showRole ? "<br/>" + roleOfFile(n.path).replace(/[（）"]/g, "") : "");
    lines.push("  " + ids.get(n.path) + '["' + label.replace(/"/g, "") + '"]');
  }
  // 起点を目立たせ、層ごとに色を付ける
  const rootId = ids.get(root);
  if (rootId) lines.push("  style " + rootId + " stroke-width:3px");
  for (const n of nodes) {
    if (n.path === root) continue;
    const L = layerOf(n.path);
    lines.push("  style " + ids.get(n.path) + " fill:" + L.color + "1a,stroke:" + L.color);
  }
  return lines.join("\n");
}

/* =========================================================================
   API のエンドポイント
   ========================================================================= */
const PATTERNS = [
  // Express / Fastify / Hono: app.get("/path", ...)
  { re: /\b(?:app|router|server|api)\s*\.\s*(get|post|put|patch|delete|all|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    method: 1, path: 2, kind: "Express 系" },
  // FastAPI / Flask のデコレータ: @app.get("/path") / @app.route("/path", methods=["POST"])
  { re: /@\s*(?:app|router|api|bp|blueprint)\s*\.\s*(get|post|put|patch|delete|route)\s*\(\s*["']([^"']+)["']/gi,
    method: 1, path: 2, kind: "FastAPI / Flask" },
  // NestJS: @Get("path")
  { re: /@\s*(Get|Post|Put|Patch|Delete)\s*\(\s*["']([^"']*)["']\s*\)/g,
    method: 1, path: 2, kind: "NestJS" },
  // Django urls.py: path("route/", view)
  { re: /\b(?:path|re_path|url)\s*\(\s*r?["']([^"']*)["']/g,
    method: null, path: 1, kind: "Django urls" },
];

/** ファイルの置き場所そのものがルートになる書き方 */
function fileRouteOf(path) {
  // Next.js App Router: app/api/users/route.ts
  let m = path.match(/(?:^|\/)app\/(.+?)\/route\.[jt]sx?$/);
  if (m) return "/" + m[1].replace(/\((?:[^/]+)\)\//g, "");
  // Next.js Pages Router: pages/api/users.ts
  m = path.match(/(?:^|\/)pages\/(api\/.+?)(?:\/index)?\.[jt]sx?$/);
  if (m) return "/" + m[1];
  // SvelteKit: routes/api/users/+server.ts
  m = path.match(/(?:^|\/)routes\/(.+?)\/\+server\.[jt]s$/);
  if (m) return "/" + m[1];
  return null;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * @returns {{method:string, path:string, file:string, line:number, kind:string}[]}
 */
export function findEndpoints() {
  const out = [];
  const seen = new Set();

  for (const f of S.files.values()) {
    if (!f.text || isGenerated(f.path)) continue;

    const byPath = fileRouteOf(f.path);
    if (byPath) {
      // 置き場所で決まる場合、書かれている HTTP メソッドを拾う
      const methods = [...f.text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
        .map(m => m[1]);
      const list = methods.length ? methods : ["ANY"];
      for (const method of list) {
        const key = method + " " + byPath;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ method, path: byPath, file: f.path, line: 1, kind: "ファイル配置" });
      }
      continue;
    }

    if (!["js", "jsx", "ts", "tsx", "mjs", "cjs", "py"].includes(f.ext)) continue;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(f.text)) !== null) {
        const route = m[p.path];
        if (!route || route.length > 120) continue;
        const method = p.method ? m[p.method].toUpperCase() : "ANY";
        const key = method + " " + route + " " + f.path;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          method: method === "ROUTE" ? "ANY" : method,
          path: route.startsWith("/") ? route : "/" + route,
          file: f.path, line: lineAt(f.text, m.index), kind: p.kind,
        });
        if (out.length > 400) return out;
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** エンドポイントの一覧を Mermaid にする（入口 → 実装ファイル → その依存） */
export function endpointsToMermaid(endpoints, { maxRoutes = 30 } = {}) {
  const list = endpoints.slice(0, maxRoutes);
  if (!list.length) return "graph LR\n  empty[エンドポイントが見つかりませんでした]";

  const lines = ["graph LR"];
  const fileIds = new Map();
  let fi = 0;
  const fileId = (p) => {
    if (!fileIds.has(p)) fileIds.set(p, "f" + (fi++));
    return fileIds.get(p);
  };

  list.forEach((e, i) => {
    const rid = "r" + i;
    lines.push("  " + rid + '["' + (e.method + " " + e.path).replace(/"/g, "") + '"]');
    lines.push("  " + rid + " --> " + fileId(e.file));
  });
  for (const [p, id] of fileIds) {
    lines.push("  " + id + '["' + baseOf(p).replace(/"/g, "") + '"]');
    // 実装ファイルが何を使っているかを 1 段だけ足す
    for (const e of (S.outMap.get(p) || []).slice(0, 4)) {
      lines.push("  " + id + " --> " + fileId(e.to));
    }
  }
  for (let i = 0; i < list.length; i++) {
    lines.push("  style r" + i + " fill:#00add81a,stroke:#00add8");
  }
  return lines.join("\n");
}
