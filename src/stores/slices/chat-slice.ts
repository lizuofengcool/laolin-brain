/**
 * 对话状态管理 Slice
 * 支持对话历史持久化到数据库
 */

import type { StoreSet, StoreGet } from "./types";
import type { AiProviderType } from "@/lib/ai/providers/base";

// ── Chat Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** 工具调用结果（仅 assistant 消息） */
  toolResults?: {
    name: string;
    status: "running" | "success" | "error";
    result?: unknown;
  }[];
  /** 是否正在生成 */
  isStreaming?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  provider: AiProviderType;
  /** 是否已持久化到数据库 */
  persisted?: boolean;
}

export interface ChatSlice {
  // 对话列表
  conversations: ChatConversation[];
  currentConversationId: string | null;

  // 当前对话消息
  currentMessages: ChatMessage[];

  // 发送状态
  isSending: boolean;

  // AI 模型选择
  chatProvider: AiProviderType;
  setChatProvider: (provider: AiProviderType) => void;

  // 浮动聊天气泡
  floatingChatOpen: boolean;
  setFloatingChatOpen: (open: boolean) => void;

  // 操作
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setCurrentConversation: (id: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  clearCurrentConversation: () => void;
  loadConversations: () => Promise<void>;
  loadConversationMessages: (id: string) => Promise<void>;
}

let messageCounter = 0;
function genId() {
  return `msg_${Date.now()}_${++messageCounter}`;
}

/** 保存对话消息到数据库 */
async function persistMessages(convId: string, messages: ChatMessage[], title?: string, token?: string) {
  if (!token) return;
  try {
    await fetch(`/api/chat/conversations/${convId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolResults: m.toolResults,
          isStreaming: false,
        })),
        title,
      }),
    });
  } catch (err) {
    console.error("Failed to persist messages:", err);
  }
}

export function createChatSlice(set: StoreSet, get: StoreGet): ChatSlice {
  return {
    conversations: [],
    currentConversationId: null,
    currentMessages: [],
    isSending: false,
    chatProvider: "zhipu",
    floatingChatOpen: false,

    setChatProvider: (provider) => {
      set({ chatProvider: provider });
    },

    setFloatingChatOpen: (open) => {
      set({ floatingChatOpen: open });
    },

    loadConversations: async () => {
      const token = get().token;
      if (!token) return;
      try {
        const res = await fetch("/api/chat/conversations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const conversations: ChatConversation[] = data.conversations.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          title: c.title as string,
          messages: [],
          createdAt: new Date(c.createdAt as string).getTime(),
          updatedAt: new Date(c.updatedAt as string).getTime(),
          provider: (c.provider as AiProviderType) || "zhipu",
          persisted: true,
        }));
        set({ conversations });
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    },

    loadConversationMessages: async (id) => {
      const token = get().token;
      if (!token) return;
      try {
        const res = await fetch(`/api/chat/conversations/${id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const messages: ChatMessage[] = data.messages;
        set({
          currentConversationId: id,
          currentMessages: messages,
        });
        // 更新本地对话列表中的消息
        const conversations = get().conversations.map((c: ChatConversation) =>
          c.id === id ? { ...c, messages, persisted: true } : c,
        );
        set({ conversations });
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    },

    createConversation: () => {
      const id = genId();
      const conv: ChatConversation = {
        id,
        title: "新对话",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider: get().chatProvider,
      };
      set({
        conversations: [conv, ...get().conversations],
        currentConversationId: id,
        currentMessages: [],
      });

      // 持久化到数据库
      const token = get().token;
      if (token) {
        fetch("/api/chat/conversations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: "新对话", provider: get().chatProvider }),
        })
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.conversation) {
              // 更新本地ID为数据库ID
              const conversations = get().conversations.map((c: ChatConversation) =>
                c.id === id
                  ? { ...c, id: data.conversation.id, persisted: true }
                  : c,
              );
              const currentId = get().currentConversationId === id
                ? data.conversation.id
                : get().currentConversationId;
              set({ conversations, currentConversationId: currentId });
            }
          })
          .catch(() => {});
      }

