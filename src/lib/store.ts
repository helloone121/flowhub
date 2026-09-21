"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ApiKeys,
  ChatMessage,
  DispatchMode,
  DispatchPrefs,
  DispatchTask,
  LogEntry,
  Memory,
  ModelId,
  PageId,
  Session,
  Subtask,
  WorkspaceView,
} from "./types";
import { AI_MODELS } from "./ai-meta";
import { autoRoute, type ParsedSubtask } from "./routing";
import { estimateTokens } from "./tokens";

// ---------- 工具 ----------
const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const nowHHMM = () => {
  const d = new Date();
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
};

const nowHHMMSS = () => {
  const d = new Date();
  return (
    nowHHMM() +
    ":" +
    String(d.getSeconds()).padStart(2, "0")
  );
};

// ---------- 初始演示数据 ----------
const DEMO_SESSIONS: Session[] = [
  {
    id: "whitepaper",
    model: "kimi",
    title: "产品白皮书 · 进行中",
    preview: "帮我把这份 2 万字的调研材料整理成…",
    time: "14:35",
    group: "kimi",
    handoffCount: 3,
    createdAt: Date.now() - 3600_000,
  },
  {
    id: "kimi-research",
    model: "kimi",
    title: "调研材料精读",
    preview: "AI 调度系统 v1 概念稿…",
    time: "昨天",
    group: "kimi",
    createdAt: Date.now() - 86400_000,
  },
  {
    id: "pricing",
    model: "deepseek",
    title: "竞品定价推演",
    preview: "基于 LTV 数据推演 3 套定价…",
    time: "昨天",
    group: "deepseek",
    createdAt: Date.now() - 90000_000,
  },
  {
    id: "weekly",
    model: "claude",
    title: "周报润色",
    preview: "把本周迭代总结压缩到 200 字…",
    time: "10/02",
    group: "claude",
    createdAt: Date.now() - 100000_000,
  },
  {
    id: "image",
    model: "midjourney",
    title: "发布会主视觉",
    preview: "科技感极光风主视觉海报…",
    time: "10/01",
    group: "midjourney",
    createdAt: Date.now() - 110000_000,
  },
];

const DEMO_MESSAGES: Record<string, ChatMessage[]> = {
  whitepaper: [
    {
      id: "m1",
      role: "user",
      content:
        "帮我把这份 2 万字的调研材料整理成产品白皮书框架，重点保留数据结论。",
      time: "14:32",
      tokens: 36,
    },
    {
      id: "m2",
      role: "ai",
      model: "kimi",
      color: "#9381FF",
      time: "14:32",
      tokens: 95,
      content:
        "已完整读取 2 万字调研材料，梳理出 5 个章节的白皮书框架：\n一、行业背景与痛点（保留 3 组核心数据）\n二、市场格局与竞品矩阵\n三、产品定位与差异化优势\n四、技术架构与路线图\n五、商业模式与增长预测",
    },
    {
      id: "m3",
      role: "ai",
      model: "deepseek",
      color: "#2EA7FF",
      time: "14:35",
      tokens: 110,
      content:
        "接力补充：针对第三章，我推演了三种并发调度场景下的吞吐曲线，建议白皮书加入「调度时延对比表」。相关数据已自动存入记忆库，撰写时可直接引用。",
    },
  ],
};

const DEMO_MEMORIES: Memory[] = [
  {
    id: "mem_001",
    category: "background",
    label: "项目背景",
    color: "#13DDC4",
    title: "AI 调度系统 v1 概念稿",
    content:
      "目标用户为重度 AI 使用者，核心痛点是会话接力断档 + 切换多个 AI 工具繁琐。当前已完成 4 屏概念原型。",
    createdAt: Date.now() - 86400_000,
  },
  {
    id: "mem_002",
    category: "pref",
    label: "用户偏好",
    color: "#2EA7FF",
    title: "输出风格",
    content: "中文回复 · 结构化输出 · 精简排版 · 优先使用数据说话，避免空泛表述",
    createdAt: Date.now() - 80000_000,
  },
  {
    id: "mem_003",
    category: "decision",
    label: "关键决策",
    color: "#9381FF",
    title: "产品定位",
    content: "v1 先做 Web 端，浏览器插件列入 v2 规划；不做桌面端，避免分发渠道负担",
    createdAt: Date.now() - 70000_000,
  },
  {
    id: "mem_004",
    category: "data",
    label: "数据资产",
    color: "#F5C542",
    title: "调研数据",
    content:
      "竞品定价推演.xlsx · 38 份行业报告索引 · 12 页调研笔记 · 5 张 Midjourney 候选主视觉",
    createdAt: Date.now() - 60000_000,
  },
  {
    id: "mem_005",
    category: "background",
    label: "项目背景",
    color: "#13DDC4",
    title: "团队节奏",
    content: "周三产品评审 · 周五迭代发版 · 周一周会。当前进度：概念稿 v0.1 已完成",
    createdAt: Date.now() - 50000_000,
  },
  {
    id: "mem_006",
    category: "decision",
    label: "关键决策",
    color: "#9381FF",
    title: "记忆策略",
    content:
      "记忆自动注入新对话阈值 = 0.7，重要决策类记忆强制保留，会话结束后再让用户确认归档",
    createdAt: Date.now() - 40000_000,
  },
  {
    id: "mem_007",
    category: "pref",
    label: "用户偏好",
    color: "#2EA7FF",
    title: "调度偏好",
    content:
      "长文本默认交给 Kimi，数值推理默认交给 DeepSeek，文案默认交给 Claude，配图交给 Midjourney",
    createdAt: Date.now() - 30000_000,
  },
  {
    id: "mem_008",
    category: "data",
    label: "数据资产",
    color: "#F5C542",
    title: "品牌色板",
    content: "主色 #2EA7FF 蓝 / #9381FF 紫 / #13DDC4 青 / #F5C542 金，渐变方向 135° 右上到左下",
    createdAt: Date.now() - 20000_000,
  },
];

