/* =========================================================================
   ファイル・フォルダの役割を名前から推し量る
   （このアプリの特徴。初見のプロジェクトを読むときの手がかりになる）
   ========================================================================= */
import { baseOf, dirOf, extOf } from "./util.js";

const DIR_ROLES = [
  [/^(src|source|lib)$/i, "ソースコードの本体"],
  [/^(components?|ui|widgets?)$/i, "UIコンポーネント"],
  [/^(pages?|routes?|views?|screens?|app)$/i, "画面・ルーティング"],
  [/^(api|server|backend|controllers?)$/i, "サーバー・API処理"],
  [/^(tests?|__tests__|spec|e2e|cypress)$/i, "テストコード"],
  [/^(docs?|documentation|manual)$/i, "ドキュメント"],
  [/^(public|static|assets?|images?|img|media)$/i, "静的ファイル・画像"],
  [/^(styles?|css|scss|sass|theme)$/i, "スタイル定義"],
  [/^(utils?|helpers?|common|shared)$/i, "共通ユーティリティ"],
  [/^hooks?$/i, "React フック"],
  [/^(config|configs|settings|conf)$/i, "設定ファイル群"],
  [/^(scripts?|bin|tools?)$/i, "実行スクリプト"],
  [/^(dist|build|out|target|\.next|\.nuxt)$/i, "ビルド成果物（自動生成）"],
  [/^node_modules$/i, "依存パッケージ（自動生成）"],
  [/^(migrations?|db|database)$/i, "データベース関連"],
  [/^(models?|entities|schemas?)$/i, "データ構造の定義"],
  [/^(types?|typings|@types)$/i, "型定義"],
  [/^(i18n|locales?|lang|translations?)$/i, "多言語リソース"],
  [/^\.github$/i, "GitHub の設定・CI"],
  [/^\.vscode$/i, "エディタ設定"],
  [/^(data|datasets?|fixtures?|samples?)$/i, "データファイル"],
  [/^(logs?|tmp|temp|cache|\.cache)$/i, "一時ファイル・ログ"],
  [/^(\.git|\.svn)$/i, "バージョン管理の内部データ"],
  [/^(workers?|jobs?|tasks?|queues?)$/i, "バックグラウンド処理"],
  [/^(middleware|middlewares)$/i, "ミドルウェア"],
  [/^(store|stores|state|redux|context)$/i, "状態管理"],
];

const FILE_ROLES = [
  [/^readme(\.|$)/i, "プロジェクトの説明・入口となる文書"],
  [/^changelog(\.|$)/i, "変更履歴"],
  [/^contributing(\.|$)/i, "開発への参加ガイド"],
  [/^licen[cs]e(\.|$)/i, "ライセンス条文"],
  [/^package\.json$/i, "依存パッケージとコマンドの定義"],
  [/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i, "依存バージョンの固定（自動生成）"],
  [/^tsconfig.*\.json$/i, "TypeScript のコンパイル設定"],
  [/^(vite|webpack|rollup|next|nuxt|svelte|astro|tailwind|postcss|babel|jest|vitest|eslint|prettier)\..*config\./i, "ビルド・開発ツールの設定"],
  [/^\.env/i, "環境変数（秘密情報を含む可能性あり）"],
  [/^\.gitignore$/i, "Git の追跡除外設定"],
  [/^dockerfile$/i, "コンテナイメージの定義"],
  [/^docker-compose/i, "複数コンテナの構成定義"],
  [/^makefile$/i, "ビルドコマンドの定義"],
  [/^requirements.*\.txt$/i, "Python の依存パッケージ"],
  [/^(pyproject|setup)\.(toml|py|cfg)$/i, "Python パッケージの設定"],
  [/^(index|main)\.(js|ts|jsx|tsx|py|go|rs|java|html)$/i, "エントリーポイント（実行の起点）"],
  [/^app\.(js|jsx|ts|tsx|vue|py)$/i, "アプリのルート"],
  [/\.(test|spec)\.[a-z]+$/i, "テストコード"],
  [/\.d\.ts$/i, "型定義ファイル"],
  [/\.config\.[a-z]+$/i, "設定ファイル"],
];

const EXT_ROLES = {
  md: "ドキュメント", markdown: "ドキュメント", mdx: "ドキュメント", txt: "テキストメモ",
  csv: "表形式データ", tsv: "表形式データ", json: "データ・設定", yml: "設定（YAML）", yaml: "設定（YAML）", toml: "設定（TOML）",
  pdf: "PDF 文書", docx: "Word 文書", doc: "Word 文書", xlsx: "Excel ブック", pptx: "PowerPoint 資料",
  js: "JavaScript の処理", mjs: "JavaScript の処理", cjs: "JavaScript の処理", jsx: "React コンポーネント",
  ts: "TypeScript の処理", tsx: "React コンポーネント（TS）", py: "Python の処理", rb: "Ruby の処理",
  go: "Go の処理", rs: "Rust の処理", java: "Java クラス", php: "PHP の処理", cs: "C# クラス",
  html: "画面のマークアップ", htm: "画面のマークアップ", css: "スタイル", scss: "スタイル（SCSS）", less: "スタイル（LESS）",
  vue: "Vue コンポーネント", svelte: "Svelte コンポーネント", sh: "シェルスクリプト", sql: "SQL クエリ",
  png: "画像", jpg: "画像", jpeg: "画像", gif: "画像", svg: "ベクター画像", webp: "画像", ico: "アイコン",
  lock: "依存の固定（自動生成）", log: "ログ", xml: "XML データ", ini: "設定", env: "環境変数",
};

export function roleOfDir(name) {
  for (const [re, r] of DIR_ROLES) if (re.test(name)) return r;
  return "";
}

export function roleOfFile(path) {
  const b = baseOf(path);
  for (const [re, r] of FILE_ROLES) if (re.test(b)) return r;
  const dir = baseOf(dirOf(path));
  const ext = extOf(b);
  const byExt = EXT_ROLES[ext];
  if (byExt) {
    const dr = roleOfDir(dir);
    if (dr && !/自動生成|バージョン管理/.test(dr)) return byExt + "（" + dr + "）";
    return byExt;
  }
  return "その他のファイル";
}

/** 自動生成されたもの（読まなくてよい）かどうか */
export function isGenerated(path) {
  return /(^|\/)(dist|build|out|target|\.next|\.nuxt|node_modules|vendor|coverage)\//i.test(path) ||
    /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.map)$/i.test(path);
}
