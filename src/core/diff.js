/* =========================================================================
   行単位の差分（外部ライブラリなし）
   共通の先頭・末尾を落としてから LCS をとる。
   大きすぎる比較は諦めて、その旨を返す。
   ========================================================================= */

const MAX_CELLS = 4_000_000;   // LCS 表の上限（約 2000 x 2000 行）

/**
 * @returns {{ok:boolean, rows:{t:"same"|"add"|"del", a:number|null, b:number|null, s:string}[], added:number, removed:number, reason?:string}}
 */
export function diffLines(aText, bText) {
  const A = String(aText ?? "").split("\n");
  const B = String(bText ?? "").split("\n");

  // 先頭の一致
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  // 末尾の一致
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head &&
         A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;

  const a = A.slice(head, A.length - tail);
  const b = B.slice(head, B.length - tail);

  if (a.length * b.length > MAX_CELLS) {
    return { ok: false, rows: [], added: 0, removed: 0,
      reason: "差分が大きすぎるため比較できません（変化した行が " + Math.max(a.length, b.length).toLocaleString() + " 行）" };
  }

  const rows = [];
  for (let i = 0; i < head; i++) rows.push({ t: "same", a: i + 1, b: i + 1, s: A[i] });

  const mid = lcsDiff(a, b, head);
  rows.push(...mid.rows);

  for (let i = 0; i < tail; i++) {
    const ai = A.length - tail + i, bi = B.length - tail + i;
    rows.push({ t: "same", a: ai + 1, b: bi + 1, s: A[ai] });
  }
  return { ok: true, rows, added: mid.added, removed: mid.removed };
}

function lcsDiff(a, b, offset) {
  const n = a.length, m = b.length;
  const rows = [];
  let added = 0, removed = 0;

  if (!n && !m) return { rows, added, removed };
  if (!n) {
    for (let j = 0; j < m; j++) { rows.push({ t: "add", a: null, b: offset + j + 1, s: b[j] }); added++; }
    return { rows, added, removed };
  }
  if (!m) {
    for (let i = 0; i < n; i++) { rows.push({ t: "del", a: offset + i + 1, b: null, s: a[i] }); removed++; }
    return { rows, added, removed };
  }

  // LCS の長さ表（Uint32 で確保）
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ t: "same", a: offset + i + 1, b: offset + j + 1, s: a[i] });
      i++; j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      rows.push({ t: "del", a: offset + i + 1, b: null, s: a[i] });
      removed++; i++;
    } else {
      rows.push({ t: "add", a: null, b: offset + j + 1, s: b[j] });
      added++; j++;
    }
  }
  while (i < n) { rows.push({ t: "del", a: offset + i + 1, b: null, s: a[i] }); removed++; i++; }
  while (j < m) { rows.push({ t: "add", a: null, b: offset + j + 1, s: b[j] }); added++; j++; }
  return { rows, added, removed };
}

/** 変化のない行を畳んで、前後 n 行だけ残す */
export function collapseSame(rows, context = 3) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length <= context * 2 + 2) out.push(...run);
    else {
      out.push(...run.slice(0, context));
      out.push({ t: "gap", n: run.length - context * 2 });
      out.push(...run.slice(-context));
    }
    run = [];
  };
  for (const r of rows) {
    if (r.t === "same") run.push(r);
    else { flush(); out.push(r); }
  }
  flush();
  return out;
}
