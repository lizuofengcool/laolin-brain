"use client";

import { useAppStore, type ChatMessage } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Send,
  Plus,
  Trash2,
  User,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader,
  Sparkles,
  X,
  MessageSquare,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function FloatingMessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className={cn("text-xs", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex flex-col gap-1 max-w-[80%]", isUser ? "items-end" : "items-start")}>
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="flex flex-col gap-0.5 w-full">
            {message.toolResults.map((tool, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-muted/50 border">
                <Wrench className="h-2.5 w-2.5" />
                <span>{tool.name}</span>
                {tool.status === "running" && <Loader className="h-2.5 w-2.5 animate-spin text-blue-500" />}
                {tool.status === "success" && <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />}
                {tool.status === "error" && <XCircle className="h-2.5 w-2.5 text-red-500" />}
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm"
          )}
        >
          {message.isStreaming && !message.content ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <div className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms] opacity-60" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms] opacity-60" />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms] opacity-60" />
              </div>
              <span className="opacity-60">思考中</span>
            </div>
          ) : (
            message.content
          )}
          {message.isStreaming && message.content && (
            <span className="inline-block w-0.5 h-3 bg-current animate-pulse ml-0.5 align-middle rounded-full" />
          )}
        </div>
      </div>
    </div>
  );
}

export function FloatingChatBubble() {
  const {
    currentMessages,
    isSending,
    sendMessage,
    createConversation,
    clearCurrentConversation,
    conversations,
    currentConversationId,
    setCurrentConversation,
    deleteConversation,
    floatingChatOpen,
    setFloatingChatOpen,
  } = useAppStore();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [currentMessages, scrollToBottom]);

  useEffect(() => {
    if (floatingChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [floatingChatOpen]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    createConversation();
    inputRef.current?.focus();
  };

  return (
    <>
      {/* 浮动按钮 */}
      <AnimatePresence>
        {!floatingChatOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setFloatingChatOpen(true)}
            className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center"
          >
            <Sparkles className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* 聊天面板 */}
      <AnimatePresence>
        {floatingChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* 头部 */}
            <div className="h-12 flex items-center justify-between px-4 border-b bg-gradient-to-r from-primary/5 to-transparent shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="font-semibold text-sm">AI 助手</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFloatingChatOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* 对话切换条（有多个对话时显示） */}
            {conversations.length > 1 && (
              <div className="flex gap-1 px-3 py-2 border-b bg-muted/20 overflow-x-auto shrink-0">
                {conversations.slice(0, 5).map((conv) => (
                  <button
                    key={conv.id}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] whitespace-nowrap transition-colors shrink-0",
                      conv.id === currentConversationId
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}
                    onClick={() => setCurrentConversation(conv.id)}
                  >
                    <MessageSquare className="h-2.5 w-2.5" />
                    {conv.title}
                  </button>
                ))}
              </div>
            )}

            {/* 消息区域 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {currentMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <Sparkles className="h-8 w-8 opacity-20" />
                  <p className="text-xs text-center">输入消息开始对话<br />AI 帮你管理文件</p>
                </div>
              ) : (
                currentMessages.map((msg) => <FloatingMessageItem key={msg.id} message={msg} />)
              )}
            </div>

            {/* 输入区域 */}
            <div className="p-3 border-t shrink-0">
              <div className="flex items-end gap-2 bg-muted/30 rounded-xl border p-1.5">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  disabled={isSending}
                  className="flex-1 min-h-[32px] max-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs placeholder:text-muted-foreground/50"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  disabled={isSending || !input.trim()}
                  size="icon"
                  className="h-7 w-7 rounded-lg shrink-0"
                >
                  {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
