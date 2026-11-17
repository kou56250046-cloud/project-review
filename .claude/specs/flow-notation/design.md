# 設計

| ファイル | 変更 |
|---|---|
| `src/viewers/flowNotation.js`（新規） | gemini-kit `flow.js` を ES モジュール化（中身は無改変）。`looksLikeFlow` を追加 |
| `src/viewers/diagram.js` | `flowNotationBlock(raw)` を追加。`shellWithHead` と `.seg` 切替を流用 |
| `src/viewers/prose.js` | Mermaid 判定の直後に flow 判定を追加 |
| `src/styles/diagram.css` | `.flow-fig`（白地・横スクロール） |

SVG は `DOMParser` で取り込み、`height` を外して `width=100%`・`max-width=geo.width`（gemini-kit docview と同じ）。
SVG 内のテキストは `esc()` 済みで、取り込みは `image/svg+xml` としてパースするためスクリプトは実行されない。

## 検証方法

- Node で `render` を呼び、`50-fmt-flow.md` の例がエラー0で SVG になる
- `pnpm dev` で `gemini-kit/src/items` を読み込み `50-fmt-flow.md` / `84-design-flow.md` をライト／ダークで確認
- 壊した記法でエラー表示、既存の罫線図・Mermaid が変わらない
- `pnpm build` / `pnpm build:single`
