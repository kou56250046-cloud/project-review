/* =========================================================================
   File Review Studio — 起動と配線
   フォルダをブラウザの中だけで読み、構造・関係・中身をレビューする。
   ========================================================================= */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sidebar.css";
import "./styles/editor.css";
import "./styles/prose.css";
import "./styles/data.css";
import "./styles/diagram.css";
import "./styles/graph.css";
import "./styles/welcome.css";

import { S, on, emit, actions } from "./core/state.js";
import { $, $$, esc, fmtSize, debounce } from "./core/util.js";
import { ingest, fromInput, fromDataTransfer, walkHandle, ensurePermission, canUseFsApi } from "./core/ingest.js";
import { analyze } from "./core/analyze.js";
import { restoreReview, progress, toggleDone, isDone } from "./core/review.js";
import { listProjects } from "./core/persist.js";

import { toast, initProgress, setStatus } from "./ui/feedback.js";
import { openTab, activateTab, closeTab, closeOthers, togglePin, toggleSplit, renderTabs, tabId } from "./ui/tabs.js";
import { renderTree, collapseAll, expandAll, revealPath } from "./ui/tree.js";
import { initSearch, focusSearch, runSearch } from "./ui/search.js";
import { renderRelationsPanel } from "./ui/relations.js";
import { renderInsights, insightCount } from "./ui/insights.js";
import { renderReviewPanel, initReviewPanel } from "./ui/reviewPanel.js";
import { buildOverviewPane, renderOverviewPanel } from "./ui/overview.js";
import { buildGraphPane } from "./ui/graph.js";
import { initSettings, applySettings, cycleTheme, zoom, resetZoom, settings } from "./ui/settings.js";
import { openPalette, closePalette, fill as fillPalette, move as movePalette, run as runPalette, isOpen as paletteOpen, registerCommands } from "./ui/palette.js";
import { renderRecent, remember, pickFolder } from "./ui/recent.js";
import { renderDiagramsPanel, invalidateDiagramCache } from "./ui/diagrams.js";

import { buildFilePane, jumpToLine, controllers } from "./viewers/file.js";
import { buildDiffPane } from "./viewers/diffview.js";
import { buildBookPane } from "./viewers/book.js";
import { buildReportPane } from "./viewers/report.js";
import { buildDiagramPane, DIAGRAM_KINDS } from "./viewers/diagramPane.js";

/* =========================================================================
   ファイルを開く
   ========================================================================= */
function openFile(path, opts) {
  const f = S.files.get(path);
  if (!f) { toast("そのファイルは読み込まれていません: " + path); return; }
  const known = S.panes.has(tabId("file", path));
  openTab("file", path, f.name, (pane) => buildFilePane(pane, f));
  if (opts && opts.line) {
    const jump = () => jumpToLine(path, opts.line);
    if (known) jump(); else setTimeout(jump, 60);
  }
}

const openOverview = () => openTab("overview", "", "プロジェクト概要", buildOverviewPane);
const openGraph = () => openTab("graph", "", "関係グラフ", buildGraphPane);
const openBook = () => openTab("book", "", "まとめて通読", buildBookPane);
const openReport = () => openTab("report", "", "レビューレポート", buildReportPane);
const openDiff = (preset) => openTab("diff", "", "ファイルの比較", (pane) => buildDiffPane(pane, preset || {}));
const openDiagram = (kind) => {
  if (!S.files.size) { toast("先にフォルダを開いてください"); return; }
  const meta = DIAGRAM_KINDS[kind] || DIAGRAM_KINDS.layers;
  openTab("diagram", kind, meta.label, (pane) => buildDiagramPane(pane, kind));
};

/* =========================================================================
   読み込みの流れ
   ========================================================================= */
