"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface VideoTrack {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  src: string;
  duration?: number;
  resolution?: string;
}

export interface VideoPlayerProps {
  tracks?: VideoTrack[];
  currentTrackIndex?: number;
  onTrackChange?: (index: number, track: VideoTrack) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  showControls?: boolean;
  showPlaylist?: boolean;
  height?: string | number;
  width?: string | number;
  className?: string;
}

// ==================== 主组件 ====================

export function VideoPlayer({
  tracks = [],
  currentTrackIndex: externalIndex,
  onTrackChange,
  onPlay,
  onPause,
  onEnded,
  autoPlay = false,
  showControls = true,
  showPlaylist = true,
  height = "500px",
  width = "100%",
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [currentIndex, setCurrentIndex] = useState(externalIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showControlsPanel, setShowControlsPanel] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(showPlaylist);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackQuality, setPlaybackQuality] = useState("auto");

  // 自动隐藏控制栏
  const [controlsTimeout, setControlsTimeout] = useState<NodeJS.Timeout | null>(null);

  // 当前视频
  const currentTrack = useMemo(() => {
    return tracks[currentIndex] || null;
  }, [tracks, currentIndex]);

  // ==================== 视频事件处理 ====================

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setIsLoading(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  }, []);

  const handleProgress = useCallback(() => {
    const video = videoRef.current;
    if (video && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBuffered(bufferedEnd);
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
    // 自动播放下一个
    if (tracks.length > 0 && currentIndex < tracks.length - 1) {
      handleNext();
    }
  }, [onEnded, tracks.length, currentIndex]);

  const handleWaiting = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    console.error("Video load error");
  }, []);

  // ==================== 播放控制 ====================

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentTrack) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  }, [isPlaying, currentTrack]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;

    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentIndex(nextIndex);
    onTrackChange?.(nextIndex, tracks[nextIndex]);
  }, [tracks, currentIndex, onTrackChange]);

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;

    // 如果当前播放超过3秒，重新开始
    const video = videoRef.current;
    if (video && video.currentTime > 3) {
      video.currentTime = 0;
      return;
    }

    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    setCurrentIndex(prevIndex);
    onTrackChange?.(prevIndex, tracks[prevIndex]);
  }, [tracks, currentIndex, onTrackChange]);

  // ==================== 进度控制 ====================

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const time = pos * duration;

    video.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  const skipForward = useCallback((seconds: number = 10) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.currentTime + seconds, duration);
  }, [duration]);

  const skipBackward = useCallback((seconds: number = 10) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(video.currentTime - seconds, 0);
  }, []);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ==================== 音量控制 ====================

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);

    const video = videoRef.current;
    if (video) {
      video.volume = vol;
      video.muted = vol === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    video.muted = newMuted;

    if (!newMuted && volume === 0) {
      setVolume(0.5);
      video.volume = 0.5;
    }
  }, [isMuted, volume]);

  // ==================== 播放速度 ====================

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
    }
  }, []);

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // ==================== 全屏控制 ====================

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
      }).catch(() => {
        setIsFullscreen(false);
      });
    } else {
      document.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // ==================== 画中画 ====================

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await video.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (e) {
      console.error("PiP error:", e);
    }
  }, []);

  useEffect(() => {
    const handlePiPChange = () => {
      setIsPiP(!!document.pictureInPictureElement);
    };

    document.addEventListener("enterpictureinpicture", handlePiPChange);
    document.addEventListener("leavepictureinpicture", handlePiPChange);

    return () => {
      document.removeEventListener("enterpictureinpicture", handlePiPChange);
      document.removeEventListener("leavepictureinpicture", handlePiPChange);
    };
  }, []);

  // ==================== 截图功能 ====================

  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `screenshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, "image/png");
  }, []);

  // ==================== 控制栏自动隐藏 ====================

  const showControlsTemporarily = useCallback(() => {
    setShowControlsPanel(true);

    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    if (isPlaying) {
      const timeout = setTimeout(() => {
        setShowControlsPanel(false);
        setShowSettings(false);
      }, 3000);
      setControlsTimeout(timeout);
    }
  }, [isPlaying, controlsTimeout]);

  useEffect(() => {
    if (!isPlaying) {
      setShowControlsPanel(true);
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    }
  }, [isPlaying, controlsTimeout]);

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框中，不处理
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          skipForward(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBackward(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => {
            const newVol = Math.min(v + 0.1, 1);
            const video = videoRef.current;
            if (video) {
              video.volume = newVol;
              video.muted = false;
            }
            setIsMuted(false);
            return newVol;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => {
            const newVol = Math.max(v - 0.1, 0);
            const video = videoRef.current;
            if (video) {
              video.volume = newVol;
              video.muted = newVol === 0;
            }
            setIsMuted(newVol === 0);
            return newVol;
          });
          break;
        case "f":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, skipForward, skipBackward, toggleFullscreen, toggleMute]);

  // ==================== 自动播放 ====================

  useEffect(() => {
    if (autoPlay && currentTrack && videoRef.current) {
      videoRef.current.play().catch(console.error);
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
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = isMuted;
    }
  }, []);

  // ==================== 选择视频 ====================

  const selectTrack = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      onTrackChange?.(index, tracks[index]);

      setTimeout(() => {
        videoRef.current?.play().catch(console.error);
      }, 100);
    },
    [tracks, onTrackChange]
  );

  // ==================== 渲染 ====================

  return (
    <div
      className={`
        flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-black
        ${className}
      `}
      style={{ height, width }}
    >
      {/* 视频主区域 */}
      <div className="flex-1 flex flex-col relative">
        {/* 视频容器 */}
        <div
          ref={containerRef}
          className="flex-1 relative bg-black flex items-center justify-center cursor-pointer"
          onMouseMove={showControlsTemporarily}
          onMouseLeave={() => isPlaying && setShowControlsPanel(false)}
          onClick={togglePlay}
        >
          {/* 视频元素 */}
          <video
            ref={videoRef}
            src={currentTrack?.src}
            poster={currentTrack?.thumbnail}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onWaiting={handleWaiting}
            onCanPlay={handleCanPlay}
            onError={handleError}
            preload="metadata"
            playsInline
            className="max-w-full max-h-full w-full h-full object-contain"
          />

          {/* 加载指示器 */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* 大播放按钮（暂停时显示） */}
          {!isPlaying && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-20 h-20 flex items-center justify-center bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full transition-all hover:scale-110"
              >
                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}

          {/* 顶部标题栏 */}
          {showControls && showControlsPanel && (
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
              <h3 className="text-white font-medium truncate">
                {currentTrack?.title || "未选择视频"}
              </h3>
            </div>
          )}

          {/* 底部控制栏 */}
          {showControls && showControlsPanel && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 进度条 */}
              <div
                ref={progressRef}
                className="relative h-1.5 bg-white/30 rounded-full cursor-pointer mb-3 group"
                onClick={handleSeek}
              >
                {/* 缓冲进度 */}
                <div
                  className="absolute top-0 left-0 h-full bg-white/40 rounded-full"
                  style={{ width: `${(buffered / duration) * 100 || 0}%` }}
                />
                {/* 播放进度 */}
                <div
                  className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
                  style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                />
                {/* 进度点 */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${(currentTime / duration) * 100 || 0}% - 7px)` }}
                />
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center justify-between">
                {/* 左侧：播放控制 */}
                <div className="flex items-center gap-3">
                  {/* 播放列表 */}
                  {showPlaylist && (
                    <button
                      onClick={() => setShowPlaylistPanel(!showPlaylistPanel)}
                      className={`text-white/80 hover:text-white transition-colors ${
                        showPlaylistPanel ? "text-white" : ""
                      }`}
                      title="播放列表"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                    </button>
                  )}

                  {/* 上一个 */}
                  <button
                    onClick={handlePrev}
                    className="text-white/80 hover:text-white transition-colors"
                    title="上一个"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                  </button>

                  {/* 播放/暂停 */}
                  <button
                    onClick={togglePlay}
                    className="text-white hover:text-white/80 transition-colors"
                    title={isPlaying ? "暂停" : "播放"}
                  >
                    {isPlaying ? (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* 下一个 */}
                  <button
                    onClick={handleNext}
                    className="text-white/80 hover:text-white transition-colors"
                    title="下一个"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </button>

                  {/* 音量 */}
                  <div className="flex items-center gap-2 group/volume">
                    <button
                      onClick={toggleMute}
                      className="text-white/80 hover:text-white transition-colors"
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
                      className="w-0 group-hover/volume:w-20 transition-all duration-200 h-1 bg-white/30 rounded-full appearance-none cursor-pointer accent-white"
                    />
                  </div>

                  {/* 时间 */}
                  <span className="text-xs text-white/80 tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* 右侧：更多控制 */}
                <div className="flex items-center gap-3 relative">
                  {/* 截图 */}
                  <button
                    onClick={takeScreenshot}
                    className="text-white/80 hover:text-white transition-colors"
                    title="截图"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>

                  {/* 画中画 */}
                  <button
                    onClick={togglePiP}
                    className={`text-white/80 hover:text-white transition-colors ${
                      isPiP ? "text-white" : ""
                    }`}
                    title="画中画"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>

                  {/* 设置 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`text-white/80 hover:text-white transition-colors ${
                        showSettings ? "text-white" : ""
                      }`}
                      title="设置"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>

                    {/* 设置菜单 */}
                    {showSettings && (
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
                        {/* 播放速度 */}
                        <div className="px-3 py-2 border-b border-gray-700">
                          <div className="text-xs text-gray-400 mb-2">播放速度</div>
                          <div className="flex flex-wrap gap-1">
                            {playbackRates.map((rate) => (
                              <button
                                key={rate}
                                onClick={() => handlePlaybackRateChange(rate)}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                  playbackRate === rate
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                }`}
                              >
                                {rate}x
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 画质 */}
                        <div className="px-3 py-2">
                          <div className="text-xs text-gray-400 mb-2">画质</div>
                          <div className="space-y-1">
                            {["auto", "1080p", "720p", "480p", "360p"].map((quality) => (
                              <button
                                key={quality}
                                onClick={() => setPlaybackQuality(quality)}
                                className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                                  playbackQuality === quality
                                    ? "bg-blue-500/20 text-blue-400"
                                    : "text-gray-300 hover:bg-gray-800"
                                }`}
                              >
                                {quality === "auto" ? "自动" : quality}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 全屏 */}
                  <button
                    onClick={toggleFullscreen}
                    className="text-white/80 hover:text-white transition-colors"
                    title={isFullscreen ? "退出全屏" : "全屏"}
                  >
                    {isFullscreen ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：播放列表 */}
      {showPlaylistPanel && showPlaylist && (
        <div className="w-64 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-gray-900">
          <div className="px-4 py-3 border-b border-gray-700">
            <h4 className="text-sm font-medium text-white">
              播放列表
              <span className="text-xs text-gray-400 ml-2">
                ({tracks.length}个)
              </span>
            </h4>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <span className="text-3xl mb-2">🎬</span>
                <span className="text-sm">暂无视频</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {tracks.map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => selectTrack(index)}
                    className={`
                      flex gap-3 p-3 cursor-pointer transition-colors
                      ${index === currentIndex
                        ? "bg-blue-900/30"
                        : "hover:bg-gray-800"
                      }
                    `}
                  >
                    {/* 缩略图 */}
                    <div className="relative w-24 h-14 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                      {track.thumbnail ? (
                        <img
                          src={track.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-lg">🎬</span>
                        </div>
                      )}

                      {/* 播放状态 */}
                      {index === currentIndex && isPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex items-end gap-0.5 h-4">
                            <div className="w-0.5 bg-white animate-pulse" style={{ height: "60%" }} />
                            <div className="w-0.5 bg-white animate-pulse" style={{ height: "100%", animationDelay: "0.1s" }} />
                            <div className="w-0.5 bg-white animate-pulse" style={{ height: "40%", animationDelay: "0.2s" }} />
                          </div>
                        </div>
                      )}

                      {/* 时长 */}
                      {track.duration && (
                        <span className="absolute bottom-0.5 right-0.5 text-[10px] text-white bg-black/70 px-1 rounded">
                          {formatTime(track.duration)}
                        </span>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${
                        index === currentIndex ? "text-blue-400" : "text-white"
                      }`}>
                        {track.title}
                      </div>
                      {track.description && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {track.description}
                        </div>
                      )}
                      {track.resolution && (
                        <div className="text-xs text-gray-600 mt-1">
                          {track.resolution}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
