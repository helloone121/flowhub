"use client";

import { quickChat, streamChat } from "./ai-client";
import { PRICE_PER_1K } from "./ai-meta";
import {
  EXECUTOR_SYSTEM,
  EXECUTOR_USER,
  PLANNER_SYSTEM,
  PLANNER_USER,
  REVIEW_SYSTEM,
  REVIEW_USER,
  REVISE_SYSTEM,
  REVISE_USER,
} from "./prompts";
import { estimateTokens } from "./tokens";
import type {
  CollabBrief,
  CollabIssue,
  CollabStep,
  ModelId,
} from "./types";

/**
 * 接力协同的 AI 调用层：
 * 策划（DeepSeek，便宜）→ 交接单 → 执行（Kimi，长文）→ 可选质检/修订。
 * 所有调用失败都不抛出，返回结构化结果，由 UI 决定重试或降级。
 */

/** 尝试把模型文本解析成 JSON 对象：三层容错（直解 → 剥围栏 → 截首个对象） */
function tryJsonObject(text: string): Record<string, unknown> | null {
  const clean = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = parse(clean);
  if (direct) return direct;
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = parse(clean.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return null;
}

const asText = (v: unknown, max = 400): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const asList = (v: unknown, max = 8): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];

/** 把结构化字段渲染成给执行方看的 Markdown 交接单 */
export function briefToMarkdown(b: Omit<CollabBrief, "raw">): string {
  const lines: string[] = [];
  lines.push(`# 交接单`);
  lines.push(`\n## 目标\n${b.goal || "（未填写）"}`);
  lines.push(`\n## 交付物\n${b.deliverable || "（未填写）"}`);
  if (b.audience) lines.push(`\n## 受众\n${b.audience}`);
  if (b.constraints.length)
    lines.push(`\n## 约束\n${b.constraints.map((x) => `- ${x}`).join("\n")}`);
  if (b.questions.length)
    lines.push(`\n## 待确认问题\n${b.questions.map((x) => `- ${x}`).join("\n")}`);
  if (b.outline.length)
    lines.push(`\n## 建议大纲\n${b.outline.map((x) => `- ${x}`).join("\n")}`);
  if (b.acceptance.length)
    lines.push(`\n## 验收标准\n${b.acceptance.map((x) => `- ${x}`).join("\n")}`);
  return lines.join("\n");
}

/** 解析策划输出；失败时返回 null，由调用方降级为纯文本交接单 */
export function parseBrief(text: string): CollabBrief | null {
  const obj = tryJsonObject(text);
  if (!obj) return null;
  const fields = {
    goal: asText(obj.goal, 200),
    deliverable: asText(obj.deliverable, 200),
    audience: asText(obj.audience, 120),
    constraints: asList(obj.constraints),
    questions: asList(obj.questions, 3),
    outline: asList(obj.outline, 8),
    acceptance: asList(obj.acceptance, 6),
  };
  // 目标与交付物都为空，视为解析失败
  if (!fields.goal && !fields.deliverable) return null;
  return { ...fields, raw: briefToMarkdown(fields) };
}

/** 纯文本降级交接单 */
export function fallbackBrief(text: string): CollabBrief {
  return {
    goal: "",
    deliverable: "",
    audience: "",
    constraints: [],
    questions: [],
    outline: [],
    acceptance: [],
    raw: text.trim().slice(0, 1600),
  };
}

/** 估算一次调用的成本（元） */
export function estimateStepCost(
  model: ModelId,
  input: string,
  output: string
): number {
  const price = PRICE_PER_1K[model];
  if (!price) return 0;
  return (
    (estimateTokens(input) / 1000) * price.input +
    (estimateTokens(output) / 1000) * price.output
  );
}

/** 组装一个已完成步骤（统一 token / 成本 / 输入留痕） */
export function makeStep(args: {
  model: ModelId;
  stage: CollabStep["stage"];
  content: string;
  input: string;
  ms: number;
  error?: string;
}): CollabStep {
  return {
    model: args.model,
    stage: args.stage,
    content: args.content,
    input: args.input.slice(0, 4000),
    ms: args.ms,
    tokens: estimateTokens(args.input) + estimateTokens(args.content),
    costYuan: estimateStepCost(args.model, args.input, args.content),
    error: args.error,
  };
}