async function load(entries, meta = {}) {
  if (!entries || !entries.length) { toast("読み込めるファイルがありませんでした"); return; }
  const res = await ingest(entries, { rootName: meta.name, rootKey: meta.key });
  if (!res) return;

  S.dirHandle = meta.handle || null;
  analyze();
  await restoreReview(S.rootKey);

  renderTree();
  renderOverviewPanel();
  renderInsights();
  renderReviewPanel();
  invalidateDiagramCache();
  renderDiagramsPanel();
  refreshBadges();

  $("#welcome").style.display = "none";
  $("#stRoot").textContent = S.rootName;
  setStatus(S.files.size.toLocaleString() + " 個のファイル" +
    (res.skipped ? "（" + res.skipped.toLocaleString() + " 件を除外）" : ""));
  $("#winTitle").textContent = S.rootName + " — File Review Studio";
  $("#btnReload").hidden = !S.dirHandle;
  document.title = S.rootName + " — File Review Studio";

  if (settings.restoreLast) remember();

  // 入口になりそうなファイルを自動で開く
  if (!S.tabs.length) {
    const first = S.readOrder[0];
    if (first) openFile(first.path);
    else openOverview();
  }
  toast(S.files.size.toLocaleString() + " 個のファイルを読み込みました");
}

/** 開き直し（最近のプロジェクトや F5 から） */
async function reload(meta) {
  if (!meta) {
    if (!S.dirHandle) { toast("読み直せるフォルダがありません"); return; }
    meta = { handle: S.dirHandle, name: S.rootName, key: S.rootKey };
  }
  if (meta.handle && !(await ensurePermission(meta.handle))) {
    toast("フォルダを読む許可が得られませんでした");
    return;
  }
  const keep = S.tabs.map(t => ({ kind: t.kind, path: t.path, pinned: t.pinned }));
  const activePath = S.active ? S.active.path : null;

  softReset();
  const entries = meta.entries || await walkHandle(meta.handle, meta.handle.name + "/");
  await load(entries, meta);

  // 開いていたタブを復元する
  for (const t of keep) {
    if (t.kind === "file" && S.files.has(t.path)) openFile(t.path);
  }
  if (activePath && S.files.has(activePath)) openFile(activePath);
}

function softReset() {
  for (const u of S.urlCache.values()) URL.revokeObjectURL(u);
  S.files.clear(); S.urlCache.clear();
  S.tabs = [];
  S.panes.forEach(p => p.remove());
  S.panes.clear();
  controllers.clear();
  S.active = null; S.split = false; S.splitIds = [];
  S.edges = []; S.outMap.clear(); S.inMap.clear(); S.externals.clear();
  S.missing = []; S.cycles = []; S.orphans = []; S.readOrder = [];
  S.collapsed.clear();
  $("#tabbar").innerHTML = "";
  $("#panes").classList.remove("split");
}

function fullReset() {
  softReset();
  S.rootName = ""; S.rootKey = ""; S.dirHandle = null;
  S.review.files = new Map();
  $("#tree").innerHTML = '<div class="empty-note">フォルダを開くと、ここに構造が表示されます。</div>';
  $("#relBody").innerHTML = '<div class="empty-note">ファイルを開くと、そのファイルの参照関係を表示します。</div>';
  $("#insBody").innerHTML = '<div class="empty-note">フォルダを開くと、気づいた点をここに並べます。</div>';
  $("#rvBody").innerHTML = '<div class="empty-note">フォルダを開くと、レビューの進み具合をここに表示します。</div>';
  $("#ovBody").innerHTML = '<div class="empty-note">まだ何も読み込まれていません。</div>';
  $("#dgBody").innerHTML = '<div class="empty-note">フォルダを開くと、組み立てられる図をここに並べます。</div>';
  invalidateDiagramCache();
  $("#searchResults").innerHTML = '<div class="empty-note">読み込んだテキストファイルの中身を検索します。</div>';
  $("#welcome").style.display = "flex";
  $("#stRoot").textContent = "フォルダ未選択";
  setStatus("");
  $("#stFile").textContent = ""; $("#stMeta").textContent = "";
  $("#stReview").hidden = true;
  $("#btnReload").hidden = true;
  $("#winTitle").textContent = "File Review Studio";
  document.title = "File Review Studio";
  refreshBadges();
  renderRecent();
}

/* =========================================================================
   画面の更新
   ========================================================================= */
