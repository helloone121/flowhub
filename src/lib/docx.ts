"use client";

/**
 * Word (.docx) 文本提取（浏览器本地完成，不上传服务器）
 * 基于 mammoth.js，与 pdf.ts 同款动态 import 模式，避免首屏加载
 * 注意：仅支持 .docx（OOXML），不支持旧版 .doc 二进制格式
 */

export interface DocxExtractResult {
  text: string;
  /** mammoth 解析警告（如被忽略的样式），一般可忽略 */
  warnings: string[];
}

/**
 * 从 .docx File 提取纯文本
 * @param maxChars 提取文本上限（防止超大文档撑爆 token）
 */
export async function extractDocxText(
  file: File,
  maxChars = 100_000
): Promise<DocxExtractResult> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const { value, messages } = await mammoth.extractRawText({ arrayBuffer });
  let text = value.trim();
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[已达提取上限，后续内容省略]";
  }
  return {
    text,
    warnings: messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message)
      .slice(0, 3),
  };
}
