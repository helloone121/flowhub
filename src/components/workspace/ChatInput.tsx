"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { autoRoute } from "@/lib/routing";
import { streamChat, buildHistoryForModel } from "@/lib/ai-client";
import { extractPdfText } from "@/lib/pdf";
import { pickHelper, extractMemories, buildMemoryContext } from "@/lib/memory-ai";
import type { CompareColumn, ModelId } from "@/lib/types";
import { toast } from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";

/** 可参与真实对比/调度的模型（排除 mock） */
const REAL_MODELS: ModelId[] = ["kimi", "deepseek"];

/** 附件：文本类文件直接读取；PDF 经 pdf.js 提取文字 */
interface Attachment {
  name: string;
  size: number;
  content: string;
  /** 附加展示信息，如 "PDF · 12 页" */
  meta?: string;
}

const SINGLE_LIMIT = 200 * 1024; // 文本单文件 200KB
const TOTAL_LIMIT = 500 * 1024; // 文本附件合计 500KB
const PDF_FILE_LIMIT = 5 * 1024 * 1024; // PDF 文件 ≤5MB
const PDF_TEXT_LIMIT = 100_000; // PDF 提取文字 ≤10 万字
const ACCEPT =
  ".txt,.md,.markdown,.csv,.json,.log,.xml,.yaml,.yml,.html,.htm,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.java,.go,.rs,.c,.h,.cpp,.cc,.sql,.sh,.bash,.ini,.conf,.toml,.env,.vue,.php,.rb,.swift,.kt,.pdf,text/*,application/json,application/pdf";
const TEXT_EXT = [
  "txt","md","markdown","csv","json","log","xml","yaml","yml","html","htm","css",
  "js","mjs","cjs","ts","tsx","jsx","py","java","go","rs","c","h","cpp","cc","sql",
  "sh","bash","ini","conf","toml","env","vue","php","rb","swift","kt",
];

