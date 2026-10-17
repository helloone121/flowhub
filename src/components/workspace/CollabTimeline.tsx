"use client";

import { useEffect, useRef, useState } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { toast } from "@/components/ui";
import {
  makeStep,
  planBrief,
  reviewOutput,
  reviseOutput,
  runExecutor,
} from "@/lib/collab-ai";
import {
  EXECUTOR_USER,
  PLANNER_USER,
  REVIEW_USER,
  REVISE_USER,
} from "@/lib/prompts";
import type {
  CollabBrief,
  CollabIssue,
  CollabPhase,
  CollabRun,
  ModelId,
} from "@/lib/types";

const PHASE_META: Record<CollabPhase, { label: string; color: string }> = {
  planning: { label: "策划中", color: "#F5C542" },
  awaiting_confirm: { label: "待你确认", color: "#F5C542" },
  executing: { label: "执行中", color: "#2EA7FF" },
  reviewing: { label: "质检中", color: "#F5C542" },
  revising: { label: "修订中", color: "#9381FF" },
  done: { label: "已完成", color: "#13DDC4" },
  error: { label: "出错", color: "#FF5C5C" },
  cancelled: { label: "已取消", color: "#8E8E9C" },
  interrupted: { label: "已中断", color: "#FF5C5C" },
};

const LIVE_STAGE: Record<"exec" | "review" | "revise", string> = {
  exec: "执行",
  review: "质检",
  revise: "修订",
};

