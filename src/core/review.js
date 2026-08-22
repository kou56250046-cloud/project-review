/* =========================================================================
   レビューの記録
     - ファイル単位の「確認済み」
     - 行に紐づくメモ（要確認の印つき）
     - 進捗と、Markdown での書き出し
   保存先はブラウザ内の IndexedDB。プロジェクトごとに分けて持つ。
   ========================================================================= */
import { S, emit } from "./state.js";
import { saveReview, loadReview } from "./persist.js";
import { debounce, baseOf } from "./util.js";
import { roleOfFile } from "./roles.js";

const persist = debounce(() => {
  if (!S.rootKey) return;
  saveReview(S.rootKey, S.review.files);
  S.review.dirty = false;
}, 600);

function rec(path) {
  let r = S.review.files.get(path);
  if (!r) { r = { done: false, notes: [] }; S.review.files.set(path, r); }
  return r;
}

export const getReview = (path) => S.review.files.get(path) || null;

export function isDone(path) {
  const r = S.review.files.get(path);
  return !!(r && r.done);
}

export function toggleDone(path, force) {
  const r = rec(path);
  r.done = force === undefined ? !r.done : !!force;
  r.at = Date.now();
  changed(path);
  return r.done;
}

export function addNote(path, line, text, flag = false) {
  const r = rec(path);
  const note = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    line: line || 0, text: String(text || "").trim(), flag: !!flag, at: Date.now() };
  if (!note.text) return null;
  r.notes.push(note);
  r.notes.sort((a, b) => a.line - b.line);
  changed(path);
  return note;
}

export function updateNote(path, id, patch) {
  const r = S.review.files.get(path);
  if (!r) return;
  const n = r.notes.find(x => x.id === id);
  if (!n) return;
  Object.assign(n, patch, { at: Date.now() });
  changed(path);
}

export function removeNote(path, id) {
  const r = S.review.files.get(path);
  if (!r) return;
  r.notes = r.notes.filter(x => x.id !== id);
  changed(path);
}

export const notesOf = (path) => (S.review.files.get(path) || {}).notes || [];

function changed(path) {
  S.review.dirty = true;
  persist();
  emit("review-changed", path);
}

/** レビュー対象とみなすファイル（自動生成やバイナリは数に入れない） */
export function reviewTargets() {
  return [...S.files.values()].filter(f =>
    f.kind === "text" || f.kind === "markdown" || f.kind === "csv");
}

export function progress() {
  const targets = reviewTargets();
  const total = targets.length;
  const done = targets.filter(f => isDone(f.path)).length;
  let notes = 0, flags = 0;
  for (const r of S.review.files.values()) {
    notes += r.notes.length;
    flags += r.notes.filter(n => n.flag).length;
  }
  return { total, done, pct: total ? Math.round(done / total * 100) : 0, notes, flags };
}

export async function restoreReview(key) {
  S.review.files = await loadReview(key);
  emit("review-changed", null);
}

export function clearAll() {
  S.review.files = new Map();
  changed(null);
}

/* ---------- 書き出し ---------- */
export function toMarkdown() {
  const p = progress();
  const now = new Date();
  const stamp = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0") + " " +
    String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

  const out = [];
  out.push("# レビュー記録: " + S.rootName, "");
  out.push("作成日時: " + stamp, "");
  out.push("## 進捗", "");
  out.push("- 確認済み: " + p.done + " / " + p.total + " ファイル（" + p.pct + "%）");
  out.push("- メモ: " + p.notes + " 件（うち要確認 " + p.flags + " 件）");
  out.push("");

  const withNotes = [...S.review.files.entries()]
    .filter(([, r]) => r.notes && r.notes.length)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const flagged = withNotes
    .map(([path, r]) => [path, r.notes.filter(n => n.flag)])
    .filter(([, ns]) => ns.length);

  if (flagged.length) {
    out.push("## 要確認", "");
    for (const [path, ns] of flagged) {
      for (const n of ns) out.push("- `" + path + ":" + n.line + "` — " + oneLine(n.text));
    }
    out.push("");
  }

  if (withNotes.length) {
    out.push("## ファイルごとのメモ", "");
    for (const [path, r] of withNotes) {
      out.push("### " + path);
      out.push("");
      out.push("役割: " + roleOfFile(path) + (r.done ? " / 確認済み" : ""));
      out.push("");
      for (const n of r.notes) {
        out.push("- **" + n.line + " 行目**" + (n.flag ? " ⚠️ 要確認" : "") + ": " + oneLine(n.text));
      }
      out.push("");
    }
  }

  const doneOnly = [...S.review.files.entries()]
    .filter(([, r]) => r.done && (!r.notes || !r.notes.length))
    .map(([path]) => path).sort();
  if (doneOnly.length) {
    out.push("## メモなしで確認済みのファイル", "");
    for (const path of doneOnly) out.push("- `" + path + "`");
    out.push("");
  }

  const remain = reviewTargets().filter(f => !isDone(f.path));
  if (remain.length) {
    out.push("## 未確認（" + remain.length + " ファイル）", "");
    for (const f of remain.slice(0, 200)) out.push("- `" + f.path + "` — " + roleOfFile(f.path));
    if (remain.length > 200) out.push("- …ほか " + (remain.length - 200) + " ファイル");
    out.push("");
  }

  out.push("---", "", "File Review Studio で作成");
  return out.join("\n");
}

const oneLine = (s) => String(s).replace(/\r?\n/g, " / ").trim();

/** ファイル名の候補 */
export const reportFileName = () =>
  "review-" + (baseOf(S.rootName) || "project").replace(/[^\w.-]+/g, "_") + ".md";
