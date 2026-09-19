"use client";

import type { ChatMessage, ModelId } from "./types";
import { AI_MODELS } from "./ai-meta";

/**
 * 前端 AI 调用客户端
 * 走 /api/chat/[provider] Route Handler 代理：
 * - key 不暴露到浏览器 Network 面板
 * - 跨域由 Next.js 服务端转发解决
 * - 返回流式 SSE，前端逐字渲染
 */

export interface ChatRequest {
  provider: ModelId;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  apiKey?: string; // 个人 MVP：从 localStorage 带过来，Route Handler 优先用 env
  systemHint?: string;
}

export interface ChatStreamHandlers {
  onToken: (delta: string) => void;
  onDone: (full: string) => void;
  onError: (err: string) => void;
}

/**
 * 流式调用 AI · 返回完整文本
 * 内部用 fetch + ReadableStream 解析 SSE
 */
export async function streamChat(
  req: ChatRequest,
  handlers: ChatStreamHandlers
): Promise<void> {
  const meta = AI_MODELS[req.provider];
  try {
    const res = await fetch(`/api/chat/${req.provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: req.messages,
        apiKey: req.apiKey,
        systemHint: req.systemHint,
        model: meta.model,
      }),
    });

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      handlers.onError(`请求失败 ${res.status}：${txt || res.statusText}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按 \n\n 切 SSE event
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            handlers.onDone(full);
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta =
              json.choices?.[0]?.delta?.content ??
              json.choices?.[0]?.message?.content ??
              json.delta ??
              "";
            if (delta) {
              full += delta;
              handlers.onToken(delta);
            }
          } catch {
            // 非 JSON 行（如注释），忽略
          }
        }
      }
    }
    handlers.onDone(full);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    handlers.onError(msg);
  }
}

export interface QuickChatRequest {
  provider: ModelId;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  apiKey?: string;
  systemHint?: string;
  /** true 时要求模型输出 JSON（DeepSeek JSON mode；Kimi 走 prompt 约束） */
  json?: boolean;
}

/**
 * 非流式一次性调用 · 用于记忆抽取 / 任务拆解 / 全案汇总等结构化场景
 * 返回纯文本；失败时返回 { ok:false, error }
 */
export async function quickChat(
  req: QuickChatRequest
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const meta = AI_MODELS[req.provider];
  try {
    const res = await fetch(`/api/chat/${req.provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: req.messages,
        apiKey: req.apiKey,
        systemHint: req.systemHint,
        model: meta.model,
        stream: false,
        ...(req.json ? { responseFormat: "json" } : {}),
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[]; error?: string }
      | null;
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ?? `请求失败 ${res.status}`,
      };
    }
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) return { ok: false, error: "模型返回为空" };
    return { ok: true, content };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 构造会话历史 messages 数组（OpenAI 格式） */
export function buildChatHistory(
  history: ChatMessage[],
  systemHint?: string
): { role: "system" | "user" | "assistant"; content: string }[] {
  const out: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (systemHint) {
    out.push({ role: "system", content: systemHint });
  }
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}

/**
 * 按目标模型构造历史（对比/重新生成用）：
 * - user 消息照常
 * - 单聊 ai 消息只带同一模型的
 * - 对比轮只带该模型所属那一列
 */
export function buildHistoryForModel(
  history: ChatMessage[],
  model: ModelId,
  systemHint?: string
): { role: "system" | "user" | "assistant"; content: string }[] {
  const out: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (systemHint) {
    out.push({ role: "system", content: systemHint });
  }
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    if (m.compare) {
      const col = m.compare.find((c) => c.model === model);
      if (col && col.content && !col.error) {
        out.push({ role: "assistant", content: col.content });
      }
      continue;
    }
    if (m.model === model && m.content) {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}
