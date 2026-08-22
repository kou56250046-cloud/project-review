/* =========================================================================
   ソースコードの表示
     - 仮想スクロールなので、何万行あっても切り捨てずに表示できる
     - 関数・クラスのアウトライン
     - ファイル内検索（Ctrl+F）
     - 行にレビューのメモを付けられる
   ========================================================================= */
import hljs from "highlight.js/lib/common";
import { S, actions } from "../core/state.js";
import { $, $$, esc, escRe, HL_MAP, debounce } from "../core/util.js";
import { outlineOf } from "../core/outline.js";
import { addNote, notesOf, removeNote, updateNote } from "../core/review.js";
import { looksLikeDiagram } from "./diagram.js";

/** ハイライト済み HTML を行ごとに切り分ける（開いたままの span を引き継ぐ） */
export function highlightToLines(html) {
  const lines = []; const stack = []; let cur = "";
  const re = /<span\b[^>]*>|<\/span>|[^<]+|</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tok = m[0];
    if (tok === "</span>") { cur += tok; stack.pop(); }
    else if (tok.charAt(0) === "<" && tok.length > 1) { cur += tok; stack.push(tok); }
    else {
      const parts = tok.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) { lines.push(cur + "</span>".repeat(stack.length)); cur = stack.join(""); }
        cur += parts[i];
      }
    }
  }
  lines.push(cur + "</span>".repeat(stack.length));
  return lines;
}

/** ハイライトが現実的な上限。これを超えたら素のテキストで出す */
const HL_LIMIT = 1_200_000;

function buildLines(text, ext, name) {
  const lang = HL_MAP[ext] || HL_MAP[String(name).toLowerCase()] || null;
  let html;
  if (text.length > HL_LIMIT) {
    html = esc(text);
  } else {
    try {
      if (lang && hljs.getLanguage(lang)) html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      else html = hljs.highlightAuto(text).value;
    } catch { html = esc(text); }
  }
  return { lines: highlightToLines(html), lang };
}