function refreshBadges() {
  const ins = insightCount();
  const insDot = $("#insDot");
  insDot.hidden = !ins;
  insDot.textContent = ins > 99 ? "99+" : ins;

  const p = progress();
  const rvDot = $("#rvDot");
  rvDot.hidden = !p.flags;
  rvDot.textContent = p.flags > 99 ? "99+" : p.flags;

  const st = $("#stReview");
  if (S.files.size) {
    st.hidden = false;
    st.textContent = "レビュー " + p.done + "/" + p.total + "（" + p.pct + "%）";
    st.title = "レビューパネルを開く";
  } else st.hidden = true;
}

function updateStatusFor(tab) {
  if (!tab || tab.kind !== "file") {
    $("#stFile").textContent = tab ? tab.label : "";
    $("#stMeta").textContent = "";
    return;
  }
  const f = S.files.get(tab.path);
  if (!f) return;
  $("#stFile").textContent = f.path;
  const bits = [fmtSize(f.size)];
  if (f.text) bits.push(f.text.split("\n").length.toLocaleString() + " 行");
  bits.push(f.ext ? f.ext.toUpperCase() : "ファイル");
  if (isDone(f.path)) bits.push("確認済み");
  $("#stMeta").textContent = bits.join("  ·  ");
}

on("tab-changed", (tab) => {
  updateStatusFor(tab);
  renderRelationsPanel();
});

on("review-changed", () => {
  refreshBadges();
  renderReviewPanel();
  renderTree();
  if (S.active) updateStatusFor(S.active);
  // 開いているコードビューのメモ表示も更新する
  for (const ctl of controllers.values()) if (ctl.refreshNotes) ctl.refreshNotes();
});

on("zoom-changed", () => {
  for (const ctl of controllers.values()) if (ctl.repaint) ctl.repaint();
});

/* =========================================================================
   パネル切り替え
   ========================================================================= */
function switchPanel(name) {
  $$(".act").forEach(b => {
    const on = b.dataset.panel === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  });
  $$(".side-panel").forEach(p => p.classList.toggle("on", p.dataset.panel === name));
  $("#sidebar").classList.remove("hidden");
  if (name === "insights") renderInsights();
  if (name === "diagrams") renderDiagramsPanel();
  if (name === "review") renderReviewPanel();
  if (name === "overview") renderOverviewPanel();
}

$$(".act").forEach(b => {
  b.onclick = () => {
    const already = b.classList.contains("on") && !$("#sidebar").classList.contains("hidden");
    if (already) { $("#sidebar").classList.add("hidden"); return; }
    switchPanel(b.dataset.panel);
  };
});

/* =========================================================================
   コマンド（Ctrl+Shift+P）
   ========================================================================= */
const hasFiles = () => S.files.size > 0;

registerCommands([
  { title: "フォルダを開く", key: "", run: () => pickFolder() },
  { title: "ファイルを開く", key: "", run: () => $("#pickFiles").click() },
  { title: "フォルダを読み直す", key: "F5", when: () => !!S.dirHandle, run: () => reload() },
  { title: "プロジェクト概要を開く", when: hasFiles, run: openOverview },
  { title: "関係グラフを開く", when: hasFiles, run: openGraph },
  { title: "ファイルを比較する（差分）", when: hasFiles, run: () => openDiff() },
  { title: "レイヤー依存マップを開く", keywords: "layer 層 依存", when: hasFiles, run: () => openDiagram("layers") },
  { title: "ER 図を開く", keywords: "er database テーブル", when: hasFiles, run: () => openDiagram("er") },
  { title: "データフロー図を開く", keywords: "flow 流れ", when: hasFiles, run: () => openDiagram("flow") },
  { title: "API の入口を一覧する", keywords: "endpoint route api", when: hasFiles, run: () => openDiagram("endpoints") },
  { title: "まとめて通読する（ブックモード）", when: hasFiles, run: openBook },
  { title: "レビューレポートを開く", when: hasFiles, run: openReport },
  { title: "全文検索", key: "Ctrl+Shift+F", run: () => { switchPanel("search"); focusSearch(); } },
  { title: "気づきを見る", when: hasFiles, run: () => switchPanel("insights") },
  { title: "レビューの記録を見る", when: hasFiles, run: () => switchPanel("review") },
  { title: "テーマを切り替える", keywords: "theme dark light ダーク ライト", run: () => toast("テーマ: " + cycleTheme()) },
  { title: "文字を大きくする", key: "Ctrl++", run: () => zoom(1) },
  { title: "文字を小さくする", key: "Ctrl+-", run: () => zoom(-1) },
  { title: "文字サイズを戻す", key: "Ctrl+0", run: () => resetZoom() },
  { title: "画面を左右に分ける", key: "Ctrl+\\", when: () => S.tabs.length > 1, run: () => doSplit() },
  { title: "このファイルを確認済みにする", key: "Ctrl+Enter", when: () => S.active && S.active.kind === "file", run: () => markDone() },
  { title: "ツリーで今のファイルの位置を示す", when: () => S.active && S.active.path, run: () => { switchPanel("explorer"); revealPath(S.active.path); } },
  { title: "すべて折りたたむ", when: hasFiles, run: collapseAll },
  { title: "すべて展開する", when: hasFiles, run: expandAll },
  { title: "タブをピン留めする / 外す", when: () => !!S.active, run: () => togglePin(S.active.id) },
  { title: "他のタブを閉じる", when: () => S.tabs.length > 1, run: () => closeOthers(S.active.id) },
  { title: "プロジェクトを閉じる", when: hasFiles, run: fullReset },
]);

