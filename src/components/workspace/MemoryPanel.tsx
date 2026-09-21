"use client";

import { useFlowHub } from "@/lib/store";
import { useMemoryDetailModal } from "@/components/modals";
import { toast } from "@/components/ui";
import type { Memory } from "@/lib/types";

const SOURCE_BADGE: Record<NonNullable<Memory["source"]>, { label: string; color: string }> = {
  ai: { label: "AI 提取", color: "#13DDC4" },
  user: { label: "手动", color: "#9381FF" },
  seed: { label: "示例", color: "#71717F" },
};

export function MemoryPanel() {
  const memories = useFlowHub((s) => s.memories);
  const setWorkspaceView = useFlowHub((s) => s.setWorkspaceView);
  const clearSeedMemories = useFlowHub((s) => s.clearSeedMemories);
  const { open: openMemory } = useMemoryDetailModal();

  const featured = memories.slice(0, 5);
  const seedCount = memories.filter((m) => m.source === "seed").length;

  return (
    <aside
      className="hidden lg:flex w-rpanel shrink-0 flex-col gap-3 px-5 py-5 overflow-y-auto"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-h3 font-semibold text-text-primary">持久记忆库</div>
        <div
          className="px-2 py-0.5 rounded-pill text-tag text-text-muted"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {memories.length} 条
        </div>
      </div>
      <div className="text-tag text-text-muted">
        跨 AI 跨会话共享 · 自动注入新对话
      </div>

      {seedCount > 0 && (
        <button
          onClick={() => {
            clearSeedMemories();
            toast(`已清空 ${seedCount} 条示例记忆`, "#71717F");
          }}
          className="self-start text-tag text-text-muted hover:text-text-tertiary transition"
          style={{
            borderBottom: "1px dashed rgba(255,255,255,0.2)",
          }}
        >
          清空 {seedCount} 条示例记忆
        </button>
      )}

      <div className="flex flex-col gap-2.5 mt-1">
        {featured.map((m) => {
          const src = SOURCE_BADGE[m.source ?? "user"];
          return (
            <button
              key={m.id}
              onClick={() => openMemory(m.id)}
              className="text-left px-3 py-2.5 rounded-lg transition hover:bg-white/[0.07]"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="rounded-pill" style={{ width: 6, height: 6, background: m.color }} />
                <span className="text-label text-text-muted">{m.label}</span>
                <span
                  className="ml-auto px-1.5 py-px rounded-pill text-tag"
                  style={{
                    color: src.color,
                    background: `${src.color}1A`,
                  }}
                >
                  {src.label}
                </span>
              </div>
              <div className="text-body-sm text-text-tertiary leading-[18px] line-clamp-2">
                {m.title} · {m.content}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setWorkspaceView("memory")}
        className="text-label text-text-muted hover:text-text-tertiary transition mt-1 text-left"
      >
        查看全部 {memories.length} 条记忆 →
      </button>
    </aside>
  );
}