// 示例记忆统一打 seed 标：仅展示用，不参与对话注入，可一键清空
const DEMO_MEMORIES_TYPED: Memory[] = DEMO_MEMORIES.map((m) => ({
  ...m,
  source: "seed" as const,
}));

// ---------- Store 定义 ----------
interface FlowHubState {
  // 视图状态（不持久化）
  currentPage: PageId;
  /** 工作台内视图：对话 / 任务 / 记忆 */
  workspaceView: WorkspaceView;
  searchQuery: string;
  memoryFilter: "all" | Memory["category"];
  showKeyMap: Partial<Record<ModelId, boolean>>; // 设置页密钥可见性

  // 持久化数据
  sessions: Session[];
  messages: Record<string, ChatMessage[]>; // sessionId → 消息
  memories: Memory[];
  apiKeys: ApiKeys;
  prefs: DispatchPrefs;
  currentSessionId: string;
  currentModel: ModelId;
  dispatchMode: DispatchMode;
  dispatchTask: DispatchTask | null;

  // ---------- Actions ----------
  setPage: (p: PageId) => void;
  setWorkspaceView: (v: WorkspaceView) => void;
  setSearch: (q: string) => void;
  setMemoryFilter: (f: "all" | Memory["category"]) => void;
  toggleKeyVisible: (m: ModelId) => void;

  selectSession: (id: string) => void;
  newSession: (model?: ModelId, title?: string, preview?: string) => string;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  handoffSession: (id: string, summary: string) => string;

  setModel: (m: ModelId) => void;
  pushUserMessage: (sessionId: string, text: string) => void;
  pushAiMessage: (sessionId: string, msg: Omit<ChatMessage, "id">) => void;
  patchMessage: (
    sessionId: string,
    messageId: string,
    patch: Partial<ChatMessage>
  ) => void;
  routeFor: (text: string) => { model: ModelId; reason: string };

