/* =========================================================================
   コードの見出し（関数・クラスなど）を取り出す
   構文解析はせず、行ごとの正規表現で拾う。速さと対応言語の広さを優先。
   ========================================================================= */

const RULES = {
  js: [
    [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, "fn"],
    [/^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "cls"],
    [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/, "fn"],
    [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][\w$]*)\s*=/, "const"],
    [/^\s*(?:public|private|protected|static|async|get|set|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/, "m"],
    [/^\s*(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/, "type"],
  ],
  py: [
    [/^\s*class\s+([A-Za-z_]\w*)/, "cls"],
    [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, "fn"],
  ],
  go: [
    [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, "fn"],
    [/^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, "type"],
  ],
  rs: [
    [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, "fn"],
    [/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/, "type"],
    [/^\s*impl(?:<[^>]*>)?\s+([A-Za-z_]\w*)/, "impl"],
  ],
  java: [
    [/^\s*(?:public|private|protected|\s)*(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/, "cls"],
    [/^\s*(?:public|private|protected|static|final|synchronized|\s)+[\w<>\[\],.\s]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/, "m"],
  ],
  rb: [
    [/^\s*class\s+([A-Za-z_]\w*)/, "cls"],
    [/^\s*module\s+([A-Za-z_]\w*)/, "mod"],
    [/^\s*def\s+([A-Za-z_][\w.?!]*)/, "fn"],
  ],
  php: [
    [/^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, "cls"],
    [/^\s*(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)/, "fn"],
  ],
  css: [
    [/^\s*(@(?:media|supports|keyframes|font-face)[^{]*)\{/, "at"],
    [/^\s*([.#]?[\w\-.:>\s,#[\]="']{2,80}?)\s*\{\s*$/, "sel"],
  ],
  sql: [
    [/^\s*create\s+(?:or\s+replace\s+)?(?:table|view|function|procedure|index)\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i, "obj"],
  ],
  sh: [
    [/^\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*\{/, "fn"],
  ],
  html: [
    [/<(?:section|main|article|header|footer|nav|form|dialog)\b[^>]*\bid\s*=\s*["']([^"']+)["']/i, "id"],
    [/^\s*<(h[1-6])\b[^>]*>(.*?)</i, "h"],
  ],
  json: [],
  yaml: [
    [/^([A-Za-z_][\w.-]*):\s*$/, "key"],
  ],
  toml: [
    [/^\s*(\[[^\]]+\])/, "sec"],
  ],
  ini: [
    [/^\s*(\[[^\]]+\])/, "sec"],
  ],
};

const EXT_TO_RULE = {
  js: "js", jsx: "js", mjs: "js", cjs: "js", ts: "js", tsx: "js", vue: "js", svelte: "js",
  py: "py", go: "go", rs: "rs", java: "java", kt: "java", cs: "java", scala: "java",
  rb: "rb", php: "php", css: "css", scss: "css", less: "css", sql: "sql",
  sh: "sh", bash: "sh", zsh: "sh", html: "html", htm: "html",
  yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", cfg: "ini", conf: "ini",
};

const KIND_LABEL = { fn: "fn", cls: "class", m: "()", const: "const", type: "type",
  impl: "impl", mod: "mod", at: "@", sel: "{}", obj: "sql", id: "#", h: "H", key: "k", sec: "[]" };

/**
 * @returns {{name:string, line:number, kind:string, depth:number}[]}
 */
export function outlineOf(text, ext) {
  const ruleKey = EXT_TO_RULE[ext];
  const rules = RULES[ruleKey];
  if (!rules || !rules.length || !text) return [];

  const lines = text.split("\n");
  const out = [];
  const limit = Math.min(lines.length, 20000);

  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line || line.length > 400) continue;
    // 行コメントは飛ばす
    if (/^\s*(\/\/|#(?!!)|\*|<!--)/.test(line) && ruleKey !== "yaml" && ruleKey !== "toml" && ruleKey !== "ini") continue;
    for (const [re, kind] of rules) {
      const m = line.match(re);
      if (!m) continue;
      const name = (kind === "h" ? m[2] : m[1] || "").trim();
      if (!name || name.length > 90) break;
      if (kind === "m" && /^(if|for|while|switch|catch|return|function|do|else)$/.test(name)) break;
      const indent = (line.match(/^\s*/) || [""])[0].replace(/\t/g, "  ").length;
      out.push({
        name, line: i + 1, kind: KIND_LABEL[kind] || kind,
        depth: Math.min(2, Math.floor(indent / 2)),
      });
      break;
    }
    if (out.length >= 800) break;
  }
  return out;
}
