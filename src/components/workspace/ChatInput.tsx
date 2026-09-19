"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { autoRoute } from "@/lib/routing";
import { streamChat, buildChatHistory } from "@/lib/ai-client";
import { extractPdfText } from "@/lib/pdf";
import type { ModelId } from "@/lib/types";
import { toast } from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";

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

  const { open: openNewTask, setInitialDesc } = useNewTaskModal();

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

  async function handleSend() {
    const t = text.trim();
    if ((!t && attachments.length === 0) || !currentSessionId || parsing) return;

    // 1. / 触发调度任务（附件不参与调度）
    if (t.startsWith("/")) {
      const desc = t.slice(1).trim();
      setText("");
      if (desc) {
        setInitialDesc(desc);
        openNewTask();
      } else {
        openNewTask();
      }
      return;
    }

    // 合成最终发送内容（文本 + 附件）
    const composed = composeWithAttachments(t, attachments);

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

    // 3. push 用户消息 + 清空输入
    pushUserMessage(currentSessionId, composed);
    setText("");
    setAttachments([]);

    // 4. 检查 key（mock 跳过）
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

    // 5. 流式调用
    setTyping({ model, color: meta.color, content: "" });
    const history = buildChatHistory(
      messages,
      "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。"
    );
    history.push({ role: "user", content: composed });

    let acc = "";
    await streamChat(
      {
        provider: model,
        messages: history,
        apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
        systemHint:
          "你是 FlowHub 调度中枢的 AI 协作者。用户偏好：中文回复、结构化输出、简洁排版、优先用数据说话。",
      },
      {
        onToken: (delta) => {
          acc += delta;
          setTyping({ model, color: meta.color, content: acc });
        },
        onDone: (full) => {
          setTyping(null);
          pushAiMessage(currentSessionId, {
            role: "ai",
            model,
            color: meta.color,
            time: nowHHMM(),
            content: full || acc,
          });
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

  return (
    <div className="px-7 pb-6">
      {routeHint && (
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
          disabled={(!text.trim() && attachments.length === 0) || typing != null || parsing != null}
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