function doSplit() {
  const on = toggleSplit();
  if (on === false && S.tabs.length <= 1) toast("分けるにはタブが 2 つ必要です");
}

function markDone() {
  if (!S.active || S.active.kind !== "file") return;
  const d = toggleDone(S.active.path);
  const pane = S.panes.get(S.active.id);
  if (pane && pane._syncDone) pane._syncDone();
  toast(d ? "確認済みにしました" : "確認済みを外しました");
}

/* =========================================================================
   ボタンの配線
   ========================================================================= */
$("#btnFolder").onclick = $("#btnFolder2").onclick = () => pickFolder();
$("#btnFiles").onclick = $("#btnFiles2").onclick = () => $("#pickFiles").click();
$("#btnReset").onclick = fullReset;
$("#btnReload").onclick = () => reload();
$("#btnPalette").onclick = () => openPalette("");
$("#btnTheme").onclick = () => cycleTheme();
$("#btnGraph").onclick = () => (hasFiles() ? openGraph() : toast("先にフォルダを開いてください"));
$("#btnOverview").onclick = () => (hasFiles() ? openOverview() : toast("先にフォルダを開いてください"));
$("#btnBook").onclick = () => (hasFiles() ? openBook() : toast("先にフォルダを開いてください"));
$("#btnCollapse").onclick = collapseAll;
$("#btnExpand").onclick = expandAll;
$("#stReview").onclick = () => switchPanel("review");
$("#optIgnore").onchange = (e) => { S.ignoreHeavy = e.target.checked; settings.ignoreHeavy = e.target.checked; applySettings(); };
$("#pickFolder").onchange = (e) => { load(fromInput(e.target.files)); e.target.value = ""; };
$("#pickFiles").onchange = (e) => { load(fromInput(e.target.files)); e.target.value = ""; };
$("#treeFilter").addEventListener("input", debounce(renderTree, 140));

/* ---------- ドラッグ＆ドロップ ---------- */
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth++;
  $("#dropveil").classList.add("on");
  $("#drop").classList.add("hot");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => {
  if (--dragDepth > 0) return;
  dragDepth = 0;
  $("#dropveil").classList.remove("on");
  $("#drop").classList.remove("hot");
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("#dropveil").classList.remove("on");
  $("#drop").classList.remove("hot");
  const r = await fromDataTransfer(e.dataTransfer);
  softReset();
  await load(r.entries, r.handle ? { handle: r.handle, name: r.handle.name, key: r.handle.name } : {});
});

/* ---------- サイドバーの幅 ---------- */
(function () {
  const r = $("#resizer");
  const sb = $("#sidebar");
  const setW = (w) => {
    const v = Math.max(180, Math.min(560, w));
    sb.style.width = v + "px";
    try { localStorage.setItem("frs.sidebarW", String(v)); } catch { /* 保存できなくてもよい */ }
  };
  try {
    const saved = +localStorage.getItem("frs.sidebarW");
    if (saved) sb.style.width = saved + "px";
  } catch { /* 読めなくてもよい */ }

  r.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const move = (e2) => setW(e2.clientX - 48);
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  r.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setW(sb.offsetWidth - 20); }
    if (e.key === "ArrowRight") { e.preventDefault(); setW(sb.offsetWidth + 20); }
  });
})();