function fmtMs(ms?: number) {
  if (ms == null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(n?: number) {
  if (n == null) return "";
  return n > 0 && n < 0.01 ? "<¥0.01" : `¥${n.toFixed(2)}`;
}

function fmtTokens(n?: number) {
  if (n == null) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`;
}

export function CollabTimeline({
  sessionId,
  messageId,
  run,
}: {
  sessionId: string;
  messageId: string;
  run: CollabRun;
}) {
  const apiKeys = useFlowHub((s) => s.apiKeys);
  const patchMessage = useFlowHub((s) => s.patchMessage);
  const setSessionBrief = useFlowHub((s) => s.setSessionBrief);

  const [busy, setBusy] = useState<null | "plan" | "exec" | "review" | "revise">(null);
  const [live, setLive] = useState<{
    stage: string;
    model: ModelId;
    content: string;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(run.brief?.raw ?? "");
  const [note, setNote] = useState(run.userNote ?? "");
  const [openInput, setOpenInput] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editing) setDraft(run.brief?.raw ?? "");
  }, [run.brief?.raw, editing]);

  // 刷新 / 切换会话导致组件重挂时，把“进行中”的幽灵状态标成已中断，允许重试
  useEffect(() => {
    const p = run.phase;
    if (
      p === "planning" ||
      p === "executing" ||
      p === "reviewing" ||
      p === "revising"
    ) {
      patchMessage(sessionId, messageId, {
        collabRun: { ...run, phase: "interrupted" },
      });
    }
    // 只在挂载时检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 接力只涉及真实模型，apiKeys 索引收窄 */
  const keyFor = (m: ModelId) => apiKeys[m as "kimi" | "deepseek"] ?? "";

  const readRun = (): CollabRun => {
    const msg = useFlowHub
      .getState()
      .messages[sessionId]?.find((m) => m.id === messageId);
    return msg?.collabRun ?? run;
  };

  const writeRun = (next: CollabRun) => {
    patchMessage(sessionId, messageId, { collabRun: next });
  };

  const patchPhase = (phase: CollabPhase, extra: Partial<CollabRun> = {}) => {
    writeRun({ ...readRun(), phase, ...extra });
  };

  const appendStep = (step: ReturnType<typeof makeStep>) => {
    const cur = readRun();
    writeRun({ ...cur, steps: [...cur.steps, step] });
  };

  const isBusy = busy !== null;

  // ---------- 策划 / 重新策划 ----------
  async function replan() {
    if (isBusy) return;
    const cur = readRun();
    const apiKey = keyFor(cur.planner);
    if (!apiKey) {
      toast(
        `未配置 ${AI_MODELS[cur.planner].name} 的 API key，无法重新策划`,
        "#FF5C5C"
      );
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy("plan");
    patchPhase("planning");
    const started = performance.now();
    const r = await planBrief({
      userText: cur.sourceText,
      model: cur.planner,
      apiKey,
      signal: ac.signal,
    });
    abortRef.current = null;
    setBusy(null);
    if (!r.ok || !r.brief) {
      toast(r.error ?? "策划失败", "#FF5C5C");
      patchPhase("error");
      return;
    }
    const step = makeStep({
      model: cur.planner,
      stage: "策划",
      content: r.brief.raw,
      input: PLANNER_USER(cur.sourceText),
      ms: Math.round(performance.now() - started),
    });
    const latest = readRun();
    writeRun({
      ...latest,
      brief: r.brief,
      phase: "awaiting_confirm",
      steps: [step, ...latest.steps.filter((s) => s.stage !== "策划")],
    });
    setDraft(r.brief.raw);
    toast("交接单已更新", AI_MODELS[cur.planner].color);
  }

  // ---------- 执行 → 质检 → 修订 ----------
  async function execute(briefText: string, userNote?: string) {
    if (isBusy) return;
    const cur = readRun();
    const apiKey = keyFor(cur.executor);
    if (!apiKey) {
      toast(
        `未配置 ${AI_MODELS[cur.executor].name} 的 API key，无法执行`,
        "#FF5C5C"
      );
      return;
    }
    const brief: CollabBrief | undefined = cur.brief
      ? { ...cur.brief, raw: briefText }
      : undefined;

    const ac = new AbortController();
    abortRef.current = ac;
    setBusy("exec");
    setEditing(false);
    writeRun({ ...cur, brief, userNote, phase: "executing" });
    setLive({ stage: LIVE_STAGE.exec, model: cur.executor, content: "" });

    const input = EXECUTOR_USER(briefText, userNote);
    const started = performance.now();
    const r = await runExecutor({
      brief: briefText,
      userNote,
      model: cur.executor,
      apiKey,
      signal: ac.signal,
      onToken: (delta) =>
        setLive((prev) => (prev ? { ...prev, content: prev.content + delta } : prev)),
    });
    abortRef.current = null;
    setBusy(null);
    setLive(null);

    const cancelled = ac.signal.aborted;
    const step = makeStep({
      model: cur.executor,
      stage: "执行",
      content: r.content,
      input,
      ms: Math.round(performance.now() - started),
      error: r.error,
    });
    appendStep(step);
    if (cancelled) {
      patchPhase("cancelled");
      toast("已取消执行", "#8E8E9C");
      return;
    }
    if (!r.ok) {
      patchPhase("error");
      return;
    }

    const afterExec = readRun();
    if (afterExec.deepReview && (afterExec.brief?.acceptance.length ?? 0) > 0) {
      await reviewAndRevise(r.content);
    } else {
      patchPhase("done");
    }
    if (afterExec.brief) {
      // 固定给后续追问的简报要带上用户补充，否则下一轮会丢约束
      const pinned = userNote?.trim()
        ? {
            ...afterExec.brief,
            raw: `${afterExec.brief.raw}\n\n【用户补充】\n${userNote.trim()}`,
          }
        : afterExec.brief;
      setSessionBrief(sessionId, pinned, afterExec.executor);
    }
  }

  async function reviewAndRevise(output: string) {
    const cur = readRun();
    const key = keyFor(cur.planner);
    if (!key) {
      patchPhase("done");
      return;
    }
    setBusy("review");
    setLive({
      stage: LIVE_STAGE.review,
      model: cur.planner,
      content: "对照验收标准检查中…",
    });
    const started = performance.now();
    const rr = await reviewOutput({
      brief: cur.brief?.raw ?? "",
      output,
      model: cur.planner,
      apiKey: key,
    });
    const reviewInput = REVIEW_USER(cur.brief?.raw ?? "", output);
    const reviewStep = makeStep({
      model: cur.planner,
      stage: "质检",
      content: rr.pass
        ? "✓ 通过：未发现实质问题"
        : rr.issues.map((it, i) => `${i + 1}. [${it.where}] ${it.problem}`).join("\n"),
      input: reviewInput,
      ms: Math.round(performance.now() - started),
    });
    appendStep(reviewStep);
    writeRun({
      ...readRun(),
      issues: rr.issues,
      phase: rr.pass ? "done" : "revising",
    });
    setBusy(null);
    setLive(null);

    if (rr.pass || rr.issues.length === 0) return;

    const ac = new AbortController();
    abortRef.current = ac;
    setBusy("revise");
    setLive({ stage: LIVE_STAGE.revise, model: cur.executor, content: "" });
    const started2 = performance.now();
    const rev = await reviseOutput({
      output,
      issues: rr.issues,
      model: cur.executor,
      apiKey: keyFor(cur.executor),
      signal: ac.signal,
      onToken: (delta) =>
        setLive((prev) => (prev ? { ...prev, content: prev.content + delta } : prev)),
    });
    abortRef.current = null;
    setBusy(null);
    setLive(null);
    const reviseStep = makeStep({
      model: cur.executor,
      stage: "修订",
      content: rev.content,
      input: REVISE_USER(output, rr.issues),
      ms: Math.round(performance.now() - started2),
      error: rev.error,
    });
    appendStep(reviseStep);
    patchPhase(rev.ok && !ac.signal.aborted ? "done" : "error");
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function saveEdit() {
    const cur = readRun();
    const brief = cur.brief
      ? { ...cur.brief, raw: draft }
      : { ...emptyBrief(), raw: draft };
    writeRun({ ...cur, brief });
    setEditing(false);
    toast("交接单已保存", "#13DDC4");
  }

  function startFromEditor() {
    execute(draft, note);
  }

  const phase = PHASE_META[run.phase] ?? PHASE_META.done;
  const totalCost = run.steps.reduce((n, s) => n + (s.costYuan ?? 0), 0);
  const brief = run.brief;
  const showBrief =
    !!brief &&
    (run.phase === "awaiting_confirm" ||
      editing ||
      run.phase === "error" ||
      run.phase === "cancelled" ||
      run.phase === "interrupted");

  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(147,129,255,0.22)",
      }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-body-sm font-semibold" style={{ color: "#C9C0FF" }}>
          AI 接力
        </span>
        <span className="text-tag text-text-muted">
          {AI_MODELS[run.planner].name} 策划
        </span>
        <span className="text-tag text-text-disabled">→</span>
        <span className="text-tag text-text-muted">
          {AI_MODELS[run.executor].name} 执行
        </span>
        {run.deepReview && <span className="text-tag text-text-disabled">· 深质检</span>}
        <div className="flex-1" />
        <span
          className="px-2 py-0.5 rounded-pill text-tag"
          style={{ background: `${phase.color}1f`, color: phase.color }}
        >
          {phase.label}
        </span>
        {totalCost > 0 && (
          <span className="text-tag text-text-disabled">{fmtCost(totalCost)}</span>
        )}
      </div>

      {/* 步骤链 */}
      <div className="space-y-2">
        {run.steps.map((st, i) => {
          const c = AI_MODELS[st.model]?.color ?? "#8E8E9C";
          return (
            <div key={i}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-1 pl-2 text-tag text-text-disabled">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 4v14m0 0l-5-5m5 5l5-5"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </svg>
                  {i === 1 ? "交接单 → 执行输入" : "上一步产出 → 下一步输入"}
                </div>
              )}
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderLeft: `3px solid ${c}`,
                }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="rounded-pill" style={{ width: 7, height: 7, background: c }} />
                  <span className="text-label font-semibold" style={{ color: c }}>
                    {AI_MODELS[st.model]?.name ?? st.model}
                  </span>
                  <span
                    className="text-tag px-1.5 py-0.5 rounded"
                    style={{ background: `${c}22`, color: c }}
                  >
                    {st.stage}
                  </span>
                  {st.ms != null && (
                    <span className="text-tag text-text-disabled">{fmtMs(st.ms)}</span>
                  )}
                  {st.tokens != null && (
                    <span className="text-tag text-text-disabled">{fmtTokens(st.tokens)}</span>
                  )}
                  {st.costYuan != null && st.costYuan > 0 && (
                    <span className="text-tag text-text-disabled">{fmtCost(st.costYuan)}</span>
                  )}
                  {st.input && (
                    <button
                      onClick={() => setOpenInput(openInput === i ? null : i)}
                      className="ml-auto text-tag text-text-muted hover:text-text-primary transition"
                    >
                      {openInput === i ? "收起输入" : "查看输入"}
                    </button>
                  )}
                </div>
                {st.error ? (
                  <div className="text-label" style={{ color: "#FF5C5C" }}>
                    执行失败：{st.error}
                  </div>
                ) : (
                  <div className="text-body-sm text-text-tertiary leading-[21px] whitespace-pre-line">
                    {st.content}
                  </div>
                )}
                {openInput === i && st.input && (
                  <pre
                    className="mt-2 px-2.5 py-2 rounded-lg text-tag leading-[18px] whitespace-pre-wrap overflow-y-auto"
                    style={{
                      background: "rgba(0,0,0,0.28)",
                      color: "rgba(255,255,255,0.6)",
                      maxHeight: 220,
                    }}
                  >
                    {st.input}
                  </pre>
                )}
              </div>
            </div>
          );
        })}

        {/* 流式进行中的一步 */}
        {live && (
          <div>
            <div className="flex items-center gap-2 py-1 pl-2 text-tag text-text-disabled">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v14m0 0l-5-5m5 5l5-5"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
              进行中
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderLeft: `3px solid ${AI_MODELS[live.model]?.color ?? "#8E8E9C"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="rounded-pill"
                  style={{
                    width: 7,
                    height: 7,
                    background: AI_MODELS[live.model]?.color ?? "#8E8E9C",
                  }}
                />
                <span
                  className="text-label font-semibold"
                  style={{ color: AI_MODELS[live.model]?.color }}
                >
                  {AI_MODELS[live.model]?.name}
                </span>
                <span className="text-tag text-text-disabled">{live.stage}中…</span>
              </div>
              <div className="text-body-sm text-text-tertiary leading-[21px] whitespace-pre-line">
                {live.content || (
                  <span className="inline-flex items-center gap-1 py-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                )}
                {live.content && (
                  <span
                    className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse-soft"
                    style={{ background: AI_MODELS[live.model]?.color }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 交接单 */}
      {showBrief && brief && (
        <div
          className="mt-3 rounded-xl px-3 py-2.5"
          style={{
            background: "rgba(46,167,255,0.06)",
            border: "1px solid rgba(46,167,255,0.22)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-label font-semibold" style={{ color: "#7CC4FF" }}>
              交接单
            </span>
            <span className="text-tag text-text-disabled">
              {AI_MODELS[run.planner].name} 产出 · 执行方只读这份
            </span>
            <div className="flex-1" />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(brief.raw);
                  toast("交接单已复制", "#13DDC4");
                } catch {
                  toast("复制失败", "#FF5C5C");
                }
              }}
              className="text-tag text-text-muted hover:text-text-primary transition"
            >
              复制
            </button>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-tag text-text-muted hover:text-text-primary transition"
              >
                编辑
              </button>
            )}
          </div>

          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                className="w-full rounded-lg px-2.5 py-2 text-body-sm text-text-secondary outline-none resize-y"
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(46,167,255,0.3)",
                  lineHeight: "21px",
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={saveEdit}
                  className="px-2.5 py-1 rounded-md text-tag font-medium text-white"
                  style={{ background: "var(--grad-brand)" }}
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(run.brief?.raw ?? "");
                  }}
                  className="px-2.5 py-1 rounded-md text-tag text-text-muted hover:text-text-primary transition"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <BriefPreview brief={brief} />
          )}

          {/* 用户补充 / 回答问题 */}
          {!editing && (
            <div className="mt-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={
                  brief.questions.length > 0
                    ? "回答上面的问题，或补充新的约束 / 偏好（可留空直接执行）"
                    : "补充约束或偏好（可留空直接执行）"
                }
                className="w-full rounded-lg px-2.5 py-1.5 text-body-sm text-text-secondary outline-none resize-y placeholder:text-text-disabled"
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={() => execute(draft || brief.raw, note)}
              disabled={isBusy}
              className="px-3 py-1.5 rounded-md text-label font-medium text-white transition disabled:opacity-50"
              style={{ background: "var(--grad-brand)" }}
            >
              开始执行 · {AI_MODELS[run.executor].name}
            </button>
            <button
              onClick={replan}
              disabled={isBusy}
              className="px-2.5 py-1.5 rounded-md text-label text-text-muted hover:text-text-primary hover:bg-white/5 transition disabled:opacity-50"
            >
              重新策划
            </button>
            {editing && (
              <button
                onClick={startFromEditor}
                disabled={isBusy}
                className="px-2.5 py-1.5 rounded-md text-label text-text-muted hover:text-text-primary hover:bg-white/5 transition disabled:opacity-50"
              >
                用当前编辑内容执行
              </button>
            )}
          </div>
        </div>
      )}

      {/* 运行中 */}
      {isBusy && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-tag text-text-muted">
            {busy === "plan"
              ? `${AI_MODELS[run.planner].name} 正在重新策划…`
              : busy === "review"
              ? `${AI_MODELS[run.planner].name} 正在质检…`
              : busy === "revise"
              ? `${AI_MODELS[run.executor].name} 正在修订…`
              : `${AI_MODELS[run.executor].name} 正在执行…`}
          </span>
          <button
            onClick={cancel}
            className="text-tag text-text-muted hover:text-text-primary transition"
          >
            取消
          </button>
        </div>
      )}

      {/* 失败 / 取消 / 中断重试 */}
      {(run.phase === "error" ||
        run.phase === "cancelled" ||
        run.phase === "interrupted") &&
        !isBusy && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-tag" style={{ color: "#FF8A8A" }}>
              {run.phase === "cancelled"
                ? "已取消，可继续或重跑"
                : run.phase === "interrupted"
                ? "页面刷新导致中断，可重试"
                : "执行失败，可重试"}
            </span>
            <button
              onClick={() => execute(run.brief?.raw ?? "", note)}
              className="px-2.5 py-1 rounded-md text-tag text-text-muted hover:text-text-primary hover:bg-white/5 transition"
            >
              重试执行
            </button>
          </div>
        )}

      {/* 已完成：可折叠查看交接单与质检问题 */}
      {run.phase === "done" && brief && !showBrief && (
        <details className="mt-3">
          <summary className="cursor-pointer text-tag text-text-muted hover:text-text-primary transition select-none">
            查看交接单
          </summary>
          <pre
            className="mt-1.5 px-2.5 py-2 rounded-lg text-tag leading-[18px] whitespace-pre-wrap overflow-y-auto"
            style={{
              background: "rgba(0,0,0,0.22)",
              color: "rgba(255,255,255,0.6)",
              maxHeight: 260,
            }}
          >
            {brief.raw}
          </pre>
        </details>
      )}

      {run.phase === "done" && run.issues && run.issues.length > 0 && (
        <IssueList issues={run.issues} />
      )}
    </div>
  );
}

