"use client";

import { useEffect, useRef } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS, PRICE_PER_1K } from "@/lib/ai-meta";
import { streamChat } from "@/lib/ai-client";
import { pickHelper, type HelperChoice } from "@/lib/memory-ai";
import {
  aiParseTask,
  fallbackParse,
  summarizeTask,
  type TaskBlock,
} from "@/lib/dispatch-ai";
import { estimateTokens } from "@/lib/tokens";
import {
  ProgressBar,
  StatusBadge,
  PrimaryButton,
  GhostButton,
  toast,
} from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";
import type { DispatchMode, Subtask } from "@/lib/types";

const MODE_LABEL: Record<DispatchMode, string> = {
  auto: "智能编排 · 并发",
  parallel: "全并发",
  relay: "接力执行",
};

export function Dispatch() {
  const task = useFlowHub((s) => s.dispatchTask);
  const prefs = useFlowHub((s) => s.prefs);
  const { open: openNewTask } = useNewTaskModal();

  // 每个任务只允许启动一次（防 effect 重入/无限循环）
  const startedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!task) return;
    const id = task.id;
    if (startedRef.current.has(id)) return;
    startedRef.current.add(id);
    void runTask(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

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
  const errored = task.subtasks.filter((t) => t.status === "error").length;
  const runningTask = task.subtasks.find((t) => t.status === "running");
  const runningProgress = runningTask ? runningTask.progress / 100 : 0;
  const overallPct = task.parsing
    ? 0
    : total > 0
    ? Math.round((((done + errored) + runningProgress) / total) * 100)
    : 0;
  const allFinished = !task.parsing && total > 0 && done + errored === total;
  const headerStatus = task.summary
    ? errored > 0
      ? "error"
      : "done"
    : task.parsing
    ? "running"
    : runningTask
    ? "running"
    : "queued";
  const headerLabel = task.summary
    ? errored > 0
      ? `全案完成 · ${errored} 个子任务失败`
      : "全案完成"
    : task.parsing
    ? "AI 拆解中…"
    : runningTask
    ? `执行中 ${overallPct}%`
    : "排队中";

  const exportMarkdown = () => {
    if (!task.summary) return;
    const blob = new Blob([task.summary], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowhub-${task.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出全案 Markdown", "#13DDC4");
  };

  return (
    <div className="px-7 pt-5 pb-12">
      {/* 头部 */}
      <div className="flex flex-col gap-2.5 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-h1 font-semibold text-text-primary">任务调度</h1>
          <StatusBadge status={headerStatus as "done" | "running" | "queued" | "error"} label={headerLabel} />
          <div className="ml-auto">
            <GhostButton onClick={() => openNewTask()}>新建任务</GhostButton>
          </div>
        </div>
        <div className="text-body-sm text-text-muted">{task.description}</div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex-1 max-w-[480px]">
            <ProgressBar value={overallPct} variant="aurora" />
          </div>
          <div className="flex items-center gap-4 text-label text-text-muted">
            <span>
              Token <span className="text-text-secondary">{task.tokenUsed.toLocaleString()}</span>
            </span>
            <span>·</span>
            <span>
              成本 <span className="text-text-secondary">¥ {task.costYuan.toFixed(4)}</span>
            </span>
            <span>·</span>
            <span>
              已完成 <span className="text-text-secondary">{!task.parsing ? `${done + errored}/${total}` : "—"}</span>
            </span>
          </div>
        </div>
        {prefs.priceAlert && task.costYuan > 1 && (
          <div
            className="mt-2 px-3 py-1.5 rounded-md text-label w-fit"
            style={{ background: "rgba(245,197,66,0.12)", color: "#F5C542" }}
          >
            本次任务真实成本已超 ¥1
          </div>
        )}
      </div>

      <div className="flex gap-0">
        {/* 流水线 */}
        <section className="flex-1 overflow-y-auto pr-6 space-y-3 min-w-0">
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
              “{task.description}”
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
                {task.parsing
                  ? "调度大脑 · AI 正在拆解任务…"
                  : `调度大脑 · 已拆解为 ${total} 个子任务`}
              </div>
              <div className="text-label text-text-muted leading-[17px] mt-1">
                {task.parsing
                  ? "DeepSeek 优先（未配置则回退 Kimi），按模型真实能力路由"
                  : `执行模式：${MODE_LABEL[task.mode]} · 仅调用已配置 key 的真实模型`}
              </div>
            </div>
            {!task.parsing && (
              <div
                className="px-2 py-1 rounded-md text-tag text-text-muted shrink-0"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                {done + errored}/{total} 完成
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <div style={{ width: 2, height: 20, background: "#2A2A3A" }} />
          </div>

          {/* 子任务卡片网格 */}
          {task.parsing ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="px-4 py-3.5 rounded-2xl animate-pulse-soft"
                  style={{ background: "rgba(255,255,255,0.03)", minHeight: 96 }}
                >
                  <div
                    className="h-3 rounded mb-3"
                    style={{
                      width: `${40 + i * 14}%`,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                  <div
                    className="h-2.5 rounded mb-2"
                    style={{ width: "80%", background: "rgba(255,255,255,0.05)" }}
                  />
                  <div
                    className="h-2.5 rounded"
                    style={{ width: "55%", background: "rgba(255,255,255,0.05)" }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {task.subtasks.map((t) => (
                <SubtaskCard key={t.id} t={t} relay={task.mode === "relay"} />
              ))}
            </div>
          )}

          {!task.parsing && (
            <>
              <div className="flex justify-center">
                <div style={{ width: 2, height: 20, background: "#2A2A3A" }} />
              </div>

              {/* 全案汇总 */}
              <div
                className="rounded-2xl"
                style={{
                  background: "rgba(147,129,255,0.08)",
                  border: "1px solid rgba(147,129,255,0.25)",
                }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 text-body-sm font-medium" style={{ color: "#B4A7FF" }}>
                    全案汇总 ·{" "}
                    {task.summary
                      ? "已基于各子任务真实产出合成"
                      : allFinished
                      ? "正在合成…"
                      : "等待全部子任务完成后自动合成"}
                  </div>
                  {task.summary && (
                    <button
                      onClick={exportMarkdown}
                      className="px-2.5 py-1 rounded-md text-label font-medium text-white"
                      style={{ background: "var(--grad-brand)" }}
                    >
                      导出全案
                    </button>
                  )}
                </div>
                {task.summary && (
                  <div
                    className="mx-4 mb-4 px-3.5 py-3 rounded-xl text-label text-text-tertiary leading-[19px] whitespace-pre-line overflow-y-auto"
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      maxHeight: 320,
                    }}
                  >
                    {task.summary}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* 右侧 aside */}
        <aside className="w-[312px] shrink-0 hidden lg:flex flex-col gap-3 overflow-y-auto pl-2 pr-1">
          {/* 参与模型 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="text-body-sm font-semibold text-text-primary mb-2.5">
              参与模型 · {task.parsing ? "—" : `${total} 个`}
            </div>
            {task.parsing ? (
              <div className="text-label text-text-muted py-1">等待拆解结果…</div>
            ) : (
              task.subtasks.map((t) => {
                const stColor =
                  t.status === "done"
                    ? "#13DDC4"
                    : t.status === "error"
                    ? "#FF5C5C"
                    : t.status === "running"
                    ? "#F5C542"
                    : "#8E8E9C";
                const stText =
                  t.status === "done"
                    ? "已完成"
                    : t.status === "error"
                    ? "失败"
                    : t.status === "running"
                    ? `生成中 ${t.progress}%`
                    : "排队中";
                return (
                  <div key={t.id} className="flex items-center gap-2 py-1.5">
                    <span
                      className="rounded-pill shrink-0"
                      style={{ width: 6, height: 6, background: t.color }}
                    />
                    <span className="text-label flex-1 text-text-tertiary truncate">
                      {AI_MODELS[t.model].name} · {t.name}
                    </span>
                    <span className="text-tag shrink-0" style={{ color: stColor }}>
                      {stText}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* 执行日志 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-body font-semibold text-text-primary">执行日志</div>
              {!allFinished && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill text-tag"
                  style={{ background: "rgba(19,221,196,0.12)", color: "#13DDC4" }}
                >
                  <span className="rounded-pill animate-pulse-soft" style={{ width: 6, height: 6, background: "#13DDC4" }} />
                  实时
                </span>
              )}
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

          {/* 真实计费卡 */}
          <div
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: "rgba(46,167,255,0.06)" }}
          >
            <div className="text-label text-text-muted mb-1">本次真实消耗</div>
            <div className="flex items-baseline gap-2">
              <span className="text-h3 font-semibold" style={{ color: "#2EA7FF" }}>
                ¥ {task.costYuan.toFixed(4)}
              </span>
              <span className="text-tag text-text-disabled">
                · {task.tokenUsed.toLocaleString()} tokens
              </span>
            </div>
            <div className="text-tag text-text-disabled leading-[16px] mt-1">
              辅助调用（拆解/汇总）优先 DeepSeek，更便宜
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** 单个子任务卡片：真实流式产出/错误 */
function SubtaskCard({ t, relay }: { t: Subtask; relay: boolean }) {
  return (
    <div
      className="px-4 py-3.5 rounded-2xl"
      style={{
        background: t.status === "queued" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)",
        opacity: t.status === "queued" ? 0.55 : 1,
        border: t.status === "error" ? "1px solid rgba(255,92,92,0.3)" : "1px solid transparent",
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
        <StatusBadge status={t.status} progress={t.progress} />
      </div>
      <div className="text-label text-text-tertiary leading-[18px] mb-2">{t.desc}</div>
      {t.status === "running" && (
        <div className="mb-2">
          <ProgressBar value={t.progress} variant="brand" />
        </div>
      )}
      {t.status === "done" && t.output && (
        <div
          className="text-label text-text-muted leading-[18px] whitespace-pre-line overflow-hidden"
          style={{ maxHeight: 132 }}
        >
          {t.output}
        </div>
      )}
      {t.status === "error" && (
        <div className="text-label" style={{ color: "#FF5C5C" }}>
          执行失败：{t.error}
        </div>
      )}
      {relay && t.status === "queued" && (
        <div className="text-tag text-text-disabled">等待上游产出接力…</div>
      )}
    </div>
  );
}

// ---------- 真实执行 runner ----------
async function runTask(id: string) {
  const st0 = useFlowHub.getState();
  if (!st0.dispatchTask || st0.dispatchTask.id !== id) return;
  const { addLog, setTaskParsed, setSubtask, addTaskUsage, setTaskSummary } = st0;
  const desc = st0.dispatchTask.description;
  const helper: HelperChoice | null = pickHelper(st0.apiKeys);

  // ---- 1. AI 拆解（无 key 走规则版）----
  if (st0.dispatchTask.parsing) {
    let parsed;
    if (helper) {
      addLog(id, `调度大脑（${AI_MODELS[helper.model].name}）正在拆解子任务…`);
      const r = await aiParseTask(desc, helper);
      parsed = r.tasks;
      const helperTokens =
        estimateTokens(desc) + estimateTokens(JSON.stringify(r.tasks));
      addTaskUsage(
        id,
        helperTokens,
        (helperTokens * PRICE_PER_1K[helper.model]!.input) / 1000
      );
      if (r.fellBack) {
        addLog(id, "AI 拆解结果不可用，已回退规则拆解");
      } else {
        const names = [...new Set(r.tasks.map((p) => AI_MODELS[p.model].name))].join(" / ");
        addLog(id, `拆解完成：${parsed.length} 个子任务 → ${names}`);
      }
      if (helper.fallback) {
        addLog(id, "未配置 DeepSeek key，辅助调用已回退 Kimi（配置后更省）");
      }
    } else {
      parsed = fallbackParse(desc);
      addLog(id, "未配置任何 API key，使用规则拆解；子任务将无法真实执行");
    }
    setTaskParsed(id, parsed);
  }

  // zustand set 同步生效，直接取最新
  const cur = useFlowHub.getState().dispatchTask;
  if (!cur || cur.id !== id) return;
  const mode = cur.mode;
  const subtasks = cur.subtasks;

  // ---- 2. 真实执行 ----
  addLog(id, mode === "relay" ? "开始接力执行" : `开始并发执行 ${subtasks.length} 个子任务`);

  const runOne = (t: Subtask, upstream: string): Promise<TaskBlock> =>
    new Promise<TaskBlock>((resolve) => {
      setSubtask(id, t.id, { status: "running", progress: 6 });
      addLog(id, `${AI_MODELS[t.model].name} 开始：${t.name}`);

      // 拆解阶段已保证子任务只落在 kimi/deepseek
      const em = t.model as "kimi" | "deepseek";
      const apiKey = useFlowHub.getState().apiKeys[em] ?? "";
      const basePrompt = t.prompt || t.desc;
      const finalPrompt = upstream
        ? `${basePrompt}\n\n以下是上游子任务的真实产出，请在此基础上继续完成你的任务：\n${upstream}`
        : basePrompt;

      if (!apiKey) {
        const err = `未配置 ${AI_MODELS[t.model].name} API key`;
        setSubtask(id, t.id, { status: "error", error: err, progress: 100 });
        addLog(id, `${t.name} 失败：${err}`);
        resolve({ name: t.name, model: t.model, output: "", error: err });
        return;
      }

      let acc = "";
      streamChat(
        {
          provider: em,
          apiKey,
          messages: [{ role: "user", content: finalPrompt }],
        },
        {
          onToken: (delta) => {
            acc += delta;
            // 约每 20 字刷一次进度，避免无谓重渲染
            const p = Math.min(95, 8 + Math.round(acc.length / 20));
            setSubtask(id, t.id, { progress: p });
          },
          onDone: (full) => {
            const text = full || acc;
            setSubtask(id, t.id, { status: "done", output: text, progress: 100 });
            const totalT = estimateTokens(`${finalPrompt}\n${text}`);
            const inT = Math.round(totalT * 0.7);
            const outT = totalT - inT;
            const price = PRICE_PER_1K[em]!;
            const cost = (inT * price.input + outT * price.output) / 1000;
            addTaskUsage(id, totalT, cost);
            addLog(
              id,
              `${t.name} 完成 · ${totalT.toLocaleString()} tokens · ¥${cost.toFixed(4)}`
            );
            resolve({ name: t.name, model: t.model, output: text });
          },
          onError: (err) => {
            setSubtask(id, t.id, { status: "error", error: err, progress: 100 });
            addLog(id, `${t.name} 失败：${err}`);
            resolve({ name: t.name, model: t.model, output: acc, error: err });
          },
        }
      );
    });

  const blocks: TaskBlock[] = [];
  if (mode === "relay") {
    let upstream = "";
    for (const t of subtasks) {
      const b = await runOne(t, upstream);
      blocks.push(b);
      if (!b.error && b.output) {
        upstream += `\n\n【${b.name}】\n${b.output.slice(0, 800)}`;
      }
    }
  } else {
    const rs = await Promise.all(subtasks.map((t) => runOne(t, "")));
    blocks.push(...rs);
  }

  // ---- 3. AI 全案汇总 ----
  addLog(id, "全部子任务结束，正在合成全案汇总…");
  const summary = await summarizeTask(desc, blocks, helper);
  if (helper) {
    const stTokens = estimateTokens(summary) + estimateTokens(desc);
    addTaskUsage(
      id,
      stTokens,
      (stTokens * PRICE_PER_1K[helper.model]!.input) / 1000
    );
  }
  setTaskSummary(id, summary);
  addLog(id, "全案汇总完成，可导出 Markdown");
}
