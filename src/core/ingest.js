/* =========================================================================
   フォルダ・ファイルの読み込み
   大きなプロジェクトでも固まらないよう、進捗を出しながら少しずつ読む。
   ========================================================================= */
import { S, emit } from "./state.js";
import { normPath, baseOf, dirOf, extOf, kindOf, isTextKind } from "./util.js";

export const HEAVY = ["node_modules", ".git", ".svn", "__pycache__", ".venv", "venv",
  ".cache", ".DS_Store", ".idea", ".pytest_cache", ".mypy_cache", ".gradle", ".terraform",
  "dist", "build", ".next", ".nuxt", ".output", "coverage", ".turbo", ".parcel-cache"];

/** 除外の既定に入れるが、利用者が明示的に開いたときは尊重するもの */
const ALWAYS_SKIP = [".DS_Store", "Thumbs.db"];

export const isHeavy = (name) => HEAVY.includes(name);

const MAX_TEXT = 2 * 1024 * 1024;   // これを超えるテキストは解析対象から外す
const READ_CONCURRENCY = 24;        // 同時に読むファイル数

/* ---------- 進捗 ---------- */
function progress(done, total, label) {
  emit("progress", { done, total, label });
}

/**
 * 読み込みの本体。
 * entries は {file, path} の配列。
 */
export async function ingest(entries, opts = {}) {
  if (!entries.length) return;
  let skipped = 0;

  for (const { file, path } of entries) {
    const p = normPath(path);
    if (!p) continue;
    if (ALWAYS_SKIP.includes(baseOf(p))) { skipped++; continue; }
    if (S.ignoreHeavy && p.split("/").some(isHeavy)) { skipped++; continue; }
    S.files.set(p, {
      path: p, name: baseOf(p), dir: dirOf(p), ext: extOf(p),
      size: file.size, file, kind: kindOf(p), text: null,
      mtime: file.lastModified || 0,
    });
  }

  const first = [...S.files.keys()][0] || "";
  S.rootName = opts.rootName || (first.includes("/") ? first.split("/")[0] : (S.rootName || "選択したファイル"));
  S.rootKey = opts.rootKey || S.rootName;

  // 解析材料としてテキストを先読みする（並列度を絞って進捗を出す）
  const targets = [...S.files.values()].filter(
    f => f.text === null && isTextKind(f.kind) && f.size <= MAX_TEXT
  );
  let done = 0;
  progress(0, targets.length, "ファイルを読み込んでいます");

  for (let i = 0; i < targets.length; i += READ_CONCURRENCY) {
    const batch = targets.slice(i, i + READ_CONCURRENCY);
    await Promise.all(batch.map(f =>
      f.file.text().then(t => { f.text = t; }).catch(() => { f.text = ""; })
    ));
    done += batch.length;
    progress(done, targets.length, "ファイルを読み込んでいます");
    // 画面を固めないよう、バッチごとに制御を返す
    if (i % (READ_CONCURRENCY * 8) === 0) await new Promise(r => setTimeout(r, 0));
  }
  progress(targets.length, targets.length, "");

  emit("ingested", { skipped, count: S.files.size });
  return { skipped, count: S.files.size };
}

/* ---------- 入力の受け口 ---------- */
export function fromInput(fileList) {
  return [...fileList].map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
}

export async function fromDataTransfer(dt) {
  // File System Access API が使えるならハンドルを取り、再読み込みできるようにする
  if (dt.items && dt.items.length && dt.items[0].getAsFileSystemHandle) {
    try {
      const handles = await Promise.all([...dt.items]
        .filter(i => i.kind === "file")
        .map(i => i.getAsFileSystemHandle()));
      const dir = handles.find(h => h && h.kind === "directory");
      if (dir) return { handle: dir, entries: await walkHandle(dir, "") };
    } catch { /* 取れなければ従来の方式にする */ }
  }
  const out = [];
  const items = [...dt.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!items.length) return { entries: [...dt.files].map(f => ({ file: f, path: f.name })) };
  for (const it of items) await walkEntry(it, "", out);
  return { entries: out };
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const f = await new Promise(res => entry.file(res, () => res(null)));
    if (f) out.push({ file: f, path: prefix + entry.name });
    return;
  }
  if (entry.isDirectory) {
    if (S.ignoreHeavy && isHeavy(entry.name)) return;
    const reader = entry.createReader();
    let all = [];
    while (true) {
      const batch = await new Promise(res => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      all = all.concat(batch);
    }
    for (const e of all) await walkEntry(e, prefix + entry.name + "/", out);
  }
}

/* ---------- File System Access API ---------- */
export const canUseFsApi = typeof window !== "undefined" && "showDirectoryPicker" in window;

/** ディレクトリハンドルを辿って {file, path} の配列にする */
export async function walkHandle(dirHandle, prefix) {
  const out = [];
  const stack = [[dirHandle, prefix || dirHandle.name + "/"]];
  let scanned = 0;
  while (stack.length) {
    const [dir, base] = stack.pop();
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "directory") {
        if (S.ignoreHeavy && isHeavy(name)) continue;
        stack.push([handle, base + name + "/"]);
      } else {
        try {
          const file = await handle.getFile();
          out.push({ file, path: base + name });
        } catch { /* 読めないファイルは飛ばす */ }
        if (++scanned % 200 === 0) progress(scanned, 0, "フォルダを走査しています");
      }
    }
  }
  return out;
}

/** ハンドルの読み取り許可を確かめる（必要なら聞き直す） */
export async function ensurePermission(handle) {
  if (!handle || !handle.queryPermission) return true;
  const opts = { mode: "read" };
  if (await handle.queryPermission(opts) === "granted") return true;
  return await handle.requestPermission(opts) === "granted";
}
