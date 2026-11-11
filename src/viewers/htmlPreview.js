/* =========================================================================
   HTML の表示
     - 既定はコード表示。ヘッダーのボタンで画面プレビューに切り替える
     - プレビューは sandbox 付き iframe（allow-same-origin なし）で描く
     - 読み込んだフォルダ内の CSS・JS・画像は中身を埋め込んでから渡す
   ========================================================================= */
import { S } from "../core/state.js";
import { resolveRef } from "../core/analyze.js";
import { isHeavy } from "../core/ingest.js";
import { renderCode } from "./code.js";

function readText(rf) {
  if (rf.text != null) return Promise.resolve(rf.text);
  return rf.file ? rf.file.text() : Promise.resolve(null);
}

function readDataUrl(rf) {
  if (!rf.file) return Promise.resolve(null);
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => res(null);
    r.readAsDataURL(rf.file);
  });
}

/** タグごとに埋め込んでよい種類 */
const ALLOW = {
  css: (rf) => rf.ext === "css",
  js: (rf) => ["js", "mjs", "cjs"].includes(rf.ext),
  img: (rf) => rf.kind === "image",
};

/**
 * 参照先を引く。プレビュー内のスクリプトは外へ通信できるので、
 * 秘密が入りがちなドットファイルや別のフォルダの中身は渡さない
 */
function lookup(spec, f, kind) {
  const p = resolveRef(spec, f.path);
  if (!p) return null;
  const segs = p.split("/");
  if (segs[0] !== f.path.split("/")[0]) return null;           // 同じ最上位フォルダの中だけ
  if (segs.some(s => s.startsWith(".") || isHeavy(s))) return null;
  const rf = S.files.get(p);
  return rf && ALLOW[kind](rf) ? rf : null;
}

/** 埋め込む中身の合計の上限。巨大なファイルを参照されても本体が固まらないようにする */
const INLINE_BUDGET = 20 * 1024 * 1024;

/**
 * プレビューの中で押された本体のショートカットを親へ渡す。
 * iframe にフォーカスがあるとキー入力が本体に届かないため
 */
const KEY_RELAY =
  'document.addEventListener("keydown",function(e){var m=e.ctrlKey||e.metaKey;' +
  'if(m&&(e.key==="Enter"||e.key.toLowerCase()==="f")){e.preventDefault();' +
  'parent.postMessage({frsKey:e.key,shift:e.shiftKey},"*");}},true);';

/** link / script / img の参照を中身に置き換えた HTML を返す。見つからない参照はそのまま残す */
export async function inlineAssets(f) {
  const doc = new DOMParser().parseFromString(f.text || "", "text/html");
  const jobs = [];
  let budget = INLINE_BUDGET;
  const memo = new Map();
  // 同じファイルは1回だけ読む。上限を超えたものは埋め込まない
  const once = (rf, read) => {
    if (!memo.has(rf.path)) {
      if (rf.size > budget) memo.set(rf.path, Promise.resolve(null));
      else { budget -= rf.size; memo.set(rf.path, read(rf).catch(() => null)); }
    }
    return memo.get(rf.path);
  };

  for (const el of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const rf = lookup(el.getAttribute("href"), f, "css");
    if (!rf) continue;
    jobs.push(once(rf, readText).then(t => {
      if (t == null) return;
      const st = doc.createElement("style");
      const media = el.getAttribute("media");
      if (media) st.setAttribute("media", media);
      // 中身に </style が含まれると埋め込んだ先で要素が閉じてしまう
      st.textContent = t.replace(/<\/style/gi, "<\\/style");
      el.replaceWith(st);
    }));
  }

  // スクリプトは src を data URL に差し替える。中身を直接埋めると defer / async が効かなくなる
  for (const el of doc.querySelectorAll("script[src]")) {
    const rf = lookup(el.getAttribute("src"), f, "js");
    if (!rf) continue;
    jobs.push(once(rf, r => readText(r).then(t =>
      t == null ? null : readDataUrl({ file: new Blob([t], { type: "text/javascript;charset=utf-8" }) })
    )).then(u => { if (u) el.setAttribute("src", u); }));
  }

  for (const el of doc.querySelectorAll("img[src]")) {
    const rf = lookup(el.getAttribute("src"), f, "img");
    if (!rf) continue;
    jobs.push(once(rf, readDataUrl).then(u => { if (u) el.setAttribute("src", u); }));
  }

  await Promise.all(jobs);

  // 解決できなかった相対参照が本体の URL を起点に読まれないよう、基準を srcdoc 自身にする。
  // ページ内リンク（#見出し）はこれで同じ文書の中の移動になる
  const head = doc.head;
  if (!doc.querySelector("base[href]")) {
    const base = doc.createElement("base");
    base.setAttribute("href", "about:srcdoc");
    head.prepend(base);
  }
  const relay = doc.createElement("script");
  relay.textContent = KEY_RELAY;
  head.prepend(relay);

  // srcdoc の文書は doctype に関係なく標準モードで描かれる（HTML の仕様）。quirks モードは再現できない
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}

