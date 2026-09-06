"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { useFlowHub } from "@/lib/store";
import { MEMORY_LABELS } from "@/lib/ai-meta";
import { Modal, PrimaryButton, toast } from "./ui";
import type { DispatchMode, MemoryCategory } from "@/lib/types";

// ---------- 全局弹层 context ----------
interface ModalCtx {
  newTaskOpen: boolean;
  newTaskInitialDesc: string;
  memoryDetailOpen: boolean;
  memoryDetailId: string | null;
  openNewTask: (desc?: string) => void;
  setNewTaskDesc: (d: string) => void;
  closeNewTask: () => void;
  openMemory: (id: string) => void;
  closeMemory: () => void;
}

const Ctx = createContext<ModalCtx | null>(null);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskInitialDesc, setNewTaskInitialDesc] = useState("");
  const [memoryDetailOpen, setMemoryDetailOpen] = useState(false);
  const [memoryDetailId, setMemoryDetailId] = useState<string | null>(null);

  const openNewTask = useCallback((desc?: string) => {
    setNewTaskInitialDesc(desc ?? "");
    setNewTaskOpen(true);
  }, []);
  const setNewTaskDesc = useCallback((d: string) => {
    setNewTaskInitialDesc(d);
  }, []);
  const closeNewTask = useCallback(() => {
    setNewTaskOpen(false);
    setNewTaskInitialDesc("");
  }, []);
  const openMemory = useCallback((id: string) => {
    setMemoryDetailId(id);
    setMemoryDetailOpen(true);
  }, []);
  const closeMemory = useCallback(() => {
    setMemoryDetailOpen(false);
    setMemoryDetailId(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        newTaskOpen,
        newTaskInitialDesc,
        memoryDetailOpen,
        memoryDetailId,
        openNewTask,
        setNewTaskDesc,
        closeNewTask,
        openMemory,
        closeMemory,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useNewTaskModal() {
  const ctx = useContext(Ctx)!;
  return {
    isOpen: ctx.newTaskOpen,
    initialDesc: ctx.newTaskInitialDesc,
    open: ctx.openNewTask,
    setInitialDesc: ctx.setNewTaskDesc,
    close: ctx.closeNewTask,
  };
}

export function useMemoryDetailModal() {
  const ctx = useContext(Ctx)!;
  return {
    isOpen: ctx.memoryDetailOpen,
    memoryId: ctx.memoryDetailId,
    open: ctx.openMemory,
    close: ctx.closeMemory,
  };
}

// ---------- 实际渲染的弹层组件 ----------
export function NewTaskModal() {
  const ctx = useContext(Ctx)!;
  const [desc, setDesc] = useState("");
  const dispatchMode = useFlowHub((s) => s.dispatchMode);
  const setDispatchMode = useFlowHub((s) => s.setDispatchMode);
  const startDispatch = useFlowHub((s) => s.startDispatch);

  React.useEffect(() => {
    if (ctx.newTaskOpen) setDesc(ctx.newTaskInitialDesc);
  }, [ctx.newTaskOpen, ctx.newTaskInitialDesc]);

  const modes: { id: DispatchMode; label: string; desc: string }[] = [
    { id: "auto", label: "智能调度", desc: "按能力路由" },
    { id: "parallel", label: "并行分发", desc: "同时跑" },
    { id: "relay", label: "接力模式", desc: "前序结果作为输入" },
  ];

  return (
    <Modal
      open={ctx.newTaskOpen}
      onClose={ctx.closeNewTask}
      title="新建调度任务"
      width={480}
    >
      <label className="text-label text-text-muted mb-2 block">任务描述</label>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={4}
        placeholder="例如：帮我做一份 2026 春季产品发布会的全案，包括行业调研、传播策略、主视觉和全套文案"
        className="w-full px-3.5 py-3 rounded-xl text-body resize-none outline-none focus:border-aurora-blue transition bg-surface-2 border border-border text-text-primary placeholder:text-text-disabled"
      />

      <div className="mt-4 text-label text-text-muted mb-2 block">调度模式</div>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {modes.map((m) => {
          const active = dispatchMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setDispatchMode(m.id)}
              className="px-3 py-2 rounded-lg text-label text-center transition"
              style={{
                background: active ? "rgba(46,167,255,0.14)" : "rgba(255,255,255,0.04)",
                color: active ? "#7CC4FF" : "#A9A9B7",
                border: active
                  ? "1px solid rgba(46,167,255,0.3)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="font-medium">{m.label}</div>
              <div className="text-tag text-text-disabled mt-0.5">{m.desc}</div>
            </button>
          );
        })}
      </div>

      <PrimaryButton
        className="w-full"
        onClick={() => {
          const d = desc.trim();
          if (!d) {
            toast("请输入任务描述", "#FF5C5C");
            return;
          }
          startDispatch(d);
          ctx.closeNewTask();
          toast("调度任务已启动", "#13DDC4");
        }}
      >
        启动调度
      </PrimaryButton>
    </Modal>
  );
}

export function MemoryDetailModal() {
  const ctx = useContext(Ctx)!;
  const memories = useFlowHub((s) => s.memories);
  const deleteMemory = useFlowHub((s) => s.deleteMemory);
  const updateMemory = useFlowHub((s) => s.updateMemory);

  const m = memories.find((x) => x.id === ctx.memoryDetailId);
  if (!m) return null;

  return (
    <Modal
      open={ctx.memoryDetailOpen}
      onClose={ctx.closeMemory}
      title="记忆详情"
      width={480}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="rounded-pill" style={{ width: 8, height: 8, background: m.color }} />
        <span className="text-label text-text-muted">
          {m.label} · #{m.id.slice(-4)}
        </span>
      </div>
      <input
        value={m.title}
        onChange={(e) => updateMemory(m.id, { title: e.target.value })}
        className="w-full mb-3 px-2 py-1.5 rounded-md text-h3 font-semibold text-text-primary bg-surface-2 border border-border outline-none focus:border-aurora-blue transition"
      />
      <textarea
        value={m.content}
        onChange={(e) => updateMemory(m.id, { content: e.target.value })}
        rows={4}
        className="w-full mb-4 px-3 py-2 rounded-md text-body text-text-tertiary leading-[22px] bg-surface-2 border border-border outline-none focus:border-aurora-blue transition resize-none"
      />
      <div
        className="h-px mb-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
      <div className="text-label text-text-muted mb-3">
        来源 · 多次会话 / 4 个 AI 自动提取
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            const cats: MemoryCategory[] = ["background", "pref", "decision", "data"];
            const catColors = ["#13DDC4", "#2EA7FF", "#9381FF", "#F5C542"];
            const idx = cats.indexOf(m.category);
            const nextIdx = (idx + 1) % 4;
            const next = cats[nextIdx];
            updateMemory(m.id, {
              category: next,
              label: MEMORY_LABELS[next],
              color: catColors[nextIdx],
            });
            toast("已切换分类", "#13DDC4");
          }}
          className="px-3 py-2 rounded-md text-body-sm text-text-secondary"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          切换分类
        </button>
        <button
          onClick={() => {
            deleteMemory(m.id);
            ctx.closeMemory();
            toast("已删除", "#FF5C5C");
          }}
          className="px-3 py-2 rounded-md text-body-sm"
          style={{ background: "rgba(217,119,87,0.14)", color: "#D97757" }}
        >
          删除
        </button>
      </div>
    </Modal>
  );
}


