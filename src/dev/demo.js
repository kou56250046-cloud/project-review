/* =========================================================================
   開発中の動作確認用。ビルド成果物には含まれない。
   ブラウザのコンソールで __loadDemo() と打つと、見本のプロジェクトを読み込む。
   ========================================================================= */
const FILES = {
  "demo/README.md": [
    "# デモプロジェクト", "",
    "File Review Studio の動作確認用です。", "",
    "## 構成", "",
    "- [設計メモ](docs/architecture.md)",
    "- [使い方](docs/usage.md)  ← このリンクは切れている",
    "- エントリ: `src/main.js`", "",
    "## 依存の図", "",
    "```mermaid", "graph LR",
    "  A[main.js] --> B[utils.js]",
    "  A --> C[api/client.js]",
    "  C --> B", "```", "",
    "## 罫線で描いた図", "",
    "```text",
    "┌──────────────────┐",
    "│  画面 (UI)        │",
    "│  ボタンや一覧を出す │",
    "└──────────────────┘",
    "        ↓ 呼び出し",
    "┌──────────────────┐",
    "│  API クライアント  │",
    "│  fetch でやり取り  │",
    "└──────────────────┘",
    "```", "",
    "| 項目 | 内容 |", "| --- | --- |", "| 言語 | JavaScript |", "| 目的 | 動作確認 |", "",
  ].join("\n"),

  "demo/package.json": JSON.stringify({
    name: "demo", version: "1.0.0",
    scripts: { start: "node src/main.js" },
    dependencies: { lodash: "^4.17.21", "date-fns": "^3.0.0" },
  }, null, 2) + "\n",

  "demo/src/main.js": [
    'import { formatDate, sum } from "./utils.js";',
    'import { fetchUsers } from "./api/client.js";',
    'import _ from "lodash";', "",
    "/** アプリの入口 */",
    "export async function main() {",
    "  const users = await fetchUsers();",
    "  console.log(formatDate(new Date()), sum([1, 2, 3]));",
    "  return _.uniq(users);",
    "}", "",
    "export class App {",
    "  constructor(config) {",
    "    this.config = config;",
    "    this.running = false;",
    "  }",
    "  start() {",
    "    this.running = true;",
    "    return main();",
    "  }",
    "  stop() {",
    "    this.running = false;",
    "  }",
    "}", "",
    "const DEFAULT_TIMEOUT = 3000;", "",
    "main();", "",
  ].join("\n"),

  "demo/src/utils.js": [
    'import { retry } from "./api/client.js";', "",
    "export function formatDate(d) {",
    "  return d.toISOString().slice(0, 10);",
    "}", "",
    "export function sum(xs) {",
    "  return xs.reduce((a, b) => a + b, 0);",
    "}", "",
    "export function chunk(xs, n) {",
    "  const out = [];",
    "  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));",
    "  return out;",
    "}", "",
    'export const VERSION = "1.0.0";', "",
  ].join("\n"),

  "demo/src/api/client.js": [
    'import { VERSION } from "../utils.js";', "",
    "export async function fetchUsers() {",
    '  const res = await fetch("/api/users", { headers: { "x-version": VERSION } });',
    "  return res.json();",
    "}", "",
    "export function retry(fn, times = 3) {",
    "  return fn();",
    "}", "",
  ].join("\n"),

  "demo/src/legacy/old-helper.js":
    "// どこからも参照されていないファイル\nexport function unusedHelper() {\n  return null;\n}\n",

  "demo/docs/architecture.md": [
    "---", "title: 設計メモ", "author: demo", "---", "",
    "# 設計メモ", "",
    "## レイヤー構成", "",
    "画面から API を呼び、共通処理は utils にまとめています。", "",
    "## 未解決の課題", "",
    "- [ ] エラー処理の統一",
    "- [x] 依存の整理", "",
    "参照: [存在しないファイル](./missing-notes.md)", "",
  ].join("\n"),

  "demo/data/sample.csv": [
    "名前,部署,売上,備考",
    "山田,営業,1200000,",
    "佐藤,開発,,新人",
    "鈴木,営業,980000,",
    "田中,人事,450000,異動あり",
    "高橋,開発,760000,",
  ].join("\n") + "\n",
};

window.__loadDemo = function loadDemo() {
  const dt = new DataTransfer();
  for (const [path, text] of Object.entries(FILES)) {
    const f = new File([text], path.split("/").pop(), { type: "text/plain", lastModified: Date.now() });
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    dt.items.add(f);
  }
  const input = document.querySelector("#pickFiles");
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return Object.keys(FILES).length + " 件を読み込みます";
};
console.info("[dev] __loadDemo() で見本プロジェクトを読み込めます");
