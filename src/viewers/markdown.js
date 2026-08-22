/* =========================================================================
   Markdown の表示
   ========================================================================= */
import { marked } from "marked";
import DOMPurify from "dompurify";
import { esc } from "../core/util.js";
import { decorateProse, buildToc } from "./prose.js";
import { renderCode } from "./code.js";

export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

/** Markdown を安全な HTML にする（他の画面からも使う） */
export function mdToHtml(md) {
  marked.setOptions({ gfm: true, breaks: false });
  return DOMPurify.sanitize(marked.parse(md), { ADD_ATTR: ["target"] });
}

export function renderMarkdown(f, body, head) {
  const { fm, body: md } = parseFrontMatter(f.text || "");

  const layout = document.createElement("div");
  layout.className = "md-layout";
  const main = document.createElement("div");
  main.className = "md-main";
  const art = document.createElement("div");
  art.className = "prose";
  main.appendChild(art);
  const toc = document.createElement("nav");
  toc.className = "toc";
  toc.setAttribute("aria-label", "目次");
  layout.appendChild(main);
  layout.appendChild(toc);
  body.appendChild(layout);

  if (fm) {
    const box = document.createElement("div");
    box.className = "frontmatter";
    box.innerHTML = fm.split("\n").map(l => {
      const i = l.indexOf(":");
      if (i < 0) return esc(l);
      return '<span class="fm-k">' + esc(l.slice(0, i + 1)) + "</span>" + esc(l.slice(i + 1));
    }).join("<br>");
    art.appendChild(box);
  }

  const holder = document.createElement("div");
  holder.innerHTML = mdToHtml(md);
  art.appendChild(holder);

  decorateProse(art, f);
  buildToc(toc, holder, body);

  if (head) {
    const b = document.createElement("button");
    b.className = "hbtn";
    b.textContent = "原文（Markdown）を見る";
    b.setAttribute("aria-pressed", "false");
    let raw = false;
    let rawBox = null;
    b.onclick = () => {
      raw = !raw;
      layout.style.display = raw ? "none" : "flex";
      if (!rawBox) {
        rawBox = document.createElement("div");
        rawBox.style.cssText = "flex:1;display:flex;flex-direction:column;min-height:0";
        body.appendChild(rawBox);
        renderCode({ ...f, ext: "md" }, rawBox, null, { outline: false });
      }
      rawBox.style.display = raw ? "flex" : "none";
      b.classList.toggle("on", raw);
      b.setAttribute("aria-pressed", String(raw));
      b.textContent = raw ? "整形して見る" : "原文（Markdown）を見る";
    };
    head.appendChild(b);
  }
}