// プレビューから渡されたショートカットを、本体で押されたものとして流し直す。
// 送り元が表示中のプレビューであることを確かめてから受け付ける
window.addEventListener("message", (e) => {
  if (e.origin !== "null" || !e.data || typeof e.data.frsKey !== "string") return;
  const own = [...document.querySelectorAll(".html-preview iframe")].some(fr => fr.contentWindow === e.source);
  if (!own) return;
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: e.data.frsKey, ctrlKey: true, shiftKey: !!e.data.shift, bubbles: true, cancelable: true,
  }));
});

export function renderHtml(f, body, head) {
  const codeBox = document.createElement("div");
  codeBox.style.cssText = "flex:1;display:flex;flex-direction:column;min-height:0;height:100%";
  body.appendChild(codeBox);
  const ctl = renderCode(f, codeBox, head);

  const stage = document.createElement("div");
  stage.className = "html-preview";
  stage.hidden = true;
  body.appendChild(stage);

  let preview = false;
  let seq = 0;

  const draw = () => {
    const my = ++seq;
    stage.innerHTML = '<div class="html-preview-msg">読み込み中…</div>';
    inlineAssets(f).then(html => {
      if (my !== seq) return;
      const fr = document.createElement("iframe");
      fr.setAttribute("sandbox", "allow-scripts");
      fr.setAttribute("title", f.name + " のプレビュー");
      fr.srcdoc = html;
      stage.replaceChildren(fr);
    }).catch(() => {
      if (my !== seq) return;
      stage.innerHTML = '<div class="html-preview-msg">プレビューを作れませんでした</div>';
    });
  };

  const btn = document.createElement("button");
  btn.className = "hbtn";
  btn.textContent = "プレビュー";
  btn.setAttribute("aria-pressed", "false");
  btn.title = "画面としての見え方を表示します（スクリプトは隔離して実行）";

  const reload = document.createElement("button");
  reload.className = "hbtn";
  reload.textContent = "再読み込み";
  reload.title = "プレビューを最初の状態から描き直します";
  reload.hidden = true;
  reload.onclick = draw;

  const setPreview = (on) => {
    if (on === preview) return;
    preview = on;
    codeBox.style.display = on ? "none" : "flex";
    stage.hidden = !on;
    reload.hidden = !on;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "コードを見る" : "プレビュー";
    if (on) draw();
    else { seq++; stage.replaceChildren(); }   // 隠している間はスクリプトを止める
  };
  btn.onclick = () => setPreview(!preview);

  if (head) { head.appendChild(btn); head.appendChild(reload); }

  return {
    ...ctl,
    goto: (...a) => { setPreview(false); return ctl.goto(...a); },
    openFind: (...a) => { setPreview(false); return ctl.openFind(...a); },
  };
}

export const isHtmlFile = (f) => f.kind === "text" && /^html?$/i.test(f.ext || "");
