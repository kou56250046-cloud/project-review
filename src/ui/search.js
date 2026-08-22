/* =========================================================================
   全文検索
     - 入力しながら結果が出る（打鍵のたびに前回の検索は打ち切る）
     - 正規表現 / 大文字小文字 / 単語単位 / ファイル名での絞り込み
     - 走査は小分けにして進めるので、画面が固まらない
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, escRe, colorOf, debounce } from "../core/util.js";

const opts = { regex: false, caseSensitive: false, word: false };
let include = "";
let runToken = 0;

const CHUNK = 60;          // 一度に走査するファイル数
const MAX_FILES = 300;
const MAX_HITS_PER_FILE = 60;
const MAX_TOTAL = 4000;

export function initSearch() {
  const input = $("#searchInput");
  const inc = $("#searchInclude");
  const run = debounce(() => runSearch(), 180);

  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  inc.addEventListener("input", debounce(() => { include = inc.value.trim(); runSearch(); }, 220));

  $$("#searchOpts .tg").forEach(b => {
    b.onclick = () => {
      const k = b.dataset.opt;
      opts[k] = !opts[k];
      b.setAttribute("aria-pressed", String(opts[k]));
      runSearch();
    };
  });
}

export function focusSearch(preset) {
  const input = $("#searchInput");
  if (preset != null) input.value = preset;
  input.focus();
  input.select();
  if (preset) runSearch();
}

/** ファイル名のかんたんなパターン一致（*.md, src/, .py など） */
function includeMatches(path) {
  if (!include) return true;
  const pats = include.split(/[,\s]+/).filter(Boolean);
  if (!pats.length) return true;
  return pats.some(p => {
    if (p.includes("*")) {
      const re = new RegExp("^" + p.split("*").map(escRe).join(".*") + "$", "i");
      return re.test(path) || re.test(path.split("/").pop());
    }
    return path.toLowerCase().includes(p.toLowerCase());
  });
}

function buildMatcher(q) {
  if (opts.regex) {
    return new RegExp(q, opts.caseSensitive ? "g" : "gi");
  }
  const body = escRe(q);
  const src = opts.word ? "\\b" + body + "\\b" : body;
  return new RegExp(src, opts.caseSensitive ? "g" : "gi");
}

export async function runSearch() {
  const q = $("#searchInput").value;
  const host = $("#searchResults");
  const token = ++runToken;

  if (!q.trim()) {
    host.innerHTML = '<div class="empty-note">読み込んだテキストファイルの中身を検索します。</div>';
    return;
  }

  let re;
  try {
    re = buildMatcher(q);
  } catch (e) {
    host.innerHTML = '<div class="sr-meta err">正規表現に誤りがあります: ' + esc(e.message) + "</div>";
    return;
  }

  const files = [...S.files.values()].filter(f => f.text && includeMatches(f.path));
  let total = 0, fileCount = 0;
  const parts = [];
  host.innerHTML = '<div class="sr-meta">検索しています…</div>';

  for (let i = 0; i < files.length; i += CHUNK) {
    if (token !== runToken) return;             // 新しい検索が始まったら打ち切る
    const batch = files.slice(i, i + CHUNK);
    for (const f of batch) {
      if (fileCount >= MAX_FILES || total >= MAX_TOTAL) break;
      const hits = findInFile(f, re);
      if (!hits.length) continue;
      fileCount++;
      total += hits.length;
      parts.push(renderFile(f, hits));
    }
    // 画面に制御を返して入力を受け付ける
    await new Promise(r => setTimeout(r, 0));
    if (token !== runToken) return;
    host.innerHTML =
      '<div class="sr-meta">' + total.toLocaleString() + " 件 / " + fileCount + " ファイル" +
      (i + CHUNK < files.length ? "（検索中…）" : "") + "</div>" + parts.join("");
    if (fileCount >= MAX_FILES || total >= MAX_TOTAL) break;
  }

  if (!parts.length) {
    host.innerHTML = '<div class="empty-note">見つかりませんでした。</div>';
    return;
  }
  host.innerHTML =
    '<div class="sr-meta">' + total.toLocaleString() + " 件 / " + fileCount + " ファイル" +
    (total >= MAX_TOTAL ? "（上限に達しました）" : "") + "</div>" + parts.join("");
  wire(host);
}

function findInFile(f, re) {
  const lines = f.text.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length && hits.length < MAX_HITS_PER_FILE; i++) {
    const raw = lines[i];
    if (!raw) continue;
    re.lastIndex = 0;
    const m = re.exec(raw);
    if (!m) continue;
    const at = m.index;
    const len = m[0].length || 1;
    const from = Math.max(0, at - 24);
    const snippet =
      (from > 0 ? "…" : "") + esc(raw.slice(from, at)) +
      "<mark>" + esc(raw.substr(at, len)) + "</mark>" +
      esc(raw.slice(at + len, at + len + 70));
    hits.push({ line: i + 1, snippet });
  }
  return hits;
}

function renderFile(f, hits) {
  return '<div class="sr-file" data-p="' + esc(f.path) + '" title="' + esc(f.path) + '">' +
    '<span style="color:' + colorOf(f.ext) + '">◆</span>' +
    '<span class="nm">' + esc(f.name) + "</span>" +
    '<span class="cnt">' + hits.length + "</span></div>" +
    hits.map(x =>
      '<div class="sr-hit" data-p="' + esc(f.path) + '" data-l="' + x.line + '">' +
      '<span class="ln">' + x.line + "</span>  " + x.snippet + "</div>").join("");
}

function wire(host) {
  $$(".sr-hit", host).forEach(el => {
    el.onclick = () => actions.openFile(el.dataset.p, { line: +el.dataset.l });
  });
  $$(".sr-file", host).forEach(el => {
    el.onclick = () => actions.openFile(el.dataset.p);
  });
}
