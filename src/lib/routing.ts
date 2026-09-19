import type { ModelId } from "./types";

/**
 * 自动路由 · 基于关键词规则（设计稿路由原则）：
 * - 长文本（>2000 字符）→ Kimi
 * - 数值 / 推演 / 数据类 → DeepSeek
 * - 文案 / 写作 / 润色类 → Claude
 * - 图像 / 海报 / 主视觉类 → Midjourney
 * - 默认 → Kimi
 *
 * 用户偏好（用户消息中明确指定）优先级最高。
 */
interface RouteResult {
  model: ModelId;
  reason: string;
}

const KEYWORDS: Record<ModelId, string[]> = {
  deepseek: [
    "推演", "数据", "数值", "定价", "测算", "估算", "概率", "推算", "回归",
    "分析", "对比", "预测", "推算", "统计", "ltv", "arr", "mau", "留存",
  ],
  claude: [
    "文案", "写作", "润色", "改写", "扩写", "标题", "slogan", "宣传语",
    "话术", "稿件", "推文", "邮件正文", "脚本",
  ],
  midjourney: [
    "主视觉", "海报", "图像", "插图", "插画", "配图", "poster", "image",
    "封面", "icon", "图标",
  ],
  kimi: [
    "长文", "材料", "调研", "白皮书", "报告", "总结", "梳理", "整理",
    "万字", "论文", "原文", "读取",
  ],
};

export function autoRoute(text: string): RouteResult {
  const lower = text.toLowerCase();

  // 1. 长文本优先（>2000 字符直接走 Kimi）
  if (text.length > 2000) {
    return { model: "kimi", reason: "长文本读取（>2000 字符）→ Kimi" };
  }

  // 2. 关键词匹配 · 按 midjourney → claude → deepseek → kimi 顺序
  //    （图像最特化，先判；长文兜底）
  const order: ModelId[] = ["midjourney", "claude", "deepseek"];
  for (const m of order) {
    const hit = KEYWORDS[m].some((k) => lower.includes(k.toLowerCase()));
    if (hit) {
      return {
        model: m,
        reason: `关键词「${KEYWORDS[m].find((k) => lower.includes(k.toLowerCase()))}」→ ${m}`,
      };
    }
  }

  // 3. 默认走 Kimi（长文本兜底）
  return { model: "kimi", reason: "默认路由 → Kimi" };
}

/**
 * 任务调度 · 自然语言拆解子任务（规则版）
 * 把一段任务描述按关键词切片，分配给合适的 AI。
 */
export interface ParsedSubtask {
  name: string;
  model: ModelId;
  desc: string;
  /** 给执行模型的完整指令（AI 拆解时生成；规则版留空则用 desc） */
  prompt?: string;
}

export function dispatchParse(description: string): ParsedSubtask[] {
  const tasks: ParsedSubtask[] = [];
  const lower = description.toLowerCase();

  if (/(调研|行业|竞品|背景|材料|梳理|总结|白皮书|报告)/.test(lower)) {
    tasks.push({
      name: "Kimi · 行业趋势与调研",
      model: "kimi",
      desc: "扫描材料、提炼结构化要点与可引用数据。",
    });
  }
  if (/(推演|数据|数值|定价|测算|策略|对比|预测|留存|转化)/.test(lower)) {
    tasks.push({
      name: "DeepSeek · 数据推演",
      model: "deepseek",
      desc: "基于数据集推演关键指标，给出方案推荐。",
    });
  }
  if (/(主视觉|海报|图像|配图|封面|poster|image)/.test(lower)) {
    tasks.push({
      name: "Midjourney · 主视觉生成",
      model: "midjourney",
      desc: "按品牌色板与极光风格产出候选视觉。",
    });
  }
  if (/(文案|写作|润色|改写|话术|脚本|稿件|宣传语|slogan)/.test(lower)) {
    tasks.push({
      name: "Claude · 全套文案",
      model: "claude",
      desc: "依据上游结论产出全套文案，调性对齐偏好。",
    });
  }

  // 兜底：一个都没匹配上，至少给 Kimi 做整体梳理
  if (tasks.length === 0) {
    tasks.push({
      name: "Kimi · 整体梳理",
      model: "kimi",
      desc: "未识别到能力关键词，默认交给 Kimi 整理为结构化结论。",
    });
  }

  return tasks;
}
