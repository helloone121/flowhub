"use client";

import { useEffect, useRef } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { ContextBudget } from "./ContextBudget";
import { ModelSwitch } from "./ModelSwitch";

export function MessageList() {
  const currentSessionId = useFlowHub((s) => s.currentSessionId);
  const sessions = useFlowHub((s) => s.sessions);
  const messages = useFlowHub((s) =>
    s.currentSessionId ? s.messages[s.currentSessionId] ?? [] : []
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const session = sessions.find((x) => x.id === currentSessionId);
  const model = AI_MODELS[session?.model ?? "kimi"];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <>
      <div
        className="px-7 pt-5 pb-3 flex items-center gap-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="text-h3 font-semibold text-text-primary">
          {session?.title.replace(" · 进行中", "") ?? "新会话"}
        </div>
        {session?.handoffCount != null && session.handoffCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-label"
            style={{ background: "rgba(147,129,255,0.16)", color: "#B4A7FF" }}
          >
            <span className="rounded-pill" style={{ width: 6, height: 6, background: "#9381FF" }} />
            接力 #{session.handoffCount}
          </span>
        )}
        <div className="flex-1 min-w-[20px]" />
        <ContextBudget sessionId={currentSessionId} />
        <ModelSwitch />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-7 py-6">
        {messages.length === 0 && (
          <div className="text-body-sm text-text-muted text-center py-12">
            还没有消息。在下方输入栏开始对话，或输入 `/` 创建调度任务。
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end mb-5 animate-fade-up">
                <div
                  className="max-w-[60%] px-4 py-2.5 rounded-2xl text-body leading-[20px] text-text-secondary"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  {m.content}
                </div>
              </div>
            );
          }
          const aiColor = m.color ?? model.color;
          return (
            <div key={m.id} className="mb-5 animate-fade-up">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-pill" style={{ width: 8, height: 8, background: aiColor }} />
                <span className="text-body-sm font-semibold" style={{ color: aiColor }}>
                  {AI_MODELS[m.model ?? "kimi"].name}
                </span>
                {m.time && <span className="text-tag text-text-muted">{m.time}</span>}
              </div>
              <div className="text-body text-text-tertiary leading-[22px] whitespace-pre-line">
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
