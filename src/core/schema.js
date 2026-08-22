/* =========================================================================
   ER 図の材料をコードから拾う
     - SQL の CREATE TABLE
     - Prisma schema の model
     - Django の models.Model
     - SQLAlchemy の Base 継承クラス
     - TypeORM の @Entity()
   構文解析はせず行ベースで拾うので、取りこぼしは出る。
   拾えた根拠（どのファイルの何行目か）を必ず添えて、確かめられるようにする。
   ========================================================================= */
import { S } from "./state.js";
import { isGenerated } from "./roles.js";

/** @typedef {{name:string, type:string, key:string}} Column */
/** @typedef {{name:string, columns:Column[], file:string, line:number, source:string}} Table */
/** @typedef {{from:string, to:string, kind:string, label:string, file:string}} Rel */

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** Mermaid の識別子として安全な形にする */
const safeName = (s) => String(s).replace(/["`\[\]]/g, "").replace(/[^\w぀-ヿ一-龯]/g, "_").slice(0, 60) || "T";
/**
 * Mermaid の属性型はカンマや括弧を受け付けないので、型名だけにする。
 * DECIMAL(10,2) のような桁指定は size として別に持ち、注記として添える。
 */
function splitType(raw) {
  const t = String(raw || "").replace(/\s+/g, "");
  const m = t.match(/^([\w]+)\(([^)]*)\)$/);
  const name = (m ? m[1] : t).replace(/[^\w]/g, "").slice(0, 30) || "unknown";
  const size = m ? m[2].replace(/[^\d,]/g, "") : "";
  return { name, size };
}
const safeType = (s) => splitType(s).name;

/**
 * 読み込み済みのファイルからテーブル定義と関係を集める。
 * @returns {{tables:Table[], rels:Rel[], sources:string[]}}
 */
export function extractSchema() {
  const tables = [];
  const rels = [];
  const sources = new Set();

  for (const f of S.files.values()) {
    if (!f.text || isGenerated(f.path)) continue;
    let found = 0;
    if (f.ext === "sql") found += fromSQL(f, tables, rels);
    else if (f.ext === "prisma") found += fromPrisma(f, tables, rels);
    else if (f.ext === "py") found += fromPython(f, tables, rels);
    else if (["ts", "js", "tsx", "jsx"].includes(f.ext)) found += fromTypeORM(f, tables, rels);
    if (found) sources.add(f.path);
  }

  // 同じ名前のテーブルが複数から拾えたときは、列が多いほうを残す
  const byName = new Map();
  for (const t of tables) {
    const cur = byName.get(t.name);
    if (!cur || t.columns.length > cur.columns.length) byName.set(t.name, t);
  }
  const uniq = [...byName.values()];
  const names = new Set(uniq.map(t => t.name));

  // 実在しないテーブルへの関係は落とす
  const cleanRels = [];
  const seen = new Set();
  for (const r of rels) {
    if (!names.has(r.from) || !names.has(r.to) || r.from === r.to) continue;
    const key = r.from + r.kind + r.to;
    if (seen.has(key)) continue;
    seen.add(key);
    cleanRels.push(r);
  }

  return { tables: uniq, rels: cleanRels, sources: [...sources] };
}

/* ---------- SQL ---------- */
function fromSQL(f, tables, rels) {
  const t = f.text;
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?[`"[]?([\w.]+)[`"\]]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m, n = 0;
  while ((m = re.exec(t)) !== null) {
    const name = safeName(m[1].split(".").pop());
    const body = m[2];
    const columns = [];
    for (const raw of splitTop(body)) {
      const line = raw.trim();
      if (!line) continue;

      // 表レベルの制約
      const fk = line.match(/foreign\s+key\s*\(\s*[`"[]?([\w]+)[`"\]]?\s*\)\s*references\s+[`"[]?([\w.]+)[`"\]]?/i);
      if (fk) {
        rels.push({ from: name, to: safeName(fk[2].split(".").pop()), kind: "many-to-one",
          label: fk[1], file: f.path });
        continue;
      }
      if (/^(primary|unique|constraint|check|key|index)\b/i.test(line)) {
        const pk = line.match(/primary\s+key\s*\(\s*[`"[]?([\w]+)/i);
        if (pk) { const c = columns.find(c2 => c2.name === pk[1]); if (c) c.key = "PK"; }
        continue;
      }

      // 列定義
      const col = line.match(/^[`"[]?([\w]+)[`"\]]?\s+([\w]+(?:\s*\([\d,\s]*\))?)/);
      if (!col) continue;
      const isPk = /primary\s+key/i.test(line);
      const ref = line.match(/references\s+[`"[]?([\w.]+)[`"\]]?/i);
      if (ref) {
        rels.push({ from: name, to: safeName(ref[1].split(".").pop()), kind: "many-to-one",
          label: col[1], file: f.path });
      }
      const ty = splitType(col[2]);
      columns.push({ name: col[1], type: ty.name, size: ty.size,
        key: isPk ? "PK" : (ref ? "FK" : "") });
    }
    tables.push({ name, columns, file: f.path, line: lineAt(t, m.index), source: "SQL" });
    n++;
  }
  return n;
}

/** 括弧の深さを見ながらカンマで割る（DECIMAL(10,2) を壊さない） */
function splitTop(body) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/* ---------- Prisma ---------- */
function fromPrisma(f, tables, rels) {
  const t = f.text;
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const modelNames = [...t.matchAll(/model\s+(\w+)\s*\{/g)].map(x => x[1]);
  let m, n = 0;
  while ((m = re.exec(t)) !== null) {
    const name = safeName(m[1]);
    const columns = [];
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+([\w[\]?]+)/);
      if (!fm) continue;
      const field = fm[1];
      const type = fm[2];
      const bare = type.replace(/[[\]?]/g, "");
      if (modelNames.includes(bare)) {
        // 他モデルを型に持つ＝関係
        const many = type.includes("[]");
        rels.push({
          from: name, to: safeName(bare),
          kind: many ? "one-to-many" : "many-to-one",
          label: field, file: f.path,
        });
        continue;
      }
      const key = /@id\b/.test(line) ? "PK" : (/@unique\b/.test(line) ? "UK" : "");
      columns.push({ name: field, type: safeType(bare), key });
    }
    tables.push({ name, columns, file: f.path, line: lineAt(t, m.index), source: "Prisma" });
    n++;
  }
  return n;
}

/* ---------- Python（Django / SQLAlchemy） ---------- */
function fromPython(f, tables, rels) {
  const t = f.text;
  // JavaScript の正規表現に \Z はないため、文字列の終わりは (?![\s\S]) で表す
  const re = /^class\s+(\w+)\s*\(([^)]*)\)\s*:([\s\S]*?)(?=^class\s|(?![\s\S]))/gm;
  let m, n = 0;
  while ((m = re.exec(t)) !== null) {
    const cls = m[1];
    const bases = m[2];
    const body = m[3];
    const isDjango = /models\.Model|\bModel\b/.test(bases);
    const isAlchemy = /\bBase\b|DeclarativeBase/.test(bases) || /__tablename__/.test(body);
    if (!isDjango && !isAlchemy) continue;

    const name = safeName(cls);
    const columns = [];

    if (isDjango) {
      for (const line of body.split("\n")) {
        const fm = line.match(/^\s{2,}(\w+)\s*=\s*models\.(\w+)\s*\(([^)]*)/);
        if (!fm) continue;
        const [, field, kind, args] = fm;
        if (/^(ForeignKey|OneToOneField|ManyToManyField)$/.test(kind)) {
          const targetM = args.match(/^\s*["']?([\w.]+)["']?/);
          const target = targetM ? safeName(targetM[1].split(".").pop()) : null;
          if (target && target !== "self") {
            rels.push({
              from: name, to: target,
              kind: kind === "ManyToManyField" ? "many-to-many"
                : kind === "OneToOneField" ? "one-to-one" : "many-to-one",
              label: field, file: f.path,
            });
          }
          continue;
        }
        columns.push({ name: field, type: safeType(kind.replace(/Field$/, "")),
          key: /primary_key\s*=\s*True/.test(line) ? "PK" : (/unique\s*=\s*True/.test(line) ? "UK" : "") });
      }
    } else {
      for (const line of body.split("\n")) {
        const fm = line.match(/^\s{2,}(\w+)\s*=\s*(?:Column|mapped_column)\s*\(([^)]*)/);
        if (fm) {
          const [, field, args] = fm;
          const typeM = args.match(/^\s*(\w+)/);
          const fk = args.match(/ForeignKey\s*\(\s*["']([\w.]+)["']/);
          if (fk) {
            rels.push({ from: name, to: safeName(fk[1].split(".")[0]), kind: "many-to-one",
              label: field, file: f.path });
          }
          columns.push({ name: field, type: safeType(typeM ? typeM[1] : ""),
            key: /primary_key\s*=\s*True/.test(args) ? "PK" : (fk ? "FK" : "") });
          continue;
        }
        const relM = line.match(/^\s{2,}(\w+)\s*=\s*relationship\s*\(\s*["'](\w+)["']/);
        if (relM) {
          rels.push({ from: name, to: safeName(relM[2]), kind: "one-to-many",
            label: relM[1], file: f.path });
        }
      }
    }

    if (columns.length || rels.some(r => r.from === name)) {
      tables.push({ name, columns, file: f.path, line: lineAt(t, m.index),
        source: isDjango ? "Django" : "SQLAlchemy" });
      n++;
    }
  }
  return n;
}

/* ---------- TypeORM ---------- */
function fromTypeORM(f, tables, rels) {
  const t = f.text;
  if (!t.includes("@Entity")) return 0;
  const re = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g;
  let m, n = 0;
  while ((m = re.exec(t)) !== null) {
    const name = safeName(m[1]);
    const columns = [];
    const body = m[2];
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const relM = line.match(/@(ManyToOne|OneToMany|ManyToMany|OneToOne)\s*\(\s*\(\)\s*=>\s*(\w+)/);
      if (relM) {
        const next = lines.slice(i + 1, i + 4).join(" ");
        const fieldM = next.match(/(\w+)\s*[!?]?\s*:/);
        rels.push({
          from: name, to: safeName(relM[2]),
          kind: { ManyToOne: "many-to-one", OneToMany: "one-to-many",
            ManyToMany: "many-to-many", OneToOne: "one-to-one" }[relM[1]],
          label: fieldM ? fieldM[1] : "", file: f.path,
        });
        continue;
      }
      if (/@(Column|PrimaryGeneratedColumn|PrimaryColumn|CreateDateColumn|UpdateDateColumn)\s*\(/.test(line)) {
        const next = lines.slice(i + 1, i + 3).join(" ");
        const fieldM = next.match(/(\w+)\s*[!?]?\s*:\s*([\w<>[\]]+)/);
        if (fieldM) {
          columns.push({ name: fieldM[1], type: safeType(fieldM[2]),
            key: /Primary/.test(line) ? "PK" : "" });
        }
      }
    }
    tables.push({ name, columns, file: f.path, line: lineAt(t, m.index), source: "TypeORM" });
    n++;
  }
  return n;
}

/* ---------- Mermaid ---------- */
const CARD = {
  "many-to-one": "}o--||",
  "one-to-many": "||--o{",
  "many-to-many": "}o--o{",
  "one-to-one": "||--||",
};

export function schemaToMermaid(schema, { withColumns = true, maxTables = 40 } = {}) {
  const { tables, rels } = schema;
  if (!tables.length) return null;

  const shown = tables.slice(0, maxTables);
  const names = new Set(shown.map(t => t.name));
  const lines = ["erDiagram"];

  for (const r of rels) {
    if (!names.has(r.from) || !names.has(r.to)) continue;
    const label = (r.label || "rel").replace(/[^\w]/g, "_") || "rel";
    lines.push("  " + r.from + " " + (CARD[r.kind] || "}o--||") + " " + r.to + " : " + label);
  }
  if (withColumns) {
    for (const t of shown) {
      if (!t.columns.length) { lines.push("  " + t.name + " {\n  }"); continue; }
      lines.push("  " + t.name + " {");
      for (const c of t.columns.slice(0, 24)) {
        lines.push("    " + c.type + " " + c.name +
          (c.key ? " " + c.key : "") +
          (c.size ? ' "' + c.size + '"' : ""));
      }
      lines.push("  }");
    }
  } else {
    // 関係を持たないテーブルも図に出す
    for (const t of shown) {
      if (rels.some(r => r.from === t.name || r.to === t.name)) continue;
      lines.push("  " + t.name + " {\n  }");
    }
  }
  return lines.join("\n");
}
