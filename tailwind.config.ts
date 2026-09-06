import type { Config } from "tailwindcss";

// FlowHub Design Tokens — Tailwind 配置
// 配套 src/styles/tokens.css 使用：本 config 暴露颜色 / 字号 / 圆角 / 间距命名
const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: {
          1: "var(--color-surface-1)",
          2: "var(--color-surface-2)",
          3: "var(--color-surface-3)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          muted: "var(--color-text-muted)",
          disabled: "var(--color-text-disabled)",
        },
        aurora: {
          blue: "var(--color-aurora-blue)",
          "blue-soft": "var(--color-aurora-blue-soft)",
          purple: "var(--color-aurora-purple)",
          "purple-soft": "var(--color-aurora-purple-soft)",
          cyan: "var(--color-aurora-cyan)",
          amber: "var(--color-aurora-amber)",
          coral: "var(--color-aurora-coral)",
        },
        status: {
          running: "var(--color-status-running)",
          pending: "var(--color-status-pending)",
          queued: "var(--color-status-queued)",
          error: "var(--color-status-error)",
        },
      },
      backgroundImage: {
        "grad-brand": "var(--grad-brand)",
        "grad-aurora": "var(--grad-aurora)",
        "grad-glow-blue": "var(--grad-glow-blue)",
        "grad-glow-purple": "var(--grad-glow-purple)",
        "grad-glow-cyan": "var(--grad-glow-cyan)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        pill: "var(--radius-pill)",
      },
      spacing: {
        topbar: "var(--topbar-h)",
        sidebar: "var(--sidebar-w)",
        rpanel: "var(--sidebar-r-w)",
        "input-h": "var(--input-h)",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
      fontSize: {
        display: ["40px", { lineHeight: "1.2", fontWeight: "600" }],
        h1: ["28px", { lineHeight: "1.3" }],
        h2: ["20px", { lineHeight: "1.3" }],
        h3: ["16px", { lineHeight: "1.4" }],
        body: ["13px", { lineHeight: "1.5" }],
        "body-lg": ["14px", { lineHeight: "1.5" }],
        "body-sm": ["12px", { lineHeight: "1.5" }],
        label: ["11px", { lineHeight: "1.4" }],
        tag: ["10px", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elev1: "var(--shadow-elev-1)",
        elev2: "var(--shadow-elev-2)",
        "glow-blue": "var(--glow-blue)",
        "glow-purple": "var(--glow-purple)",
        "glow-cyan": "var(--glow-cyan)",
      },
      transitionTimingFunction: { out: "var(--ease-out)" },
      transitionDuration: { fast: "120ms", base: "200ms" },
      animation: {
        "fade-up": "fadeUp 200ms var(--ease-out)",
        "pulse-soft": "pulseSoft 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
