import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowHub · AI 调度中枢",
  description: "聚合多 AI 会话的调度中枢：自动摘要接力 + 一键分发调度",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