/* ---------- キーボード ---------- */
$("#palInput").addEventListener("input", (e) => fillPalette(e.target.value));
$("#palette").addEventListener("mousedown", (e) => { if (e.target.id === "palette") closePalette(); });

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;

  // パレットが開いているときは、その操作を優先する
  if (paletteOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runPalette(); }
    return;
  }

  if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); openPalette(">"); return; }
  if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); openPalette(""); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); switchPanel("search"); focusSearch(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); switchPanel("explorer"); return; }
  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); $("#sidebar").classList.toggle("hidden"); return; }
  if (mod && e.key === "\\") { e.preventDefault(); doSplit(); return; }
  if (mod && e.key === "Enter") { e.preventDefault(); markDone(); return; }
  if (mod && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoom(1); return; }
  if (mod && e.key === "-") { e.preventDefault(); zoom(-1); return; }
  if (mod && e.key === "0") { e.preventDefault(); resetZoom(); return; }
  if (mod && e.key.toLowerCase() === "w") {
    if (S.active) { e.preventDefault(); closeTab(S.active.id); }
    return;
  }
  if (mod && e.key.toLowerCase() === "f") {
    // 開いているコードビューの中を検索する
    const ctl = S.active && S.active.kind === "file" ? controllers.get(S.active.path) : null;
    if (ctl && ctl.openFind) { e.preventDefault(); ctl.openFind(); }
    return;
  }
  if (e.key === "F5" && S.dirHandle) { e.preventDefault(); reload(); return; }

  // Ctrl+Tab でタブを順に切り替える
  if (mod && e.key === "Tab" && S.tabs.length > 1) {
    e.preventDefault();
    const i = S.tabs.findIndex(t => S.active && t.id === S.active.id);
    const next = S.tabs[(i + (e.shiftKey ? -1 : 1) + S.tabs.length) % S.tabs.length];
    if (next) activateTab(next.id);
  }
});

/* =========================================================================
   起動
   ========================================================================= */
actions.openFile = openFile;
actions.openTab = openTab;
actions.openOverview = openOverview;
actions.openGraph = openGraph;
actions.openDiff = openDiff;
actions.openBook = openBook;
actions.openReport = openReport;
actions.openDiagram = openDiagram;
actions.toast = toast;
actions.reload = reload;

applySettings();
initSettings();
initProgress();
initSearch();
initReviewPanel();
$("#optIgnore").checked = settings.ignoreHeavy;

renderRecent();

if (!canUseFsApi) {
  // Safari / Firefox 向けの補足
  const note = document.querySelector(".wel .support");
  if (note) {
    note.insertAdjacentHTML("beforeend",
      "<br><span style='color:var(--fg-dim)'>※ このブラウザではフォルダを覚えておけません。Chrome / Edge なら、次回から一覧をクリックするだけで開き直せます。</span>");
  }
}

// 前回のプロジェクトがあれば、ようこそ画面から 1 クリックで戻れるようにする
listProjects().then(list => {
  if (list.length) renderRecent();
});

/* ---------- 更新の受け取り ----------
   画面はネットワークを先に見るので、読み込み直せば必ず最新になる。
   開いたままのときのために、新しい版が有効になったら知らせる。
   読み込み直すかどうかは利用者が決める（レビューの途中で
   画面が作り直されると、書きかけのメモが消えてしまうため）。 */
if (!import.meta.env || !import.meta.env.DEV) {
  const bar = $("#updatebar");
  bar.querySelector(".go").onclick = () => location.reload();
  bar.querySelector(".later").onclick = () => bar.classList.remove("on");

  if ("serviceWorker" in navigator) {
    // 初回の登録でも制御が移るので、すでに制御されていた場合だけ知らせる
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) bar.classList.add("on");
    });
  }

  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* Service Worker が使えない環境では何もしない */ });
}

// 開発時だけ、見本プロジェクトを読み込むための入口を用意する
if (import.meta.env && import.meta.env.DEV) import("./dev/demo.js");

window.addEventListener("beforeunload", (e) => {
  if (S.review.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
