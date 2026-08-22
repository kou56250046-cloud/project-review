/* =========================================================================
   タブ（ピン留め・並べ替え・分割表示に対応）
   ========================================================================= */
import { S, emit } from "../core/state.js";
import { $, $$, esc, colorOf, fmtSize } from "../core/util.js";

export const tabId = (kind, path) => kind + ":" + (path || "");

export function openTab(kind, path, label, builder) {
  const id = tabId(kind, path);
  let tab = S.tabs.find(t => t.id === id);
  if (!tab) {
    tab = { id, kind, path, label, pinned: false };
    S.tabs.push(tab);
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.id = id;
    pane.setAttribute("role", "tabpanel");
    $("#panes").appendChild(pane);
    S.panes.set(id, pane);
    try { builder(pane); }
    catch (e) {
      console.error(e);
      pane.innerHTML = '<div class="center-note"><div class="big">表示中に問題が起きました</div><div>' + esc(e.message || "") + "</div></div>";
    }
  }
  activateTab(id);
  return tab;
}

export function activateTab(id) {
  const tab = S.tabs.find(t => t.id === id);
  if (!tab) return;
  S.active = tab;
  if (S.split) {
    // 分割中は「もう片方」を保ったまま入れ替える
    const other = S.splitIds.find(x => x !== id && S.panes.has(x));
    S.splitIds = other ? [id, other] : [id];
  } else {
    S.splitIds = [id];
  }
  applyPaneVisibility();
  renderTabs();
  $$("#tree .row").forEach(r => r.classList.toggle("sel", r.dataset.path === tab.path));
  emit("tab-changed", tab);
}

function applyPaneVisibility() {
  const show = new Set(S.split ? S.splitIds : [S.active && S.active.id]);
  for (const [id, pane] of S.panes) pane.classList.toggle("on", show.has(id));
  $("#panes").classList.toggle("split", S.split && S.splitIds.length > 1);
}

export function closeTab(id) {
  const i = S.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const pane = S.panes.get(id);
  if (pane) pane.remove();
  S.panes.delete(id);
  S.tabs.splice(i, 1);
  S.splitIds = S.splitIds.filter(x => x !== id);
  if (S.active && S.active.id === id) {
    const next = S.tabs[i] || S.tabs[i - 1];
    if (next) { activateTab(next.id); return; }
    S.active = null;
    applyPaneVisibility();
    renderTabs();
    emit("tab-changed", null);
    if (!S.files.size) $("#welcome").style.display = "flex";
    return;
  }
  applyPaneVisibility();
  renderTabs();
}

export function closeOthers(id) {
  for (const t of [...S.tabs]) if (t.id !== id && !t.pinned) closeTab(t.id);
}

export function togglePin(id) {
  const t = S.tabs.find(x => x.id === id);
  if (!t) return;
  t.pinned = !t.pinned;
  // ピン留めしたタブは左へ寄せる
  S.tabs.sort((a, b) => (b.pinned === true) - (a.pinned === true));
  renderTabs();
}

export function toggleSplit() {
  if (!S.active) return;
  if (S.split) {
    S.split = false;
    S.splitIds = [S.active.id];
  } else {
    const other = S.tabs.find(t => t.id !== S.active.id);
    if (!other) return false;
    S.split = true;
    S.splitIds = [S.active.id, other.id];
  }
  applyPaneVisibility();
  renderTabs();
  return S.split;
}

export function renderTabs() {
  const bar = $("#tabbar");
  bar.innerHTML = "";
  for (const t of S.tabs) {
    const el = document.createElement("div");
    const shown = S.splitIds.includes(t.id) && S.split;
    el.className = "tab" +
      ((S.active && S.active.id === t.id) || shown ? " on" : "") +
      (t.pinned ? " pinned" : "");
    el.draggable = true;
    el.dataset.id = t.id;
    el.setAttribute("role", "tab");
    el.setAttribute("aria-selected", String(!!(S.active && S.active.id === t.id)));
    el.tabIndex = 0;
    const f = t.kind === "file" ? S.files.get(t.path) : null;
    const color = f ? colorOf(f.ext) : "#8f8f8f";
    el.innerHTML =
      '<span style="color:' + color + ';font-size:10px">◆</span>' +
      (t.pinned ? '<span class="pin">📌</span>' : "") +
      '<span class="nm">' + esc(t.label) + "</span>" +
      '<span class="x" role="button" aria-label="タブを閉じる">×</span>';
    el.title = (t.path || t.label) + (f ? "\n" + fmtSize(f.size) : "") + "\n中クリックで閉じる";
    el.onclick = (e) => {
      if (e.target.classList.contains("x")) closeTab(t.id);
      else activateTab(t.id);
    };
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activateTab(t.id); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); closeTab(t.id); }
    };
    el.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } };
    el.oncontextmenu = (e) => { e.preventDefault(); togglePin(t.id); };
    wireDrag(el, t);
    bar.appendChild(el);
  }
  const on = bar.querySelector(".tab.on");
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/* ---------- ドラッグで並べ替え ---------- */
let dragId = null;
function wireDrag(el, t) {
  el.addEventListener("dragstart", (e) => {
    dragId = t.id;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", t.id); } catch { /* 一部ブラウザ対策 */ }
  });
  el.addEventListener("dragend", () => {
    dragId = null;
    el.classList.remove("dragging");
    $$(".tab").forEach(x => x.classList.remove("drop-before", "drop-after"));
  });
  el.addEventListener("dragover", (e) => {
    if (!dragId || dragId === t.id) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    el.classList.toggle("drop-before", !after);
    el.classList.toggle("drop-after", after);
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragId || dragId === t.id) return;
    const from = S.tabs.findIndex(x => x.id === dragId);
    let to = S.tabs.findIndex(x => x.id === t.id);
    if (from < 0 || to < 0) return;
    const r = el.getBoundingClientRect();
    if (e.clientX > r.left + r.width / 2) to++;
    const [moved] = S.tabs.splice(from, 1);
    if (from < to) to--;
    S.tabs.splice(to, 0, moved);
    renderTabs();
  });
}
