"use client";

import { useState, useRef, useEffect } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { autoRoute } from "@/lib/routing";
import { streamChat, buildChatHistory } from "@/lib/ai-client";
import type { ModelId } from "@/lib/types";
import { toast } from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";

export function ChatInput() {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<{ model: ModelId; color: string; content: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // store
  const currentSessionId = useFlowHub((s) => s.currentSessionId);
  const currentModel = useFlowHub((s) => s.currentModel);
  const prefs = useFlowHub((s) => s.prefs);
  const apiKeys = useFlowHub((s) => s.apiKeys);
  const messages = useFlowHub((s) =>
    s.currentSessionId ? s.messages[s.currentSessionId] ?? [] : []
  );
  const pushUserMessage = useFlowHub((s) => s.pushUserMessage);
  const pushAiMessage = useFlowHub((s) => s.pushAiMessage);
  const routeFor = useFlowHub((s) => s.routeFor);
  const setModel = useFlowHub((s) => s.setModel);

  const { open: openNewTask, setInitialDesc } = useNewTaskModal();

  // 自动路由提示（不强制切换，只显示）
  const routeHint =
    text.length > 0 && prefs.autoRoute
      ? (() => {
          const r = autoRoute(text);
          return r.model !== currentModel ? r : null;
        })()
      : null;

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + "px";
    }
  }, [text]);

  async function handleSend() {
    const t = text.trim();
    if (!t || !currentSessionId) return;

    // 1. / 触发调度任务
    if (t.startsWith("/")) {
      const desc = t.slice(1).trim();
      setText("");
      if (desc) {
        setInitialDesc(desc);
        openNewTask();
      } else {
        openNewTask();
      }
      return;
    }

    // 2. 自动路由（按需切换 model）
    let model = currentModel;
    if (prefs.autoRoute) {
      const r = routeFor(t);
      if (r.model !== currentModel) {
        setModel(r.model);
        model = r.model;
        toast(`已自动切换：${r.reason}`, AI_MODELS[r.model].color);
      }
    }

    // 3. push 用户消息 + 清空输入
    pushUserMessage(currentSessionId, t);
    setText("");

    // 4. 检查 key（mock 跳过）
    const meta = AI_MODELS[model];
    if (!meta.mock && !(apiKeys[model as keyof typeof apiKeys] ?? "")) {
      pushAiMessage(currentSessionId, {
        role: "ai",
        model,
        color: meta.color,
        time: nowHHMM(),
        content: `未检测到 ${meta.name} 的 API key。请在「设置」页填入后重试。`,
      });
      return;
    }

    // 5. 流式调用
    setTyping({ model, color: meta.color, content: "" });
    const history = buildChatHistory(
      messages,
      "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。"
    );
    history.push({ role: "user", content: t });

    let acc = "";
    await streamChat(
      {
        provider: model,
        messages: history,
        apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
        systemHint:
          "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。",
      },
      {
        onToken: (delta) => {
          acc += delta;
          setTyping({ model, color: meta.color, content: acc });
        },
        onDone: (full) => {
          setTyping(null);
          pushAiMessage(currentSessionId, {
            role: "ai",
            model,
            color: meta.color,
            time: nowHHMM(),
            content: full || acc,
          });
        },
        onError: (err) => {
          setTyping(null);
          pushAiMessage(currentSessionId, {
            role: "ai",
            model,
            color: meta.color,
            time: nowHHMM(),
            content: `调用失败：${err}`,
          });
        },
      }
    );
  }

  return (
    <div className="px-7 pb-6">
      {routeHint && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-2 text-label"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 9h13l-4-4M20 15H7l4 4"
              stroke="#71717F"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-text-muted">
            将自动路由：{routeHint.reason}（点击切换或继续）
          </span>
          <button
            onClick={() => {
              setModel(routeHint.model);
              toast(`已切换到 ${AI_MODELS[routeHint.model].name}`, AI_MODELS[routeHint.model].color);
            }}
            className="text-text-secondary hover:text-text-primary transition"
          >
            立即切换
          </button>
        </div>
      )}

      <div
        className="flex items-end gap-3 rounded-2xl px-3.5 py-2 transition"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          minHeight: "var(--input-h)",
        }}
      >
        <button className="text-text-muted hover:text-text-primary transition shrink-0 mb-1.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={`给 ${AI_MODELS[currentModel].name} 发送消息，输入 / 创建调度任务`}
          className="flex-1 bg-transparent outline-none text-body text-text-primary placeholder:text-text-disabled resize-none py-2.5 leading-[20px]"
          style={{ maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || typing != null}
          className="shrink-0 mb-1 w-9 h-9 rounded-md flex items-center justify-center text-white transition disabled:opacity-40"
          style={{ background: "var(--grad-brand)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="text-tag text-text-muted mt-2 px-1 flex items-center gap-3 flex-wrap">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <span>·</span>
        <span>输入 / 创建调度任务</span>
        <span>·</span>
        <span>当前模型 {AI_MODELS[currentModel].name}</span>
      </div>

      {/* typing 指示气泡 */}
      {typing && (
        <div className="mt-4 mb-1 animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-pill" style={{ width: 8, height: 8, background: typing.color }} />
            <span className="text-body-sm font-semibold" style={{ color: typing.color }}>
              {AI_MODELS[typing.model].name}
            </span>
          </div>
          {typing.content ? (
            <div className="text-body text-text-tertiary leading-[22px] whitespace-pre-line">
              {typing.content}
              <span className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse-soft" style={{ background: typing.color }} />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
