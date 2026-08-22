/* =========================================================================
   アプリ全体で共有する状態
   ========================================================================= */

export const S = {
  files: new Map(),      // path -> FileRec { path,name,dir,ext,size,file,kind,text,mtime }
  rootName: "",
  rootKey: "",           // 保存用のプロジェクト識別子
  dirHandle: null,       // File System Access API のハンドル（対応ブラウザのみ）
  ignoreHeavy: true,
  edges: [],             // {from, to, kind}
  outMap: new Map(),     // path -> [{to, kind}]
  inMap: new Map(),      // path -> [{from, kind}]
  externals: new Map(),  // path -> Set(pkg)
  missing: [],           // {from, spec, line} 解決できなかった参照
  cycles: [],            // 循環参照のパス配列
  orphans: [],           // どこからも参照されていないファイル
  readOrder: [],         // {path, why} 読む順番の提案
  tabs: [],              // {id, kind, path, label, pinned, scroll}
  active: null,
  panes: new Map(),
  collapsed: new Set(),
  urlCache: new Map(),
  review: {              // path -> {done:bool, notes:[{line,text,flag,at}]}
    files: new Map(),
    dirty: false,
  },
  seen: new Map(),       // path -> 読んだ割合 0..1
  split: false,          // 分割ビュー
  splitIds: [],          // 分割時に表示するタブ id
};

/** 状態変化を各パネルへ伝えるための最小限のイベントバス */
const handlers = new Map();
export function on(evt, fn) {
  if (!handlers.has(evt)) handlers.set(evt, new Set());
  handlers.get(evt).add(fn);
  return () => handlers.get(evt).delete(fn);
}
export function emit(evt, payload) {
  const set = handlers.get(evt);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error("[" + evt + "]", e); }
  }
}

/**
 * 相互 import による循環を避けるための入口テーブル。
 * main.js が起動時に実体を差し込む。
 */
export const actions = {
  openFile: () => {},
  openTab: () => {},
  openOverview: () => {},
  openGraph: () => {},
  openDiff: () => {},
  openBook: () => {},
  openReport: () => {},
  openDiagram: () => {},
  toast: () => {},
  reload: () => {},
};