export interface PlanResult {
  ok: boolean;
  brief?: CollabBrief;
  error?: string;
  content: string;
  ms: number;
}

/** 策划：生成交接单。JSON 解析失败时自动降级为纯文本，不阻断流程。 */
export async function planBrief(opts: {
  userText: string;
  model: ModelId;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<PlanResult> {
  const started = performance.now();
  const userPrompt = PLANNER_USER(opts.userText);
  const r = await quickChat({
    provider: opts.model,
    apiKey: opts.apiKey,
    systemHint: PLANNER_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    json: opts.model === "deepseek",
    maxTokens: 900,
    timeoutMs: 60_000,
    signal: opts.signal,
  });
  const ms = Math.round(performance.now() - started);
  if (!r.ok) return { ok: false, error: r.error, content: "", ms };
  return {
    ok: true,
    brief: parseBrief(r.content) ?? fallbackBrief(r.content),
    content: r.content,
    ms,
  };
}

export interface ExecuteResult {
  ok: boolean;
  content: string;
  error?: string;
}

/** 执行：只拿交接单 + 用户补充，流式产出正文。 */
export function runExecutor(opts: {
  brief: string;
  userNote?: string;
  model: ModelId;
  apiKey: string;
  signal: AbortSignal;
  onToken: (delta: string) => void;
}): Promise<ExecuteResult> {
  const userPrompt = EXECUTOR_USER(opts.brief, opts.userNote);
  return new Promise((resolve) => {
    let acc = "";
    streamChat(
      {
        provider: opts.model,
        apiKey: opts.apiKey,
        systemHint: EXECUTOR_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
        signal: opts.signal,
      },
      {
        onToken: (delta) => {
          acc += delta;
          opts.onToken(delta);
        },
        onDone: (full) => resolve({ ok: true, content: full || acc }),
        onError: (error) =>
          resolve({ ok: false, content: acc, error }),
      }
    );
  });
}

export interface ReviewResult {
  pass: boolean;
  issues: CollabIssue[];
}

/** 质检：失败或解析不出时默认放行，不阻断交付。 */
export async function reviewOutput(opts: {
  brief: string;
  output: string;
  model: ModelId;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<ReviewResult> {
  const r = await quickChat({
    provider: opts.model,
    apiKey: opts.apiKey,
    systemHint: REVIEW_SYSTEM,
    messages: [
      { role: "user", content: REVIEW_USER(opts.brief, opts.output) },
    ],
    json: opts.model === "deepseek",
    maxTokens: 500,
    timeoutMs: 45_000,
    signal: opts.signal,
  });
  if (!r.ok) return { pass: true, issues: [] };
  const obj = tryJsonObject(r.content);
  if (!obj) return { pass: true, issues: [] };
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: CollabIssue[] = rawIssues
    .slice(0, 5)
    .map((x) => {
      const it = (x ?? {}) as Record<string, unknown>;
      return {
        where: asText(it.where, 80),
        problem: asText(it.problem, 200),
        fix: asText(it.fix, 200),
      };
    })
    .filter((x) => x.problem || x.fix);
  return { pass: obj.pass === true || issues.length === 0, issues };
}

/** 修订：只改质检问题，返回完整修订稿。 */
export function reviseOutput(opts: {
  output: string;
  issues: CollabIssue[];
  model: ModelId;
  apiKey: string;
  signal: AbortSignal;
  onToken: (delta: string) => void;
}): Promise<ExecuteResult> {
  const userPrompt = REVISE_USER(opts.output, opts.issues);
  return new Promise((resolve) => {
    let acc = "";
    streamChat(
      {
        provider: opts.model,
        apiKey: opts.apiKey,
        systemHint: REVISE_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
        signal: opts.signal,
      },
      {
        onToken: (delta) => {
          acc += delta;
          opts.onToken(delta);
        },
        onDone: (full) => resolve({ ok: true, content: full || acc }),
        onError: (error) => resolve({ ok: false, content: acc, error }),
      }
    );
  });
}
