"use client";

import { useState } from "react";
import { useFlowHub } from "@/lib/store";
import { MEMORY_LABELS } from "@/lib/ai-meta";
import { PrimaryButton, GhostButton, Modal, TextInput, toast } from "@/components/ui";
import { useMemoryDetailModal } from "@/components/modals";
import type { MemoryCategory } from "@/lib/types";

const CATS: MemoryCategory[] = ["background", "pref", "decision", "data"];
const CAT_COLORS: Record<MemoryCategory, string> = {
  background: "#13DDC4",
  pref: "#2EA7FF",
  decision: "#9381FF",
  data: "#F5C542",
};

export function MemoryLibrary() {
  const memories = useFlowHub((s) => s.memories);
  const filter = useFlowHub((s) => s.memoryFilter);
  const setFilter = useFlowHub((s) => s.setMemoryFilter);
  const addMemory = useFlowHub((s) => s.addMemory);
  const exportAll = useFlowHub((s) => s.exportAll);
  const { open: openMemory } = useMemoryDetailModal();

  const [creating, setCreating] = useState(false);
  const [draftCat, setDraftCat] = useState<MemoryCategory>("background");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const filtered =
    filter === "all" ? memories : memories.filter((m) => m.category === filter);

  const counts: Record<string, number> = {
    all: memories.length,
    background: memories.filter((m) => m.category === "background").length,
    pref: memories.filter((m) => m.category === "pref").length,
    decision: memories.filter((m) => m.category === "decision").length,
    data: memories.filter((m) => m.category === "data").length,
  };

  const filters: { id: "all" | MemoryCategory; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "background", label: "项目背景" },
    { id: "pref", label: "用户偏好" },
    { id: "decision", label: "关键决策" },
    { id: "data", label: "数据资产" },
  ];

  return (
    <div className="px-7 pt-5 pb-12">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-h1 font-semibold text-text-primary mb-1.5">
            持久记忆库
          </h1>
          <p className="text-body-sm text-text-muted">
            跨 AI、跨会话共享 · 自动注入新对话
          </p>
        </div>
        <div className="flex gap-2">
          <GhostButton
            onClick={() => {
              const json = exportAll();
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flowhub-export-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast("已导出全部数据", "#13DDC4");
            }}
          >
            导出 JSON
          </GhostButton>
          <PrimaryButton onClick={() => setCreating(true)}>
            + 新建记忆
          </PrimaryButton>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-5">
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 h-8 rounded-pill text-body-sm transition"
              style={{
                background: active ? "rgba(46,167,255,0.14)" : "transparent",
                color: active ? "#7CC4FF" : "#A9A9B7",
              }}
            >
              {f.label} {counts[f.id]}
            </button>
          );
        })}
      </div>

      {/* 网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => openMemory(m.id)}
            className="text-left rounded-2xl p-4 transition hover:bg-surface-2"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="rounded-pill"
                  style={{ width: 6, height: 6, background: m.color }}
                />
                <span className="text-label text-text-muted">
                  {MEMORY_LABELS[m.category]}
                </span>
              </div>
              <span className="text-tag text-text-disabled">
                #{m.id.slice(-4)}
              </span>
            </div>
            <div className="text-body font-semibold text-text-primary mb-1.5">
              {m.title}
            </div>
            <div className="text-label text-text-tertiary leading-[18px] line-clamp-3">
              {m.content}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-text-muted py-12">
            暂无记忆 · 点右上「+ 新建记忆」添加
          </div>
        )}
      </div>

      {/* 新建记忆弹层 */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="新建记忆"
        width={460}
      >
        <label className="text-label text-text-muted mb-2 block">分类</label>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {CATS.map((c) => {
            const active = draftCat === c;
            return (
              <button
                key={c}
                onClick={() => setDraftCat(c)}
                className="px-2 py-2 rounded-md text-label transition"
                style={{
                  background: active ? `${CAT_COLORS[c]}22` : "rgba(255,255,255,0.04)",
                  color: active ? CAT_COLORS[c] : "#A9A9B7",
                  border: active ? `1px solid ${CAT_COLORS[c]}55` : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {MEMORY_LABELS[c]}
              </button>
            );
          })}
        </div>

        <label className="text-label text-text-muted mb-2 block">标题</label>
        <TextInput
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="例如：输出风格"
          className="mb-4"
        />

        <label className="text-label text-text-muted mb-2 block">内容</label>
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={4}
          placeholder="中文回复 · 结构化输出 · 精简排版…"
          className="w-full mb-5 px-3 py-2 rounded-md text-body text-text-tertiary bg-surface-2 border border-border outline-none focus:border-aurora-blue transition resize-none"
        />

        <PrimaryButton
          className="w-full"
          onClick={() => {
            if (!draftTitle.trim() || !draftContent.trim()) {
              toast("请填写标题和内容", "#FF5C5C");
              return;
            }
            addMemory({
              category: draftCat,
              label: MEMORY_LABELS[draftCat],
              color: CAT_COLORS[draftCat],
              title: draftTitle.trim(),
              content: draftContent.trim(),
            });
            setDraftTitle("");
            setDraftContent("");
            setCreating(false);
            toast("已新增记忆", "#13DDC4");
          }}
        >
          保存
        </PrimaryButton>
      </Modal>
    </div>
  );
}
