/* =========================================================================
   小さな道具（DOM・パス・種別判定）
   ========================================================================= */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const esc = (s) => String(s).replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

/** 要素を作って属性・中身をまとめて設定する */
export function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.appendChild(c);
  return n;
}

/* ---------- 拡張子まわり ---------- */
export const TEXT_EXT = new Set((
  "txt md markdown mdx rst adoc log csv tsv json jsonc json5 yaml yml toml ini cfg conf env " +
  "js jsx mjs cjs ts tsx vue svelte html htm xml svg css scss sass less styl " +
  "py rb php go rs java kt kts swift c h cpp hpp cc cs scala sh bash zsh fish ps1 bat cmd " +
  "sql graphql gql prisma proto r lua dart pl ex exs erl hs clj m mm gradle properties lock diff patch " +
  "gitignore gitattributes editorconfig dockerignore npmrc babelrc eslintrc prettierrc"
).split(" "));

export const NO_EXT_TEXT = new Set(["dockerfile", "makefile", "license", "licence", "readme",
  "changelog", "procfile", "gemfile", "rakefile", "brewfile", "notice", "authors", "codeowners"]);

export const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);

export const HL_MAP = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java", kt: "kotlin", kts: "kotlin", cs: "csharp", c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", cc: "cpp", php: "php", swift: "swift", sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  ps1: "powershell", bat: "dos", cmd: "dos", sql: "sql", yml: "yaml", yaml: "yaml", json: "json", jsonc: "json", json5: "json",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml", svelte: "xml", css: "css", scss: "scss", less: "less",
  md: "markdown", markdown: "markdown", mdx: "markdown", toml: "ini", ini: "ini", cfg: "ini", conf: "ini", env: "bash",
  dockerfile: "dockerfile", makefile: "makefile", lua: "lua", dart: "dart", r: "r", pl: "perl", scala: "scala",
  graphql: "graphql", gql: "graphql", diff: "diff", patch: "diff", tsv: "plaintext", csv: "plaintext", txt: "plaintext",
};

const EXT_COLOR = {
  md: "#519aba", markdown: "#519aba", mdx: "#519aba", txt: "#a0a0a0",
  js: "#cbcb41", mjs: "#cbcb41", cjs: "#cbcb41", jsx: "#61dafb", ts: "#3178c6", tsx: "#61dafb",
  json: "#cbcb41", yml: "#cb6b41", yaml: "#cb6b41", toml: "#cb6b41",
  py: "#3572a5", rb: "#cc342d", go: "#00add8", rs: "#dea584", java: "#b07219", php: "#7377ad", cs: "#68217a",
  html: "#e44d26", htm: "#e44d26", css: "#42a5f5", scss: "#cf649a", less: "#2a4d80",
  vue: "#41b883", svelte: "#ff3e00", csv: "#4caf50", tsv: "#4caf50",
  pdf: "#e5252a", docx: "#2b579a", doc: "#2b579a", xlsx: "#217346", pptx: "#d24726",
  png: "#a074c4", jpg: "#a074c4", jpeg: "#a074c4", gif: "#a074c4", svg: "#ffb13b", webp: "#a074c4",
  sh: "#89e051", sql: "#e38c00", xml: "#e37933", lock: "#8b8b8b",
};
export const colorOf = (ext) => EXT_COLOR[ext] || "#8f8f8f";

/* ---------- パス操作 ---------- */
export function normPath(p) {
  const parts = [];
  for (const seg of String(p).replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}
export const dirOf = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
export const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1);

export function extOf(name) {
  const b = baseOf(name).toLowerCase();
  if (!b.includes(".")) return b;
  if (b.startsWith(".") && b.split(".").length === 2) return b.slice(1);
  return b.slice(b.lastIndexOf(".") + 1);
}

export function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

export function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return Math.floor(diff / 60) + " 分前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 時間前";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 日前";
  return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
}

/* ---------- 種別判定 ---------- */
export function kindOf(name) {
  const ext = extOf(name);
  const low = baseOf(name).toLowerCase();
  if (["md", "markdown", "mdx"].includes(ext)) return "markdown";
  if (["csv", "tsv"].includes(ext)) return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (["doc", "xlsx", "xls", "pptx", "ppt"].includes(ext)) return "office";
  if (IMG_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext) || NO_EXT_TEXT.has(low) || NO_EXT_TEXT.has(ext)) return "text";
  return "binary";
}
export const isTextKind = (k) => k === "text" || k === "markdown" || k === "csv";

/** 正規表現に使える形へ逃がす */
export const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 連続実行を間引く */
export function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

/** ブラウザに保存させずにファイルを渡す（ダウンロード） */
export function saveAs(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