  addMemory: (m: Omit<Memory, "id" | "createdAt">) => void;
  addMemories: (ms: Omit<Memory, "id" | "createdAt">[]) => void;
  clearSeedMemories: () => void;
  updateMemory: (id: string, patch: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  exportAll: () => string;

  setApiKey: (m: ModelId, key: string) => void;
  updatePref: (k: keyof DispatchPrefs, v: boolean) => void;
  setDispatchMode: (m: DispatchMode) => void;

  startDispatch: (desc: string) => DispatchTask;
  setTaskParsed: (taskId: string, parsed: ParsedSubtask[]) => void;
  setSubtask: (
    taskId: string,
    subtaskId: string,
    patch: Partial<Subtask>
  ) => void;
  setTaskSummary: (taskId: string, summary: string) => void;
  addTaskUsage: (taskId: string, tokens: number, costYuan: number) => void;
  addLog: (taskId: string, text: string) => void;
  resetDispatch: () => void;
}

const DEFAULT_PREFS: DispatchPrefs = {
  autoHandoff: true,
  autoRoute: true,
  autoMemory: true,
  priceAlert: false,
};

export const useFlowHub = create<FlowHubState>()(
  persist(
    (set, get) => ({
      // 视图状态
      currentPage: "workspace",
      workspaceView: "chat",
      searchQuery: "",
      memoryFilter: "all",
      showKeyMap: {},

      // 持久化数据
      sessions: DEMO_SESSIONS,
      messages: DEMO_MESSAGES,
      memories: DEMO_MEMORIES_TYPED,
      apiKeys: {},
      prefs: DEFAULT_PREFS,
      currentSessionId: "whitepaper",
      currentModel: "kimi",
      dispatchMode: "auto",
      // 调度任务只存在于内存：执行中有真实流式连接，刷新后僵尸状态无意义
      dispatchTask: null,

      setPage: (p) => set({ currentPage: p }),
      setWorkspaceView: (v) => set({ workspaceView: v }),
      setSearch: (q) => set({ searchQuery: q }),
      setMemoryFilter: (f) => set({ memoryFilter: f }),
      toggleKeyVisible: (m) =>
        set((s) => ({
          showKeyMap: { ...s.showKeyMap, [m]: !s.showKeyMap[m] },
        })),

      selectSession: (id) => {
        const s = get().sessions.find((x) => x.id === id);
        if (!s) return;
        set((st) => ({
          currentSessionId: id,
          currentModel: s.model,
          sessions: st.sessions.map((x) => ({ ...x, /* 不再用 active 字段 */ })),
        }));
      },

      newSession: (model = "kimi", title = "新会话", preview = "") => {
        const id = uid("s");
        const session: Session = {
          id,
          model,
          title,
          preview,
          time: nowHHMM(),
          group: model,
          createdAt: Date.now(),
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          messages: { ...s.messages, [id]: [] },
          currentSessionId: id,
          currentModel: model,
        }));
        return id;
      },

      renameSession: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, title } : x
          ),
        })),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          const messages = { ...s.messages };
          delete messages[id];
          const next =
            s.currentSessionId === id
              ? sessions[0]?.id ?? ""
              : s.currentSessionId;
          return {
            sessions,
            messages,
            currentSessionId: next,
            currentModel:
              sessions.find((x) => x.id === next)?.model ?? s.currentModel,
          };
        }),

      // 上下文接力：把当前会话压缩成摘要，建新会话携带
      handoffSession: (id, summary) => {
        const old = get().sessions.find((x) => x.id === id);
        if (!old) return id;
        const newId = uid("s");
        const newSession: Session = {
          id: newId,
          model: old.model,
          title: `${old.title} · 接力 #${(old.handoffCount ?? 0) + 1}`,
          preview: summary.slice(0, 40),
          time: nowHHMM(),
          group: old.group,
          handoffCount: (old.handoffCount ?? 0) + 1,
          createdAt: Date.now(),
        };
        const seed: ChatMessage = {
          id: uid("m"),
          role: "ai",
          model: old.model,
          color: AI_MODELS[old.model].color,
          time: nowHHMM(),
          tokens: estimateTokens(summary),
          content: `[上下文接力] 已携带前文摘要：\n${summary}`,
        };
        set((s) => ({
          sessions: [newSession, ...s.sessions],
          messages: { ...s.messages, [newId]: [seed] },
          currentSessionId: newId,
        }));
        return newId;
      },

      setModel: (m) => set({ currentModel: m }),

      pushUserMessage: (sessionId, text) => {
        const msg: ChatMessage = {
          id: uid("m"),
          role: "user",
          content: text,
          time: nowHHMM(),
          tokens: estimateTokens(text),
        };
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: [...(s.messages[sessionId] ?? []), msg],
          },
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, preview: text.slice(0, 40), time: nowHHMM() } : x
          ),
        }));
      },

      pushAiMessage: (sessionId, msg) => {
        const full: ChatMessage = { id: uid("m"), ...msg };
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: [...(s.messages[sessionId] ?? []), full],
          },
        }));
      },

      patchMessage: (sessionId, messageId, patch) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: (s.messages[sessionId] ?? []).map((m) =>
              m.id === messageId ? { ...m, ...patch } : m
            ),
          },
        })),

      routeFor: (text) => {
        if (!get().prefs.autoRoute) {
          return { model: get().currentModel, reason: "手动指定" };
        }
        return autoRoute(text);
      },

      addMemory: (m) =>
        set((s) => ({
          memories: [
            { ...m, source: m.source ?? "user", id: uid("mem"), createdAt: Date.now() },
            ...s.memories,
          ],
        })),

      addMemories: (ms) => {
        if (ms.length === 0) return;
        set((s) => ({
          memories: [
            ...ms.map((m) => ({
              ...m,
              source: (m.source ?? "ai") as Memory["source"],
              id: uid("mem"),
              createdAt: Date.now(),
            })),
            ...s.memories,
          ],
        }));
      },

      clearSeedMemories: () =>
        set((s) => ({
          memories: s.memories.filter((m) => m.source !== "seed"),
        })),

      updateMemory: (id, patch) =>
        set((s) => ({
          memories: s.memories.map((m) =>
            m.id === id ? { ...m, ...patch } : m
          ),
        })),

      deleteMemory: (id) =>
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

      exportAll: () => {
        const { sessions, messages, memories, prefs, apiKeys } = get();
        return JSON.stringify(
          { sessions, messages, memories, prefs, apiKeys, exportedAt: Date.now() },
          null,
          2
        );
      },

      setApiKey: (m, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [m]: key || undefined } })),

      updatePref: (k, v) =>
        set((s) => ({ prefs: { ...s.prefs, [k]: v } })),

      setDispatchMode: (m) => set({ dispatchMode: m }),

      // 创建"拆解中"任务；真实子任务由 Dispatch 页调 AI 拆解后 setTaskParsed 填入
      startDispatch: (desc) => {
        const task: DispatchTask = {
          id: uid("task"),
          description: desc,
          mode: get().dispatchMode,
          subtasks: [],
          parsing: true,
          logs: [
            {
              id: uid("log"),
              time: nowHHMMSS(),
              text: "任务已接收，调度大脑正在拆解子任务…",
            },
          ],
          createdAt: Date.now(),
          tokenUsed: 0,
          costYuan: 0,
        };
        // 自动切到工作台内的「任务」视图，让用户立刻看到执行进度
        set({ dispatchTask: task, currentPage: "workspace", workspaceView: "task" });
        return task;
      },

      setTaskParsed: (taskId, parsed) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          const stamp = Date.now().toString(36);
          const subtasks: Subtask[] = parsed.map((p, i) => ({
            id: `st_${i}_${stamp}`,
            name: p.name,
            model: p.model,
            color: AI_MODELS[p.model].color,
            desc: p.desc,
            prompt: p.prompt,
            status: "queued",
            output: "",
            progress: 0,
          }));
          return {
            dispatchTask: { ...s.dispatchTask, parsing: false, subtasks },
          };
        }),

      setSubtask: (taskId, subtaskId, patch) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          return {
            dispatchTask: {
              ...s.dispatchTask,
              subtasks: s.dispatchTask.subtasks.map((t) =>
                t.id === subtaskId ? { ...t, ...patch } : t
              ),
            },
          };
        }),

      setTaskSummary: (taskId, summary) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          return { dispatchTask: { ...s.dispatchTask, summary } };
        }),

      addTaskUsage: (taskId, tokens, costYuan) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          return {
            dispatchTask: {
              ...s.dispatchTask,
              tokenUsed: s.dispatchTask.tokenUsed + Math.max(0, Math.round(tokens)),
              costYuan: s.dispatchTask.costYuan + Math.max(0, costYuan),
            },
          };
        }),

      addLog: (taskId, text) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          const entry: LogEntry = { id: uid("log"), time: nowHHMMSS(), text };
          return {
            dispatchTask: {
              ...s.dispatchTask,
              logs: [...s.dispatchTask.logs, entry],
            },
          };
        }),

      resetDispatch: () => set({ dispatchTask: null }),
    }),
    {
      name: "flowhub-store",
      // 只持久化数据，不持久化视图状态
      // dispatchTask 不持久化：执行中持有真实流式连接，刷新后残留只可能是僵尸状态
      partialize: (s) => ({
        sessions: s.sessions,
        messages: s.messages,
        memories: s.memories,
        apiKeys: s.apiKeys,
        prefs: s.prefs,
        currentSessionId: s.currentSessionId,
        currentModel: s.currentModel,
        dispatchMode: s.dispatchMode,
      }),
      version: 1,
      // v0 → v1：旧版本（≤2026-09）种子记忆没有 source 字段，
      // 按标题与当前种子集匹配补标为 seed（示例记忆不参与对话注入、可一键清空）；
      // 用户自建记忆无 source 时保持原样（按手动记忆对待）。
      // 同时丢弃旧版本可能持久化的僵尸调度任务。
      migrate: (persisted, fromVersion) => {
        type Persisted = Pick<
          FlowHubState,
          | "sessions"
          | "messages"
          | "memories"
          | "apiKeys"
          | "prefs"
          | "currentSessionId"
          | "currentModel"
          | "dispatchMode"
        >;
        const s = persisted as Partial<Persisted> & { dispatchTask?: unknown };
        if (fromVersion < 1 && Array.isArray(s.memories)) {
          const seedTitles = new Set(DEMO_MEMORIES_TYPED.map((m) => m.title));
          s.memories = s.memories.map((m) =>
            m.source == null && seedTitles.has(m.title)
              ? { ...m, source: "seed" as const }
              : m
          );
        }
        if (s.dispatchTask !== undefined) delete s.dispatchTask;
        return s as Persisted;
      },
      onRehydrateStorage: () => (state) => {
        // 兜底：merge 后内存态也不保留任何调度任务
        if (state) state.dispatchTask = null;
      },
    }
  )
);
