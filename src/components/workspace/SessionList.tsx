"use client";

import { useEffect, useState } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import type { ModelId } from "@/lib/types";
import { toast } from "@/components/ui";
import { WorkspaceTabs } from "./WorkspaceTabs";

const GROUPS: ModelId[] = ["kimi", "deepseek", "claude", "midjourney"];
const GROUP_LABELS: Record<ModelId, string> = {
  kimi: "KIMI · 长文本",
  deepseek: "DEEPSEEK · 推理",
  claude: "CLAUDE · 写作",
  midjourney: "MIDJOURNEY · 图像",
};

export function SessionList() {
  const sessions = useFlowHub((s) => s.sessions);
  const currentId = useFlowHub((s) => s.currentSessionId);
  const search = useFlowHub((s) => s.searchQuery);
  const setSearch = useFlowHub((s) => s.setSearch);
  const selectSession = useFlowHub((s) => s.selectSession);
  const newSession = useFlowHub((s) => s.newSession);
  const deleteSession = useFlowHub((s) => s.deleteSession);

  // 待确认删除的会话 id；3 秒不操作自动取消，防误删
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const filtered = sessions.filter((s) =>
    search ? s.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  const grouped = GROUPS.map((g) => ({
    group: g,
    items: filtered.filter((s) => s.group === g),
  })).filter((x) => x.items.length > 0);

  return (
    <aside
      className="hidden md:flex w-sidebar shrink-0 flex-col gap-3.5 px-5 py-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <WorkspaceTabs />

      <button
        onClick={() => {
          newSession("kimi", "新会话", "");
          useFlowHub.getState().setWorkspaceView("chat");
          toast(`已创建新会话`, "#2EA7FF");
        }}
        className="h-9 rounded-md flex items-center justify-center gap-2 text-body-sm font-medium text-white transition hover:opacity-90"
        style={{ background: "var(--grad-brand)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
        新建对话
      </button>

      <div
        className="h-9 rounded-md px-2.5 flex items-center gap-2"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm10 2l-4.35-4.35"
            stroke="#A9A9B7"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索会话"
          className="bg-transparent outline-none flex-1 text-body-sm text-text-secondary placeholder:text-text-disabled"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {grouped.length === 0 && (
          <div className="text-tag text-text-disabled px-2 py-6 text-center">
            无匹配会话
          </div>
        )}
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <div className="text-tag tracking-[1px] font-medium text-text-disabled px-1 mt-2 mb-1">
              {GROUP_LABELS[group]}
            </div>
            {items.map((s) => {
              const active = s.id === currentId;
              const color = AI_MODELS[s.model].color;
              const confirming = confirmId === s.id;
              return (
                <div
                  key={s.id}
                  className="group w-full flex items-center gap-1 h-9 pl-2.5 pr-1.5 rounded-md transition"
                  style={{
                    background: active
                      ? "rgba(147,129,255,0.12)"
                      : "transparent",
                  }}
                >
                  <button
                    onClick={() => {
                      selectSession(s.id);
                      useFlowHub.getState().setWorkspaceView("chat");
                    }}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <span
                      className="rounded-pill shrink-0"
                      style={{ width: 8, height: 8, background: color }}
                    />
                    <span
                      className="text-body-sm truncate"
                      style={{ color: active ? "#E9E9F0" : "#A9A9B7" }}
                    >
                      {s.title}
                    </span>
                  </button>

                  {confirming ? (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          deleteSession(s.id);
                          setConfirmId(null);
                          toast(`已删除会话「${s.title}」`, "#FF5C5C");
                        }}
                        className="text-tag px-1.5 py-0.5 rounded transition hover:bg-red-500/15"
                        style={{ color: "#FF7A7A" }}
                        title="确认删除"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-white/10 transition"
                        title="取消"
                        aria-label="取消删除"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="text-tag text-text-disabled shrink-0 group-hover:hidden">
                        {s.time}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmId(s.id);
                        }}
                        className="shrink-0 w-5 h-5 hidden group-hover:flex items-center justify-center rounded text-text-disabled hover:text-[#FF7A7A] hover:bg-white/10 transition"
                        title="删除会话"
                        aria-label={`删除会话 ${s.title}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="text-tag text-text-disabled px-2 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        v0.1 · MVP · 数据存本地
      </div>
    </aside>
  );
}
