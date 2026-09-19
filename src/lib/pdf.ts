"use client";

/**
 * PDF 文本提取（浏览器本地完成，不上传服务器）
 * 基于 pdf.js 4.x，worker 位于 public/ 本地加载，不依赖外部 CDN
 */

let workerReady = false;

async function getPdfLib() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerReady) {
    // worker 由 next.config.js 自动同步到 public/，本地静态加载（不走 CDN）
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerReady = true;
  }
  return pdfjs;
}

export interface PdfExtractResult {
  text: string;
  pages: number;
}

/**
 * 从 PDF File 提取纯文本
 * @param maxChars 提取文本上限（防止超大 PDF 撑爆 token）
 */
export async function extractPdfText(
  file: File,
  maxChars = 100_000
): Promise<PdfExtractResult> {
  const pdfjs = await getPdfLib();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const chunks: string[] = [];
  let total = 0;
  let truncated = false;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // 同一行内的 item 用空格连接，行间用换行；pdf.js 的 item 带 hasEOL
    const lines: string[] = [];
    let line = "";
    for (const item of content.items as Array<{
      str?: string;
      hasEOL?: boolean;
    }>) {
      const s = item.str ?? "";
      line += s;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) lines.push(line.trim());
    const pageText = lines.filter(Boolean).join("\n");
    if (total + pageText.length > maxChars) {
      chunks.push(`--- 第 ${i} 页 ---\n${pageText.slice(0, maxChars - total)}`);
      total = maxChars;
      truncated = true;
      break;
    }
    chunks.push(`--- 第 ${i} 页 ---\n${pageText}`);
    total += pageText.length;
  }

  doc.destroy();
  const text =
    chunks.join("\n\n") +
    (truncated ? "\n\n[已达提取上限，后续页面内容省略]" : "");
  return { text, pages: doc.numPages };
}
