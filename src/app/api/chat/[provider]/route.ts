import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  apiKey?: string;
  systemHint?: string;
  model?: string;
}

/**
 * /api/chat/[provider]
 * Route Handler · 个人 MVP 代理
 *
 * Kimi / DeepSeek · OpenAI 兼容 SSE 流式
 * Claude · Mock（按用户偏好中文风格返回模拟文本）
 * Midjourney · Mock（返回占位提示）
 *
 * Key 优先级：env > 请求体 apiKey
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const body = (await req.json()) as ChatBody;

  // ---------- Mock 提供方 ----------
  if (provider === "claude" || provider === "midjourney") {
    return mockStream(provider, body);
  }

  // ---------- 真实 OpenAI 兼容提供方 ----------
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    return new Response("Unknown provider: " + provider, { status: 400 });
  }

  const apiKey = processEnv(config.envKey) || body.apiKey;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: `缺少 ${provider} 的 API key。请在「设置」页填入，或在 Vercel env 中配置 ${config.envKey}。`,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 注入 systemHint（用户偏好 / 调度上下文）
  const messages = body.systemHint
    ? [{ role: "system" as const, content: body.systemHint }, ...body.messages]
    : body.messages;

  const upstream = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model || config.defaultModel,
      messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({
        error: `上游 ${provider} 返回 ${upstream.status}：${txt.slice(0, 200) || upstream.statusText}`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // 透传 SSE 流
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

const PROVIDER_CONFIG: Record<
  string,
  { endpoint: string; envKey: string; defaultModel: string }
> = {
  kimi: {
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    envKey: "MOONSHOT_API_KEY",
    defaultModel: "moonshot-v1-32k",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
};

function processEnv(key: string): string | undefined {
  // next server env
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

// ---------- Mock 实现 ----------
function mockStream(provider: string, body: ChatBody): Response {
  const last = body.messages.filter((m) => m.role === "user").slice(-1)[0];
  const userText = last?.content ?? "";
  const lines = pickMockLines(provider, userText);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        const payload = {
          choices: [{ delta: { content: line }, index: 0, finish_reason: null }],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        await sleep(60 + Math.random() * 80);
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function pickMockLines(provider: string, userText: string): string[] {
  if (provider === "midjourney") {
    return [
      "[Mock · Midjourney]\n",
      "已基于你的输入生成 3 张候选主视觉（科技感极光风 · 135° 渐变）。\n",
      "本次采用记忆库色板：#2EA7FF 蓝 / #9381FF 紫 / #13DDC4 青 / #F5C542 金。\n",
      "MVP 版本未接入真实图像生成，请在 v2 接入 Discord Bot 或第三方代理。",
    ];
  }
  // Claude mock
  const has = (k: string[]) => k.some((x) => userText.includes(x));
  if (has(["白皮书", "方案", "结构"])) {
    return [
      "[Mock · Claude · 中文风格]\n",
      "已根据品牌色板与「数据说话」偏好完成框架：\n\n",
      "一、行业背景：3 组核心数据\n",
      "二、产品定位：调度中枢 · 意图优先\n",
      "三、技术架构：Next.js 14 + Zustand + localStorage\n",
      "四、商业模式：Token 直付 · v0.3 复盘\n\n",
      "（MVP 未接入真实 Claude，请在 v2 填 Anthropic key 启用）",
    ];
  }
  return [
    "[Mock · Claude]\n",
    "已按你的偏好（中文 · 结构化 · 简洁）输出初稿。\n",
    "MVP 版本未接入真实 Claude，请在 v2 在「设置」页填入 Anthropic key 启用。",
  ];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
