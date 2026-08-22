/* =========================================================================
   レイヤー依存マップ
   フォルダ名からファイルを層に割り当て、層をまたぐ依存を数える。
   上の層が下の層を使うのが自然な向きなので、その逆を「逆流」として拾う。
   ========================================================================= */
import { S } from "./state.js";
import { baseOf } from "./util.js";
import { isGenerated } from "./roles.js";

/**
 * 層の定義。order が小さいほど上位（画面に近い）。
 * match はフォルダ名 1 つに対して当てる。
 */
export const LAYERS = [
  { id: "ui", order: 1, name: "画面・UI", color: "#61dafb",
    match: /^(pages?|views?|screens?|components?|ui|widgets?|layouts?|templates?|partials?)$/i },
  { id: "route", order: 2, name: "ルーティング・API", color: "#00add8",
    match: /^(routes?|router|controllers?|api|endpoints?|handlers?|middlewares?|server|backend|resolvers?)$/i },
  { id: "domain", order: 3, name: "ロジック・状態", color: "#c586c0",
    match: /^(services?|service|domain|usecases?|use-cases?|logic|business|store|stores|state|reducers?|actions?|hooks?|composables?|contexts?|providers?|workers?|jobs?|tasks?|queues?)$/i },
  { id: "data", order: 4, name: "データアクセス", color: "#dea584",
    match: /^(models?|entities|entity|repositories|repository|repos?|dao|db|database|migrations?|seeds?|schemas?|prisma|queries|mappers?)$/i },
  { id: "base", order: 5, name: "共通基盤", color: "#4ec9b0",
    match: /^(utils?|util|helpers?|lib|libs|common|shared|core|config|configs|settings|constants?|types?|typings|@types|i18n|locales?|styles?|css|theme|assets?|static|public)$/i },
];

const TEST_RE = /^(tests?|__tests__|spec|specs|e2e|cypress|playwright|__mocks__|fixtures?)$/i;
const TEST_FILE_RE = /\.(test|spec)\.[a-z]+$/i;

export const OTHER = { id: "other", order: 6, name: "その他", color: "#8f8f8f" };
export const TEST = { id: "test", order: 7, name: "テスト", color: "#dcdcaa" };

/**
 * ファイルを層に割り当てる。
 * パスを後ろから見て最初に当たった層を採る（pages/api/… は API と見なしたいため）。
 */
export function layerOf(path) {
  if (TEST_FILE_RE.test(baseOf(path))) return TEST;
  const segs = path.split("/");
  for (let i = segs.length - 2; i >= 0; i--) {   // ファイル名は除く
    const seg = segs[i];
    if (TEST_RE.test(seg)) return TEST;
    for (const L of LAYERS) if (L.match.test(seg)) return L;
  }
  // フォルダで決まらない場合はファイル名で補う
  const b = baseOf(path).toLowerCase();
  const stem = b.replace(/\.[^.]+$/, "");
  for (const [re, id] of FILE_HINTS) {
    if (re.test(stem)) return byId.get(id) || OTHER;
  }
  if (/\.(jsx|tsx|vue|svelte)$/.test(b)) return byId.get("ui");
  if (/\.(sql|prisma)$/.test(b)) return byId.get("data");
  if (/\.(d\.ts|config\.[a-z]+)$/.test(b)) return byId.get("base");
  if (/^(index|main|app)$/.test(stem)) return byId.get("ui");
  return OTHER;
}

/** フォルダで決まらないときに、ファイル名から層を推し量る */
const FILE_HINTS = [
  [/^(utils?|helpers?|constants?|config|settings|types?|typings|lib|common|shared|format|logger)$/i, "base"],
  [/^(api|client|router|routes?|controller|server|handler|endpoints?|middleware)$/i, "route"],
  [/^(store|state|service|services|usecase|reducer|action|context|provider|worker|queue)$/i, "domain"],
  [/^(models?|entity|entities|schema|repository|repositories|migration|dao|db|database|query|queries)$/i, "data"],
  [/^(page|view|screen|layout|component|widget)$/i, "ui"],
];

const byId = new Map([...LAYERS, OTHER, TEST].map(L => [L.id, L]));
export const layerById = (id) => byId.get(id) || OTHER;

/**
 * 層ごとの内訳と、層をまたぐ依存を集計する。
 * @returns {{layers:[], links:[], violations:[], unassigned:number}}
 */
export function analyzeLayers() {
  const counts = new Map();
  const assign = new Map();     // path -> layer

  for (const f of S.files.values()) {
    if (isGenerated(f.path)) continue;
    if (f.kind === "binary" || f.kind === "image") continue;
    const L = layerOf(f.path);
    assign.set(f.path, L);
    counts.set(L.id, (counts.get(L.id) || 0) + 1);
  }

  const linkMap = new Map();    // "from>to" -> {n, samples:[]}
  const violations = [];

  for (const e of S.edges) {
    const a = assign.get(e.from), b = assign.get(e.to);
    if (!a || !b || a.id === b.id) continue;
    const key = a.id + ">" + b.id;
    if (!linkMap.has(key)) linkMap.set(key, { from: a.id, to: b.id, n: 0, samples: [] });
    const rec = linkMap.get(key);
    rec.n++;
    if (rec.samples.length < 8) rec.samples.push({ from: e.from, to: e.to });

    // 層がはっきりしないもの（その他）とテストは逆流の判定から外す。
    // 判定できないものを違反として挙げても、直しようがないため。
    const judgeable = a.order <= 5 && b.order <= 5;
    if (judgeable && a.order > b.order) {
      violations.push({ from: e.from, to: e.to, fromLayer: a, toLayer: b });
    }
  }

  const layers = [...LAYERS, OTHER, TEST]
    .map(L => ({ ...L, count: counts.get(L.id) || 0 }))
    .filter(L => L.count > 0);

  return {
    layers,
    links: [...linkMap.values()].sort((a, b) => b.n - a.n),
    violations: violations.slice(0, 100),
    violationTotal: violations.length,
    assign,
  };
}

/** レイヤー依存マップを Mermaid の flowchart にする */
export function layersToMermaid(result, { showCounts = true } = {}) {
  const { layers, links } = result;
  if (!layers.length) return "graph TD\n  empty[割り当てられるファイルがありませんでした]";

  const lines = ["graph TD"];
  // 層は上から下へ並べる
  for (const L of layers) {
    const label = L.name + (showCounts ? "<br/>" + L.count + " files" : "");
    lines.push('  ' + L.id + '["' + label + '"]');
  }
  const seen = new Set();
  for (const l of links) {
    const key = l.from + ">" + l.to;
    if (seen.has(key)) continue;
    seen.add(key);
    const A = layerById(l.from), B = layerById(l.to);
    // 逆流の見せ方は集計側の判定に合わせる（その他・テストは対象外）
    const back = A.order <= 5 && B.order <= 5 && A.order > B.order;
    // 逆流は点線にして目立たせる
    lines.push("  " + l.from + (back ? " -.->|" : " -->|") + l.n + (back ? " 逆流|" : "|") + l.to);
  }
  for (const L of layers) {
    lines.push("  style " + L.id + " fill:" + L.color + "22,stroke:" + L.color + ",stroke-width:2px");
  }
  return lines.join("\n");
}
