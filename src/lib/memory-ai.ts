import { quickChat } from "./ai-client";
import { MEMORY_CAT_COLORS, MEMORY_LABELS } from "./ai-meta";
import {
  MEMORY_EXTRACT_SYSTEM,
  MEMORY_EXTRACT_USER,
  MEMORY_INJECT_INTRO,
} from "./prompts";
import type { ApiKeys, Memory, MemoryCategory, ModelId } from "./types";

/**
 * 记忆的 AI 处理：
 * - 对话后抽取长期记忆（结构化 JSON）
 * - 发送前挑选相关记忆拼注入上下文
 * 辅助调用优先 DeepSeek（便宜），未配置则回退 Kimi。
 */

export interface HelperChoice {
  model: Extract<ModelId, "kimi" | "deepseek">;
  apiKey: string;
  /** true 表示想用的 DeepSeek 没配 key，回退到了 Kimi */
  fallback: boolean;
}

/** 选择辅助调用模型：DeepSeek 优先，回退 Kimi；都没有返回 null */
export function pickHelper(apiKeys: ApiKeys): HelperChoice | null {
  if (apiKeys.deepseek) {
    return { model: "deepseek", apiKey: apiKeys.deepseek, fallback: false };
  }
  if (apiKeys.kimi) {
    return { model: "kimi", apiKey: apiKeys.kimi, fallback: true };
  }
  return null;
}

type RawMemoryItem = {
  category?: unknown;
  title?: unknown;
  content?: unknown;
};

/** 从模型文本里尽力解析 JSON 数组：三层容错（直解 → 剥围栏 → 截首个数组） */
export function parseLooseJsonArray<T = unknown>(text: string): T[] {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(clean);
    if (Array.isArray(v)) return v as T[];
  } catch {
    /* 继续降级 */
  }
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(v)) return v as T[];
    } catch {
      /* 忽略 */
    }
  }
  return [];
}

const CATS: MemoryCategory[] = ["background", "pref", "decision", "data"];

/** 新旧记忆是否高度重复（标题相同 或 内容双向包含） */
function isDuplicate(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const ratio = (s: string, t: string) =>
    s.length >= 8 && t.includes(s) ? s.length / t.length : 0;
  return Math.max(ratio(x, y), ratio(y, x)) > 0.8;
}

/**
 * 对话后抽取记忆。静默失败（返回空数组），不阻断聊天。
 * existing 用于去重；最多返回 3 条。
 */
export async function extractMemories(
  userText: string,
  aiText: string,
  helper: HelperChoice,
  existing: Memory[]
): Promise<Omit<Memory, "id" | "createdAt">[]> {
  if (aiText.trim().length < 40) return [];
  const r = await quickChat({
    provider: helper.model,
    apiKey: helper.apiKey,
    systemHint: MEMORY_EXTRACT_SYSTEM,
    messages: [{ role: "user", content: MEMORY_EXTRACT_USER(userText, aiText) }],
    json: true,
  });
  if (!r.ok) return [];

  const items = parseLooseJsonArray<RawMemoryItem>(r.content);
  const out: Omit<Memory, "id" | "createdAt">[] = [];
  for (const it of items) {
    const category = String(it.category ?? "") as MemoryCategory;
    const title = String(it.title ?? "").trim().slice(0, 20);
    const content = String(it.content ?? "").trim().slice(0, 120);
    if (!CATS.includes(category) || !title || !content) continue;
    if (
      existing.some((m) => isDuplicate(m.title, title) || isDuplicate(m.content, content)) ||
      out.some((m) => isDuplicate(m.title, title) || isDuplicate(m.content, content))
    ) {
      continue;
    }
    out.push({
      category,
      label: MEMORY_LABELS[category],
      color: MEMORY_CAT_COLORS[category],
      title,
      content,
      source: "ai",
    });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 发送前挑选相关记忆拼注入上下文（≤1500 字）：
 * pref 类按时间取最多 3 条；其余类别按与最近用户消息的关键词重叠排序取 3 条。
 * seed 记忆永不参与。
 */
export function buildMemoryContext(
  memories: Memory[],
  latestUserText: string
): string {
  const usable = memories.filter((m) => m.source !== "seed");
  if (usable.length === 0) return "";

  const prefs = usable
    .filter((m) => m.category === "pref")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);

  const keywords = new Set(
    (latestUserText.match(/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/g) ?? []).map((s) =>
      s.toLowerCase()
    )
  );
  const score = (m: Memory): number => {
    const hay = `${m.title} ${m.content}`.toLowerCase();
    let n = 0;
    keywords.forEach((k) => {
      if (hay.includes(k)) n += k.length >= 4 ? 2 : 1;
    });
    return n;
  };
  const others = usable
    .filter((m) => m.category !== "pref")
    .sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt)
    .slice(0, 3);

  const picked = [...prefs, ...others];
  const lines: string[] = [];
  let total = 0;
  for (const m of picked) {
    const line = `- 【${m.label}】${m.title}：${m.content}`;
    if (total + line.length > 1500) break;
    lines.push(line);
    total += line.length;
  }
  return lines.length > 0 ? MEMORY_INJECT_INTRO + lines.join("\n") : "";
}
