/* =========================================================================
   ファイルツリー
   レビューの状態（確認済み・メモあり）も一緒に表示する。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, colorOf, fmtSize } from "../core/util.js";
import { roleOfDir, roleOfFile } from "../core/roles.js";
import { isDone, notesOf } from "../core/review.js";

let showRoles = true;
export function setShowRoles(v) { showRoles = v; }

export function buildTree() {
  const root = { name: S.rootName || "root", dir: true, children: new Map(), path: "" };
  for (const p of [...S.files.keys()].sort()) {
    const segs = p.split("/");
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      const isFile = i === segs.length - 1;
      const key = segs[i];
      if (!node.children.has(key)) {
        node.children.set(key, {
          name: key, dir: !isFile, children: new Map(),
          path: segs.slice(0, i + 1).join("/"),
        });
      }
      node = node.children.get(key);
    }
  }
  return root;
}

export function renderTree() {
  const filter = ($("#treeFilter").value || "").trim().toLowerCase();
  const root = buildTree();
  const host = $("#tree");
  host.innerHTML = "";
  const frag = document.createDocumentFragment();
  const kids = [...root.children.values()];
  const start = kids.length === 1 && kids[0].dir ? [kids[0]] : kids;
  for (const n of start) renderNode(n, 0, frag, filter);
  if (!frag.childNodes.length) {
    host.innerHTML = '<div class="empty-note">一致するファイルがありません。</div>';
    return;
  }
  host.appendChild(frag);
  wireKeyboard(host);
}

function matchesFilter(node, filter) {
  if (!filter) return true;
  if (node.name.toLowerCase().includes(filter)) return true;
  for (const c of node.children.values()) if (matchesFilter(c, filter)) return true;
  return false;
}

function renderNode(node, depth, host, filter) {
  if (!matchesFilter(node, filter)) return;
  const row = document.createElement("div");
  row.className = "row";
  row.style.paddingLeft = (6 + depth * 12) + "px";
  row.tabIndex = -1;
  const open = filter ? true : !S.collapsed.has(node.path);

  if (node.dir) {
    const kids = [...node.children.values()]
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    const role = roleOfDir(node.name);
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-expanded", String(open));
    row.dataset.dir = node.path;
    row.innerHTML =
      '<span class="caret">' + (open ? "▾" : "▸") + "</span>" +
      '<span class="ic" style="color:#c09553">▮</span>' +
      '<span class="nm">' + esc(node.name) + "</span>" +
      (role && showRoles ? '<span class="role">' + esc(role) + "</span>" : "");
    row.title = node.path + (role ? "\n役割: " + role : "");
    const box = document.createElement("div");
    box.className = "kids" + (open ? "" : " closed");
    host.appendChild(row);
    host.appendChild(box);
    for (const c of kids) renderNode(c, depth + 1, box, filter);
    row.onclick = () => toggleDir(node.path);
  } else {
    const f = S.files.get(node.path);
    if (!f) return;
    const role = roleOfFile(node.path);
    const done = isDone(node.path);
    const notes = notesOf(node.path);
    const flagged = notes.some(n => n.flag);
    row.setAttribute("role", "treeitem");
    row.dataset.path = node.path;
    if (done) row.classList.add("rv-done");
    row.innerHTML =
      '<span class="caret"></span>' +
      '<span class="ic" style="color:' + colorOf(f.ext) + '">◆</span>' +
      '<span class="nm">' + esc(node.name) + "</span>" +
      (notes.length || done
        ? '<span class="rv ' + (flagged ? "flag" : done ? "done" : "todo") + '">' +
          (flagged ? "⚠" : done ? "✓" : "●") + "</span>"
        : "") +
      (showRoles ? '<span class="role">' + esc(role) + "</span>" : "");
    row.title = node.path + "\n役割: " + role + "\nサイズ: " + fmtSize(f.size) +
      (notes.length ? "\nメモ " + notes.length + " 件" : "") + (done ? "\n確認済み" : "");
    if (S.active && S.active.path === node.path) row.classList.add("sel");
    row.onclick = () => actions.openFile(node.path);
    host.appendChild(row);
  }
}

function toggleDir(path) {
  if (S.collapsed.has(path)) S.collapsed.delete(path);
  else S.collapsed.add(path);
  renderTree();
}

export function collapseAll() {
  const root = buildTree();
  (function mark(n) {
    if (n.dir && n.path) S.collapsed.add(n.path);
    n.children.forEach(mark);
  })(root);
  renderTree();
}

export function expandAll() {
  S.collapsed.clear();
  renderTree();
}

/** 開いているファイルの位置までツリーを展開して見せる */
export function revealPath(path) {
  const segs = path.split("/");
  for (let i = 1; i < segs.length; i++) S.collapsed.delete(segs.slice(0, i).join("/"));
  renderTree();
  const row = $('#tree .row[data-path="' + CSS.escape(path) + '"]');
  if (row) row.scrollIntoView({ block: "nearest" });
}

/* ---------- キーボードで辿れるようにする ---------- */
function wireKeyboard(host) {
  const rows = $$(".row", host);
  if (!rows.length) return;
  const visible = () => $$(".row", host).filter(r => r.offsetParent !== null);
  rows[0].tabIndex = 0;
  host.onkeydown = (e) => {
    const list = visible();
    const cur = document.activeElement.closest(".row");
    let i = list.indexOf(cur);
    if (i < 0) return;
    const focus = (j) => {
      const t = list[Math.max(0, Math.min(list.length - 1, j))];
      if (!t) return;
      list.forEach(r => { r.tabIndex = -1; });
      t.tabIndex = 0;
      t.focus();
      t.scrollIntoView({ block: "nearest" });
    };
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focus(i + 1); break;
      case "ArrowUp": e.preventDefault(); focus(i - 1); break;
      case "Home": e.preventDefault(); focus(0); break;
      case "End": e.preventDefault(); focus(list.length - 1); break;
      case "ArrowRight":
        if (cur.dataset.dir && cur.getAttribute("aria-expanded") === "false") { e.preventDefault(); toggleDir(cur.dataset.dir); }
        break;
      case "ArrowLeft":
        if (cur.dataset.dir && cur.getAttribute("aria-expanded") === "true") { e.preventDefault(); toggleDir(cur.dataset.dir); }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        cur.click();
        break;
      default: break;
    }
  };
}
