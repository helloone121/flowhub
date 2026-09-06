"use client";

import { SessionList } from "@/components/workspace/SessionList";
import { MessageList } from "@/components/workspace/MessageList";
import { MemoryPanel } from "@/components/workspace/MemoryPanel";
import { ChatInput } from "@/components/workspace/ChatInput";

export function Workspace() {
  // Hydration 由 AppShell 顶层统一处理，这里直接渲染
  return (
    <div className="flex h-[calc(100vh-60px)]">
      <SessionList />
      <section className="flex-1 flex flex-col min-w-0">
        <MessageList />
        <ChatInput />
      </section>
      <MemoryPanel />
    </div>
  );
}
