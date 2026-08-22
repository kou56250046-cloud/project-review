/* =========================================================================
   レビューパネル
   進捗と、これまでに書いたメモの一覧。結果は Markdown で書き出せる。
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, baseOf, saveAs, fmtWhen } from "../core/util.js";
import { progress, toMarkdown, reportFileName, clearAll, reviewTargets, isDone } from "../core/review.js";

export function renderReviewPanel() {
  const host = $("#rvBody");
  if (!S.files.size) {
    host.innerHTML = '<div class="empty-note">フォルダを開くと、レビューの進み具合をここに表示します。</div>';
    return;
  }
  const p = progress();

  let h =
    '<div class="rv-progress">' +
      '<div class="bar" role="progressbar" aria-valuenow="' + p.pct + '" aria-valuemin="0" aria-valuemax="100">' +
        '<i style="width:' + p.pct + '%"></i></div>' +
      '<div class="cap"><span>確認済み ' + p.done + " / " + p.total + "</span><span>" + p.pct + "%</span></div>" +
    "</div>";

  h += '<div class="rv-progress" style="padding-top:0"><div class="cap">' +
    "<span>メモ " + p.notes + " 件</span>" +
    (p.flags ? '<span style="color:var(--rv-flag)">要確認 ' + p.flags + " 件</span>" : "<span></span>") +
    "</div></div>";

  const entries = [...S.review.files.entries()]
    .filter(([, r]) => r.notes && r.notes.length)
    .sort((a, b) => {
      const fa = a[1].notes.some(n => n.flag) ? 0 : 1;
      const fb = b[1].notes.some(n => n.flag) ? 0 : 1;
      return fa - fb || a[0].localeCompare(b[0]);
    });

  if (entries.length) {
    h += '<div class="rel-group">メモの一覧</div>';
    for (const [path, r] of entries) {
      for (const n of r.notes) {
        h += '<div class="rv-note' + (n.flag ? " flag" : "") + '" data-p="' + esc(path) + '" data-l="' + n.line + '">' +
          '<div class="hd">' + (n.flag ? "⚠ " : "") + esc(baseOf(path)) + ":" + n.line +
          '<span style="margin-left:auto;color:var(--fg-dim)">' + fmtWhen(n.at) + "</span></div>" +
          '<div class="bd">' + esc(n.text) + "</div></div>";
      }
    }
  } else {
    h += '<div class="empty-note">コードの行番号の右にある「＋」から、気づいたことをメモできます。</div>';
  }

  const remain = reviewTargets().filter(f => !isDone(f.path));
  if (remain.length) {
    h += '<div class="rel-group">未確認（' + remain.length + "）</div>";
    h += remain.slice(0, 40).map(f =>
      '<div class="rel-item" data-p="' + esc(f.path) + '" title="' + esc(f.path) + '">' +
      '<span style="color:var(--fg-dim)">○</span>' + esc(f.name) + "</div>").join("");
  }

  host.innerHTML = h;
  $$("[data-p]", host).forEach(el => {
    el.onclick = () => actions.openFile(el.dataset.p, el.dataset.l ? { line: +el.dataset.l } : undefined);
  });
}

export function initReviewPanel() {
  $("#btnExportReview").onclick = () => {
    if (!S.files.size) { actions.toast("先にフォルダを開いてください"); return; }
    saveAs(reportFileName(), toMarkdown(), "text/markdown;charset=utf-8");
    actions.toast("レビュー記録を書き出しました");
  };
  $("#btnReport").onclick = () => actions.openReport();
  $("#btnClearReview").onclick = () => {
    const p = progress();
    if (!p.done && !p.notes) { actions.toast("消す記録がありません"); return; }
    if (!confirm("このプロジェクトのレビュー記録（確認済み " + p.done + " 件 / メモ " + p.notes + " 件）を消します。よろしいですか？")) return;
    clearAll();
    actions.toast("レビュー記録を消しました");
  };
}
