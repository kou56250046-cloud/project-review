/* =========================================================================
   図パネル
   コードから組み立てられる図を並べる。
   材料が見つかっているかを先に数えて、開く前に分かるようにしている。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc } from "../core/util.js";
import { analyzeLayers } from "../core/layers.js";
import { extractSchema } from "../core/schema.js";
import { findEndpoints } from "../core/dataflow.js";
import { DIAGRAM_KINDS } from "../viewers/diagramPane.js";

/** 数え直しは軽くないので、読み込みごとに 1 回だけにする */
let cache = null;
export function invalidateDiagramCache() { cache = null; }

function counts() {
  if (cache) return cache;
  const layers = analyzeLayers();
  const schema = extractSchema();
  const endpoints = findEndpoints();
  cache = {
    layers: {
      n: layers.links.length,
      note: layers.layers.length + " 層 / 層をまたぐ依存 " + layers.links.length + " 経路" +
        (layers.violationTotal ? " ・逆流 " + layers.violationTotal + " 件" : ""),
      warn: layers.violationTotal,
    },
    er: {
      n: schema.tables.length,
      note: schema.tables.length
        ? "テーブル " + schema.tables.length + " / 関係 " + schema.rels.length
        : "定義が見つかりません",
    },
    flow: {
      n: S.edges.length,
      note: S.edges.length ? "参照 " + S.edges.length + " 本からたどれます" : "参照が見つかりません",
    },
    endpoints: {
      n: endpoints.length,
      note: endpoints.length ? endpoints.length + " 件の入口" : "入口が見つかりません",
    },
    folders: {
      n: S.edges.length,
      note: S.edges.length ? "フォルダ単位でまとめます" : "参照が見つかりません",
    },
  };
  return cache;
}

export function renderDiagramsPanel() {
  const host = $("#dgBody");
  if (!host) return;
  if (!S.files.size) {
    host.innerHTML = '<div class="empty-note">フォルダを開くと、コードから組み立てられる図をここに並べます。</div>';
    return;
  }

  const c = counts();
  const order = ["layers", "er", "flow", "endpoints", "folders"];
  host.innerHTML = order.map(kind => {
    const meta = DIAGRAM_KINDS[kind];
    const info = c[kind] || { n: 0, note: "" };
    const off = !info.n;
    return '<div class="dg-item' + (off ? " off" : "") + '" data-kind="' + kind + '" role="button" tabindex="0">' +
      '<div class="nm">' + esc(meta.label) +
        (info.warn ? '<span class="warn">逆流 ' + info.warn + "</span>" : "") + "</div>" +
      '<div class="note">' + esc(info.note) + "</div>" +
      "</div>";
  }).join("");

  const open = (el) => actions.openDiagram(el.dataset.kind);
  $$(".dg-item", host).forEach(el => {
    el.onclick = () => open(el);
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el); } };
  });
}
