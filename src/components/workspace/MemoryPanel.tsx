"use client";

import { useFlowHub } from "@/lib/store";
import { useMemoryDetailModal } from "@/components/modals";

export function MemoryPanel() {
  const memories = useFlowHub((s) => s.memories);
  const setPage = useFlowHub((s) => s.setPage);
  const { open: openMemory } = useMemoryDetailModal();

  const featured = memories.slice(0, 5);

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

      <div className="flex flex-col gap-2.5 mt-2">
        {featured.map((m) => (
          <button
            key={m.id}
            onClick={() => openMemory(m.id)}
            className="text-left px-3 py-2.5 rounded-lg transition hover:bg-white/[0.07]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="rounded-pill" style={{ width: 6, height: 6, background: m.color }} />
              <span className="text-label text-text-muted">{m.label}</span>
            </div>
            <div className="text-body-sm text-text-tertiary leading-[18px] line-clamp-2">
              {m.title} · {m.content}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => setPage("memory")}
        className="text-label text-text-muted hover:text-text-tertiary transition mt-1 text-left"
      >
        查看全部 {memories.length} 条记忆 →
      </button>
    </aside>
  );
}
