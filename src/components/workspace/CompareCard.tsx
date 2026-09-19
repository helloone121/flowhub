"use client";

import { useState } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { buildHistoryForModel, quickChat } from "@/lib/ai-client";
import { toast } from "@/components/ui";
import type { ChatMessage, CompareColumn } from "@/lib/types";

const SYSTEM_HINT =
  "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。";

export function CompareCard({
  sessionId,
  messageId,
  col,
}: {
  sessionId: string;
  col: CompareColumn;
  messageId: string;
}) {
  const meta = AI_MODELS[col.model];
  const apiKeys = useFlowHub((s) => s.apiKeys);
  const patchMessage = useFlowHub((s) => s.patchMessage);
  const setModel = useFlowHub((s) => s.setModel);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const patchCol = (patch: Partial<CompareColumn>) => {
    const msg =
      useFlowHub
        .getState()
        .messages[sessionId]?.find((m) => m.id === messageId) ?? null;
    if (!msg?.compare) return;
    patchMessage(sessionId, messageId, {
      compare: msg.compare.map((c) =>
        c.model === col.model ? { ...c, ...patch } : c
      ),
    });
  };

  async function regenerate() {
    if (busy) return;
    const apiKey = useFlowHub.getState().apiKeys[col.model as "kimi" | "deepseek"] ?? "";
    if (!apiKey) {
      toast(`请先在「设置」页填入 ${meta.name} 的 API key`, "#F5C542");
      return;
    }
    const all = useFlowHub.getState().messages[sessionId] ?? [];
    const idx = all.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const userMsg = [...all.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!userMsg) return;

    setBusy(true);
    patchCol({ content: "", error: undefined, ms: undefined });
    const history = buildHistoryForModel(all.slice(0, idx), col.model, SYSTEM_HINT);
    history.push({ role: "user", content: userMsg.content });
    const started = performance.now();
    const r = await quickChat({
      provider: col.model,
      messages: history,
      apiKey,
    });
    if (r.ok) {
      patchCol({ content: r.content, ms: Math.round(performance.now() - started) });
      toast(`${meta.name} 已重新生成`, meta.color);
    } else {
      patchCol({ error: r.error, ms: Math.round(performance.now() - started) });
    }
    setBusy(false);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col min-w-0"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${meta.color}33`,
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-3.5 py-2.5"
        style={{ background: `${meta.color}14` }}
      >
        <span className="rounded-pill shrink-0" style={{ width: 8, height: 8, background: meta.color }} />
        <span className="text-body-sm font-semibold" style={{ color: meta.color }}>
          {meta.name}
        </span>
        <span className="text-tag text-text-disabled">{meta.capability}</span>
        <div className="flex-1" />
        {!busy && col.ms != null && !col.error && (
          <span className="text-tag text-text-disabled">{(col.ms / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* 正文 */}
      <div className="px-3.5 py-3 flex-1">
        {busy ? (
          <div className="flex items-center gap-1 py-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : col.error ? (
          <div className="text-body-sm leading-[20px]" style={{ color: "#FF8A8A" }}>
            调用失败：{col.error}
          </div>
        ) : col.content ? (
          <div className="text-body-sm text-text-tertiary leading-[21px] whitespace-pre-line">
            {col.content}
          </div>
        ) : (
          <div className="text-tag text-text-disabled">无内容</div>
        )}
      </div>

      {/* 操作条 */}
      {!busy && (col.content || col.error) && (
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <ActionButton
            disabled={!col.content}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(col.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast("复制失败", "#FF5C5C");
              }
            }}
          >
            {copied ? "已复制" : "复制"}
          </ActionButton>
          <ActionButton onClick={regenerate}>重新生成</ActionButton>
          <ActionButton
            disabled={!col.content}
            onClick={() => {
              setModel(col.model);
              toast(`已切换到 ${meta.name}，可直接在下方追问`, meta.color);
            }}
          >
            用它继续
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 rounded-md text-tag text-text-muted hover:text-text-primary hover:bg-white/10 transition disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** 对比轮的整体消息头（MessageList 在卡片网格上方渲染） */
export function CompareIntro({ cols }: { cols: ChatMessage["compare"] }) {
  return (
    <div className="flex items-center gap-2 mb-2 text-label text-text-muted">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 3v18M15 3v18M3 9h6M3 15h6M15 9h6M15 15h6"
          stroke="#71717F"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </svg>
      多模型对比 · {cols?.length ?? 0} 路同时回答
    </div>
  );
}
