"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Save, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";

/**
 * 语音笔记组件
 * 使用 Web Speech API (SpeechRecognition) 实现语音转文字
 * 支持实时识别、多语言、结果编辑、保存为文件
 */

// 扩展 Window 类型
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export function VoiceNote() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const { user, storageMode } = useAppStore();

  // 检测浏览器支持
  useEffect(() => {
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setIsSupported(supported);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setInterimText("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        toast({
          title: "语音识别错误",
          description: `错误: ${event.error}`,
          variant: "destructive",
        });
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimText("");
  }, []);

  const saveAsNote = useCallback(async () => {
    if (!transcript.trim() || !user) return;

    setIsSaving(true);
    try {
      // 创建 Markdown 格式的笔记文件
      const now = new Date();
      const dateStr = now.toLocaleString("zh-CN");
      const fileName = `语音笔记_${now.toISOString().slice(0, 10)}_${now.getHours()}-${String(now.getMinutes()).padStart(2, "0")}.md`;
      const content = `# 语音笔记\n\n> 创建时间: ${dateStr}\n\n${transcript}`;

      // 创建 Blob 并上传
      const blob = new Blob([content], { type: "text/markdown" });
      const file = new File([blob], fileName, { type: "text/markdown" });

      if (storageMode === "cloud") {
        const token = useAppStore.getState().token;
        const formData = new FormData();
        formData.append("file", file);
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/files", {
          method: "POST",
          headers,
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          useAppStore.getState().addFile({
            id: data.id,
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            filePath: data.filePath,
            textContent: data.textContent,
            storageMode: "cloud",
            tags: ["语音笔记"],
            isFavorite: false,
            createdAt: new Date(),
          });
        }
      } else {
        const { getStorageAdapter, resetAdapter } = await import("@/lib/storage/factory");
        resetAdapter();
        const adapter = getStorageAdapter("local");
        const result = await adapter.uploadFile(file, user.id);

        useAppStore.getState().addFile({
          id: result.id,
          fileName: result.fileName,
          fileType: "markdown",
          fileSize: result.fileSize,
          textContent: transcript,
          storageMode: "local",
          tags: ["语音笔记"],
          isFavorite: false,
          createdAt: new Date() as Date,
        });
      }

      toast({
        title: "笔记已保存",
        description: `语音笔记「${fileName}」已保存`,
      });

      setTranscript("");
      useAppStore.getState().refreshFiles();
    } catch (err) {
      console.error("Save voice note failed:", err);
      toast({
        title: "保存失败",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [transcript, user, storageMode]);

  if (!isSupported) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mic className="h-4 w-4" />
            语音笔记
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            您的浏览器不支持语音识别功能。请使用 Chrome 或 Edge 浏览器。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Mic className="h-4 w-4" />
          语音笔记
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 控制按钮 */}
        <div className="flex items-center gap-2">
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={isRecording ? stopRecording : startRecording}
            className="gap-2"
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4" />
                停止录音
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                开始录音
              </>
            )}
          </Button>

          {transcript && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={saveAsNote}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存为笔记
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearTranscript}
                className="gap-2 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* 录音状态指示 */}
        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            录音中...
          </div>
        )}

        {/* 识别结果 */}
        {isRecording ? (
          <div className="min-h-[100px] rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {transcript || interimText ? (
              <>
                <span>{transcript}</span>
                {interimText && (
                  <span className="text-muted-foreground italic">{interimText}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">正在聆听...</span>
            )}
          </div>
        ) : transcript || interimText ? (
          <textarea
            className="min-h-[100px] w-full rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap resize-y outline-none focus:ring-2 focus:ring-primary/20"
            value={transcript + (interimText ? `\n${interimText}` : '')}
            onChange={(e) => setTranscript(e.target.value)}
          />
        ) : (
          <div className="min-h-[100px] rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            点击「开始录音」按钮，语音内容将显示在这里
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          支持中文普通话识别。录音完成后可编辑内容，点击保存将创建 Markdown 笔记文件。
        </p>
      </CardContent>
    </Card>
  );
}
