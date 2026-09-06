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
} from "./types";
import { AI_MODELS } from "./ai-meta";
import { autoRoute, dispatchParse } from "./routing";
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

const DEMO_SUBTASKS: Subtask[] = [
  {
    id: "s1",
    name: "Kimi · 行业趋势与竞品调研",
    model: "kimi",
    color: "#9381FF",
    desc: "扫描 38 份行业报告，提炼 6 条趋势结论与竞品传播打法，标记 3 个可引用数据点。",
    status: "done",
    output: "12 页结构化笔记 · 3m12s",
    progress: 100,
  },
  {
    id: "s2",
    name: "DeepSeek · 传播策略数据推演",
    model: "deepseek",
    color: "#2EA7FF",
    desc: "基于近三年发布会传播数据，推演 3 套策略的曝光曲线与转化漏斗，推荐方案 B。",
    status: "done",
    output: "推演报告 + 对比图表 · 1m48s",
    progress: 100,
  },
  {
    id: "s3",
    name: "Midjourney · 主视觉海报生成",
    model: "midjourney",
    color: "#F5C542",
    desc: "科技感主视觉 · 极光渐变风格，基于记忆库中的品牌色板，已产出 3 / 5 张候选。",
    status: "running",
    output: "3 / 5 张候选生成中",
    progress: 60,
  },
  {
    id: "s4",
    name: "Claude · 全套发布会文案",
    model: "claude",
    color: "#D97757",
    desc: "等待主视觉与调研结论作为输入，预计接入后 5 分钟内完成全套文案。",
    status: "queued",
    output: "等待上游结果",
    progress: 0,
  },
];

// ---------- Store 定义 ----------
interface FlowHubState {
  // 视图状态（不持久化）
  currentPage: PageId;
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
  routeFor: (text: string) => { model: ModelId; reason: string };

  addMemory: (m: Omit<Memory, "id" | "createdAt">) => void;
  updateMemory: (id: string, patch: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  exportAll: () => string;

  setApiKey: (m: ModelId, key: string) => void;
  updatePref: (k: keyof DispatchPrefs, v: boolean) => void;
  setDispatchMode: (m: DispatchMode) => void;

  startDispatch: (desc: string) => DispatchTask;
  advanceSubtask: (taskId: string, subtaskId: string, progress: number) => void;
  completeSubtask: (taskId: string, subtaskId: string, output: string) => void;
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
      searchQuery: "",
      memoryFilter: "all",
      showKeyMap: {},

      // 持久化数据
      sessions: DEMO_SESSIONS,
      messages: DEMO_MESSAGES,
      memories: DEMO_MEMORIES,
      apiKeys: {},
      prefs: DEFAULT_PREFS,
      currentSessionId: "whitepaper",
      currentModel: "kimi",
      dispatchMode: "auto",
      dispatchTask: {
        id: "demo",
        description: "下个月要开产品发布会，帮我做一套完整方案：行业背景、传播策略、主视觉和全套文案。",
        mode: "auto",
        subtasks: DEMO_SUBTASKS,
        logs: [
          {
            id: "log1",
            time: "14:30:02",
            text: "调度大脑完成拆解，4 个子任务并行分发",
          },
        ],
        createdAt: Date.now() - 1800_000,
        tokenUsed: 86000,
        costYuan: 1.28,
      },

      setPage: (p) => set({ currentPage: p }),
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

      routeFor: (text) => {
        if (!get().prefs.autoRoute) {
          return { model: get().currentModel, reason: "手动指定" };
        }
        return autoRoute(text);
      },

      addMemory: (m) =>
        set((s) => ({
          memories: [
            { ...m, id: uid("mem"), createdAt: Date.now() },
            ...s.memories,
          ],
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

      startDispatch: (desc) => {
        const parsed = dispatchParse(desc);
        const subtasks: Subtask[] = parsed.map((p, i) => ({
          id: `st_${i}_${Date.now().toString(36)}`,
          name: p.name,
          model: p.model,
          color: AI_MODELS[p.model].color,
          desc: p.desc,
          status: i === 0 ? "running" : "queued",
          output: i === 0 ? "执行中" : "等待上游",
          progress: 0,
        }));
        const task: DispatchTask = {
          id: uid("task"),
          description: desc,
          mode: get().dispatchMode,
          subtasks,
          logs: [
            {
              id: uid("log"),
              time: nowHHMM() + ":00",
              text: `调度大脑完成拆解，${subtasks.length} 个子任务并行分发`,
            },
          ],
          createdAt: Date.now(),
          tokenUsed: 0,
          costYuan: 0,
        };
        set({ dispatchTask: task, currentPage: "dispatch" });
        return task;
      },

      advanceSubtask: (taskId, subtaskId, progress) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          return {
            dispatchTask: {
              ...s.dispatchTask,
              subtasks: s.dispatchTask.subtasks.map((t) =>
                t.id === subtaskId
                  ? { ...t, progress: Math.min(100, progress), status: "running" }
                  : t
              ),
            },
          };
        }),

      completeSubtask: (taskId, subtaskId, output) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          const subtasks = s.dispatchTask.subtasks.map((t) =>
            t.id === subtaskId
              ? { ...t, status: "done" as const, progress: 100, output }
              : t
          );
          // 找下一个排队中
          const next = subtasks.find((t) => t.status === "queued");
          if (next) next.status = "running";
          return { dispatchTask: { ...s.dispatchTask, subtasks } };
        }),

      addLog: (taskId, text) =>
        set((s) => {
          if (!s.dispatchTask || s.dispatchTask.id !== taskId) return s;
          const entry: LogEntry = {
            id: uid("log"),
            time: nowHHMM() + ":" + String(Math.floor(Math.random() * 60)).padStart(2, "0"),
            text,
          };
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
      partialize: (s) => ({
        sessions: s.sessions,
        messages: s.messages,
        memories: s.memories,
        apiKeys: s.apiKeys,
        prefs: s.prefs,
        currentSessionId: s.currentSessionId,
        currentModel: s.currentModel,
        dispatchMode: s.dispatchMode,
        dispatchTask: s.dispatchTask,
      }),
      // hydrate 后强制重置 demo task 的 subtasks
      // 避免之前无限循环跑完的"全部完成"状态残留
      onRehydrateStorage: () => (state) => {
        if (state && state.dispatchTask && state.dispatchTask.id === "demo") {
          state.dispatchTask = {
            ...state.dispatchTask,
            subtasks: DEMO_SUBTASKS.map((t) => ({ ...t })),
            logs: [
              {
                id: "log1",
                time: "14:30:02",
                text: "调度大脑完成拆解，4 个子任务并行分发",
              },
            ],
            tokenUsed: 86000,
            costYuan: 1.28,
          };
        }
      },
    }
  )
);
