"use client";

/**
 * Excel(.xlsx/.xlsm) 文本提取（浏览器本地完成，不上传服务器）
 * 用 JSZip 解包 + DOMParser 读取工作簿，输出 TSV 便于 AI 理解
 */

const MAX_ROWS_PER_SHEET = 800; // 单表最多读取行数，防止超大表格撑爆

export interface XlsxExtractResult {
  text: string;
  sheets: number;
  warnings: string[];
}

/** "AB12" → 27（0 基列号） */
function colIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** <si>/<is> 可能是纯 <t> 或富文本 <r><t>，全部拼接 */
function allText(node: Element): string {
  return Array.from(node.getElementsByTagName("t"))
    .map((t) => t.textContent ?? "")
    .join("");
}

/** 数字单元格里常见日期序列号，粗转成 YYYY-MM-DD 便于阅读 */
function maybeDate(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return v;
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function extractXlsxText(
  file: File,
  maxChars = 100_000
): Promise<XlsxExtractResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const warnings: string[] = [];
  const parser = new DOMParser();

  // 共享字符串表
  const shared: string[] = [];
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (sharedXml) {
    const doc = parser.parseFromString(sharedXml, "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      shared.push(allText(si));
    }
  }

  // 工作表名称 → 实际文件路径
  const sheetList: { name: string; path: string }[] = [];
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const relXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (wbXml) {
    const rels: Record<string, string> = {};
    if (relXml) {
      const rd = parser.parseFromString(relXml, "application/xml");
      for (const r of Array.from(rd.getElementsByTagName("Relationship"))) {
        rels[r.getAttribute("Id") ?? ""] = r.getAttribute("Target") ?? "";
      }
    }
    const wd = parser.parseFromString(wbXml, "application/xml");
    for (const s of Array.from(wd.getElementsByTagName("sheet"))) {
      const rid = s.getAttribute("r:id") ?? "";
      let target = rels[rid] ?? "";
      if (!target) continue;
      target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      sheetList.push({ name: s.getAttribute("name") ?? "Sheet", path: target });
    }
  }
  // 兜底：workbook 解析失败时按文件名顺序读取
  if (sheetList.length === 0) {
    const files = Object.keys(zip.files)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
      .sort();
    files.forEach((p, i) => sheetList.push({ name: `Sheet${i + 1}`, path: p }));
  }

  const out: string[] = [];
  let total = 0;
  let truncated = false;

  for (const sheet of sheetList) {
    if (total >= maxChars) {
      truncated = true;
      break;
    }
    const xml = await zip.file(sheet.path)?.async("string");
    if (!xml) continue;
    const doc = parser.parseFromString(xml, "application/xml");
    const rows = Array.from(doc.getElementsByTagName("row"));
    const lines: string[] = [];

    for (let i = 0; i < Math.min(rows.length, MAX_ROWS_PER_SHEET); i++) {
      const cells: string[] = [];
      for (const c of Array.from(rows[i].getElementsByTagName("c"))) {
        const ref = c.getAttribute("r") ?? "";
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") {
          const is = c.getElementsByTagName("is")[0];
          val = is ? allText(is) : v;
        } else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (t === "str") val = v;
        else val = maybeDate(v);
        // 按列号补空，保证表格对齐
        const idx = colIndex(ref);
        while (cells.length < idx) cells.push("");
        cells[idx] = val.replace(/\t/g, " ").replace(/\r?\n/g, " ");
      }
      // 跳过整行空白
      if (cells.some((x) => x.trim() !== "")) lines.push(cells.join("\t"));
    }

    if (rows.length > MAX_ROWS_PER_SHEET) {
      warnings.push(`工作表「${sheet.name}」共 ${rows.length} 行，仅读取前 ${MAX_ROWS_PER_SHEET} 行`);
    }
    if (lines.length === 0) continue;

    const block = `--- 工作表：${sheet.name} ---\n${lines.join("\n")}`;
    const room = maxChars - total;
    if (block.length > room) {
      out.push(block.slice(0, room));
      total = maxChars;
      truncated = true;
      break;
    }
    out.push(block);
    total += block.length;
  }

  const text =
    out.join("\n\n") + (truncated ? "\n\n[已达提取上限，后续内容省略]" : "");
  return { text, sheets: out.length, warnings };
}
