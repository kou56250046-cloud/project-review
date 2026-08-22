/* =========================================================================
   長文（Markdown / Word）の共通仕上げ
     見出しにアンカー、コードブロックの整形、図の描画、
     画像とリンクを読み込み済みファイルへつなぐ。
   ========================================================================= */
import hljs from "highlight.js/lib/common";
import { S, actions } from "../core/state.js";
import { $$, esc } from "../core/util.js";
import { resolveRef } from "../core/analyze.js";
import { looksLikeDiagram, diagramBlock, mermaidBlock, MERMAID_HEAD } from "./diagram.js";

export function blobURL(path) {
  if (S.urlCache.has(path)) return S.urlCache.get(path);
  const f = S.files.get(path);
  if (!f) return "";
  const u = URL.createObjectURL(f.file);
  S.urlCache.set(path, u);
  return u;
}

export function decorateProse(art, f) {
  // 見出しに id とアンカー
  const used = new Set();
  $$("h1,h2,h3,h4,h5,h6", art).forEach(h => {
    const slug = h.textContent.trim().toLowerCase()
      .replace(/[^\w぀-ヿ一-龯-]+/g, "-").replace(/^-|-$/g, "") || "sec";
    let s = slug, i = 2;
    while (used.has(s)) s = slug + "-" + (i++);
    used.add(s); h.id = s;
    const a = document.createElement("a");
    a.className = "anchor"; a.href = "#" + s; a.textContent = "#";
    a.setAttribute("aria-label", "この見出しへのリンク");
    a.onclick = (e) => { e.preventDefault(); h.scrollIntoView({ behavior: "smooth" }); };
    h.appendChild(a);
  });

  // コードブロック
  $$("pre", art).forEach(pre => {
    const code = pre.querySelector("code");
    if (!code) return;
    const cls = (code.className || "").match(/language-([\w+-]+)/);
    const lang = cls ? cls[1] : "";
    const raw = code.textContent;

    // Mermaid 記法はそのまま図に描く
    if (lang === "mermaid" || (!lang && MERMAID_HEAD.test(raw))) {
      pre.replaceWith(mermaidBlock(raw));
      return;
    }
    // 罫線・矢印で描かれた図は、行間を詰めて線がつながる形で表示する
    if (looksLikeDiagram(raw) && (!lang || /^(text|txt|plain|plaintext|ascii|tree|diagram|none|console|shell)$/i.test(lang))) {
      pre.replaceWith(diagramBlock(raw));
      return;
    }
    try {
      if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
      else code.innerHTML = hljs.highlightAuto(raw).value;
    } catch { /* ハイライトできなくても原文は読める */ }

    const bar = document.createElement("div");
    bar.className = "cb-head";
    bar.innerHTML = '<span class="cb-lang">' + esc(lang || "text") + "</span>";
    const cp = document.createElement("button");
    cp.className = "cb-copy"; cp.textContent = "コピー";
    cp.onclick = () => navigator.clipboard.writeText(raw).then(() => {
      cp.textContent = "コピーしました";
      setTimeout(() => { cp.textContent = "コピー"; }, 1400);
    });
    bar.appendChild(cp);
    const inner = document.createElement("div");
    inner.className = "cb-body";
    const shell = document.createElement("div");
    shell.className = "dgm-shell";
    pre.parentNode.insertBefore(shell, pre);
    shell.appendChild(bar);
    shell.appendChild(inner);
    inner.appendChild(pre);
    pre.style.margin = "0"; pre.style.border = "none"; pre.style.background = "none";
  });

  // タスクリスト
  $$("li", art).forEach(li => { if (li.querySelector('input[type=checkbox]')) li.classList.add("task"); });

  // 画像を読み込み済みファイルから解決
  $$("img", art).forEach(img => {
    const src = img.getAttribute("src") || "";
    if (/^(https?:|data:)/i.test(src)) return;
    const t = resolveRef(src, f.path);
    if (t) { img.src = blobURL(t); img.title = t; }
    else {
      img.removeAttribute("src");
      img.alt = (img.alt || "") + "（画像が見つかりません: " + src + "）";
      img.style.cssText = "border:1px dashed var(--border-strong);padding:14px;color:var(--fg-muted);display:inline-block";
    }
  });

  // 内部リンクはアプリ内で開く
  $$("a", art).forEach(a => {
    const href = a.getAttribute("href") || "";
    if (/^(https?:|mailto:)/i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; return; }
    if (!href || href.startsWith("#")) return;
    const t = resolveRef(href, f.path);
    if (t) { a.onclick = (e) => { e.preventDefault(); actions.openFile(t); }; a.title = t; }
    else { a.style.color = "var(--fg-muted)"; a.title = "参照先が見つかりません: " + href; }
  });
}

/** 見出しから目次を組み立てる */
export function buildToc(toc, holder, scrollRoot) {
  const heads = $$("h1,h2,h3,h4", holder);
  if (heads.length <= 1) { toc.style.display = "none"; return; }
  toc.innerHTML = '<div class="t">目次</div>';
  heads.forEach(h => {
    const a = document.createElement("a");
    a.href = "#" + h.id;
    a.className = "lv" + h.tagName[1];
    a.textContent = h.textContent.replace(/#$/, "").trim();
    a.onclick = (e) => { e.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); };
    toc.appendChild(a);
  });
  const links = $$("a", toc);
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const idx = heads.indexOf(en.target);
      links.forEach((l, i) => l.classList.toggle("on", i === idx));
    });
  }, { root: scrollRoot, rootMargin: "0px 0px -75% 0px", threshold: 0 });
  heads.forEach(h => io.observe(h));
}
