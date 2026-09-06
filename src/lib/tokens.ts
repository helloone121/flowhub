/**
 * Token 估算 · 个人 MVP 粗估：
 * 中文 1 字符 ≈ 1.5 token
 * 英文 1 词 ≈ 1.3 token
 * 空白 / 标点按 1 token 计
 *
 * 不追求精确，只要稳定可比较即可（用于预算条 + 接力检测）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 中文字符范围（含全角标点）
  const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  // 英文词（连续字母数字）
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
  // 其他字符（空白、半角标点等）
  const others = text.length - cjk - words;
  return Math.round(cjk * 1.5 + words * 1.3 + others * 0.5);
}

/** 估算一个会话当前累计 token（消息流累计） */
export function sumSessionTokens(messages: { content: string }[]): number {
  return messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
}

/** 计算上下文使用百分比 */
export function contextUsage(tokens: number, limit = 100_000): number {
  return Math.min(100, Math.round((tokens / limit) * 100));
}

/** 距接力还剩多少 token */
export function tokensToHandoff(tokens: number, threshold = 80_000): number {
  return Math.max(0, threshold - tokens);
}
