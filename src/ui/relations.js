/* =========================================================================
   関係パネル（開いているファイルの前後関係）
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, colorOf, baseOf, dirOf } from "../core/util.js";

export function renderRelationsPanel() {
  const host = $("#relBody");
  if (!S.active || S.active.kind !== "file") {
    host.innerHTML = '<div class="empty-note">ファイルを開くと、そのファイルの参照関係を表示します。</div>';
    return;
  }
  const p = S.active.path;
  const outs = S.outMap.get(p) || [];
  const ins = S.inMap.get(p) || [];
  const ext = S.externals.get(p);
  const broken = S.missing.filter(m => m.from === p);

  let h = '<div class="rel-group">このファイルが参照している（' + outs.length + "）</div>";
  h += outs.length
    ? outs.map(e => item(e.to)).join("")
    : '<div class="empty-note" style="padding:2px 14px 8px">なし</div>';

  h += '<div class="rel-group">このファイルを参照している（' + ins.length + "）</div>";
  h += ins.length
    ? ins.map(e => item(e.from)).join("")
    : '<div class="empty-note" style="padding:2px 14px 8px">なし</div>';

  if (broken.length) {
    h += '<div class="rel-group">見つからない参照（' + broken.length + "）</div>";
    h += broken.map(m =>
      '<div class="diag-item err" data-l="' + m.line + '">' +
      '<span class="sev">✕</span><span class="msg">' + esc(m.spec) + "</span>" +
      '<span class="where">' + m.line + ' 行目</span></div>').join("");
  }

  if (ext && ext.size) {
    h += '<div class="rel-group">外部パッケージ（' + ext.size + "）</div>";
    h += [...ext].map(p2 =>
      '<div class="rel-item" style="cursor:default"><span style="color:var(--purple)">◇</span>' +
      esc(p2) + "</div>").join("");
  }

  host.innerHTML = h;
  $$(".rel-item[data-p]", host).forEach(el => { el.onclick = () => actions.openFile(el.dataset.p); });
  $$(".diag-item[data-l]", host).forEach(el => {
    el.onclick = () => actions.openFile(p, { line: +el.dataset.l });
  });
}

function item(path) {
  const f = S.files.get(path);
  return '<div class="rel-item" data-p="' + esc(path) + '" title="' + esc(path) + '">' +
    '<span style="color:' + colorOf(f ? f.ext : "") + '">◆</span>' + esc(baseOf(path)) +
    '<span class="pathdim">' + esc(dirOf(path)) + "</span></div>";
}
