"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface AudioTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  src: string;
  duration?: number;
}

export interface AudioPlayerProps {
  tracks?: AudioTrack[];
  currentTrackIndex?: number;
  onTrackChange?: (index: number, track: AudioTrack) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  showPlaylist?: boolean;
  height?: string | number;
  className?: string;
  mode?: "full" | "mini";
}

type PlayMode = "sequence" | "loop" | "shuffle" | "single";

// ==================== 主组件 ====================

export function AudioPlayer({
  tracks = [],
  currentTrackIndex: externalIndex,
  onTrackChange,
  onPlay,
  onPause,
  onEnded,
  autoPlay = false,
  showPlaylist = true,
  height = "500px",
  className = "",
  mode = "full",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const [currentIndex, setCurrentIndex] = useState(externalIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playMode, setPlayMode] = useState<PlayMode>("sequence");
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(showPlaylist);
  const [isLoading, setIsLoading] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(true);
  const [playerMode, setPlayerMode] = useState<"full" | "mini">(mode);

  // 当前曲目
  const currentTrack = useMemo(() => {
    return tracks[currentIndex] || null;
  }, [tracks, currentIndex]);

  // ==================== 音频事件处理 ====================

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
      setIsLoading(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    onPlay?.();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPause?.();
  }, [onPause]);

  const handleEnded = useCallback(() => {
    onEnded?.();
    handleNext();
  }, [onEnded]);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    console.error("Audio load error");
  }, []);

  // ==================== 播放控制 ====================

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, [isPlaying, currentTrack]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;

    let nextIndex: number;

    switch (playMode) {
      case "single":
        // 单曲循环：重新播放当前
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(console.error);
        }
        return;

      case "shuffle":
        // 随机播放
        nextIndex = Math.floor(Math.random() * tracks.length);
        break;

      case "loop":
      case "sequence":
      default:
        // 顺序/列表循环
        nextIndex = (currentIndex + 1) % tracks.length;
        break;
    }

    setCurrentIndex(nextIndex);
    onTrackChange?.(nextIndex, tracks[nextIndex]);
  }, [tracks, currentIndex, playMode, onTrackChange]);

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;

    // 如果当前播放超过3秒，重新开始当前歌曲
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    let prevIndex: number;

    switch (playMode) {
      case "shuffle":
        prevIndex = Math.floor(Math.random() * tracks.length);
        break;

      case "single":
      case "loop":
      case "sequence":
      default:
        prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
        break;
    }

    setCurrentIndex(prevIndex);
    onTrackChange?.(prevIndex, tracks[prevIndex]);
  }, [tracks, currentIndex, playMode, onTrackChange]);

  // ==================== 进度控制 ====================

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ==================== 音量控制 ====================

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);

    const audio = audioRef.current;
    if (audio) {
      audio.volume = vol;
      audio.muted = vol === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audio.muted = newMuted;

    if (!newMuted && volume === 0) {
      setVolume(0.5);
      audio.volume = 0.5;
    }
  }, [isMuted, volume]);

  // ==================== 播放速度 ====================

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
    }
  }, []);

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // ==================== 播放模式 ====================

  const cyclePlayMode = useCallback(() => {
    const modes: PlayMode[] = ["sequence", "loop", "shuffle", "single"];
    const currentModeIndex = modes.indexOf(playMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    setPlayMode(nextMode);
  }, [playMode]);

  const playModeIcon = {
    sequence: "🔁",
    loop: "🔂",
    shuffle: "🔀",
    single: "🔂",
  };

  const playModeLabel = {
    sequence: "顺序播放",
    loop: "列表循环",
    shuffle: "随机播放",
    single: "单曲循环",
  };

  // ==================== 音频可视化 ====================

  useEffect(() => {
    if (!showVisualizer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 简单的动画可视化（不使用Web Audio API以避免兼容性问题）
    const bars = 64;
    const barWidth = canvas.width / bars;
    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < bars; i++) {
        // 生成伪随机波形
        const barHeight = isPlaying
          ? Math.abs(Math.sin(time * 2 + i * 0.2) * 30 + Math.sin(time * 3 + i * 0.1) * 20 + 10)
          : 5;

        const x = i * barWidth;
        const y = canvas.height - barHeight;

        // 渐变色
        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
        gradient.addColorStop(0, "#3b82f6");
        gradient.addColorStop(1, "#8b5cf6");

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      }

      time += 0.05;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showVisualizer, isPlaying]);

  // ==================== 自动播放 ====================

  useEffect(() => {
    if (autoPlay && currentTrack && audioRef.current) {
      audioRef.current.play().catch(console.error);
    }
  }, [currentIndex]);

  // 同步外部索引
  useEffect(() => {
    if (externalIndex !== undefined && externalIndex !== currentIndex) {
      setCurrentIndex(externalIndex);
    }
  }, [externalIndex, currentIndex]);

  // 同步音量
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = isMuted;
    }
  }, []);

  // ==================== 选择曲目 ====================

  const selectTrack = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      onTrackChange?.(index, tracks[index]);

      // 自动播放
      setTimeout(() => {
        audioRef.current?.play().catch(console.error);
      }, 100);
    },
    [tracks, onTrackChange]
  );

  // ==================== 渲染 ====================

  if (playerMode === "mini") {
    return (
      <MiniPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
        onExpand={() => setPlayerMode("full")}
        className={className}
      />
    );
  }

  return (
    <div
      className={`
        flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900
        ${className}
      `}
      style={{ height }}
    >
      {/* 隐藏的audio元素 */}
      <audio
        ref={audioRef}
        src={currentTrack?.src}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onError={handleError}
        preload="metadata"
      />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：播放器主界面 */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
          {/* 封面/可视化 */}
          <div className="w-48 h-48 mb-6 relative">
            {showVisualizer ? (
              <canvas
                ref={canvasRef}
                width={192}
                height={192}
                className="w-full h-full rounded-xl shadow-lg"
              />
            ) : currentTrack?.cover ? (
              <img
                src={currentTrack.cover}
                alt={currentTrack.title}
                className={`w-full h-full rounded-xl shadow-lg object-cover ${isPlaying ? "animate-pulse" : ""}`}
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-6xl">🎵</span>
              </div>
            )}

            {/* 加载指示器 */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* 曲目信息 */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {currentTrack?.title || "未选择曲目"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {currentTrack?.artist || "未知艺术家"}
              {currentTrack?.album && ` · ${currentTrack.album}`}
            </p>
          </div>

          {/* 进度条 */}
          <div className="w-full max-w-sm mb-4">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 主控制按钮 */}
          <div className="flex items-center gap-4 mb-4">
            {/* 播放模式 */}
            <button
              onClick={cyclePlayMode}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title={playModeLabel[playMode]}
            >
              <span className="text-lg">{playModeIcon[playMode]}</span>
            </button>

            {/* 上一首 */}
            <button
              onClick={handlePrev}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="上一首"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 播放/暂停 */}
            <button
              onClick={togglePlay}
              disabled={!currentTrack}
              className="w-14 h-14 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 下一首 */}
            <button
              onClick={handleNext}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="下一首"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* 播放列表切换 */}
            <button
              onClick={() => setShowPlaylistPanel(!showPlaylistPanel)}
              className={`p-2 transition-colors ${
                showPlaylistPanel
                  ? "text-blue-500"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              title="播放列表"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
          </div>

          {/* 底部控制栏 */}
          <div className="flex items-center gap-4 w-full max-w-sm">
            {/* 音量控制 */}
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={toggleMute}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                title={isMuted ? "取消静音" : "静音"}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* 播放速度 */}
            <div className="relative">
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {playbackRates.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>
            </div>

            {/* 迷你模式切换 */}
            <button
              onClick={() => setPlayerMode("mini")}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              title="迷你模式"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* 右侧：播放列表 */}
        {showPlaylistPanel && (
          <div className="w-64 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                播放列表
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  ({tracks.length}首)
                </span>
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto">
              {tracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <span className="text-3xl mb-2">🎵</span>
                  <span className="text-sm">暂无曲目</span>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {tracks.map((track, index) => (
                    <div
                      key={track.id}
                      onClick={() => selectTrack(index)}
                      className={`
                        flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                        ${index === currentIndex
                          ? "bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }
                      `}
                    >
                      {/* 序号/播放状态 */}
                      <div className="w-6 text-center">
                        {index === currentIndex && isPlaying ? (
                          <div className="flex items-end justify-center gap-0.5 h-4">
                            <div className="w-0.5 bg-blue-500 animate-pulse" style={{ height: "60%" }} />
                            <div className="w-0.5 bg-blue-500 animate-pulse" style={{ height: "100%", animationDelay: "0.1s" }} />
                            <div className="w-0.5 bg-blue-500 animate-pulse" style={{ height: "40%", animationDelay: "0.2s" }} />
                          </div>
                        ) : (
                          <span className={`text-xs ${index === currentIndex ? "text-blue-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                            {index + 1}
                          </span>
                        )}
                      </div>

                      {/* 封面 */}
                      {track.cover ? (
                        <img
                          src={track.cover}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-xs">🎵</span>
                        </div>
                      )}

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${index === currentIndex ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                          {track.title}
                        </div>
                        {track.artist && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {track.artist}
                          </div>
                        )}
                      </div>

                      {/* 时长 */}
                      {track.duration && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 迷你播放器 ====================

interface MiniPlayerProps {
  track: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExpand: () => void;
  className?: string;
}

function MiniPlayer({
  track,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onExpand,
  className = "",
}: MiniPlayerProps) {
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 shadow-sm
        ${className}
      `}
    >
      {/* 封面 */}
      {track?.cover ? (
        <img
          src={track.cover}
          alt=""
          className="w-12 h-12 rounded-lg object-cover"
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <span className="text-xl">🎵</span>
        </div>
      )}

      {/* 信息和进度 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {track?.title || "未选择曲目"}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">
          {track?.artist || "未知艺术家"}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={onSeek}
            className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums w-10 text-right">
            {formatTime(currentTime)}
          </span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={onTogglePlay}
          disabled={!track}
          className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={onNext}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button
          onClick={onExpand}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ml-1"
          title="展开"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default AudioPlayer;
