const fs = require("fs");
const path = require("path");

/**
 * pdf.js 的 worker 必须以原始 ESM 静态资源形式提供给浏览器
 * （交给 webpack 打包会被 Terser 处理而报错）。
 * 这里在 dev/build/start 加载配置时，自动把 worker 同步到 public/，
 * 浏览器通过 /pdf.worker.min.mjs 本地加载，不依赖 CDN。
 */
function syncPdfWorker() {
  try {
    // v4 主入口与 worker 同在 build/ 目录，从主入口反推避免 exports 限制
    const src = path.join(
      path.dirname(require.resolve("pdfjs-dist")),
      "pdf.worker.min.mjs"
    );
    const destDir = path.join(__dirname, "public");
    const dest = path.join(destDir, "pdf.worker.min.mjs");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const same =
      fs.existsSync(dest) && fs.statSync(src).size === fs.statSync(dest).size;
    if (!same) fs.copyFileSync(src, dest);
  } catch (e) {
    console.warn("[pdf-worker] 同步失败：", e.message);
  }
}
syncPdfWorker();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
