# HTML ファイルの画面プレビュー（規模 S）

## 背景

`.html` / `.htm` は `kindOf` で `text` に分類され、`renderCode`（`src/viewers/code.js`）で
ハイライト付きのコードとしてしか表示されない。レビュー時に「実際どんな画面か」を見るには、
別途ブラウザで開く必要がある。

Markdown は既に「整形表示 ⇔ 原文」をヘッダーのボタンで切り替えている（`src/viewers/markdown.js`）。
HTML も同じ形で「コード ⇔ プレビュー」を切り替えられるようにする。

## 方針

- HTML ファイルはこれまでどおりコード表示で開き、ヘッダーに「プレビュー」ボタンを足す
  （既定をコードにするのは、検索結果・関係パネルからの行ジャンプ `jumpToLine` をそのまま生かすため）
- プレビューは `<iframe sandbox="allow-scripts" srcdoc="…">` で描く
  - `allow-same-origin` を付けない → 中のスクリプトは本体の DOM・localStorage・IndexedDB に触れない
  - `allow-forms` `allow-popups` `allow-top-navigation` も付けない
- 読み込んだフォルダ内の相対参照を、iframe に渡す前に**インライン化**する
  （sandbox の不透明オリジンから本体の blob: URL が読めない可能性があるため、blob URL は使わない）
  - `<link rel="stylesheet" href="相対パス">` → `<style>中身</style>`
  - `<script src="相対パス">` → `<script>中身</script>`（`type` 属性は残す）
  - `<img src="相対パス">` → `data:` URL
  - パスの解決は `src/core/analyze.js` の既存 `resolveRef(spec, fromPath)` をそのまま使う
    （「気づき」パネルのリンク切れ判定と結果を揃えるため。`analyze.js` 自体は変更しない）。
    `./` `../`、`/` 始まり（読み込んだフォルダのルート起点）、`?` `#` の除去、外部 URL の除外はこれに従う
  - 見つからない参照はそのまま残す
  - `inlineAssets(f)` は Promise を返す。CSS / JS は `text` があればそれを、`text` が null（2MB 超など）なら
    `file.text()` で読む。画像は `FileReader` で data URL にする。インライン化の間はプレビュー領域に「読み込み中…」を出す
- プレビュー領域の背景は常に白（`#fff`）。ブラウザで直接開いたときと同じ見え方にするため。枠とボタンだけ既存トークンの色
- プレビュー表示中だけ「再読み込み」ボタンを出し、押すと iframe を作り直す（スクリプトの状態をリセットするため）
- `renderHtml` は `renderCode` が返すコントローラのメソッド（`goto` `openFind` `refreshNotes` `repaint`）をすべて返す。
  `goto` と `openFind` はプレビュー表示中ならコード表示へ戻してから元の処理を呼ぶ

## 受入条件

- [ ] `.html` / `.htm` を開くと、従来どおりコードが表示され、ヘッダーに「プレビュー」ボタンが出る
- [ ] ボタンを押すとコードが隠れ、同じ領域に画面プレビューが表示される。もう一度押すとコードに戻る
- [ ] 同じフォルダ（またはサブフォルダ・親フォルダ）の CSS・JS・画像を相対パスで参照している HTML が、
      スタイル・画像・スクリプトの効いた状態で表示される
- [ ] プレビュー内のスクリプトから `parent.document` / `localStorage` に触れようとすると例外になる
      （DevTools のコンソールで確認）
- [ ] `/` 始まりのパスは読み込んだフォルダのルートを起点に解決される。存在しないファイルへの参照があっても
      他の部分は表示され、本体のコンソールに例外が出ない
- [ ] プレビュー内のスクリプトで DOM を書き換えたあと「再読み込み」を押すと、書き換え前の状態から描き直される。
      ボタンはプレビュー表示中だけ出る
- [ ] 背景色を指定していない HTML も、ダークテーマで白い背景の上に表示される
- [ ] プレビュー中に検索結果から同ファイルの行へジャンプすると、コード表示に戻ってその行が出る
- [ ] プレビュー中に Ctrl+F を押すと、コード表示に戻ってファイル内検索が開く
- [ ] Markdown・CSV・その他のテキストファイルの表示は変わらない
- [ ] 新しい依存を足さない。ライト／ダーク両テーマで枠・ボタンが既存トークンの色で表示される

## 非目標

- ES モジュールの `import` 文、CSS 内の `url()` / `@import`、`fetch()` で読む相対リソースの解決
  （インライン化するのは link / script / img の属性だけ）
- Vite・webpack などバンドラ前提の HTML（`<script type="module" src="/src/main.js">` で npm パッケージを import するもの）の動作。
  参照は解決するが、import が解決できないので画面は出ない
- 外部 URL（`https://…`）・CDN の読み込み制御。ネットにつながっていれば読まれるし、なければ読まれない
- スマホ幅・タブレット幅などの表示幅の切替、拡大縮小
- プレビュー内のリンクをたどった別ページへの遷移
- HTML の編集・ライブリロード（ファイル変更の監視）
- `.vue` `.svelte` `.xml` `.svg` など HTML 以外のマークアップのプレビュー
- 開いた時点での既定表示をプレビューにすること

## 触るファイル

- `src/viewers/htmlPreview.js`（新規）… 相対参照のインライン化 `inlineAssets(f)`（`resolveRef` を import して使う）と、
  コード表示＋プレビュー切替の `renderHtml(f, body, head)`
- `src/viewers/file.js` … `f.kind === "text"` かつ拡張子が html/htm のとき `renderHtml` に振り分け、
  返したコントローラの `goto` でプレビュー中ならコードへ戻す
- `src/styles/editor.css` … プレビュー枠（iframe）のスタイル

## 検証方法

1. テスト用フォルダを作る
   - `index.html` … `css/style.css`・`js/app.js`・`img/a.png` を相対参照、`/css/root.css` をルート起点で参照、
     存在しない `img/missing.png` も参照。背景色は指定しない
   - `sub/page.html` … `../css/style.css` を参照
   - `app.js` … DOM を書き換え、`parent.document` と `localStorage` へのアクセスを try/catch してコンソールに出す
2. `pnpm dev`（ポート 5180）で起動し、そのフォルダを読み込んで `index.html` と `sub/page.html` を開く
3. 「プレビュー」切替・スタイル／画像／スクリプトの反映・missing.png があっても崩れないこと・コンソールの例外・
   再読み込みで DOM が初期状態に戻ることを確認
4. プレビュー中に、検索で `index.html` の行を選ぶ → コード表示に戻ってジャンプ。Ctrl+F → コード表示で検索バーが開く
5. ライト／ダークでスクリーンショット確認。`pnpm build` と `pnpm build:single` が通ること
