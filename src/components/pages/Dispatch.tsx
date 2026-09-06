"use client";

import { useEffect } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { ProgressBar, StatusBadge, PrimaryButton, toast } from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";

export function Dispatch() {
  const task = useFlowHub((s) => s.dispatchTask);
  const prefs = useFlowHub((s) => s.prefs);
  const advanceSubtask = useFlowHub((s) => s.advanceSubtask);
  const completeSubtask = useFlowHub((s) => s.completeSubtask);
  const addLog = useFlowHub((s) => s.addLog);
  const { open: openNewTask } = useNewTaskModal();

  // 自动推进 · 只对用户新建的任务生效（演示任务保留原始状态）
  // 用 task.id 而非整个 task 作为依赖，避免 advanceSubtask 改 task 引用后形成无限重启
  useEffect(() => {
    // 演示任务（id 为 demo 或 createdAt 早于本组件首次挂载）不自动推进
    if (!task) return;
    if (task.id === "demo") return;
    if (task.subtasks.every((t) => t.status === "done")) return;

    // 用 ref 读最新 task，避免闭包陈旧
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const latest = useFlowHub.getState().dispatchTask;
      if (!latest) return;
      const running = latest.subtasks.find((t) => t.status === "running");
      if (!running) return;
      const newP = running.progress + 12;
      if (newP >= 100) {
        completeSubtask(latest.id, running.id, "执行完成");
        addLog(latest.id, `${running.name} 已完成`);
      } else {
        advanceSubtask(latest.id, running.id, newP);
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [task?.id, advanceSubtask, completeSubtask, addLog]);

  if (!task) {
    return (
      <div className="px-7 pt-10 pb-12">
        <div className="text-center py-20">
          <div className="text-h2 font-semibold text-text-primary mb-2">
            还没有调度任务
          </div>
          <div className="text-body text-text-muted mb-6">
            在工作台输入 <code className="px-1.5 py-0.5 rounded bg-surface-2 text-aurora-blue">/</code> 触发调度，或直接点下方按钮
          </div>
          <PrimaryButton onClick={() => openNewTask()}>
            新建调度任务
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const total = task.subtasks.length;
  const done = task.subtasks.filter((t) => t.status === "done").length;
  const runningTask = task.subtasks.find((t) => t.status === "running");
  const runningProgress = runningTask ? runningTask.progress / 100 : 0;
  const overallPct = Math.round(((done + runningProgress) / total) * 100);
  const tokenUsed = 86000 + Math.round((overallPct / 100) * 5000);
  const cost = (1.2 + (overallPct / 100) * 0.3).toFixed(2);

  return (
    <div className="px-7 pt-5 pb-12">
      {/* 头部 */}
      <div className="flex flex-col gap-2.5 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-h1 font-semibold text-text-primary">任务调度</h1>
          <StatusBadge
            status={
              done === total ? "done" : runningTask ? "running" : "queued"
            }
            label={
              done === total
                ? "全案完成"
                : runningTask
                ? `执行中 ${overallPct}%`
                : "排队中"
            }
          />
        </div>
        <div className="text-body-sm text-text-muted">
          {task.description}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex-1 max-w-[480px]">
            <ProgressBar value={overallPct} variant="aurora" />
          </div>
          <div className="flex items-center gap-4 text-label text-text-muted">
            <span>
              Token <span className="text-text-secondary">{tokenUsed.toLocaleString()}</span>
            </span>
            <span>·</span>
            <span>
              成本 <span className="text-text-secondary">¥ {cost}</span>
            </span>
            <span>·</span>
            <span>
              已完成 <span className="text-text-secondary">{done}/{total}</span>
            </span>
          </div>
        </div>
        {prefs.priceAlert && parseFloat(cost) > 1 && (
          <div
            className="mt-2 px-3 py-1.5 rounded-md text-label"
            style={{ background: "rgba(245,197,66,0.12)", color: "#F5C542" }}
          >
            本次任务成本已超 ¥1
          </div>
        )}
      </div>

      <div className="flex gap-0">
        {/* 流水线 */}
        <section className="flex-1 overflow-y-auto pr-6 space-y-3">
          {/* 原始需求 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-pill bg-white" style={{ width: 6, height: 6 }} />
              <span className="text-label text-text-muted">原始需求</span>
            </div>
            <div
              className="px-4 py-3 rounded-xl text-body text-text-secondary leading-[20px]"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              "{task.description}"
            </div>
          </div>

          <div className="flex justify-center">
            <div style={{ width: 2, height: 20, background: "#2A2A3A" }} />
          </div>

          {/* 调度大脑 */}
          <div
            className="flex gap-3.5 px-4 py-3.5 rounded-2xl items-center"
            style={{
              background: "rgba(46,167,255,0.07)",
              border: "1px solid rgba(46,167,255,0.25)",
            }}
          >
            <div
              className="w-[34px] h-[34px] rounded-md flex items-center justify-center shrink-0"
              style={{ background: "var(--grad-brand)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  stroke="white"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body font-semibold text-text-primary">
                调度大脑 · 已拆解为 {task.subtasks.length} 个子任务
              </div>
              <div className="text-label text-text-muted leading-[17px] mt-1">
                按能力路由并行分发：长文本 → Kimi · 数值推演 → DeepSeek · 图像 → Midjourney · 长文案 → Claude
              </div>
            </div>
            <div
              className="px-2 py-1 rounded-md text-tag text-text-muted shrink-0"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              拆解 0.8s
            </div>
          </div>

          <div className="flex justify-center">
            <div style={{ width: 2, height: 20, background: "#2A2A3A" }} />
          </div>

          {/* 子任务卡片网格 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {task.subtasks.map((t) => (
              <div
                key={t.id}
                className="px-4 py-3.5 rounded-2xl"
                style={{
                  background: t.status === "queued" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)",
                  opacity: t.status === "queued" ? 0.55 : 1,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="rounded-pill shrink-0"
                      style={{ width: 8, height: 8, background: t.color }}
                    />
                    <span className="text-body-sm font-semibold truncate text-text-primary">
                      {t.name}
                    </span>
                  </div>
                  <StatusBadge
                    status={t.status}
                    progress={t.progress}
                  />
                </div>
                <div className="text-label text-text-tertiary leading-[18px] mb-2">
                  {t.desc}
                </div>
                {t.status === "running" && (
                  <div className="mb-2">
                    <ProgressBar value={t.progress} variant="brand" />
                  </div>
                )}
                <div className="text-tag text-text-muted">
                  产出：{t.output}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <div style={{ width: 2, height: 20, background: "#2A2A3A" }} />
          </div>

          {/* 全案汇总 */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
            style={{
              background: "rgba(147,129,255,0.08)",
              border: "1px solid rgba(147,129,255,0.25)",
            }}
          >
            <div
              className="flex-1 text-body-sm font-medium"
              style={{ color: "#B4A7FF" }}
            >
              全案汇总 ·{" "}
              {done === total
                ? "已完成，可一键导出"
                : "等待全部子任务完成后自动合成"}
            </div>
            {done === total && (
              <button
                onClick={() => toast("已导出全案为 Markdown", "#13DDC4")}
                className="px-2.5 py-1 rounded-md text-label font-medium text-white"
                style={{ background: "var(--grad-brand)" }}
              >
                导出全案
              </button>
            )}
          </div>

          <div
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mt-3"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4M12 17h.01"
                stroke="#71717F"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="9" stroke="#71717F" strokeWidth={1.6} />
            </svg>
            <span className="text-label text-text-muted">
              任意子任务均可在工作台中人工接管 · 修改结果会自动回流至汇总
            </span>
          </div>
        </section>

        {/* 右侧 aside */}
        <aside className="w-[312px] shrink-0 hidden lg:flex flex-col gap-3 overflow-y-auto pl-2 pr-1">
          {/* 参与模型 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="text-body-sm font-semibold text-text-primary mb-2.5">
              参与模型 · {task.subtasks.length} 个
            </div>
            {task.subtasks.map((t) => {
              const stColor =
                t.status === "done" ? "#13DDC4" : t.status === "running" ? "#F5C542" : "#8E8E9C";
              const stText =
                t.status === "done"
                  ? "已完成"
                  : t.status === "running"
                  ? "生成中"
                  : "排队中";
              return (
                <div key={t.id} className="flex items-center gap-2 py-1.5">
                  <span
                    className="rounded-pill"
                    style={{ width: 6, height: 6, background: t.color }}
                  />
                  <span className="text-label flex-1 text-text-tertiary">
                    {AI_MODELS[t.model].name} · {AI_MODELS[t.model].capability}
                  </span>
                  <span className="text-tag" style={{ color: stColor }}>
                    {stText}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 执行日志 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-body font-semibold text-text-primary">执行日志</div>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-tag"
                style={{ background: "rgba(19,221,196,0.12)", color: "#13DDC4" }}
              >
                <span className="rounded-pill animate-pulse-soft" style={{ width: 6, height: 6, background: "#13DDC4" }} />
                实时
              </span>
            </div>
            <div className="space-y-2.5 text-label">
              {task.logs.slice(-8).reverse().map((log, i) => (
                <div key={log.id} className="flex gap-2">
                  <span
                    className="font-mono text-tag shrink-0"
                    style={{ color: i === 0 ? "#13DDC4" : "#71717F" }}
                  >
                    {log.time}
                  </span>
                  <span
                    className="text-text-tertiary"
                    style={{ color: i === 0 ? "#C9C9D4" : undefined }}
                  >
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 节省时间 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(19,221,196,0.06)" }}
          >
            <div className="text-label text-text-muted mb-1">预计节省</div>
            <div className="text-h2 font-semibold" style={{ color: "#13DDC4" }}>
              2.5 h
            </div>
            <div className="text-tag text-text-disabled leading-[16px] mt-1">
              相比人工逐个切换 AI 工具
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
