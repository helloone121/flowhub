"use client";

import { useFlowHub } from "@/lib/store";
import { SessionList } from "@/components/workspace/SessionList";
import { MessageList } from "@/components/workspace/MessageList";
import { MemoryPanel } from "@/components/workspace/MemoryPanel";
import { ChatInput } from "@/components/workspace/ChatInput";
import { WorkspaceTabs } from "@/components/workspace/WorkspaceTabs";
import { Dispatch } from "./Dispatch";
import { MemoryLibrary } from "./MemoryLibrary";

export function Workspace() {
  const view = useFlowHub((s) => s.workspaceView);

  return (
    <div className="flex h-[calc(100vh-60px)]">
      <SessionList />
      <section className="flex-1 flex flex-col min-w-0">
        {/* 移动端：侧栏隐藏，视图切换放在主区顶部 */}
        <div
          className="md:hidden flex items-center px-4 pt-3 pb-1 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <WorkspaceTabs />
        </div>

        {view === "chat" && (
          <>
            <MessageList />
            <ChatInput />
          </>
        )}

        {view === "task" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Dispatch />
          </div>
        )}

        {view === "memory" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MemoryLibrary />
          </div>
        )}
      </section>

      {view === "chat" && <MemoryPanel />}
    </div>
  );
}
