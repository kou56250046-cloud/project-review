/* =========================================================================
   関係グラフ（力学的に配置して、参照のつながりを俯瞰する）
   ========================================================================= */
import { S, actions } from "../core/state.js";
import { $, $$, esc, colorOf, baseOf, dirOf, fmtSize } from "../core/util.js";
import { roleOfFile } from "../core/roles.js";

export function buildGraphPane(pane) {
  const tools = document.createElement("div");
  tools.className = "graph-tools";
  tools.innerHTML =
    '<label><input type="checkbox" id="gAll"> 参照のないファイルも表示</label>' +
    '<label><input type="checkbox" id="gLabels" checked> ファイル名を表示</label>' +
    '<label>フォルダ: <select id="gDir" aria-label="表示するフォルダ"></select></label>' +
    '<button class="hbtn" id="gRelayout">配置しなおす</button>' +
    '<button class="hbtn" id="gFit">全体を表示</button>' +
    '<span class="chip dim" id="gInfo"></span>';
  pane.appendChild(tools);

  const stage = document.createElement("div");
  stage.className = "graph-stage";
  stage.innerHTML =
    '<svg role="img" aria-label="ファイルの参照関係の図"><g id="gz"><g id="glinks"></g><g id="gnodes"></g></g></svg>' +
    '<div class="gtip" role="status"></div><div class="legend"></div>';
  pane.appendChild(stage);

  const dirSel = $("#gDir", tools);
  const topDirs = new Set(["すべて"]);
  for (const p of S.files.keys()) {
    const parts = p.split("/");
    if (parts.length > 2) topDirs.add(parts.slice(0, 2).join("/"));
    else if (parts.length > 1) topDirs.add(parts[0]);
  }
  [...topDirs].forEach(d => {
    const o = document.createElement("option");
    o.value = d; o.textContent = d;
    dirSel.appendChild(o);
  });

  const svg = stage.querySelector("svg");
  const gz = stage.querySelector("#gz");
  const gl = stage.querySelector("#glinks");
  const gn = stage.querySelector("#gnodes");
  const tip = stage.querySelector(".gtip");
  let view = { x: 0, y: 0, k: 1 }, raf = null, nodes = [], links = [];

  function build() {
    const showAll = $("#gAll", tools).checked;
    const dirF = dirSel.value;
    const inGraph = new Set();
    S.edges.forEach(e => { inGraph.add(e.from); inGraph.add(e.to); });
    let list = [...S.files.keys()].filter(p => (showAll ? true : inGraph.has(p)));
    if (dirF && dirF !== "すべて") list = list.filter(p => p.startsWith(dirF + "/") || p === dirF);
    if (list.length > 400) list = list.slice(0, 400);
    const set = new Set(list);
    const W = stage.clientWidth || 900, H = stage.clientHeight || 600;
    nodes = list.map((p, i) => {
      const a = i * 2.399963;      // 黄金角に沿って初期配置すると重なりにくい
      const r = 12 * Math.sqrt(i + 1);
      return { id: p, x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a), vx: 0, vy: 0, deg: 0 };
    });
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    links = S.edges
      .filter(e => set.has(e.from) && set.has(e.to))
      .map(e => ({ s: idx.get(e.from), t: idx.get(e.to), kind: e.kind }));
    links.forEach(l => { nodes[l.s].deg++; nodes[l.t].deg++; });
    $("#gInfo", tools).textContent = nodes.length + " ノード · " + links.length + " 本のつながり";
    draw();
    kick();
  }

  function draw() {
    const showLabels = $("#gLabels", tools).checked && nodes.length <= 160;
    gl.innerHTML = links.map((l, i) => '<path class="glink" id="gl' + i + '" />').join("");
    gn.innerHTML = nodes.map((n, i) => {
      const f = S.files.get(n.id);
      const r = 4.5 + Math.min(9, n.deg * 1.25);
      return '<g class="gnode" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(baseOf(n.id)) + '">' +
        '<circle r="' + r + '" fill="' + colorOf(f ? f.ext : "") + '"></circle>' +
        (showLabels ? '<text dy="' + (r + 11) + '" text-anchor="middle">' + esc(baseOf(n.id)) + "</text>" : "") +
        "</g>";
    }).join("");
    const legend = stage.querySelector(".legend");
    const exts = [...new Set(nodes.map(n => (S.files.get(n.id) || {}).ext).filter(Boolean))].slice(0, 12);
    legend.innerHTML = exts.map(e =>
      '<span><i style="background:' + colorOf(e) + '"></i>' + esc(e) + "</span>").join("") ||
      "<span>表示するファイルがありません</span>";
    wire();
    paint();
  }

  function step() {
    const W = stage.clientWidth || 900, H = stage.clientHeight || 600;
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - .5; dy = Math.random() - .5; }
        if (d2 > 160000) continue;
        const f = 1400 / d2;
        const d = Math.sqrt(d2);
        const fx = f * dx / d, fy = f * dy / d;
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
      }
    }
    for (const l of links) {
      const a = nodes[l.s], b = nodes[l.t];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 110) * 0.012;
      const fx = f * dx / d, fy = f * dy / d;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      if (n.pin) { n.vx = 0; n.vy = 0; continue; }
      n.vx += (cx - n.x) * 0.004; n.vy += (cy - n.y) * 0.004;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-18, Math.min(18, n.vx));
      n.y += Math.max(-18, Math.min(18, n.vy));
    }
  }

  function paint() {
    for (let i = 0; i < links.length; i++) {
      const a = nodes[links[i].s], b = nodes[links[i].t];
      const el = gl.children[i];
      if (!a || !b || !el) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.12;
      el.setAttribute("d", "M" + a.x + "," + a.y + " Q" + mx + "," + my + " " + b.x + "," + b.y);
    }
    for (let i = 0; i < nodes.length; i++) {
      const g = gn.children[i];
      if (g) g.setAttribute("transform", "translate(" + nodes[i].x + "," + nodes[i].y + ")");
    }
    gz.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")");
  }

  let ticks = 0;
  function kick() { ticks = 0; if (!raf) loop(); }
  function loop() {
    step(); paint(); ticks++;
    if (ticks < 420) raf = requestAnimationFrame(loop);
    else raf = null;
  }

  function fit() {
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = stage.clientWidth || 900, H = stage.clientHeight || 600;
    // ノードが少ないときに拡大しすぎないよう、上限を抑える
    const k = Math.min(1.5, Math.max(0.15, Math.min(W / (maxX - minX + 160), H / (maxY - minY + 160))));
    view.k = k;
    view.x = W / 2 - ((minX + maxX) / 2) * k;
    view.y = H / 2 - ((minY + maxY) / 2) * k;
    paint();
  }

  function highlight(i) {
    const conn = new Set([i]);
    links.forEach((l, li) => {
      const on = l.s === i || l.t === i;
      gl.children[li].classList.toggle("hi", on);
      gl.children[li].classList.toggle("fade", !on);
      if (on) { conn.add(l.s); conn.add(l.t); }
    });
    $$(".gnode", gn).forEach((g2, j) => {
      g2.classList.toggle("hi", j === i);
      g2.classList.toggle("fade", !conn.has(j));
    });
  }
  function clearHighlight() {
    tip.style.display = "none";
    $$(".glink", gl).forEach(e => e.classList.remove("hi", "fade"));
    $$(".gnode", gn).forEach(e => e.classList.remove("hi", "fade"));
  }

  function wire() {
    $$(".gnode", gn).forEach(g => {
      const i = +g.dataset.i;
      const showTip = () => {
        const id = nodes[i].id;
        const f = S.files.get(id);
        const outs = (S.outMap.get(id) || []).length, ins = (S.inMap.get(id) || []).length;
        tip.style.display = "block";
        tip.innerHTML = "<b>" + esc(baseOf(id)) + "</b><br>" + esc(dirOf(id) || "(ルート)") +
          "<br>役割: " + esc(roleOfFile(id)) +
          "<br>参照 " + outs + " / 被参照 " + ins + " · " + (f ? fmtSize(f.size) : "");
        highlight(i);
      };
      g.onmouseenter = showTip;
      g.onfocus = showTip;
      g.onblur = clearHighlight;
      g.onmousemove = (ev) => {
        const r = stage.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 350) + "px";
        tip.style.top = (ev.clientY - r.top + 14) + "px";
      };
      g.onmouseleave = clearHighlight;
      g.onclick = () => actions.openFile(nodes[i].id);
      g.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.openFile(nodes[i].id); } };
      g.onmousedown = (ev) => {
        ev.stopPropagation();
        const n = nodes[i];
        n.pin = true;
        const move = (e2) => {
          const r = stage.getBoundingClientRect();
          n.x = (e2.clientX - r.left - view.x) / view.k;
          n.y = (e2.clientY - r.top - view.y) / view.k;
          paint();
        };
        const up = () => {
          n.pin = false;
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          kick();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      };
    });
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = Math.max(0.15, Math.min(4, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    view.x = mx - (mx - view.x) * (k2 / view.k);
    view.y = my - (my - view.y) * (k2 / view.k);
    view.k = k2;
    paint();
  }, { passive: false });

  svg.addEventListener("mousedown", (e) => {
    svg.classList.add("drag");
    const sx = e.clientX - view.x, sy = e.clientY - view.y;
    const move = (e2) => { view.x = e2.clientX - sx; view.y = e2.clientY - sy; paint(); };
    const up = () => {
      svg.classList.remove("drag");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });

  $("#gAll", tools).onchange = build;
  $("#gLabels", tools).onchange = draw;
  dirSel.onchange = build;
  $("#gRelayout", tools).onclick = build;
  $("#gFit", tools).onclick = fit;
  setTimeout(build, 40);
}
