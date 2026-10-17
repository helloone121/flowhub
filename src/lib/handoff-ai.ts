import { quickChat } from "./ai-client";
import { pickHelper, type HelperChoice } from "./memory-ai";
import { HANDOFF_SUMMARY_SYSTEM, HANDOFF_SUMMARY_USER } from "./prompts";
import type { ApiKeys, ChatMessage } from "./types";

/**
 * 上下文接力摘要：
 * - 有 key 时用真实 AI（优先 DeepSeek，更便宜）生成结构化摘要
 * - 无 key 或失败时回退到规则版（截取最近消息）
 */

/** 规则版兜底：取最后 8 条消息，用户/AI 分别提炼要点 */
export function buildLocalSummary(messages: ChatMessage[]): string {
  const tail = messages.slice(-8);
  const user = tail
    .filter((m) => m.role === "user")
    .map((m) => `- ${m.content.slice(0, 120)}`)
    .join("\n");
  const ai = tail
    .filter((m) => m.role === "ai" && !m.compare)
    .map((m) => `- ${m.content.slice(0, 120)}`)
    .join("\n");
  return `用户最近要点：\n${user || "（无）"}\n\nAI 已给出的关键结论：\n${ai || "（无）"}`;
}

/** 把会话历史拼成可供 AI 摘要的文本（用户/AI 对话，截断超长单条） */
function historyToText(messages: ChatMessage[]): string {
  const lines: string[] = [];
  let total = 0;
  // 从后往前保留更多近期内容，最多 ~6000 字
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    let content = m.content;
    if (m.role === "ai" && m.compare) {
      // 对比轮：拼接各列结果
      content = m.compare
        .map((c) => `[${c.model}] ${c.error ? "出错" : c.content}`)
        .join("\n");
    }
    const line = `【${m.role === "user" ? "用户" : "AI"}】${content.slice(0, 400)}`;
    if (total + line.length > 6000) break;
    lines.unshift(line);
    total += line.length;
  }
  return lines.join("\n");
}

/** 生成接力摘要：AI 优先，失败回退规则版。绝不返回空字符串。 */
export async function buildHandoffSummary(
  messages: ChatMessage[],
  apiKeys: ApiKeys
): Promise<string> {
  if (messages.length === 0) return "";

  const helper: HelperChoice | null = pickHelper(apiKeys);
  if (helper) {
    try {
      const r = await quickChat({
        provider: helper.model,
        apiKey: helper.apiKey,
        systemHint: HANDOFF_SUMMARY_SYSTEM,
        messages: [
          { role: "user", content: HANDOFF_SUMMARY_USER(historyToText(messages)) },
        ],
      });
      if (r.ok && r.content.trim().length > 20) {
        return r.content.trim();
      }
    } catch {
      /* 回退规则版 */
    }
  }
  return buildLocalSummary(messages);
}
