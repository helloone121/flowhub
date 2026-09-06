"use client";

import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import type { ModelId } from "@/lib/types";
import { toast } from "@/components/ui";

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
      <button
        onClick={() => {
          newSession("kimi", "新会话", "");
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
              return (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className="w-full flex items-center gap-2 h-9 px-2.5 rounded-md cursor-pointer transition text-left"
                  style={{
                    background: active ? "rgba(147,129,255,0.12)" : "transparent",
                  }}
                >
                  <span
                    className="rounded-pill shrink-0"
                    style={{ width: 8, height: 8, background: color }}
                  />
                  <span
                    className="text-body-sm truncate flex-1"
                    style={{ color: active ? "#E9E9F0" : "#A9A9B7" }}
                  >
                    {s.title}
                  </span>
                  <span className="text-tag text-text-disabled shrink-0">
                    {s.time}
                  </span>
                </button>
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
