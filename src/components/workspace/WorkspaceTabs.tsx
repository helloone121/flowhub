"use client";

import { useFlowHub } from "@/lib/store";
import type { WorkspaceView } from "@/lib/types";

const TABS: { id: WorkspaceView; label: string }[] = [
  { id: "chat", label: "对话" },
  { id: "task", label: "任务" },
  { id: "memory", label: "记忆" },
];

/**
 * 工作台内三视图切换：对话 / 任务 / 记忆
 * 任务运行中时「任务」上挂青色脉冲点
 */
export function WorkspaceTabs({ className = "" }: { className?: string }) {
  const view = useFlowHub((s) => s.workspaceView);
  const setView = useFlowHub((s) => s.setWorkspaceView);
  const task = useFlowHub((s) => s.dispatchTask);

  // 拆解中或尚未出汇总 = 仍在跑
  const taskRunning = !!task && (task.parsing || !task.summary);

  return (
    <div
      className={`flex items-center gap-0.5 p-0.5 rounded-pill ${className}`}
      style={{ background: "rgba(255,255,255,0.05)" }}
    >
      {TABS.map((t) => {
        const active = view === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className="relative px-3 h-7 rounded-pill text-body-sm transition whitespace-nowrap"
            style={{
              background: active ? "rgba(46,167,255,0.14)" : "transparent",
              color: active ? "#7CC4FF" : "#A9A9B7",
              fontWeight: active ? 500 : 400,
            }}
          >
            {t.label}
            {t.id === "task" && taskRunning && (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-pill animate-pulse-soft"
                style={{ width: 7, height: 7, background: "#13DDC4" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
