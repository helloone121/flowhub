"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { ContextBudget } from "./ContextBudget";
import { ModelSwitch } from "./ModelSwitch";
import { CompareCard, CompareIntro } from "./CompareCard";
import { GhostButton } from "@/components/ui";
import type { ChatMessage } from "@/lib/types";

export function MessageList() {
  const currentSessionId = useFlowHub((s) => s.currentSessionId);
  const sessions = useFlowHub((s) => s.sessions);
  const messages = useFlowHub((s) =>
    s.currentSessionId ? s.messages[s.currentSessionId] ?? [] : []
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const session = sessions.find((x) => x.id === currentSessionId);
  const model = AI_MODELS[session?.model ?? "kimi"];

  const handleExportPdf = useCallback(() => {
    if (!messages.length) return;
    const title = session?.title.replace(" · 进行中", "") ?? "聊天记录";
    exportChatPdf(messages, title);
  }, [messages, session?.title]);

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
        <GhostButton
          onClick={handleExportPdf}
          className={messages.length === 0 ? "opacity-40 pointer-events-none" : ""}
        >
          导出 PDF
        </GhostButton>
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
                  <UserBubbleContent content={m.content} />
                </div>
              </div>
            );
          }
          // 多模型对比轮
          if (m.compare && m.compare.length > 0) {
            return (
              <div key={m.id} className="mb-5 animate-fade-up">
                <CompareIntro cols={m.compare} />
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(m.compare.length, 2)}, minmax(0, 1fr))`,
                  }}
                >
                  {m.compare.map((c) => (
                    <CompareCard
                      key={`${m.id}-${c.model}`}
                      sessionId={currentSessionId}
                      messageId={m.id}
                      col={c}
                    />
                  ))}
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

/**
 * 解析用户消息中的附件块（ChatInput.composeWithAttachments 生成）
 * 正文正常显示；附件折叠成卡片，点开可查看原文
 */
const FILE_BLOCK_RE =
  /【附件：(.+?)（([\d.]+) KB）】\n<<<FILE:[\s\S]*?>>>\n([\s\S]*?)\n<<<END FILE>>>/g;

function UserBubbleContent({ content }: { content: string }) {
  if (!content.includes("<<<FILE:")) {
    return <span className="whitespace-pre-line">{content}</span>;
  }
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  FILE_BLOCK_RE.lastIndex = 0;
  let key = 0;
  while ((match = FILE_BLOCK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const intro = content.slice(lastIndex, match.index).trim();
      if (intro) parts.push(<div key={`t${key++}`} className="whitespace-pre-line mb-2">{intro}</div>);
    }
    const [, name, kb, body] = match;
    parts.push(
      <details
        key={`f${key++}`}
        className="rounded-lg my-1 text-body-sm"
        style={{ background: "rgba(147,129,255,0.10)", border: "1px solid rgba(147,129,255,0.3)" }}
      >
        <summary className="cursor-pointer select-none px-2.5 py-1.5 flex items-center gap-1.5 list-none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke="#B4A7FF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-medium" style={{ color: "#C9C0FF" }}>{name}</span>
          <span className="opacity-50">{kb} KB · 点击展开原文</span>
        </summary>
        <pre
          className="px-2.5 pb-2.5 pt-1 overflow-x-auto text-tag leading-[18px] whitespace-pre"
          style={{ color: "rgba(255,255,255,0.65)", maxHeight: 260 }}
        >
          {body}
        </pre>
      </details>
    );
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) parts.push(<div key={`t${key++}`} className="whitespace-pre-line mt-2">{tail}</div>);
  return <>{parts}</>;
}

// ---------- 导出 PDF ----------
/** 转义 HTML 特殊字符 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 清理用户消息中的附件块，导出时只保留文件名 */
function stripAttachments(content: string): string {
  return content
    .replace(
      /【附件：(.+?)（[\d.]+ KB）】\n<<<FILE:[\s\S]*?>>>\n[\s\S]*?\n<<<END FILE>>>/g,
      "【附件：$1】"
    )
    .replace(/<<<FILE:[\s\S]*?<<<END FILE>>>/g, "【附件内容省略】");
}

function exportChatPdf(messages: ChatMessage[], title: string) {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      parts.push(
        `<div class="msg-user"><div class="bubble-user">${esc(stripAttachments(m.content))}</div></div>`
      );
      continue;
    }
    if (m.compare && m.compare.length > 0) {
      const cells = m.compare
        .map(
          (c) =>
            `<td class="cmp-cell"><div class="cmp-head" style="color:${c.error ? "#999" : c.model ? AI_MODELS[c.model].color : "#333"}">${esc(
              c.error ? "出错" : AI_MODELS[c.model ?? "kimi"].name
            )}</div><div class="cmp-body">${esc(c.error ?? c.content)}</div>${
              c.ms != null ? `<div class="cmp-ms">耗时 ${c.ms}ms</div>` : ""
            }</td>`
        )
        .join("");
      parts.push(
        `<table class="cmp-table"><tr>${cells}</tr></table>`
      );
      continue;
    }
    const name = AI_MODELS[m.model ?? "kimi"].name;
    const color = m.color ?? AI_MODELS[m.model ?? "kimi"].color;
    parts.push(
      `<div class="msg-ai"><div class="ai-head"><span class="dot" style="background:${color}"></span><span style="color:${color}">${esc(name)}</span>${
        m.time ? `<span class="ai-time">${esc(m.time)}</span>` : ""
      }</div><div class="ai-body">${esc(m.content)}</div></div>`
    );
  }

  const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>${esc(
    title
  )} - 聊天记录</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#fff;color:#1a1a1a;padding:40px 32px;max-width:820px;margin:0 auto}
.doc-title{font-size:20px;font-weight:700;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #e0e0e0}
.msg-user{display:flex;justify-content:flex-end;margin:16px 0}
.bubble-user{background:#f0f0f3;border-radius:12px;padding:10px 16px;max-width:72%;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.msg-ai{margin:16px 0}
.ai-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.ai-head .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.ai-head span{font-size:13px;font-weight:600}
.ai-time{color:#aaa;font-weight:400;font-size:12px;margin-left:4px}
.ai-body{font-size:14px;line-height:1.65;color:#333;white-space:pre-wrap;word-break:break-word}
.cmp-table{width:100%;border-collapse:separate;border-spacing:8px 0;margin:16px 0}
.cmp-cell{vertical-align:top;width:50%;border:1px solid #e0e0e0;border-radius:8px;padding:12px}
.cmp-head{font-size:13px;font-weight:700;margin-bottom:8px}
.cmp-body{font-size:13px;line-height:1.6;color:#333;white-space:pre-wrap;word-break:break-word}
.cmp-ms{font-size:11px;color:#aaa;margin-top:8px}
.foot{margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
@media print{body{padding:0;max-width:none}@page{margin:18mm 15mm}}
</style></head><body>
<div class="doc-title">${esc(title)}</div>
${parts.join("\n")}
<div class="foot">FlowHub · ${new Date().toLocaleString("zh-CN")}</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("请允许弹窗以导出 PDF");
    return;
  }
  w.document.write(html);
  w.document.close();
  // 等渲染完成后触发打印
  w.onload = () => {
    setTimeout(() => w.print(), 200);
  };
  // 兜底：onload 可能已触发
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* 已触发或窗口已关闭 */
    }
  }, 800);
}
