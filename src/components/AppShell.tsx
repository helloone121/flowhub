"use client";

import { useEffect, useState } from "react";
import { useFlowHub } from "@/lib/store";
import { TopBar, MobileNav } from "./TopBar";
import { AuroraBackdrop, ToastHost } from "./ui";
import { ModalProvider, NewTaskModal, MemoryDetailModal } from "./modals";
import { Workspace } from "./pages/Workspace";
import { Dispatch } from "./pages/Dispatch";
import { MemoryLibrary } from "./pages/MemoryLibrary";
import { Settings } from "./pages/Settings";

export function AppShell() {
  const currentPage = useFlowHub((s) => s.currentPage);
  // Zustand persist 在 SSR 首屏数据为空，需等 hydration 完成后再渲染
  // 在 AppShell 顶层守一次，避免每个页面切回时都闪「加载中」
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-body-sm text-text-muted">FlowHub 加载中…</div>
      </div>
    );
  }

  return (
    <ModalProvider>
      <AuroraBackdrop />
      <TopBar />
      <main className="max-w-[1440px] mx-auto">
        {currentPage === "workspace" && <Workspace />}
        {currentPage === "dispatch" && <Dispatch />}
        {currentPage === "memory" && <MemoryLibrary />}
        {currentPage === "settings" && <Settings />}
      </main>
      <MobileNav />
      <NewTaskModal />
      <MemoryDetailModal />
      <ToastHost />
    </ModalProvider>
  );
}
