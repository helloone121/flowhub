"use client";

import { useFlowHub } from "@/lib/store";
import type { PageId } from "@/lib/types";

const NAV: { id: PageId; label: string }[] = [
  { id: "workspace", label: "工作台" },
  { id: "settings", label: "设置" },
];

export function TopBar() {
  const currentPage = useFlowHub((s) => s.currentPage);
  const setPage = useFlowHub((s) => s.setPage);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur"
      style={{
        background: "rgba(3,0,20,0.6)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-7 h-topbar flex items-center justify-between">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-[26px] h-[26px] rounded-md flex items-center justify-center"
              style={{ background: "var(--grad-brand)" }}
            >
              <span className="text-white text-[12px] font-bold">F</span>
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-bold text-text-primary">FlowHub</div>
              <div className="text-tag text-text-muted mt-0.5">AI 调度中枢</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = currentPage === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className="px-3.5 py-1.5 rounded-pill text-body transition"
                  style={{
                    background: active ? "rgba(46,167,255,0.14)" : "transparent",
                    color: active ? "#7CC4FF" : "#A9A9B7",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="px-3 py-1.5 rounded-pill flex items-center gap-2 text-body-sm text-text-muted"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <span
              className="rounded-pill"
              style={{ width: 6, height: 6, background: "#13DDC4" }}
            />
            单机模式 · 数据存 localStorage
          </div>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const currentPage = useFlowHub((s) => s.currentPage);
  const setPage = useFlowHub((s) => s.setPage);
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-around"
      style={{
        background: "rgba(3,0,20,0.92)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {NAV.map((n) => {
        const active = currentPage === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className="flex-1 py-3 flex flex-col items-center gap-1 text-tag"
            style={{ color: active ? "#7CC4FF" : "#71717F" }}
          >
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
