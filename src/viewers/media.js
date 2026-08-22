/* =========================================================================
   PDF / Word / 画像 / 未対応形式
   重いライブラリは、そのファイルを開いたときに初めて読み込む。
   ========================================================================= */
import { esc, fmtSize } from "../core/util.js";
import { blobURL, decorateProse } from "./prose.js";

/* ---------- PDF ---------- */
export async function renderPDF(f, body, head) {
  const scroll = document.createElement("div");
  scroll.className = "pdf-scroll";
  body.appendChild(scroll);
  body.style.overflow = "hidden";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  scroll.innerHTML = '<div class="center-note">PDF を読み込んでいます…</div>';

  let pdfjsLib;
  try {
    pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
    if (__SINGLE_FILE__) {
      // 単一 HTML では別ファイルの worker を置けないので、同じスレッドで処理する
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    } else {
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  } catch (e) {
    scroll.innerHTML = '<div class="center-note"><div class="big">PDF 表示の準備に失敗しました</div><div>' +
      esc((e && e.message) || "") + "</div></div>";
    return;
  }

  let zoom = 1.15;
  try {
    const buf = await f.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    scroll.innerHTML = "";

    if (head) {
      const info = document.createElement("span");
      info.className = "chip dim";
      info.textContent = pdf.numPages + " ページ";
      head.insertBefore(info, head.querySelector(".head-sp"));
      const zl = document.createElement("span");
      zl.className = "chip dim";
      zl.textContent = "115%";
      const mk = (t, fn, title) => {
        const b = document.createElement("button");
        b.className = "hbtn"; b.textContent = t; b.title = title || "";
        b.onclick = fn; head.appendChild(b); return b;
      };
      mk("−", () => { zoom = Math.max(0.5, zoom - 0.15); zl.textContent = Math.round(zoom * 100) + "%"; redraw(); }, "縮小");
      head.appendChild(zl);
      mk("＋", () => { zoom = Math.min(3, zoom + 0.15); zl.textContent = Math.round(zoom * 100) + "%"; redraw(); }, "拡大");
    }

    const slots = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const ph = document.createElement("div");
      ph.className = "pdf-ph";
      ph.style.height = "600px";
      ph.style.width = "min(820px, calc(100% - 40px))";
      ph.textContent = i + " ページ";
      scroll.appendChild(ph);
      slots.push({ n: i, el: ph, done: false });
    }

    async function draw(slot) {
      if (slot.done) return;
      slot.done = true;
      const page = await pdf.getPage(slot.n);
      const base = page.getViewport({ scale: 1 });
      const avail = Math.min(scroll.clientWidth - 44, 980);
      const scale = (avail / base.width) * zoom;
      const vp = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + "px";
      canvas.style.height = vp.height + "px";
      canvas.setAttribute("aria-label", slot.n + " ページ");
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      slot.el.replaceWith(canvas);
      slot.el = canvas;
    }

    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const s = slots.find(x => x.el === e.target);
      if (s) { io.unobserve(e.target); draw(s); }
    }), { root: scroll, rootMargin: "600px" });
    slots.forEach(s => io.observe(s.el));

    function redraw() {
      slots.forEach(s => { s.done = false; });
      slots.forEach(s => draw(s));
    }
  } catch (e) {
    scroll.innerHTML = '<div class="center-note"><div class="big">この PDF は表示できませんでした</div><div>' +
      esc(e.message || "") + "</div></div>";
  }
}

/* ---------- Word ---------- */
export async function renderDocx(f, body, head) {
  body.innerHTML = '<div class="center-note">Word 文書を変換しています…</div>';
  try {
    const mammoth = (await import("mammoth/mammoth.browser.js")).default;
    const DOMPurify = (await import("dompurify")).default;
    const buf = await f.file.arrayBuffer();
    const r = await mammoth.convertToHtml({ arrayBuffer: buf });
    body.innerHTML = "";
    const art = document.createElement("div");
    art.className = "prose";
    art.innerHTML = DOMPurify.sanitize(r.value || "<p>（本文が空でした）</p>");
    body.appendChild(art);
    decorateProse(art, f);
    if (r.messages && r.messages.length && head) {
      const c = document.createElement("span");
      c.className = "chip dim";
      c.textContent = "変換時の注意 " + r.messages.length + " 件";
      c.title = r.messages.map(m => m.message).join("\n");
      head.insertBefore(c, head.querySelector(".head-sp"));
    }
  } catch (e) {
    body.innerHTML = '<div class="center-note"><div class="big">この Word 文書は変換できませんでした</div><div>' +
      esc(e.message || "") + "</div></div>";
  }
}

/* ---------- 画像 ---------- */
export function renderImage(f, body, head) {
  const stage = document.createElement("div");
  stage.className = "img-stage";
  const img = document.createElement("img");
  img.src = blobURL(f.path);
  img.alt = f.name;
  img.onload = () => {
    if (!head) return;
    const c = document.createElement("span");
    c.className = "chip dim";
    c.textContent = img.naturalWidth + " × " + img.naturalHeight + " px";
    head.insertBefore(c, head.querySelector(".head-sp"));
  };
  stage.appendChild(img);
  body.appendChild(stage);
  body.style.overflow = "hidden";
  body.style.display = "flex";
}

/* ---------- 未対応 ---------- */
export function renderUnsupported(f, body) {
  const label = {
    xlsx: "Excel ブック", xls: "Excel ブック",
    pptx: "PowerPoint 資料", ppt: "PowerPoint 資料",
    doc: "旧形式の Word 文書",
  }[f.ext];
  const note = document.createElement("div");
  note.className = "center-note";
  note.innerHTML =
    '<div class="big">' + esc(label || "このファイル形式はプレビューに対応していません") + "</div>" +
    "<div>" + esc(f.path) + " · " + fmtSize(f.size) + "</div>";
  const a = document.createElement("a");
  a.className = "dl";
  a.href = blobURL(f.path);
  a.download = f.name;
  a.textContent = "ダウンロードして開く";
  note.appendChild(a);
  body.appendChild(note);
  body.style.display = "flex";
}