export function renderCode(f, body, head, opts = {}) {
  const text = f.text != null ? f.text : "";
  const { lines, lang } = buildLines(text, f.ext, f.name);
  const plain = text.split("\n");

  const layout = document.createElement("div");
  layout.className = "code-layout";

  const view = document.createElement("div");
  view.className = "code-view";
  view.tabIndex = 0;
  const sizer = document.createElement("div");
  sizer.className = "code-sizer";
  const win = document.createElement("div");
  win.className = "code-window";
  sizer.appendChild(win);
  view.appendChild(sizer);
  layout.appendChild(view);

  // アウトライン
  const symbols = opts.outline === false ? [] : outlineOf(text, f.ext);
  let outlineEl = null;
  if (symbols.length > 2) {
    outlineEl = document.createElement("nav");
    outlineEl.className = "outline";
    outlineEl.setAttribute("aria-label", "このファイルの構成");
    outlineEl.innerHTML = '<div class="t">構成（' + symbols.length + "）</div>";
    for (const s of symbols) {
      const a = document.createElement("a");
      a.className = "d" + s.depth;
      a.dataset.line = String(s.line);
      a.innerHTML = '<span class="k">' + esc(s.kind) + '</span><span class="n">' + esc(s.name) + "</span>";
      a.title = s.line + " 行目";
      a.onclick = () => goto(s.line, true);
      outlineEl.appendChild(a);
    }
    layout.appendChild(outlineEl);
  }

  // ファイル内検索バー
  const find = document.createElement("div");
  find.className = "find-bar";
  find.innerHTML =
    '<input type="search" placeholder="このファイル内を検索" aria-label="ファイル内を検索">' +
    '<span class="cnt"></span>' +
    '<button type="button" data-a="prev" title="前へ (Shift+Enter)">▲</button>' +
    '<button type="button" data-a="next" title="次へ (Enter)">▼</button>' +
    '<button type="button" data-a="close" title="閉じる (Esc)">✕</button>';
  layout.appendChild(find);

  body.appendChild(layout);
  body.style.overflow = "hidden";
  body.style.display = "flex";
  body.style.flexDirection = "column";

  /* ---------- 仮想スクロール ---------- */
  const lineH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh-code")) || 20;
  let LH = lineH();
  const BUF = 12;
  let hits = [];          // 検索でヒットした行番号
  let hitIdx = -1;
  let current = 0;        // 強調表示している行

  const noteMap = () => {
    const m = new Map();
    for (const n of notesOf(f.path)) {
      if (!m.has(n.line)) m.set(n.line, []);
      m.get(n.line).push(n);
    }
    return m;
  };
  let notes = noteMap();

  function paint() {
    LH = lineH();
    sizer.style.height = (lines.length * LH) + "px";
    const top = view.scrollTop;
    const h = view.clientHeight || 400;
    const start = Math.max(0, Math.floor(top / LH) - BUF);
    const end = Math.min(lines.length, Math.ceil((top + h) / LH) + BUF);
    const hitSet = new Set(hits);
    let out = "";
    for (let i = start; i < end; i++) {
      const no = i + 1;
      const ns = notes.get(no);
      const cls = "ln" + (hitSet.has(no) ? " hit" : "") + (no === current ? " cur" : "");
      out += '<div class="' + cls + '" data-line="' + no + '">' +
        '<span class="lnum">' + no + "</span>" +
        '<span class="lgut' + (ns ? " has" + (ns.some(n => n.flag) ? " flag" : "") : "") + '" title="' +
          (ns ? esc(ns.map(n => n.text).join(" / ")) : "クリックしてメモを残す") + '">' +
          (ns ? "●" : "＋") + "</span>" +
        '<span class="lcode">' + (lines[i] || " ") + "</span></div>";
    }
    win.style.transform = "translateY(" + (start * LH) + "px)";
    win.innerHTML = out;
    if (outlineEl) markOutline();
  }

  const repaint = () => requestAnimationFrame(paint);
  view.addEventListener("scroll", repaint, { passive: true });
  new ResizeObserver(repaint).observe(view);

  function goto(line, focus) {
    current = line;
    const target = Math.max(0, (line - 1) * LH - (view.clientHeight / 2));
    view.scrollTop = target;
    paint();
    if (focus) view.focus({ preventScroll: true });
  }

  function markOutline() {
    const firstVisible = Math.floor(view.scrollTop / LH) + 1;
    let best = null;
    for (const a of $$("a", outlineEl)) {
      if (+a.dataset.line <= firstVisible + 2) best = a;
      a.classList.remove("on");
    }
    if (best) best.classList.add("on");
  }

  /* ---------- 行のメモ ---------- */
  win.addEventListener("click", (e) => {
    const gut = e.target.closest(".lgut");
    if (gut) {
      const line = +gut.closest(".ln").dataset.line;
      openNoteEditor(line, gut);
      return;
    }
    const num = e.target.closest(".lnum");
    if (num) {
      current = +num.closest(".ln").dataset.line;
      paint();
    }
  });

  let popover = null;
  function openNoteEditor(line, anchor) {
    closePopover();
    const existing = notes.get(line) || [];
    const box = document.createElement("div");
    box.className = "line-note";
    box.style.cssText = "position:fixed;z-index:120;width:min(420px,80vw);margin:0";
    const list = existing.map(n =>
      '<div data-id="' + n.id + '" style="margin-bottom:6px">' +
      (n.flag ? "⚠️ " : "") + esc(n.text) +
      '<div class="nt-act"><button data-del="' + n.id + '">削除</button></div></div>'
    ).join("");
    box.innerHTML =
      '<div style="font-family:var(--mono);font-size:11px;color:var(--fg-dim);margin-bottom:6px">' +
        esc(f.name) + " : " + line + " 行目</div>" +
      list +
      '<textarea rows="3" style="width:100%;background:var(--bg-input);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:6px;font-family:var(--ui);font-size:12.5px" placeholder="気づいたことを書き残す"></textarea>' +
      '<div class="nt-act"><label style="display:flex;gap:5px;align-items:center;cursor:pointer">' +
        '<input type="checkbox"> 要確認として印を付ける</label>' +
        '<span style="flex:1"></span>' +
        '<button data-a="save">保存 (Ctrl+Enter)</button><button data-a="cancel">閉じる</button></div>';
    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.min(r.left, window.innerWidth - box.offsetWidth - 16) + "px";
    box.style.top = Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 16) + "px";
    const ta = box.querySelector("textarea");
    const chk = box.querySelector('input[type=checkbox]');
    ta.focus();
    const save = () => {
      const v = ta.value.trim();
      if (v) addNote(f.path, line, v, chk.checked);
      notes = noteMap();
      paint();
      closePopover();
    };
    box.addEventListener("click", (e2) => {
      const del = e2.target.dataset.del;
      if (del) { removeNote(f.path, del); notes = noteMap(); paint(); closePopover(); return; }
      const a = e2.target.dataset.a;
      if (a === "save") save();
      if (a === "cancel") closePopover();
    });
    ta.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter" && (e2.ctrlKey || e2.metaKey)) { e2.preventDefault(); save(); }
      if (e2.key === "Escape") { e2.preventDefault(); closePopover(); }
    });
    popover = box;
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
  }
  function outside(e) { if (popover && !popover.contains(e.target)) closePopover(); }
  function closePopover() {
    if (!popover) return;
    popover.remove(); popover = null;
    document.removeEventListener("mousedown", outside);
  }

  /* ---------- ファイル内検索 ---------- */
  const fInput = find.querySelector("input");
  const fCnt = find.querySelector(".cnt");

  function runFind(q) {
    hits = []; hitIdx = -1;
    if (q) {
      const needle = q.toLowerCase();
      for (let i = 0; i < plain.length; i++) {
        if (plain[i].toLowerCase().includes(needle)) hits.push(i + 1);
        if (hits.length > 5000) break;
      }
    }
    fCnt.textContent = q ? (hits.length ? "1 / " + hits.length : "見つかりません") : "";
    if (hits.length) { hitIdx = 0; goto(hits[0]); }
    else paint();
  }
  const runFindDebounced = debounce(runFind, 160);
  fInput.addEventListener("input", (e) => runFindDebounced(e.target.value));
  fInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  });
  find.addEventListener("click", (e) => {
    const a = e.target.dataset.a;
    if (a === "next") step(1);
    if (a === "prev") step(-1);
    if (a === "close") closeFind();
  });
  function step(d) {
    if (!hits.length) return;
    hitIdx = (hitIdx + d + hits.length) % hits.length;
    fCnt.textContent = (hitIdx + 1) + " / " + hits.length;
    goto(hits[hitIdx]);
  }
  function openFind() {
    find.classList.add("on");
    fInput.select();
    fInput.focus();
  }
  function closeFind() {
    find.classList.remove("on");
    hits = []; hitIdx = -1;
    paint();
    view.focus();
  }

  /* ---------- 見出し帯のボタン ---------- */
  if (head) {
    const mkBtn = (label, fn, title) => {
      const b = document.createElement("button");
      b.className = "hbtn"; b.textContent = label; if (title) b.title = title;
      b.onclick = () => fn(b);
      head.appendChild(b);
      return b;
    };
    if (lang) {
      const t = document.createElement("span");
      t.className = "chip dim"; t.textContent = lang;
      head.insertBefore(t, head.querySelector(".head-sp"));
    }
    const nl = document.createElement("span");
    nl.className = "chip dim";
    nl.textContent = plain.length.toLocaleString() + " 行";
    head.insertBefore(nl, head.querySelector(".head-sp"));

    mkBtn("検索", openFind, "このファイルの中を検索 (Ctrl+F)");
    mkBtn("折り返し", (b) => {
      const on = view.classList.toggle("wrap");
      b.classList.toggle("on", on);
      win.querySelectorAll(".lcode").forEach(x => { x.style.whiteSpace = on ? "pre-wrap" : "pre"; });
    }, "長い行を折り返す");
    mkBtn("全文をコピー", () => {
      navigator.clipboard.writeText(text).then(() => actions.toast("コピーしました"));
    });
    if (looksLikeDiagram(text)) {
      mkBtn("図モード", (b) => {
        const on = view.classList.toggle("tight");
        b.classList.toggle("on", on);
      }, "行間を詰めて、罫線の縦線がつながるように表示します");
    }
  }

  paint();
  setTimeout(paint, 30);   // フォント読み込み後の行高で描き直す

  return {
    goto,
    openFind,
    refreshNotes: () => { notes = noteMap(); paint(); },
    repaint: paint,
  };
}
