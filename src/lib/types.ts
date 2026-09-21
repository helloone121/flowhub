// FlowHub 类型定义 · 全部业务对象

/** AI 模型标识 */
export type ModelId = "kimi" | "deepseek" | "claude" | "midjourney";

/** 4 类记忆分类（设计系统.md 规定） */
export type MemoryCategory = "background" | "pref" | "decision" | "data";

/** 子任务状态 */
export type SubtaskStatus = "queued" | "running" | "done" | "error";

/** 调度模式 */
export type DispatchMode = "auto" | "parallel" | "relay";

/** AI 元信息（运行时只读，配色绑定唯一） */
export interface AIModel {
  id: ModelId;
  name: string;
  short: string; // 1-2 字母缩写，用于圆点头像
  color: string; // 唯一品牌色 hex
  capability: string; // 一句话能力描述
  endpoint: string; // OpenAI 兼容端点
  model: string; // 调用模型名
  mock: boolean; // 是否 Mock
  connected: boolean; // 默认是否"已连接"（仅 UI 显示，真实连通性看 apiKey）
}

/** 会话 */
export interface Session {
  id: string;
  model: ModelId;
  title: string;
  preview: string;
  time: string; // 显示用相对时间字符串
  group: ModelId;
  handoffCount?: number; // 接力次数
  createdAt: number;
}

/** 多模型对比时的单列结果 */
export interface CompareColumn {
  model: ModelId;
  content: string;
  ms?: number; // 耗时
  error?: string;
}

/** 单条消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  model?: ModelId;
  color?: string;
  time?: string;
  tokens?: number; // 本条消息估算 token 数
  /** 多模型对比轮：存在时 MessageList 渲染并排结果 */
  compare?: CompareColumn[];
}

/** 持久记忆 */
export interface Memory {
  id: string;
  category: MemoryCategory;
  label: string;
  color: string;
  title: string;
  content: string;
  createdAt: number;
  /** 来源：seed=内置示例（不参与注入） ai=对话自动提取 user=手动新建 */
  source?: "seed" | "ai" | "user";
}

/** 子任务（调度流水线节点） */
export interface Subtask {
  id: string;
  name: string;
  model: ModelId;
  color: string;
  desc: string;
  status: SubtaskStatus;
  output: string;
  progress: number; // 0-100
  /** 发给执行模型的完整指令 */
  prompt?: string;
  error?: string;
}

/** 执行日志条目 */
export interface LogEntry {
  id: string;
  time: string;
  text: string;
}

/** 调度偏好开关 */
export interface DispatchPrefs {
  autoHandoff: boolean; // 接近上限自动接力
  autoRoute: boolean; // 自动按能力路由
  autoMemory: boolean; // 自动沉淀记忆
  priceAlert: boolean; // 单任务成本 > ¥1 提醒
}

/** API key 容器 */
export interface ApiKeys {
  kimi?: string;
  deepseek?: string;
  claude?: string;
}

/** 调度任务（一次 / 触发的整体） */
export interface DispatchTask {
  id: string;
  description: string;
  mode: DispatchMode;
  subtasks: Subtask[];
  logs: LogEntry[];
  createdAt: number;
  tokenUsed: number;
  costYuan: number;
  /** AI 正在拆解子任务 */
  parsing?: boolean;
  /** 全案汇总（真实 AI 生成） */
  summary?: string;
}

/** 顶层页面（任务调度/记忆库已集成进工作台） */
export type PageId = "workspace" | "settings";

/** 工作台内视图 */
export type WorkspaceView = "chat" | "task" | "memory";
