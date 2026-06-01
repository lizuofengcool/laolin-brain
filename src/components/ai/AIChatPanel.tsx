"use client";

import { useState, useRef, useEffect } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Sparkles, Send, X, FileText, Image as ImageIcon, Cloud, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AIChatPanel({ open, onOpenChange }: AIChatPanelProps) {
  const { aiChatFile, storageMode } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && aiChatFile) {
      setLoading(false);
      // Add welcome message
      const isImage = aiChatFile.fileType === "image";
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: isImage
            ? `你好！我是 AI 助手。我正在查看图片"${aiChatFile.fileName}"，你可以问我关于这张图片的任何问题。`
            : `你好！我是 AI 助手。我正在查看文档"${aiChatFile.fileName}"${aiChatFile.textContent ? "，已提取文本内容。" : "。"}\n\n你可以问我关于这个文档的任何问题，例如：\n- 文档的主要内容是什么？\n- 帮我总结一下要点\n- 有哪些关键信息？`,
          timestamp: new Date(),
        },
      ]);
    } else {
      setMessages([]);
      setInput("");
    }
  }, [open, aiChatFile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading || !aiChatFile) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let answer = "";

      const token = useAppStore.getState().token;
      const aiHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) aiHeaders["Authorization"] = `Bearer ${token}`;

      if (aiChatFile.fileType === "image") {
        // For images, try to get the base64 from thumbnail URL or fetch file
        let imageBase64 = "";

        if (aiChatFile.thumbnailUrl && !aiChatFile.thumbnailUrl.startsWith("/api")) {
          // Convert blob URL to base64
          try {
            const response = await fetch(aiChatFile.thumbnailUrl);
            const blob = await response.blob();
            imageBase64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(",")[1] || "");
              };
              reader.readAsDataURL(blob);
            });
          } catch {
            // If thumbnail conversion fails
          }
        }

        if (!imageBase64) {
          answer = "无法获取图片数据，请确保图片已正确上传。";
        } else {
          const res = await fetch("/api/ai/ask", {
            method: "POST",
            headers: aiHeaders,
            signal: controller.signal,
            body: JSON.stringify({
              type: "image",
              content: imageBase64,
              question: userMessage.content,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            answer = data.answer;
          } else {
            answer = "AI 服务暂时不可用，请稍后再试。";
          }
        }
      } else {
        // For documents, use textContent
        const content = aiChatFile.textContent || "";
        if (!content) {
          answer = "此文档暂无文本内容，无法进行 AI 解读。";
        } else {
          const res = await fetch("/api/ai/ask", {
            method: "POST",
            headers: aiHeaders,
            signal: controller.signal,
            body: JSON.stringify({
              type: "document",
              content,
              question: userMessage.content,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            answer = data.answer;
          } else {
            answer = "AI 服务暂时不可用，请稍后再试。";
          }
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // Ignore aborted requests silently
      if (controller.signal.aborted) return;
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: "请求失败，请重试。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Local mode fallback UI
  const handleSwitchToCloud = () => {
    useAppStore.getState().setStorageMode('cloud');
    onOpenChange(false);
  };

  if (storageMode === 'local') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-4 pb-2 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 解读
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">当前为本地模式，AI功能需要云端支持</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              AI 解读功能依赖服务器端 API 调用，请切换到云端模式后使用。
            </p>
            <div className="bg-muted/50 rounded-lg p-4 max-w-sm mb-6 text-left">
              <p className="text-sm font-medium mb-2">切换后可使用：</p>
              <ul className="space-y-1.5">
                {['AI 摘要', '智能问答', 'OCR 识别'].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <Button onClick={handleSwitchToCloud}>
              <Cloud className="h-4 w-4 mr-2" />
              切换到云端模式
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!aiChatFile) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 解读
          </SheetTitle>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {aiChatFile.fileType === "image" ? (
              <ImageIcon className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span className="truncate">{aiChatFile.fileName}</span>
          </div>
        </SheetHeader>

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI 正在思考...
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 border-t shrink-0">
          <div className="flex items-center gap-2">
            <Input
              placeholder="输入你的问题..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              disabled={loading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            提示：你可以问关于文件内容的任何问题
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
