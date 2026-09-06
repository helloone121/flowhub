"use client";

import React from "react";
import type { ModelId } from "@/lib/types";
import { AI_MODELS } from "@/lib/ai-meta";

// ---------- AI 圆点（缩写 + 唯一色） ----------
export function AIDot({
  model,
  size = 8,
  withAbbr = false,
}: {
  model: ModelId;
  size?: number;
  withAbbr?: boolean;
}) {
  const m = AI_MODELS[model];
  if (withAbbr) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-pill text-white font-semibold shrink-0"
        style={{
          width: size,
          height: size,
          background: m.color,
          fontSize: Math.max(9, Math.floor(size * 0.45)),
        }}
      >
        {m.short}
      </span>
    );
  }
  return (
    <span
      className="rounded-pill shrink-0"
      style={{ width: size, height: size, background: m.color }}
    />
  );
}

// ---------- 状态徽章 ----------
type BadgeStatus = "done" | "running" | "queued" | "error" | "neutral";

const BADGE_STYLE: Record<BadgeStatus, { bg: string; color: string; label: string }> = {
  done: { bg: "rgba(19,221,196,0.14)", color: "#13DDC4", label: "已完成" },
  running: { bg: "rgba(245,197,66,0.14)", color: "#F5C542", label: "生成中" },
  queued: { bg: "rgba(255,255,255,0.06)", color: "#71717F", label: "排队中" },
  error: { bg: "rgba(255,92,92,0.14)", color: "#FF5C5C", label: "错误" },
  neutral: { bg: "rgba(255,255,255,0.06)", color: "#A9A9B7", label: "" },
};

export function StatusBadge({
  status,
  label,
  progress,
}: {
  status: BadgeStatus;
  label?: string;
  progress?: number;
}) {
  const s = BADGE_STYLE[status];
  const text =
    label ??
    (status === "running" && progress != null ? `生成中 ${progress}%` : s.label);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-label font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      <span
        className="rounded-pill"
        style={{
          width: 6,
          height: 6,
          background: s.color,
        }}
      />
      {text}
    </span>
  );
}

// ---------- 主按钮（渐变） ----------
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 h-9 rounded-xl text-body font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ background: "var(--grad-brand)" }}
    >
      {children}
    </button>
  );
}

// ---------- 次按钮 ----------
export function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-9 rounded-pill text-body-sm text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition ${className}`}
    >
      {children}
    </button>
  );
}

// ---------- 进度条 ----------
export function ProgressBar({
  value,
  variant = "aurora",
  height = 5,
}: {
  value: number; // 0-100
  variant?: "aurora" | "brand";
  height?: number;
}) {
  return (
    <div
      className="rounded-pill overflow-hidden w-full"
      style={{ background: "var(--color-surface-3)", height }}
    >
      <div
        className="h-full rounded-pill"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: variant === "aurora" ? "var(--grad-aurora)" : "var(--grad-brand)",
          transition: "width var(--duration-base) var(--ease-out)",
        }}
      />
    </div>
  );
}

// ---------- 输入框 ----------
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 rounded-md text-body text-text-primary placeholder:text-text-disabled outline-none focus:border-aurora-blue transition bg-surface-2 border border-border ${props.className ?? ""}`}
    />
  );
}

// ---------- Modal 容器 ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full"
        style={{
          maxWidth: width,
          background: "#0F0F22",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-body-lg font-semibold text-text-primary">{title}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6l-12 12"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- 全局极光背景层 ----------
export function AuroraBackdrop() {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
      <div
        className="absolute"
        style={{
          width: 980,
          height: 760,
          left: "30%",
          top: "-15%",
          background: "var(--grad-glow-blue)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: 820,
          height: 680,
          left: "-10%",
          top: "55%",
          background: "var(--grad-glow-purple)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: 760,
          height: 620,
          left: "60%",
          top: "70%",
          background: "var(--grad-glow-cyan)",
        }}
      />
    </div>
  );
}

// ---------- Toast ----------
let toastSetter: ((msg: string, color?: string) => void) | null = null;
export function setToastSetter(fn: (msg: string, color?: string) => void) {
  toastSetter = fn;
}
export function toast(msg: string, color?: string) {
  toastSetter?.(msg, color);
}

export function ToastHost() {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [color, setColor] = React.useState<string>("#13DDC4");
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    setToastSetter((m: string, c?: string) => {
      setMsg(m);
      if (c) setColor(c);
      if (t) clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2400);
    });
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl text-body-sm font-medium animate-fade-up"
      style={{
        background:
          color === "#13DDC4"
            ? "rgba(19,221,196,0.18)"
            : "rgba(46,167,255,0.18)",
        color,
        backdropFilter: "blur(8px)",
        border:
          color === "#13DDC4"
            ? "1px solid rgba(19,221,196,0.3)"
            : "1px solid rgba(46,167,255,0.3)",
      }}
    >
      ✓ {msg}
    </div>
  );
}
