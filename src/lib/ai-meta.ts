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
    model: "moonshot-v1-32k",
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

/** 记忆分类标签映射 */
export const MEMORY_LABELS: Record<string, string> = {
  background: "项目背景",
  pref: "用户偏好",
  decision: "关键决策",
  data: "数据资产",
};

/** 接力阈值（token）· 设计要求 80k 警告 */
export const HANDOFF_THRESHOLD = 80_000;

/** Kimi 长文本上限（用于预算条满刻度） */
export const CONTEXT_LIMIT = 100_000;
