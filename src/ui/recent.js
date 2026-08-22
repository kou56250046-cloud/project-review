/* =========================================================================
   最近開いたプロジェクト
   対応ブラウザ（Chrome / Edge）ではフォルダのハンドルを覚えておけるので、
   次からは一覧をクリックするだけで開き直せる。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, fmtWhen } from "../core/util.js";
import { listProjects, forgetProject, rememberProject } from "../core/persist.js";
import { canUseFsApi, ensurePermission, walkHandle } from "../core/ingest.js";

export async function renderRecent() {
  const host = $("#recentList");
  if (!host) return;
  const list = await listProjects();
  const box = host.closest(".recent");
  if (!list.length) { if (box) box.style.display = "none"; return; }
  if (box) box.style.display = "";

  host.innerHTML = list.slice(0, 6).map(p =>
    '<div class="recent-item" data-k="' + esc(p.key) + '">' +
    '<span style="color:#c09553">▮</span>' +
    '<span class="nm" title="' + esc(p.key) + '">' + esc(p.name) + "</span>" +
    '<span class="when">' + (p.fileCount ? p.fileCount + " ファイル · " : "") + fmtWhen(p.at) + "</span>" +
    '<button class="del" title="一覧から削除" aria-label="一覧から削除">✕</button></div>').join("");

  $$(".recent-item", host).forEach(el => {
    el.onclick = async (e) => {
      if (e.target.classList.contains("del")) {
        await forgetProject(el.dataset.k);
        renderRecent();
        return;
      }
      const rec = list.find(p => p.key === el.dataset.k);
      if (!rec) return;
      reopen(rec);
    };
  });
}

export async function reopen(rec) {
  if (!rec.handle) {
    actions.toast("このブラウザではフォルダを覚えておけません。もう一度フォルダを選んでください");
    $("#pickFolder").click();
    return;
  }
  const ok = await ensurePermission(rec.handle);
  if (!ok) { actions.toast("フォルダを読む許可が得られませんでした"); return; }
  actions.reload({ handle: rec.handle, name: rec.name, key: rec.key });
}

/** 今開いているプロジェクトを記録する */
export async function remember() {
  if (!S.rootKey) return;
  await rememberProject({
    key: S.rootKey,
    name: S.rootName,
    handle: S.dirHandle || null,
    at: Date.now(),
    fileCount: S.files.size,
  });
  renderRecent();
}

/** フォルダ選択（File System Access API があればそちらを使う） */
export async function pickFolder() {
  if (!canUseFsApi) { $("#pickFolder").click(); return; }
  try {
    const handle = await window.showDirectoryPicker({ mode: "read", id: "frs-project" });
    const entries = await walkHandle(handle, handle.name + "/");
    actions.reload({ handle, name: handle.name, key: handle.name, entries });
  } catch (e) {
    if (e && e.name === "AbortError") return;   // 利用者が取り消しただけ
    // うまくいかないときは従来のフォルダ選択に戻す
    $("#pickFolder").click();
  }
}