function BriefPreview({ brief }: { brief: CollabBrief }) {
  const rows: [string, string][] = [
    ["目标", brief.goal],
    ["交付物", brief.deliverable],
    ["受众", brief.audience ?? ""],
  ];
  return (
    <div className="space-y-1.5">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="text-body-sm text-text-tertiary leading-[21px]">
            <span className="text-text-disabled">{k}：</span>
            {v}
          </div>
        ))}
      <BriefList label="约束" items={brief.constraints} />
      <BriefList label="待确认" items={brief.questions} accent="#F5C542" />
      <BriefList label="大纲" items={brief.outline} />
      <BriefList label="验收" items={brief.acceptance} accent="#13DDC4" />
    </div>
  );
}

function BriefList({
  label,
  items,
  accent,
}: {
  label: string;
  items: string[];
  accent?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="text-body-sm text-text-tertiary leading-[21px]">
      <span className="text-text-disabled">{label}：</span>
      <span style={accent ? { color: accent } : undefined}>{items.join("；")}</span>
    </div>
  );
}

function IssueList({ issues }: { issues: CollabIssue[] }) {
  return (
    <div
      className="mt-3 rounded-lg px-3 py-2"
      style={{
        background: "rgba(245,197,66,0.08)",
        border: "1px solid rgba(245,197,66,0.22)",
      }}
    >
      <div className="text-tag font-semibold mb-1" style={{ color: "#F5C542" }}>
        质检提出 {issues.length} 个问题（已尝试修订）
      </div>
      <ul className="space-y-0.5">
        {issues.map((it, i) => (
          <li key={i} className="text-tag text-text-muted leading-[18px]">
            {i + 1}. [{it.where}] {it.problem}
          </li>
        ))}
      </ul>
    </div>
  );
}

function emptyBrief(): CollabBrief {
  return {
    goal: "",
    deliverable: "",
    audience: "",
    constraints: [],
    questions: [],
    outline: [],
    acceptance: [],
    raw: "",
  };
}
