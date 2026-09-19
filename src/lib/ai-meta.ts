import type { AIModel, ModelId } from "./types";

/**
 * AI 元信息表 · 配色严格按 FlowHub-设计系统.md 第 14 条硬规则：
 * Kimi = 紫 #9381FF · DeepSeek = 蓝 #2EA7FF · Claude = 珊瑚 #D97757 · Midjourney = 金 #F5C542
 * 严禁一 AI 多色。
 */
export const AI_MODELS: Record<ModelId, AIModel> = {
  kimi: {
    id: "kimi",
    name: "Kimi",
    short: "K",
    color: "#9381FF",
    capability: "长文本",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    model: "kimi-k3",
    mock: false,
    connected: true,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    short: "D",
    color: "#2EA7FF",
    capability: "数值推理",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    mock: false,
    connected: true,
  },
  claude: {
    id: "claude",
    name: "Claude",
    short: "C",
    color: "#D97757",
    capability: "长文案",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-sonnet-20241022",
    mock: true, // MVP 不接真实 Claude
    connected: true,
  },
  midjourney: {
    id: "midjourney",
    name: "Midjourney",
    short: "M",
    color: "#F5C542",
    capability: "图像生成",
    endpoint: "",
    model: "",
    mock: true, // MVP 不接真实 Midjourney
    connected: true,
  },
};

export const AI_LIST: AIModel[] = Object.values(AI_MODELS);

/**
 * 真实模型粗估单价 · 元 / 1K token（输入/输出）
 * 用于任务调度的成本估算（非精确计费），按官方公开价取保守值：
 * - Kimi K3：输入约 ¥0.012 / 输出约 ¥0.024
 * - DeepSeek chat：输入约 ¥0.002（缓存未命中）/ 输出约 ¥0.008
 */
export const PRICE_PER_1K: Partial<
  Record<ModelId, { input: number; output: number }>
> = {
  kimi: { input: 0.012, output: 0.024 },
  deepseek: { input: 0.002, output: 0.008 },
};

/** 记忆分类标签映射 */
export const MEMORY_LABELS: Record<string, string> = {
  background: "项目背景",
  pref: "用户偏好",
  decision: "关键决策",
  data: "数据资产",
};

/** 记忆分类唯一配色（4 家 AI 配色之外的记忆体系色） */
export const MEMORY_CAT_COLORS: Record<string, string> = {
  background: "#13DDC4",
  pref: "#2EA7FF",
  decision: "#9381FF",
  data: "#F5C542",
};

/** 接力阈值（token）· 设计要求 80k 警告 */
export const HANDOFF_THRESHOLD = 80_000;

/** Kimi 长文本上限（用于预算条满刻度） */
export const CONTEXT_LIMIT = 100_000;
