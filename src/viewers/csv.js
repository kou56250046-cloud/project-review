/* =========================================================================
   CSV / TSV の表示
   並べ替え・絞り込みに加えて、列ごとの型と欠損率を出す。
   ========================================================================= */
import Papa from "papaparse";
import { $, $$, esc } from "../core/util.js";

const PAGE = 500;

export function renderCSV(f, body, head) {
  const res = Papa.parse((f.text || "").trim(), { skipEmptyLines: "greedy" });
  const rows = res.data || [];
  if (!rows.length) {
    body.innerHTML = '<div class="center-note">中身が空のようです。</div>';
    return;
  }
  const header = rows[0].map((h, i) => (String(h).trim() || "列" + (i + 1)));
  const data = rows.slice(1);
  const cols = header.length;

  // 列ごとの性質を調べる（型の推定と欠損率）
  const profile = header.map((_, c) => {
    let filled = 0, numeric = 0, dateLike = 0;
    const sample = Math.min(data.length, 400);
    for (let i = 0; i < sample; i++) {
      const v = (data[i][c] ?? "").toString().trim();
      if (!v) continue;
      filled++;
      if (/^-?[\d,]+(\.\d+)?%?$/.test(v)) numeric++;
      else if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(v)) dateLike++;
    }
    const isNum = filled > 0 && numeric / filled > 0.8;
    const isDate = filled > 0 && dateLike / filled > 0.8;
    return {
      numeric: isNum,
      type: isNum ? "num" : isDate ? "date" : "text",
      fill: sample ? filled / sample : 0,
    };
  });

  const tools = document.createElement("div");
  tools.className = "csv-tools";
  tools.innerHTML =
    '<input class="tinput" id="csvq" placeholder="表の中を絞り込み" aria-label="表の中を絞り込み">' +
    '<span class="chip dim" id="csvcount"></span>' +
    '<span class="chip dim">' + cols + " 列</span>" +
    '<span class="head-sp"></span>' +
    '<button class="hbtn" id="csvProf" aria-pressed="true">列の性質を表示</button>';
  body.parentNode.insertBefore(tools, body);

  const scroll = document.createElement("div");
  scroll.className = "csv-scroll";
  const table = document.createElement("table");
  table.className = "csv";
  scroll.appendChild(table);
  body.appendChild(scroll);
  body.style.overflow = "hidden";
  body.style.display = "flex";
  body.style.flexDirection = "column";

  let sortCol = -1, sortDir = 0, filter = "", shown = PAGE, showProf = true;

  function view() {
    let d = data;
    if (filter) {
      const q = filter.toLowerCase();
      d = d.filter(r => r.some(v => String(v).toLowerCase().includes(q)));
    }
    if (sortCol >= 0 && sortDir) {
      const num = profile[sortCol].numeric;
      d = d.slice().sort((a, b) => {
        const x = a[sortCol] ?? "", y = b[sortCol] ?? "";
        const c = num
          ? (parseFloat(String(x).replace(/[,%]/g, "")) || 0) - (parseFloat(String(y).replace(/[,%]/g, "")) || 0)
          : String(x).localeCompare(String(y), "ja");
        return sortDir > 0 ? c : -c;
      });
    }
    return d;
  }

  function draw() {
    const d = view();
    const slice = d.slice(0, shown);
    let h = "<thead><tr><th class='rowno' scope='col'>#</th>";
    header.forEach((hd, i) => {
      const p = profile[i];
      h += "<th data-c='" + i + "' scope='col' class='" + (sortCol === i ? "sorted" : "") + "'>" +
        esc(hd) + "<span class='ar'>" + (sortCol === i ? (sortDir > 0 ? "▲" : "▼") : "⇅") + "</span>" +
        (showProf
          ? "<div class='col-prof'><span class='ty'>" + p.type + "</span>" +
            "<span class='fill' title='入力されている割合 " + Math.round(p.fill * 100) + "%'>" +
            "<i style='width:" + Math.round(p.fill * 100) + "%'></i></span></div>"
          : "") +
        "</th>";
    });
    h += "</tr></thead><tbody>";
    slice.forEach((r, i) => {
      h += "<tr><td class='rowno'>" + (i + 1) + "</td>";
      for (let c = 0; c < cols; c++) {
        const v = r[c] == null ? "" : String(r[c]);
        h += "<td class='" + (profile[c].numeric ? "num" : "") + (v === "" ? " empty" : "") +
          "' title='" + esc(v) + "'>" + (v === "" ? "—" : esc(v)) + "</td>";
      }
      h += "</tr>";
    });
    h += "</tbody>";
    table.innerHTML = h;

    $$("thead th[data-c]", table).forEach(th => {
      th.onclick = () => {
        const c = +th.dataset.c;
        if (sortCol === c) {
          sortDir = sortDir === 1 ? -1 : (sortDir === -1 ? 0 : 1);
          if (!sortDir) sortCol = -1;
        } else { sortCol = c; sortDir = 1; }
        draw();
      };
    });

    $("#csvcount", tools).textContent =
      d.length.toLocaleString() + " 行" +
      (d.length > slice.length ? "（" + slice.length.toLocaleString() + " 行を表示中）" : "");

    const old = scroll.querySelector(".more-btn");
    if (old) old.remove();
    if (d.length > slice.length) {
      const b = document.createElement("button");
      b.className = "more-btn";
      b.textContent = "さらに " + PAGE + " 行を表示";
      b.onclick = () => { shown += PAGE; draw(); };
      scroll.appendChild(b);
    }
  }

  $("#csvq", tools).addEventListener("input", (e) => { filter = e.target.value; shown = PAGE; draw(); });
  $("#csvProf", tools).onclick = (e) => {
    showProf = !showProf;
    e.target.setAttribute("aria-pressed", String(showProf));
    draw();
  };

  if (head) {
    const info = document.createElement("span");
    info.className = "chip dim";
    info.textContent = data.length.toLocaleString() + " 行";
    head.insertBefore(info, head.querySelector(".head-sp"));
  }

  draw();
}
