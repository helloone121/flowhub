"use client";

import { useState, useRef, useEffect } from "react";
import { useFlowHub } from "@/lib/store";
import { AI_MODELS } from "@/lib/ai-meta";
import type { ModelId } from "@/lib/types";
import { toast } from "@/components/ui";

export function ModelSwitch() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentModel = useFlowHub((s) => s.currentModel);
  const setModel = useFlowHub((s) => s.setModel);
  const apiKeys = useFlowHub((s) => s.apiKeys);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const m = AI_MODELS[currentModel];
  const list = Object.values(AI_MODELS);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-3 rounded-pill text-body-sm text-text-secondary cursor-pointer transition"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span className="rounded-pill" style={{ width: 8, height: 8, background: m.color }} />
        {m.name}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 z-30 w-44 rounded-xl py-1.5"
          style={{
            background: "#0A0A14",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-elev-1)",
          }}
        >
          {list.map((mm) => {
            const hasKey = mm.mock || apiKeys[mm.id];
            return (
              <button
                key={mm.id}
                onClick={() => {
                  if (!hasKey) {
                    toast(`请先在「设置」中连接 ${mm.name}`, "#FF5C5C");
                    setOpen(false);
                    return;
                  }
                  setModel(mm.id as ModelId);
                  setOpen(false);
                  toast(`已切换到 ${mm.name}`, mm.color);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition text-left"
              >
                <span className="rounded-pill" style={{ width: 8, height: 8, background: mm.color }} />
                <span className="text-body-sm flex-1 text-text-secondary">{mm.name}</span>
                {mm.mock && (
                  <span className="text-tag text-text-disabled">Mock</span>
                )}
                {!mm.mock && !hasKey && (
                  <span className="text-tag text-text-disabled">未连接</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
