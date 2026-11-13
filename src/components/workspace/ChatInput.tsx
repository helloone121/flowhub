"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import { autoRoute } from "@/lib/routing";
import { routeWithAI } from "@/lib/ai-route";
import { streamChat, buildHistoryForModel, type ChatContent } from "@/lib/ai-client";
import { makeStep, planBrief } from "@/lib/collab-ai";
import { PLANNER_USER } from "@/lib/prompts";
import { extractPdfText } from "@/lib/pdf";
import { extractDocxText } from "@/lib/docx";
import { extractXlsxText } from "@/lib/xlsx";
import { pickHelper, extractMemories, buildMemoryContext } from "@/lib/memory-ai";
import type { CompareColumn, CollabRun, ModelId } from "@/lib/types";
import { toast } from "@/components/ui";
import { useNewTaskModal } from "@/components/modals";

/** 可参与真实对比/调度的模型（排除 mock） */
const REAL_MODELS: ModelId[] = ["kimi", "deepseek"];

/** 附件：文本类文件直接读取；PDF/Word 提取文字；图片压缩后以 dataURL 随消息发送 */
interface Attachment {
  name: string;
  size: number;
  content: string;
  /** 图片附件的压缩 dataURL（存在时表示图片附件） */
  dataUrl?: string;
  /** 附加展示信息，如 "PDF · 12 页" */
  meta?: string;
}

const SINGLE_LIMIT = 200 * 1024; // 文本单文件 200KB
const TOTAL_LIMIT = 500 * 1024; // 文本附件合计 500KB
const PDF_FILE_LIMIT = 5 * 1024 * 1024; // PDF 文件 ≤5MB
const DOCX_FILE_LIMIT = 5 * 1024 * 1024; // Word 文件 ≤5MB
const XLSX_FILE_LIMIT = 5 * 1024 * 1024; // Excel 文件 ≤5MB
const XLSX_TEXT_LIMIT = 100_000; // Excel 提取文字 ≤10 万字
const DOCX_TEXT_LIMIT = 100_000; // Word 提取文字 ≤10 万字
const PDF_TEXT_LIMIT = 100_000; // PDF 提取文字 ≤10 万字
const IMAGE_FILE_LIMIT = 8 * 1024 * 1024; // 图片原图 ≤8MB（压缩后远小于此）
const IMAGE_MAX_COUNT = 4; // 每条消息最多 4 张图片
const IMAGE_MAX_WIDTH = 1280; // 截图/图片最长边压到 1280px
const IMAGE_QUALITY = 0.72; // JPEG 压缩质量
const ACCEPT =
  ".txt,.md,.markdown,.csv,.json,.log,.xml,.yaml,.yml,.html,.htm,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.java,.go,.rs,.c,.h,.cpp,.cc,.sql,.sh,.bash,.ini,.conf,.toml,.env,.vue,.php,.rb,.swift,.kt,.pdf,.docx,.xlsx,.xlsm,.png,.jpg,.jpeg,.webp,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp";
const TEXT_EXT = [
  "txt","md","markdown","csv","json","log","xml","yaml","yml","html","htm","css",
  "js","mjs","cjs","ts","tsx","jsx","py","java","go","rs","c","h","cpp","cc","sql",
  "sh","bash","ini","conf","toml","env","vue","php","rb","swift","kt",
];

