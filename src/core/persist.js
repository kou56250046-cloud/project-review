/* =========================================================================
   保存（すべてブラウザの中で完結する。外部へは何も送らない）
     - settings : 見た目や動作の設定
     - projects : 最近開いたプロジェクト（対応ブラウザではフォルダのハンドルも）
     - reviews  : レビューのメモと確認済みの記録
   ========================================================================= */

const DB_NAME = "file-review-studio";
const DB_VER = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("IndexedDB が使えません")); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
      if (!db.objectStoreNames.contains("reviews")) db.createObjectStore("reviews");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch (e) {
    console.warn("保存できませんでした:", e);
    return undefined;
  }
}

export const idbGet = (store, key) => tx(store, "readonly", s => s.get(key));
export const idbSet = (store, key, val) => tx(store, "readwrite", s => s.put(val, key));
export const idbDel = (store, key) => tx(store, "readwrite", s => s.delete(key));
export const idbAll = (store) => tx(store, "readonly", s => s.getAll());
export const idbKeys = (store) => tx(store, "readonly", s => s.getAllKeys());

/* =========================================================================
   設定（起動時に必ず要るので localStorage も併用して即座に反映する）
   ========================================================================= */
const SETTINGS_KEY = "frs.settings";

export const DEFAULT_SETTINGS = {
  theme: "system",        // system | light | dark
  uiScale: 13,            // px
  codeScale: 13,
  proseScale: 15,
  lineHeight: 20,
  proseWidth: 860,
  ignoreHeavy: true,
  showRoles: true,
  wrapCode: false,
  restoreLast: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 保存できなくても動作は続ける */ }
}

/* =========================================================================
   最近開いたプロジェクト
   ========================================================================= */
export async function rememberProject(rec) {
  const list = (await idbAll("projects")) || [];
  const keep = list.filter(p => p.key !== rec.key).sort((a, b) => b.at - a.at).slice(0, 11);
  await idbSet("projects", rec.key, rec);
  // 12 件を超えたぶんは捨てる
  for (const old of keep.slice(11)) await idbDel("projects", old.key);
}

export async function listProjects() {
  const list = (await idbAll("projects")) || [];
  return list.sort((a, b) => b.at - a.at);
}

export const forgetProject = (key) => idbDel("projects", key);

/* =========================================================================
   レビュー内容
   ========================================================================= */
export async function loadReview(key) {
  const rec = await idbGet("reviews", key);
  if (!rec) return new Map();
  return new Map(Object.entries(rec.files || {}));
}

export async function saveReview(key, filesMap) {
  const obj = {};
  for (const [k, v] of filesMap) {
    if (!v) continue;
    if (!v.done && (!v.notes || !v.notes.length)) continue;   // 空の記録は残さない
    obj[k] = v;
  }
  await idbSet("reviews", key, { key, files: obj, updatedAt: Date.now() });
}

export const clearReview = (key) => idbDel("reviews", key);
