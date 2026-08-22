import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

/**
 * ビルドは 2 種類。
 *  - `pnpm build`        … 通常ビルド。コード分割あり。GitHub Pages 用。
 *                          重いビューア（PDF / Word / Mermaid）は使うときだけ読み込む。
 *                          Service Worker を付けるので、2 回目以降はオフラインでも開ける。
 *  - `pnpm build:single` … 単一 HTML ビルド。すべてを 1 ファイルに埋め込む。
 *                          ダブルクリックで開ける持ち運び用。
 */
export default defineConfig(({ mode }) => {
  const single = mode === "single";

  const pwa = VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["favicon.svg", "icon.svg"],
    workbox: {
      // 図やビューアの遅延読み込みぶんも含めてキャッシュする
      globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      // 既定では使わない図のレイアウト実装は重いので、事前保存の対象から外す
      globIgnores: ["**/flowchart-elk-*.js", "**/mindmap-definition-*.js"],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      cleanupOutdatedCaches: true,
    },
    manifest: {
      name: "File Review Studio",
      short_name: "Review Studio",
      description: "フォルダをまるごと読み込んで、構造・関係・中身をその場でレビューする。ファイルは端末の外に出ません。",
      lang: "ja",
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#1e1e1e",
      theme_color: "#0e639c",
      icons: [
        { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      ],
    },
  });

  return {
    // リポジトリ名のサブパスに置かれても動くよう相対パスで出力する
    base: "./",
    define: {
      __SINGLE_FILE__: JSON.stringify(single),
    },
    plugins: single
      ? [viteSingleFile({ removeViteModuleLoader: true })]
      : [pwa],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      target: "es2022",
      // 単一 HTML では 1 チャンクに寄せる必要がある
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 3000,
      rollupOptions: single ? { output: { inlineDynamicImports: true } } : {},
    },
    // legacy/ や dist-single/ の HTML を入口として拾わせない
    optimizeDeps: { entries: ["index.html"] },
    worker: { format: "es" },
    server: { port: 5180, open: false },
  };
});