/** 图片压缩为 dataURL：最长边 1280、JPEG 0.72（截图识别足够，且控制 localStorage 体积） */
async function imageToDataUrl(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = url;
    });
    const scale = Math.min(1, IMAGE_MAX_WIDTH / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ChatInput() {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState<{ model: ModelId; color: string; content: string } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState<string | null>(null);
  // 单聊 / 多模型对比 / 接力协同
  const [mode, setMode] = useState<"single" | "compare" | "relay">("single");
  const [compareModels, setCompareModels] = useState<ModelId[]>(["kimi", "deepseek"]);
  const [comparing, setComparing] = useState<CompareColumn[] | null>(null);
  // 接力协同：策划（便宜）→ 交接单 → 执行（长文）
  const [relayPlanner, setRelayPlanner] = useState<ModelId>("deepseek");
  const [relayExecutor, setRelayExecutor] = useState<ModelId>("kimi");
  const [deepReview, setDeepReview] = useState(false);
  const [planning, setPlanning] = useState<{ model: ModelId } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 当前生成任务的取消控制器（单聊/对比/协同共用）
  const abortRef = useRef<AbortController | null>(null);

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
  // 当前会话固定交接单：接力完成后，后续追问继续由执行模型承接
  const pinnedBrief = useFlowHub((s) =>
    s.currentSessionId ? s.sessionBrief[s.currentSessionId] : undefined
  );
  const clearSessionBrief = useFlowHub((s) => s.clearSessionBrief);

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
        const isDocx =
          ext === "docx" ||
          f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const isLegacyDoc = ext === "doc";
        const isXlsx =
          ext === "xlsx" ||
          ext === "xlsm" ||
          f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        const isLegacyXls = ext === "xls";
        const isText =
          TEXT_EXT.includes(ext) || f.type.startsWith("text/") || f.type === "application/json";

        // ---------- Word 分支：mammoth 本地提取文字 ----------
        if (isDocx || isLegacyDoc) {
          if (isLegacyDoc) {
            toast(`「${f.name}」是旧版 .doc 格式，请先在 Word 里另存为 .docx 再上传`, "#F5C542");
            continue;
          }
          if (f.size > DOCX_FILE_LIMIT) {
            toast(`「${f.name}」超过 5MB 上限`, "#FF5C5C");
            continue;
          }
          setParsing(f.name);
          try {
            const { text: docxText } = await extractDocxText(f, DOCX_TEXT_LIMIT);
            if (docxText.trim().length < 10) {
              toast(`「${f.name}」未提取到文字，可能是纯图片文档`, "#F5C542");
            } else {
              added.push({
                name: f.name,
                size: f.size,
                content: docxText,
                meta: "Word 文档",
              });
            }
          } catch {
            toast(`「${f.name}」Word 解析失败（文件可能已损坏）`, "#FF5C5C");
          } finally {
            setParsing(null);
          }
          continue;
        }


        // ---------- Excel 分支：JSZip 本地解包读取工作表 ----------
        if (isXlsx || isLegacyXls) {
          if (isLegacyXls) {
            toast(`「${f.name}」是旧版 .xls 格式，请先在 Excel 里另存为 .xlsx 再上传`, "#F5C542");
            continue;
          }
          if (f.size > XLSX_FILE_LIMIT) {
            toast(`「${f.name}」超过 5MB 上限`, "#FF5C5C");
            continue;
          }
          setParsing(f.name);
          try {
            const { text: xlsxText, sheets, warnings } = await extractXlsxText(f, XLSX_TEXT_LIMIT);
            if (xlsxText.trim().length < 10) {
              toast(`「${f.name}」未读取到数据，可能是空表格`, "#F5C542");
            } else {
              added.push({
                name: f.name,
                size: f.size,
                content: xlsxText,
                meta: `Excel · ${sheets} 个工作表`,
              });
              if (warnings.length > 0) {
                toast(`「${f.name}」${warnings[0]}`, "#F5C542");
              }
            }
          } catch {
            toast(`「${f.name}」Excel 解析失败（文件可能已损坏或加密）`, "#FF5C5C");
          } finally {
            setParsing(null);
          }
          continue;
        }

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

        // ---------- 图片分支：本地压缩为 dataURL，随消息以多模态分片发送 ----------
        const isImage =
          f.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
        if (isImage) {
          if (f.size > IMAGE_FILE_LIMIT) {
            toast(`「${f.name}」图片超过 8MB 上限`, "#FF5C5C");
            continue;
          }
          const imgCount = [...attachments, ...added].filter((a) => a.dataUrl).length;
          if (imgCount >= IMAGE_MAX_COUNT) {
            toast(`每次最多发送 ${IMAGE_MAX_COUNT} 张图片`, "#F5C542");
            continue;
          }
          setParsing(f.name);
          try {
            const dataUrl = await imageToDataUrl(f);
            added.push({ name: f.name, size: f.size, content: "", dataUrl, meta: "图片" });
          } catch {
            toast(`「${f.name}」图片处理失败`, "#FF5C5C");
          } finally {
            setParsing(null);
          }
          continue;
        }

        // ---------- 文本文件分支 ----------
        if (!isText) {
          toast(`「${f.name}」类型暂不支持（支持 PDF / Word(.docx) / Excel(.xlsx) / 图片 / 文本文件）`, "#F5C542");
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

  /** 截图：调起系统屏幕/窗口/标签页选择器，抓帧后作为图片附件加入输入框 */
  const captureScreenshot = useCallback(async () => {
    if (attachments.filter((a) => a.dataUrl).length >= IMAGE_MAX_COUNT) {
      toast(`每次最多发送 ${IMAGE_MAX_COUNT} 张图片`, "#F5C542");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast("当前环境不支持直接截图：可用 Win+Shift+S 截图后按 Ctrl+V 粘贴到输入框", "#F5C542");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 350)); // 等首帧渲染稳定
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("empty frame");
      const dataUrl = await imageToDataUrl(blob);
      const d = new Date();
      const name = `截图-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}.png`;
      setAttachments((prev) => [
        ...prev,
        {
          name,
          size: Math.round((dataUrl.length * 3) / 4),
          content: "",
          dataUrl,
          meta: "屏幕截图",
        },
      ]);
      toast("截图已添加，补充说明后发送即可", "#2EA7FF");
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      toast("已取消截图", "#71717F");
    }
  }, [attachments]);

  /** 把附件拼进发送文本；图片以【图片：xx】标记占位（真实图片走多模态分片） */
  const composeWithAttachments = (t: string, atts: Attachment[]) => {
    const textAtts = atts.filter((a) => !a.dataUrl);
    const imgAtts = atts.filter((a) => a.dataUrl);
    const imgLines = imgAtts.length
      ? "\n" + imgAtts.map((a) => `【图片：${a.name}】`).join("\n")
      : "";
    if (textAtts.length === 0) {
      if (imgAtts.length === 0) return t;
      const intro = t.trim() || "请查看我发送的截图，说明其中的关键内容并指出需要注意的问题。";
      return `${intro}${imgLines}`;
    }
    const blocks = textAtts.map(
      (a) =>
        `【附件：${a.name}（${(a.size / 1024).toFixed(1)} KB）】\n<<<FILE:${a.name}>>>\n${a.content}\n<<<END FILE>>>`
    );
    const intro = t.trim() || "请阅读以下附件内容，总结关键要点并指出需要注意的问题。";
    return `${intro}${imgLines}\n\n${blocks.join("\n\n")}`;
  };

  /** 拼接带记忆的 systemHint */
  const hintWithMemory = (composed: string) => {
    const memCtx = buildMemoryContext(memories, composed);
    return memCtx ? `${BASE_HINT}\n\n${memCtx}` : BASE_HINT;
  };

  async function handleSend() {
    const t = text.trim();
    if ((!t && attachments.length === 0) || parsing) return;
    if (typing || comparing || planning) return;

    // 0. 当前会话不存在（如左侧历史记录被全部删除）时自动新建，避免静默失败
    let sessionId = currentSessionId;
    if (!sessionId || !useFlowHub.getState().sessions.some((x) => x.id === sessionId)) {
      sessionId = useFlowHub.getState().newSession(currentModel, "新会话", "");
      toast("已自动创建新会话", "#2EA7FF");
    }

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
    const history = sessionId === currentSessionId ? messages : [];
    // 图片附件以多模态分片随最后一条 user 消息发送，同时存入消息记录
    const imageUrls = attachments
      .filter((a) => a.dataUrl)
      .map((a) => a.dataUrl!)
      .slice(0, IMAGE_MAX_COUNT);
    const withImages = (content: string): ChatContent =>
      imageUrls.length === 0
        ? content
        : [
            { type: "text", text: content },
            ...imageUrls.map((u) => ({
              type: "image_url" as const,
              image_url: { url: u },
            })),
          ];
    pushUserMessage(sessionId, composed, imageUrls.length > 0 ? imageUrls : undefined);
    setText("");
    setAttachments([]);

    // ---------- 接力模式：DeepSeek 策划交接单 → 人工确认 → Kimi 执行 ----------
    if (mode === "relay") {
      const available = REAL_MODELS.filter(
        (m) => (apiKeys[m as keyof typeof apiKeys] ?? "").length > 0
      );
      if (available.length === 0) {
        pushAiMessage(sessionId, {
          role: "ai",
          model: "kimi",
          color: AI_MODELS.kimi.color,
          time: nowHHMM(),
          content:
            "接力模式至少需要一个已配置的 API key（Kimi 或 DeepSeek）。请在「设置」页填入后重试。",
        });
        return;
      }

      // 按实际可用的 key 调整策划/执行，避免选中的模型没配 key 时静默失败
      let planner = available.includes(relayPlanner) ? relayPlanner : available[0];
      let executor = available.includes(relayExecutor) ? relayExecutor : available[0];
      if (planner === executor && available.length > 1) {
        executor = available.find((m) => m !== planner) ?? planner;
      }
      if (planner !== relayPlanner || executor !== relayExecutor) {
        toast(
          `已按可用 key 调整接力：${AI_MODELS[planner].name} 策划 → ${AI_MODELS[executor].name} 执行`,
          "#F5C542"
        );
      } else if (planner === executor) {
        toast(
          "当前只配置了一个 key，将单模型自接力（建议补充 DeepSeek key 以启用双模型协作）",
          "#F5C542"
        );
      }

      abortRef.current = new AbortController();
      setPlanning({ model: planner });
      const started = performance.now();
      const r = await planBrief({
        userText: composed,
        model: planner,
        apiKey: apiKeys[planner as keyof typeof apiKeys] ?? "",
        signal: abortRef.current.signal,
      });
      abortRef.current = null;
      setPlanning(null);

      if (!r.ok || !r.brief) {
        pushAiMessage(sessionId, {
          role: "ai",
          model: planner,
          color: AI_MODELS[planner].color,
          time: nowHHMM(),
          content: `策划失败：${r.error ?? "模型未返回可用的交接单"}`,
        });
        return;
      }

      const planStep = makeStep({
        model: planner,
        stage: "策划",
        content: r.brief.raw,
        input: PLANNER_USER(composed),
        ms: Math.round(performance.now() - started),
      });
      const run: CollabRun = {
        id: `run_${Date.now().toString(36)}`,
        planner,
        executor,
        deepReview,
        phase: "awaiting_confirm",
        sourceText: composed,
        brief: r.brief,
        steps: [planStep],
        createdAt: Date.now(),
      };
      pushAiMessage(sessionId, {
        role: "ai",
        time: nowHHMM(),
        content: "",
        collabRun: run,
      });
      return;
    }

    // ---------- 对比模式：同一句话并发给多个真实模型 ----------
    if (mode === "compare") {
      const models = compareModels.filter(
        (m) => (apiKeys[m as keyof typeof apiKeys] ?? "").length > 0
      );
      if (models.length === 0) {
        pushAiMessage(sessionId, {
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
      abortRef.current = new AbortController();
      setComparing(models.map((m) => ({ model: m, content: "" })));

      await Promise.all(
        models.map(
          (model) =>
            new Promise<void>((resolve) => {
              startedAt[model] = performance.now();
              const msgs = buildHistoryForModel(history, model, systemHint);
              msgs.push({ role: "user", content: withImages(composed) });
              streamChat(
                {
                  provider: model,
                  messages: msgs,
                  apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
                  signal: abortRef.current?.signal,
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
      pushAiMessage(sessionId, {
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
    // 2. 有固定交接单时，后续追问继续由执行模型承接；否则走自动路由
    let model = pinnedBrief ? pinnedBrief.executor : currentModel;
    if (pinnedBrief) {
      if (model !== currentModel) setModel(model);
    } else if (prefs.autoRoute) {
      // 先算关键词规则兜底，再尝试 AI 语义路由（有 key 时，2.5s 超时）
      const keyword = routeFor(composed);
      const ai = await routeWithAI(composed, apiKeys);
      // AI 路由成功则优先采用；失败/超时/无 key 回退关键词规则
      const r = ai ?? keyword;
      if (r.model !== currentModel) {
        setModel(r.model);
        model = r.model;
        toast(
          ai ? `AI 智能路由：${r.reason}` : `已自动切换：${r.reason}`,
          AI_MODELS[r.model].color
        );
      }
    }

    // 3. 检查 key（mock 跳过）；当前模型没 key 但别的模型有时，自动切换而不是死板报错
    let meta = AI_MODELS[model];
    if (!meta.mock && !(apiKeys[model as keyof typeof apiKeys] ?? "")) {
      const alt = REAL_MODELS.find((m) => (apiKeys[m as keyof typeof apiKeys] ?? "").length > 0);
      if (alt) {
        const prevName = meta.name;
        setModel(alt);
        model = alt;
        meta = AI_MODELS[alt];
        toast(`「${prevName}」未配置 key，已自动切换到 ${meta.name}`, meta.color);
      } else {
        pushAiMessage(sessionId, {
          role: "ai",
          model,
          color: meta.color,
          time: nowHHMM(),
          content: `还没有配置任何 API key。请在「设置」页填入 Kimi 或 DeepSeek 的 key 后重试。`,
        });
        return;
      }
    }

    // 4. 流式调用（携带记忆上下文；有固定交接单时一并前置）
    const ac = new AbortController();
    abortRef.current = ac;
    setTyping({ model, color: meta.color, content: "" });
    const sysHint = pinnedBrief
      ? `${hintWithMemory(composed)}\n\n【本会话固定交接单】\n${pinnedBrief.brief.raw}`
      : hintWithMemory(composed);
    const msgs = buildHistoryForModel(history, model, sysHint);
    msgs.push({ role: "user", content: withImages(composed) });

    let acc = "";
    await streamChat(
      {
        provider: model,
        messages: msgs,
        apiKey: apiKeys[model as keyof typeof apiKeys] ?? "",
        signal: ac.signal,
      },
      {
        onToken: (delta) => {
          acc += delta;
          setTyping({ model, color: meta.color, content: acc });
        },
        onDone: (full) => {
          setTyping(null);
          abortRef.current = null;
          const text2 = full || acc;
          pushAiMessage(sessionId, {
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
          abortRef.current = null;
          pushAiMessage(sessionId, {
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
              ["compare", "⚡ 对比"],
              ["relay", "🧭 接力"],
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
        {mode === "relay" && (
          <>
            <span className="text-tag text-text-muted">策划</span>
            {REAL_MODELS.map((m) => {
              const active = relayPlanner === m;
              const c = AI_MODELS[m].color;
              return (
                <button
                  key={`p-${m}`}
                  onClick={() => setRelayPlanner(m)}
                  title={`${AI_MODELS[m].name} 负责把想法整理成交接单`}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-pill text-tag transition"
                  style={{
                    background: active ? `${c}22` : "rgba(255,255,255,0.04)",
                    color: active ? c : "#71717F",
                    border: `1px solid ${active ? `${c}66` : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <span className="rounded-pill" style={{ width: 5, height: 5, background: c }} />
                  {AI_MODELS[m].name}
                </button>
              );
            })}
            <span className="text-tag text-text-disabled">→</span>
            <span className="text-tag text-text-muted">执行</span>
            {REAL_MODELS.map((m) => {
              const active = relayExecutor === m;
              const c = AI_MODELS[m].color;
              return (
                <button
                  key={`e-${m}`}
                  onClick={() => setRelayExecutor(m)}
                  title={`${AI_MODELS[m].name} 只读交接单并产出最终结果`}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded-pill text-tag transition"
                  style={{
                    background: active ? `${c}22` : "rgba(255,255,255,0.04)",
                    color: active ? c : "#71717F",
                    border: `1px solid ${active ? `${c}66` : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <span className="rounded-pill" style={{ width: 5, height: 5, background: c }} />
                  {AI_MODELS[m].name}
                </button>
              );
            })}
            <button
              onClick={() => setDeepReview((v) => !v)}
              className="px-2 h-7 rounded-pill text-tag transition"
              style={{
                background: deepReview ? "rgba(19,221,196,0.12)" : "rgba(255,255,255,0.04)",
                color: deepReview ? "#13DDC4" : "#71717F",
                border: `1px solid ${deepReview ? "rgba(19,221,196,0.4)" : "rgba(255,255,255,0.08)"}`,
              }}
              title="执行后由策划模型对照验收标准质检，必要时让执行模型修订一次"
            >
              深度质检 {deepReview ? "开" : "关"}
            </button>
            {!apiKeys.deepseek && (
              <span className="text-tag" style={{ color: "#F5C542" }}>
                · 未配 DeepSeek，策划将回退 Kimi（更贵）
              </span>
            )}
          </>
        )}
      </div>

      {/* 会话级固定交接单：接力完成后追问仍由执行模型承接 */}
      {pinnedBrief && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-2 text-label flex-wrap"
          style={{
            background: "rgba(46,167,255,0.06)",
            border: "1px solid rgba(46,167,255,0.18)",
          }}
        >
          <span className="font-semibold" style={{ color: "#7CC4FF" }}>
            接力中
          </span>
          <span className="text-text-muted">
            · 执行 {AI_MODELS[pinnedBrief.executor].name}
          </span>
          <details className="min-w-0 max-w-full">
            <summary className="cursor-pointer text-text-muted hover:text-text-primary transition select-none">
              查看交接单
            </summary>
            <pre
              className="mt-1.5 px-2.5 py-2 rounded-lg text-tag leading-[18px] whitespace-pre-wrap overflow-y-auto"
              style={{
                background: "rgba(0,0,0,0.25)",
                color: "rgba(255,255,255,0.6)",
                maxHeight: 220,
              }}
            >
              {pinnedBrief.brief.raw}
            </pre>
          </details>
          <div className="flex-1" />
          <button
            onClick={() => {
              clearSessionBrief(currentSessionId);
              toast("已结束接力，后续按普通会话处理", "#8E8E9C");
            }}
            className="text-text-muted hover:text-text-primary transition"
          >
            结束接力
          </button>
        </div>
      )}

      {routeHint && mode === "single" && !pinnedBrief && (
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

      {/* 接力策划中 */}
      {planning && (
        <div className="mt-3 mb-2 animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="rounded-pill"
              style={{ width: 8, height: 8, background: AI_MODELS[planning.model].color }}
            />
            <span
              className="text-body-sm font-semibold"
              style={{ color: AI_MODELS[planning.model].color }}
            >
              {AI_MODELS[planning.model].name}
            </span>
            <span className="text-label text-text-muted">正在梳理成交接单…</span>
            <button
              onClick={() => abortRef.current?.abort()}
              className="ml-auto text-tag text-text-muted hover:text-text-primary transition"
            >
              取消
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}

      {/* typing 指示气泡（置于输入框上方，保证输入框始终贴底） */}
      {typing && (
        <div className="mt-3 mb-2 animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-pill" style={{ width: 8, height: 8, background: typing.color }} />
            <span className="text-body-sm font-semibold" style={{ color: typing.color }}>
              {AI_MODELS[typing.model].name}
            </span>
            <button
              onClick={() => abortRef.current?.abort()}
              className="ml-auto text-tag text-text-muted hover:text-text-primary transition"
            >
              取消
            </button>
          </div>
          {typing.content ? (
            <div
              className="text-body text-text-tertiary leading-[22px] whitespace-pre-line overflow-y-auto"
              style={{ maxHeight: 220 }}
            >
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

      {/* 多模型对比 · 流式进行中（置于输入框上方，保证输入框始终贴底） */}
      {comparing && (
        <div className="mt-3 mb-2 animate-fade-up">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-body-sm font-semibold text-text-secondary">
              多模型对比
            </span>
            <span className="text-tag text-text-muted">
              {comparing.length} 路同时回答中…
            </span>
            <button
              onClick={() => abortRef.current?.abort()}
              className="ml-auto text-tag text-text-muted hover:text-text-primary transition"
            >
              取消
            </button>
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
                    <div
                      className="text-body-sm text-text-tertiary leading-[21px] whitespace-pre-line overflow-y-auto"
                      style={{ maxHeight: 220 }}
                    >
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
          title="上传附件：PDF / Word(.docx) / Excel(.xlsx)（≤5MB，自动提取文字）、图片（≤8MB，自动压缩）或文本文件（≤200KB），也可直接拖入"
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
        <button
          onClick={captureScreenshot}
          title="截取屏幕 / 窗口 / 标签页发给 AI；也可用 Win+Shift+S 截图后 Ctrl+V 直接粘贴"
          className="text-text-muted hover:text-text-primary transition shrink-0 mb-1.5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth={1.8} />
          </svg>
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // 支持直接 Ctrl+V 粘贴截图（Win+Shift+S 后剪贴板里就是图片）
            const imgs = Array.from(e.clipboardData?.items ?? []).filter((it) =>
              it.type.startsWith("image/")
            );
            if (imgs.length > 0) {
              e.preventDefault();
              const files = imgs
                .map((it) => it.getAsFile())
                .filter((f): f is File => f != null);
              if (files.length > 0) void ingestFiles(files);
            }
          }}
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
          disabled={(!text.trim() && attachments.length === 0) || typing != null || parsing != null || comparing != null || planning != null}
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
        <span>可拖入 PDF / Word / Excel / 图片</span>
        <span>·</span>
        <span>当前模型 {AI_MODELS[currentModel].name}</span>
      </div>
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
