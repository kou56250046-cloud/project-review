/* =========================================================================
   気づきパネル
     - 読む順番の提案
     - 見つからない参照（リンク切れ）
     - 循環参照
     - どこからも参照されていないファイル
   ふつうのエディタでは出てこない、プロジェクト全体を眺めたときの発見。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, baseOf } from "../core/util.js";
import { isDone } from "../core/review.js";

export function renderInsights() {
  const host = $("#insBody");
  if (!S.files.size) {
    host.innerHTML = '<div class="empty-note">フォルダを開くと、気づいた点をここに並べます。</div>';
    return;
  }

  const parts = [];

  /* 読む順番 */
  if (S.readOrder.length) {
    parts.push(group("読む順番の提案（" + S.readOrder.length + "）",
      "依存関係から、理解しやすい順に並べています"));
    parts.push(S.readOrder.slice(0, 25).map((o, i) =>
      '<div class="rel-item" data-p="' + esc(o.path) + '" title="' + esc(o.why) + '">' +
      '<span style="color:var(--fg-dim);font-family:var(--mono);font-size:11px;min-width:20px">' +
      String(i + 1).padStart(2, "0") + "</span>" +
      '<span style="' + (isDone(o.path) ? "text-decoration:line-through;color:var(--fg-dim)" : "") + '">' +
      esc(baseOf(o.path)) + "</span>" +
      '<span class="pathdim">' + esc(o.why) + "</span></div>").join(""));
    if (S.readOrder.length > 25) {
      parts.push('<div class="empty-note" style="padding:4px 14px">…ほか ' +
        (S.readOrder.length - 25) + " 件。すべては概要ページで見られます。</div>");
    }
  }

  /* リンク切れ */
  if (S.missing.length) {
    parts.push(group("見つからない参照（" + S.missing.length + "）",
      "書かれているのに実体が見あたらないパス"));
    parts.push(S.missing.slice(0, 60).map(m =>
      '<div class="diag-item err" data-p="' + esc(m.from) + '" data-l="' + m.line + '">' +
      '<span class="sev">✕</span>' +
      '<span class="msg">' + esc(m.spec) + "</span>" +
      '<span class="where">' + esc(baseOf(m.from)) + ":" + m.line + "</span></div>").join(""));
  }

  /* 循環参照 */
  if (S.cycles.length) {
    parts.push(group("循環参照（" + S.cycles.length + "）",
      "たがいに参照し合っているため、読み解きにくくなりがちな箇所"));
    parts.push(S.cycles.slice(0, 20).map(cy =>
      '<div class="diag-item warn" data-p="' + esc(cy[0]) + '">' +
      '<span class="sev">↻</span>' +
      '<span class="msg">' + esc(cy.map(baseOf).join(" → ")) + "</span></div>").join(""));
  }

  /* 孤立ファイル */
  if (S.orphans.length) {
    parts.push(group("どこからも参照されていない（" + S.orphans.length + "）",
      "使われていない可能性がある。入口や設定ファイルは除いています"));
    parts.push(S.orphans.slice(0, 60).map(o =>
      '<div class="diag-item warn" data-p="' + esc(o.path) + '">' +
      '<span class="sev">○</span>' +
      '<span class="msg">' + esc(baseOf(o.path)) + "</span>" +
      '<span class="where">' + esc(o.role) + "</span></div>").join(""));
  }

  if (parts.length === 0) {
    host.innerHTML = '<div class="empty-note">気になる点は見つかりませんでした。</div>';
    return;
  }

  host.innerHTML = parts.join("");
  $$("[data-p]", host).forEach(el => {
    el.onclick = () => actions.openFile(el.dataset.p, el.dataset.l ? { line: +el.dataset.l } : undefined);
  });
}

function group(title, lead) {
  return '<div class="rel-group">' + esc(title) + "</div>" +
    (lead ? '<div class="empty-note" style="padding:0 14px 6px;font-size:11.5px">' + esc(lead) + "</div>" : "");
}

/** アクティビティバーの数字（気づきの件数） */
export function insightCount() {
  return S.missing.length + S.cycles.length;
}