export function ChatInput() {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<{ model: ModelId; color: string; content: string } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState<string | null>(null);
  // 单聊 / 多模型对比
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [compareModels, setCompareModels] = useState<ModelId[]>(["kimi", "deepseek"]);
  const [comparing, setComparing] = useState<CompareColumn[] | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // store
  const currentSessionId = useFlowHub((s) => s.currentSessionId);
  const currentModel = useFlowHub((s) => s.currentModel);
  const prefs = useFlowHub((s) => s.prefs);
  const apiKeys = useFlowHub((s) => s.apiKeys);
  const messages = useFlowHub((s) =>
    s.currentSessionId ? s.messages[s.currentSessionId] ?? [] : []
  );
  const pushUserMessage = useFlowHub((s) => s.pushUserMessage);
  const pushAiMessage = useFlowHub((s) => s.pushAiMessage);
  const routeFor = useFlowHub((s) => s.routeFor);
  const setModel = useFlowHub((s) => s.setModel);
  const memories = useFlowHub((s) => s.memories);
  const addMemories = useFlowHub((s) => s.addMemories);

  const BASE_HINT =
    "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。";

  /** 长回复后静默抽取记忆（autoMemory 开关控制） */
  const maybeExtractMemories = useCallback(
    async (userText: string, aiText: string) => {
      const st = useFlowHub.getState();
      if (!st.prefs.autoMemory) return;
      const helper = pickHelper(st.apiKeys);
      if (!helper) return;
      const items = await extractMemories(userText, aiText, helper, st.memories);
      if (items.length > 0) {
        st.addMemories(items);
        toast(`已沉淀 ${items.length} 条记忆`, "#9381FF");
      }
    },
    []
  );

  const { open: openNewTask } = useNewTaskModal();

  // 自动路由提示（不强制切换，只显示）
  const routeHint =
    text.length > 0 && prefs.autoRoute
      ? (() => {
          const r = autoRoute(text);
          return r.model !== currentModel ? r : null;
        })()
      : null;

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + "px";
    }
  }, [text]);

  /** 读取并校验一批文件，加入附件列表 */
  const ingestFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const added: Attachment[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        const isPdf = ext === "pdf" || f.type === "application/pdf";
        const isText =
          TEXT_EXT.includes(ext) || f.type.startsWith("text/") || f.type === "application/json";

        // ---------- PDF 分支：pdf.js 本地提取文字 ----------
        if (isPdf) {
          if (f.size > PDF_FILE_LIMIT) {
            toast(`「${f.name}」超过 5MB 上限`, "#FF5C5C");
            continue;
          }
          setParsing(f.name);
          try {
            const { text: pdfText, pages } = await extractPdfText(f, PDF_TEXT_LIMIT);
            if (pdfText.trim().length < 10) {
              toast(`「${f.name}」未提取到文字，可能是扫描件/图片版 PDF`, "#F5C542");
            } else {
              added.push({
                name: f.name,
                size: f.size,
                content: pdfText,
                meta: `PDF · ${pages} 页`,
              });
            }
          } catch {
            toast(`「${f.name}」PDF 解析失败（可能已损坏或加密）`, "#FF5C5C");
          } finally {
            setParsing(null);
          }
          continue;
        }

        // ---------- 文本文件分支 ----------
        if (!isText) {
          toast(`「${f.name}」类型暂不支持（图片/Word/Excel 留待后续版本）`, "#F5C542");
          continue;
        }
        if (f.size > SINGLE_LIMIT) {
          toast(`「${f.name}」超过 200KB 单文件上限`, "#FF5C5C");
          continue;
        }
        const currentTotal =
          attachments.reduce((s, a) => s + a.size, 0) +
          added.reduce((s, a) => s + a.size, 0);
        if (currentTotal + f.size > TOTAL_LIMIT) {
          toast("文本附件总大小超过 500KB 上限，请分批发送", "#FF5C5C");
          break;
        }
        const content = await f.text();
        added.push({ name: f.name, size: f.size, content });
      }
      if (added.length) setAttachments((prev) => [...prev, ...added]);
    },
    [attachments]
  );

  /** 把附件拼进发送文本，用明确分隔符包裹便于 AI 识别 */
  const composeWithAttachments = (t: string, atts: Attachment[]) => {
    if (atts.length === 0) return t;
    const blocks = atts.map(
      (a) =>
        `【附件：${a.name}（${(a.size / 1024).toFixed(1)} KB）】\n<<<FILE:${a.name}>>>\n${a.content}\n<<<END FILE>>>`
    );
    const intro = t.trim() || "请阅读以下附件内容，总结关键要点并指出需要注意的问题。";
    return `${intro}\n\n${blocks.join("\n\n")}`;
  };

  /** 拼接带记忆的 systemHint */
  const hintWithMemory = (composed: string) => {
    const memCtx = buildMemoryContext(memories, composed);
    return memCtx ? `${BASE_HINT}\n\n${memCtx}` : BASE_HINT;
  };

  async function handleSend() {
    const t = text.trim();
    if ((!t && attachments.length === 0) || !currentSessionId || parsing) return;
    if (typing || comparing) return;

    // 1. / 触发调度任务（附件不参与调度）
    if (t.startsWith("/")) {
      const desc = t.slice(1).trim();
      setText("");
      // 直接把描述带入弹窗（openNewTask 无参会清空 initialDesc）
      openNewTask(desc || undefined);
      return;
    }

    // 合成最终发送内容（文本 + 附件）
    const composed = composeWithAttachments(t, attachments);
    const history = messages;
    pushUserMessage(currentSessionId, composed);
    setText("");
    setAttachments([]);

    // ---------- 对比模式：同一句话并发给多个真实模型 ----------
    if (mode === "compare") {
      const models = compareModels.filter(
        (m) => (apiKeys[m as keyof typeof apiKeys] ?? "").length > 0
      );
      if (models.length === 0) {
        pushAiMessage(currentSessionId, {
          role: "ai",
          model: "kimi",
          color: AI_MODELS.kimi.color,
          time: nowHHMM(),
          content: "对比模式至少需要一个已配置的 API key（Kimi 或 DeepSeek）。请在「设置」页填入后重试。",
        });
        return;
      }
      if (models.length < compareModels.length) {
        toast("部分模型未配置 key，已自动跳过", "#F5C542");
      }
      const systemHint = hintWithMemory(composed);
      const acc: Record<string, string> = {};
      const errs: Record<string, string> = {};
      const startedAt: Record<string, number> = {};
      setComparing(models.map((m) => ({ model: m, content: "" })));

      await Promise.all(
        models.map(
          (model) =>
            new Promise<void>((resolve) => {
              startedAt[model] = performance.now();
              const msgs = buildHistoryForModel(history, model, systemHint);
              msgs.push({ role: "user", content: composed });
              streamChat(
                {
                  provider: model,
                  messages: msgs,
                  apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
                },
                {
                  onToken: (delta) => {
                    acc[model] = (acc[model] ?? "") + delta;
                    const live = acc[model];
                    setComparing((prev) =>
                      prev
                        ? prev.map((c) =>
                            c.model === model ? { ...c, content: live } : c
                          )
                        : prev
                    );
                  },
                  onDone: (full) => {
                    acc[model] = full || acc[model] || "";
                    resolve();
                  },
                  onError: (err) => {
                    errs[model] = err;
                    resolve();
                  },
                }
              );
            })
        )
      );

      const cols: CompareColumn[] = models.map((m) => ({
        model: m,
        content: acc[m] ?? "",
        ms: Math.round(performance.now() - (startedAt[m] ?? performance.now())),
        error: errs[m],
      }));
      pushAiMessage(currentSessionId, {
        role: "ai",
        time: nowHHMM(),
        content: "",
        compare: cols,
      });
      setComparing(null);

      // 取最长成功回复抽一次记忆
      const best = cols
        .filter((c) => !c.error && c.content)
        .sort((a, b) => b.content.length - a.content.length)[0];
      if (best) void maybeExtractMemories(composed, best.content);
      return;
    }

    // ---------- 单聊模式 ----------
    // 2. 自动路由（基于合成内容，带长附件时更容易正确路由到 Kimi）
    let model = currentModel;
    if (prefs.autoRoute) {
      const r = routeFor(composed);
      if (r.model !== currentModel) {
        setModel(r.model);
        model = r.model;
        toast(`已自动切换：${r.reason}`, AI_MODELS[r.model].color);
      }
    }

    // 3. 检查 key（mock 跳过）
    const meta = AI_MODELS[model];
    if (!meta.mock && !(apiKeys[model as keyof typeof apiKeys] ?? "")) {
      pushAiMessage(currentSessionId, {
        role: "ai",
        model,
        color: meta.color,
        time: nowHHMM(),
        content: `未检测到 ${meta.name} 的 API key。请在「设置」页填入后重试。`,
      });
      return;
    }

    // 4. 流式调用（携带记忆上下文）
    setTyping({ model, color: meta.color, content: "" });
    const msgs = buildHistoryForModel(history, model, hintWithMemory(composed));
    msgs.push({ role: "user", content: composed });

    let acc = "";
    await streamChat(
      {
        provider: model,
        messages: msgs,
        apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
      },
      {
        onToken: (delta) => {
          acc += delta;
          setTyping({ model, color: meta.color, content: acc });
        },
        onDone: (full) => {
          setTyping(null);
          const text2 = full || acc;
          pushAiMessage(currentSessionId, {
            role: "ai",
            model,
            color: meta.color,
            time: nowHHMM(),
            content: text2,
          });
          void maybeExtractMemories(composed, text2);
        },
        onError: (err) => {
          setTyping(null);
          pushAiMessage(currentSessionId, {
            role: "ai",
            model,
            color: meta.color,
            time: nowHHMM(),
            content: `调用失败：${err}`,
          });
        },
      }
    );
  }

  const toggleCompareModel = (m: ModelId) => {
    setCompareModels((prev) => {
      if (prev.includes(m)) {
        return prev.length > 1 ? prev.filter((x) => x !== m) : prev;
      }
      return [...prev, m];
    });
  };

  return (
    <div className="px-7 pb-6">
      {/* 模式切换：单聊 / 多模型对比 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div
          className="inline-flex items-center rounded-lg p-0.5"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {(
            [
              ["single", "单聊"],
              ["compare", "⚡ 多模型对比"],
            ] as const
          ).map(([id, label]) => {
            const active = mode === id;
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                className="px-3 h-7 rounded-md text-label font-medium transition"
                style={{
                  background: active ? "rgba(147,129,255,0.18)" : "transparent",
                  color: active ? "#C9C0FF" : "#A9A9B7",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {mode === "compare" && (
          <>
            {REAL_MODELS.map((m) => {
              const hasKey = (apiKeys[m as keyof typeof apiKeys] ?? "").length > 0;
              const active = compareModels.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => hasKey && toggleCompareModel(m)}
                  disabled={!hasKey}
                  title={hasKey ? AI_MODELS[m].name : `${AI_MODELS[m].name} 未配置 API key`}
                  className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-pill text-label transition"
                  style={{
                    background: active
                      ? `${AI_MODELS[m].color}22`
                      : "rgba(255,255,255,0.04)",
                    color: active ? AI_MODELS[m].color : "#71717F",
                    border: active
                      ? `1px solid ${AI_MODELS[m].color}66`
                      : "1px solid rgba(255,255,255,0.08)",
                    opacity: hasKey ? 1 : 0.45,
                    cursor: hasKey ? "pointer" : "not-allowed",
                  }}
                >
                  <span
                    className="rounded-pill"
                    style={{ width: 6, height: 6, background: AI_MODELS[m].color }}
                  />
                  {AI_MODELS[m].name}
                  {!hasKey && <span className="opacity-70">· 未配置</span>}
                </button>
              );
            })}
            <span className="text-tag text-text-disabled">
              同一句话并发多答 · 结果并排对比
            </span>
          </>
        )}
      </div>

      {routeHint && mode === "single" && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-2 text-label"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 9h13l-4-4M20 15H7l4 4"
              stroke="#71717F"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-text-muted">
            将自动路由：{routeHint.reason}（点击切换或继续）
          </span>
          <button
            onClick={() => {
              setModel(routeHint.model);
              toast(`已切换到 ${AI_MODELS[routeHint.model].name}`, AI_MODELS[routeHint.model].color);
            }}
            className="text-text-secondary hover:text-text-primary transition"
          >
            立即切换
          </button>
        </div>
      )}

      {/* 附件标签栏 */}
      {(attachments.length > 0 || parsing) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {parsing && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-label"
              style={{
                background: "rgba(147,129,255,0.08)",
                border: "1px dashed rgba(147,129,255,0.45)",
                color: "#C9C0FF",
              }}
            >
              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 12a9 9 0 1 1-6.22-8.56"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              </svg>
              <span className="max-w-[200px] truncate">正在解析 {parsing}…</span>
            </span>
          )}
          {attachments.map((a, i) => (
            <span
              key={`${a.name}-${i}`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-label"
              style={{
                background: "rgba(147,129,255,0.12)",
                border: "1px solid rgba(147,129,255,0.35)",
                color: "#C9C0FF",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="max-w-[160px] truncate">{a.name}</span>
              <span className="opacity-60">{a.meta ?? formatSize(a.size)}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded hover:bg-white/15 transition"
                aria-label="移除附件"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-3 rounded-2xl px-3.5 py-2 transition"
        style={{
          background: dragOver ? "rgba(147,129,255,0.08)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${dragOver ? "rgba(147,129,255,0.55)" : "rgba(255,255,255,0.1)"}`,
          minHeight: "var(--input-h)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          title="上传附件：PDF（≤5MB，自动提取文字）或文本文件（txt/md/csv/json/代码等，≤200KB），也可直接拖入"
          className="text-text-muted hover:text-text-primary transition shrink-0 mb-1.5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder={`给 ${AI_MODELS[currentModel].name} 发送消息，输入 / 创建调度任务`}
          className="flex-1 bg-transparent outline-none text-body text-text-primary placeholder:text-text-disabled resize-none py-2.5 leading-[20px]"
          style={{ maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={(!text.trim() && attachments.length === 0) || typing != null || parsing != null || comparing != null}
          className="shrink-0 mb-1 w-9 h-9 rounded-md flex items-center justify-center text-white transition disabled:opacity-40"
          style={{ background: "var(--grad-brand)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="text-tag text-text-muted mt-2 px-1 flex items-center gap-3 flex-wrap">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <span>·</span>
        <span>输入 / 创建调度任务</span>
        <span>·</span>
        <span>可拖入 PDF / 文本附件</span>
        <span>·</span>
        <span>当前模型 {AI_MODELS[currentModel].name}</span>
      </div>

      {/* typing 指示气泡 */}
      {typing && (
        <div className="mt-4 mb-1 animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-pill" style={{ width: 8, height: 8, background: typing.color }} />
            <span className="text-body-sm font-semibold" style={{ color: typing.color }}>
              {AI_MODELS[typing.model].name}
            </span>
          </div>
          {typing.content ? (
            <div className="text-body text-text-tertiary leading-[22px] whitespace-pre-line">
              {typing.content}
              <span className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse-soft" style={{ background: typing.color }} />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
      )}

      {/* 多模型对比 · 流式进行中 */}
      {comparing && (
        <div className="mt-4 mb-1 animate-fade-up">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-body-sm font-semibold text-text-secondary">
              多模型对比
            </span>
            <span className="text-tag text-text-muted">
              {comparing.length} 路同时回答中…
            </span>
          </div>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.min(comparing.length, 2)}, minmax(0, 1fr))`,
            }}
          >
            {comparing.map((c) => {
              const color = AI_MODELS[c.model].color;
              return (
                <div
                  key={c.model}
                  className="rounded-2xl px-3.5 py-3 min-h-[72px]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${color}33`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="rounded-pill" style={{ width: 7, height: 7, background: color }} />
                    <span className="text-label font-semibold" style={{ color }}>
                      {AI_MODELS[c.model].name}
                    </span>
                  </div>
                  {c.content ? (
                    <div className="text-body-sm text-text-tertiary leading-[21px] whitespace-pre-line">
                      {c.content}
                      <span
                        className="inline-block w-1.5 h-3 ml-0.5 align-middle animate-pulse-soft"
                        style={{ background: color }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${(bytes / 1024).toFixed(1)}KB`;
}
