"use client";

import { useFlowHub } from "@/lib/store";
import { AI_MODELS, HANDOFF_THRESHOLD } from "@/lib/ai-meta";
import { contextUsage, sumSessionTokens, tokensToHandoff } from "@/lib/tokens";

export function ContextBudget({ sessionId }: { sessionId: string }) {
  const messages = useFlowHub((s) => s.messages[sessionId] ?? []);
  const sessions = useFlowHub((s) => s.sessions);
  const handoffSession = useFlowHub((s) => s.handoffSession);
  const prefs = useFlowHub((s) => s.prefs);

  const session = sessions.find((x) => x.id === sessionId);
  const tokens = sumSessionTokens(messages);
  const pct = contextUsage(tokens);
  const remaining = tokensToHandoff(tokens);
  const overLimit = tokens >= HANDOFF_THRESHOLD;

  const model = AI_MODELS[session?.model ?? "kimi"];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex flex-col gap-1 w-[170px]">
        <div className="text-tag text-text-muted">
          上下文 {pct}% · {overLimit ? "已触发接力" : `距接力 ${Math.max(0, Math.round(remaining / 1000))}k`}
        </div>
        <div
          className="rounded-pill overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)", height: 5 }}
        >
          <div
            className="h-full rounded-pill"
            style={{
              width: `${pct}%`,
              background: overLimit ? "var(--color-status-error)" : "var(--grad-brand)",
              transition: "width var(--duration-base) var(--ease-out)",
            }}
          />
        </div>
      </div>

      {overLimit && prefs.autoHandoff && (
        <button
          onClick={() => {
            const summary = buildSummary(messages);
            handoffSession(sessionId, summary);
          }}
          className="px-2.5 py-1 rounded-pill text-label font-medium transition"
          style={{
            background: "rgba(46,167,255,0.14)",
            color: "#7CC4FF",
            border: "1px solid rgba(46,167,255,0.3)",
          }}
        >
          自动接力到新会话 →
        </button>
      )}
    </div>
  );
}

// 摘要生成：取最后 6 条消息压成结构化摘要
function buildSummary(messages: { role: string; content: string }[]): string {
  const tail = messages.slice(-6);
  const user = tail.filter((m) => m.role === "user").map((m) => `- ${m.content.slice(0, 80)}`).join("\n");
  const ai = tail.filter((m) => m.role === "ai").map((m) => `- ${m.content.slice(0, 80)}`).join("\n");
  return `用户最近要点：\n${user || "（无）"}\n\nAI 已给出的关键结论：\n${ai || "（无）"}`;
}
