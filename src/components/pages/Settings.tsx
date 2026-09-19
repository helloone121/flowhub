"use client";

import { useState } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS, AI_LIST } from "@/lib/ai-meta";
import { toast } from "@/components/ui";
import type { DispatchPrefs, ModelId } from "@/lib/types";

const PREFS: { key: keyof DispatchPrefs; title: string; desc: string }[] = [
  {
    key: "autoHandoff",
    title: "上下文接近上限时自动接力",
    desc: "压缩前文摘要，无缝迁移至新会话",
  },
  {
    key: "autoRoute",
    title: "自动按能力路由分发",
    desc: "调度大脑自动选择最合适的 AI 处理任务",
  },
  {
    key: "autoMemory",
    title: "自动沉淀记忆",
    desc: "从任务结果中提取关键信息存入记忆库",
  },
  {
    key: "priceAlert",
    title: "价格提醒",
    desc: "每次任务成本超过 ¥1 时提示",
  },
];

export function Settings() {
  const apiKeys = useFlowHub((s) => s.apiKeys);
  const setApiKey = useFlowHub((s) => s.setApiKey);
  const prefs = useFlowHub((s) => s.prefs);
  const updatePref = useFlowHub((s) => s.updatePref);
  const exportAll = useFlowHub((s) => s.exportAll);
  const showKeyMap = useFlowHub((s) => s.showKeyMap);
  const toggleKeyVisible = useFlowHub((s) => s.toggleKeyVisible);
  const [testing, setTesting] = useState<ModelId | null>(null);

  async function testConnection(m: ModelId) {
    setTesting(m);
    const meta = AI_MODELS[m];
    if (meta.mock) {
      setTimeout(() => {
        setTesting(null);
        toast(`${meta.name} 是 Mock，跳过测试`, "#F5C542");
      }, 400);
      return;
    }
    try {
      const res = await fetch(`/api/chat/${m}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "ping" }],
          apiKey: apiKeys[m as keyof typeof apiKeys] ?? "",
          model: meta.model,
        }),
      });
      if (res.ok) {
        toast(`${meta.name} 连接成功`, meta.color);
      } else {
        const txt = await res.text().catch(() => "");
        toast(`${meta.name} 连接失败：${txt.slice(0, 80)}`, "#FF5C5C");
      }
    } catch (e) {
      toast(`${meta.name} 连接异常：${e instanceof Error ? e.message : String(e)}`, "#FF5C5C");
    }
    setTesting(null);
  }

  return (
    <div className="max-w-[1024px] mx-auto px-7 pt-6 pb-12">
      <h1 className="text-h1 font-semibold text-text-primary mb-1.5">设置</h1>
      <p className="text-body-sm text-text-muted mb-4">
        连接 AI 账号 · 调整调度偏好 · 管理数据
      </p>

      {!apiKeys.deepseek && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-label leading-[18px]"
          style={{
            background: "rgba(46,167,255,0.08)",
            border: "1px solid rgba(46,167,255,0.25)",
            color: "#7CC4FF",
          }}
        >
          {apiKeys.kimi
            ? "建议配置 DeepSeek API key：记忆抽取、任务拆解、全案汇总等辅助调用会优先走 DeepSeek，成本约为 Kimi 的 1/6；未配置时这些调用回退 Kimi。"
            : "尚未配置任何真实 API key。多模型对比、记忆自动沉淀、任务调度执行都依赖 Kimi 或 DeepSeek 的 key，填入后即可启用全部真实功能。"}
        </div>
      )}

      {/* AI 模型连接 */}
      <div className="mb-7">
        <div className="text-label tracking-[1.5px] font-medium text-text-muted mb-3">
          AI 模型连接
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AI_LIST.map((m) => {
            const key = apiKeys[m.id as keyof typeof apiKeys] ?? "";
            const connected = m.mock || key.length > 0;
            const showKey = showKeyMap[m.id] ?? false;
            return (
              <div
                key={m.id}
                className="rounded-xl px-4 py-3.5 flex flex-col gap-3"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-pill shrink-0"
                    style={{ width: 12, height: 12, background: m.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-body font-semibold text-text-primary">
                      {m.name}
                      {m.mock && (
                        <span className="ml-2 text-tag text-aurora-amber">Mock</span>
                      )}
                    </div>
                    <div className="text-label text-text-muted">
                      {m.capability} · {m.model || "未配置"}
                    </div>
                  </div>
                  {connected && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-tag font-medium"
                      style={{
                        background: m.mock
                          ? "rgba(245,197,66,0.14)"
                          : "rgba(19,221,196,0.14)",
                        color: m.mock ? "#F5C542" : "#13DDC4",
                      }}
                    >
                      <span
                        className="rounded-pill"
                        style={{
                          width: 4,
                          height: 4,
                          background: m.mock ? "#F5C542" : "#13DDC4",
                        }}
                      />
                      {m.mock ? "Mock" : "已配置"}
                    </span>
                  )}
                </div>

                {!m.mock && (
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type={showKey ? "text" : "password"}
                        value={key}
                        onChange={(e) => setApiKey(m.id, e.target.value)}
                        placeholder={`填入 ${m.name} API key`}
                        className="flex-1 h-9 px-3 rounded-md text-body-sm font-mono text-text-secondary bg-surface-2 border border-border outline-none focus:border-aurora-blue transition placeholder:text-text-disabled"
                      />
                      <button
                        onClick={() => toggleKeyVisible(m.id)}
                        className="px-2 h-9 rounded-md text-label text-text-muted hover:text-text-primary transition"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                      >
                        {showKey ? "隐藏" : "显示"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-tag text-text-disabled">
                        密钥仅存本机 localStorage · 不上传 Vercel
                      </span>
                      <button
                        onClick={() => testConnection(m.id)}
                        disabled={testing === m.id}
                        className="text-label text-aurora-blue hover:text-aurora-blue-soft transition disabled:opacity-50"
                      >
                        {testing === m.id ? "测试中…" : "连接测试"}
                      </button>
                    </div>
                  </div>
                )}
                {m.mock && (
                  <div className="text-tag text-text-disabled leading-[16px]">
                    MVP 版本未接真实 {m.name}，输出为模拟内容。v2 在这里填 key 即可启用。
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 调度偏好 */}
      <div className="mb-7">
        <div className="text-label tracking-[1.5px] font-medium text-text-muted mb-3">
          调度偏好
        </div>
        <div
          className="rounded-xl px-5 divide-y divide-white/5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {PREFS.map((p) => {
            const on = prefs[p.key];
            return (
              <div
                key={p.key}
                className="py-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-body font-medium text-text-primary mb-0.5">
                    {p.title}
                  </div>
                  <div className="text-label text-text-muted">{p.desc}</div>
                </div>
                <Toggle
                  on={on}
                  onChange={(v) => {
                    updatePref(p.key, v);
                    toast(`${p.title}：${v ? "开" : "关"}`, v ? "#13DDC4" : "#71717F");
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 数据管理 */}
      <div>
        <div className="text-label tracking-[1.5px] font-medium text-text-muted mb-3">
          数据
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => {
              const json = exportAll();
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flowhub-export-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast("已导出全部数据", "#13DDC4");
            }}
            className="px-4 py-4 rounded-xl text-left transition hover:bg-surface-2"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="text-body font-medium text-text-primary mb-1">
              导出全部数据
            </div>
            <div className="text-label text-text-muted">
              JSON 格式，包含会话、记忆、设置
            </div>
          </button>
          <button
            onClick={() => {
              if (confirm("确定清空所有记忆？此操作不可恢复")) {
                localStorage.removeItem("flowhub-store");
                location.reload();
              }
            }}
            className="px-4 py-4 rounded-xl text-left transition hover:bg-surface-2"
            style={{
              background: "rgba(255,92,92,0.04)",
              border: "1px solid rgba(255,92,92,0.12)",
            }}
          >
            <div className="text-body font-medium mb-1" style={{ color: "#FF5C5C" }}>
              清空所有数据
            </div>
            <div className="text-label text-text-muted">
              会话、记忆、设置将永久删除
            </div>
          </button>
          <button
            onClick={() => toast("MVP 版本暂未接入使用统计", "#F5C542")}
            className="px-4 py-4 rounded-xl text-left transition hover:bg-surface-2"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="text-body font-medium text-text-primary mb-1">
              查看使用统计
            </div>
            <div className="text-label text-text-muted">
              本月 Token、成本、节省时间
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-block w-11 h-6 cursor-pointer">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className="absolute inset-0 rounded-pill transition"
        style={{ background: on ? "#2EA7FF" : "rgba(255,255,255,0.12)" }}
      />
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-pill bg-white transition peer-checked:translate-x-5"
      />
    </label>
  );
}