      return id;
    },

    deleteConversation: (id) => {
      const state = get();
      const filtered = state.conversations.filter((c: ChatConversation) => c.id !== id);
      set({
        conversations: filtered,
        currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
        currentMessages: state.currentConversationId === id ? [] : state.currentMessages,
      });

      // 从数据库删除
      const token = get().token;
      if (token) {
        fetch(`/api/chat/conversations?id=${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    },

    setCurrentConversation: async (id) => {
      const state = get();
      if (!id) {
        set({ currentConversationId: null, currentMessages: [] });
        return;
      }
      const conv = state.conversations.find((c: ChatConversation) => c.id === id);
      if (conv) {
        set({
          currentConversationId: id,
          currentMessages: conv.messages,
        });
        // 如果消息未加载，从数据库加载
        if (conv.messages.length === 0 && conv.persisted) {
          await get().loadConversationMessages(id);
        }
      }
    },

    sendMessage: async (content) => {
      const state = get();
      if (state.isSending) return;

      // 确保有当前对话
      let convId = state.currentConversationId;
      if (!convId) {
        convId = get().createConversation();
      }

      // 添加用户消息
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      // 添加空的助手消息（流式填充）
      const assistantMsg: ChatMessage = {
        id: genId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };

      const newMessages = [...state.currentMessages, userMsg, assistantMsg];
      set({
        currentMessages: newMessages,
        isSending: true,
      });

      // 更新对话标题（用第一条用户消息）
      const newTitle = state.currentMessages.length === 0 ? content.slice(0, 30) : undefined;
      const conversations = get().conversations.map((c: ChatConversation) => {
        if (c.id === convId) {
          return {
            ...c,
            ...(newTitle ? { title: newTitle } : {}),
            messages: newMessages,
            updatedAt: Date.now(),
          };
        }
        return c;
      });
      set({ conversations });

      try {
        // 构建发送给API的消息列表（不含空的assistant消息）
        const apiMessages = newMessages
          .filter((m: ChatMessage) => !(m.role === "assistant" && m.isStreaming))
          .map((m: ChatMessage) => ({
            role: m.role,
            content: m.content,
          }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
          },
          body: JSON.stringify({
            messages: apiMessages,
            provider: state.chatProvider,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "请求失败" }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // 处理流式响应
        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        const toolResults: ChatMessage["toolResults"] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));

              if (data.type === "content") {
                fullContent += data.content;
                const updatedMessages = get().currentMessages.map((m: ChatMessage) =>
                  m.id === assistantMsg.id ? { ...m, content: fullContent } : m,
                );
                set({ currentMessages: updatedMessages });
              } else if (data.type === "tool_start") {
                toolResults?.push({ name: data.name, status: "running" });
                const updatedMessages = get().currentMessages.map((m: ChatMessage) =>
                  m.id === assistantMsg.id ? { ...m, toolResults: [...(toolResults || [])] } : m,
                );
                set({ currentMessages: updatedMessages });
              } else if (data.type === "tool_result") {
                const idx = toolResults?.findIndex((t) => t.name === data.name) ?? -1;
                if (idx >= 0 && toolResults) {
                  toolResults[idx] = {
                    name: data.name,
                    status: data.result.success ? "success" : "error",
                    result: data.result,
                  };
                }
                const updatedMessages = get().currentMessages.map((m: ChatMessage) =>
                  m.id === assistantMsg.id ? { ...m, toolResults: [...(toolResults || [])] } : m,
                );
                set({ currentMessages: updatedMessages });
              } else if (data.type === "error") {
                fullContent += `\n\n❌ ${data.error}`;
                const updatedMessages = get().currentMessages.map((m: ChatMessage) =>
                  m.id === assistantMsg.id ? { ...m, content: fullContent } : m,
                );
                set({ currentMessages: updatedMessages });
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // 标记流式完成
        const finalMessages = get().currentMessages.map((m: ChatMessage) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, content: fullContent || "（无回复）", toolResults }
            : m,
        );
        set({ currentMessages: finalMessages });

        // 更新对话中的消息
        const finalConversations = get().conversations.map((c: ChatConversation) => {
          if (c.id === convId) {
            return { ...c, messages: finalMessages, updatedAt: Date.now() };
          }
          return c;
        });
        set({ conversations: finalConversations });

        // 持久化到数据库
        persistMessages(convId, finalMessages, newTitle, get().token);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "发送失败";
        const errorMessages = get().currentMessages.map((m: ChatMessage) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, content: `❌ ${errorMsg}` }
            : m,
        );
        set({ currentMessages: errorMessages });
      } finally {
        set({ isSending: false });
      }
    },

    clearCurrentConversation: () => {
      const convId = get().currentConversationId;
      if (!convId) return;

      set({ currentMessages: [] });

      const conversations = get().conversations.map((c: ChatConversation) => {
        if (c.id === convId) {
          return { ...c, messages: [], updatedAt: Date.now() };
        }
        return c;
      });
      set({ conversations });

      // 持久化清空
      persistMessages(convId, [], undefined, get().token);
    },
  };
}
