import { quickChat } from "./ai-client";
import { parseLooseJsonArray, type HelperChoice } from "./memory-ai";
import { dispatchParse, type ParsedSubtask } from "./routing";
import {
  TASK_PARSE_SYSTEM,
  TASK_PARSE_USER,
  TASK_SUMMARY_SYSTEM,
  TASK_SUMMARY_USER,
} from "./prompts";
import type { ModelId } from "./types";

/**
 * 调度大脑的两次真实 AI 调用：
 * - aiParseTask：自然语言任务 → 1-4 个可执行子任务（JSON）
 * - summarizeTask：子任务真实产出 → 全案 Markdown
 * 任何环节失败都回退到规则版 / 拼接版，保证流程不卡死。
 */

const EXECUTABLE_MODELS: ModelId[] = ["kimi", "deepseek"];

interface RawSubtask {
  name?: unknown;
  model?: unknown;
  desc?: unknown;
  prompt?: unknown;
}

/** mock 模型（claude/midjourney）无法真实执行，统一 remap 到 kimi */
function toExecutable(m: string): ModelId {
  return m === "deepseek" ? "deepseek" : "kimi";
}

/** 规则版兜底：清洗名称前缀、把 mock 模型 remap、补全 prompt */
export function fallbackParse(desc: string): ParsedSubtask[] {
  const raw = dispatchParse(desc);
  return raw.slice(0, 4).map((t) => {
    const name = t.name.replace(/^(Kimi|DeepSeek|Claude|Midjourney)\s*[·:]\s*/i, "").slice(0, 12);
    const model = toExecutable(t.model);
    const remapped = model !== t.model;
    return {
      name,
      model,
      desc: remapped ? `${t.desc}（规则回退：改由 ${model} 执行）` : t.desc,
      prompt: `你在参与一个多模型协作任务。原始任务：${desc}\n\n你的子任务：${t.desc}\n\n请直接输出该子任务的成果，中文、结构化、简洁。`,
    };
  });
}

/** AI 拆解子任务；解析/校验失败时回退规则版 */
export async function aiParseTask(
  desc: string,
  helper: HelperChoice
): Promise<{ tasks: ParsedSubtask[]; fellBack: boolean }> {
  const r = await quickChat({
    provider: helper.model,
    apiKey: helper.apiKey,
    systemHint: TASK_PARSE_SYSTEM,
    messages: [{ role: "user", content: TASK_PARSE_USER(desc) }],
    json: true,
  });
  if (!r.ok) return { tasks: fallbackParse(desc), fellBack: true };

  const items = parseLooseJsonArray<RawSubtask>(r.content);
  const tasks: ParsedSubtask[] = [];
  for (const it of items) {
    const name = String(it.name ?? "").trim().slice(0, 12);
    const d = String(it.desc ?? "").trim().slice(0, 60);
    let model = String(it.model ?? "").trim().toLowerCase();
    if (!name || !d) continue;
    if (!EXECUTABLE_MODELS.includes(model as ModelId)) {
      // 模型名不合法（含 claude/midjourney/乱写）：按能力词猜，猜不出给 kimi
      model = /(数据|数值|测算|推演|分析|预测|统计)/.test(d) ? "deepseek" : "kimi";
    }
    const prompt =
      String(it.prompt ?? "").trim().slice(0, 1200) ||
      `你在参与一个多模型协作任务。原始任务：${desc}\n\n你的子任务：${d}\n\n请直接输出该子任务的成果，中文、结构化、简洁。`;
    tasks.push({ name, model: model as ModelId, desc: d, prompt });
    if (tasks.length >= 4) break;
  }

  if (tasks.length === 0) return { tasks: fallbackParse(desc), fellBack: true };
  return { tasks, fellBack: false };
}

export interface TaskBlock {
  name: string;
  model: string;
  output: string;
  error?: string;
}

/** 全案汇总；失败/无 key 时本地拼接一份 Markdown，绝不返回空 */
export async function summarizeTask(
  desc: string,
  blocks: TaskBlock[],
  helper: HelperChoice | null
): Promise<string> {
  if (!helper) return localSummary(desc, blocks);
  const r = await quickChat({
    provider: helper.model,
    apiKey: helper.apiKey,
    systemHint: TASK_SUMMARY_SYSTEM,
    messages: [{ role: "user", content: TASK_SUMMARY_USER(desc, blocks) }],
  });
  if (r.ok && r.content.trim()) return r.content;
  return localSummary(desc, blocks);
}

function localSummary(desc: string, blocks: TaskBlock[]): string {
  const parts = [`# ${desc}`, "", `> 汇总服务暂不可用，以下为各子任务原始产出。`, ""];
  blocks.forEach((b, i) => {
    parts.push(`## ${i + 1}. ${b.name}（${b.model}）`);
    parts.push(b.error ? `该环节执行失败：${b.error}` : b.output.slice(0, 4000));
    parts.push("");
  });
  return parts.join("\n");
}
