"use client";

import { useState, useEffect, useCallback } from "react";

const AVATAR_STORAGE_KEY = "kb_user_avatar";

/**
 * 自定义头像管理 Hook
 * - 读取/保存/删除 localStorage 中的头像 base64
 * - 提供 avatar, setAvatar, removeAvatar, avatarLoading
 */
export function useAvatar() {
  const [avatar, setAvatarState] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);

  // Mount 时从 localStorage 读取
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (stored) {
        setAvatarState(stored);
      }
    } catch {
      // localStorage 不可用时静默失败
    } finally {
      setAvatarLoading(false);
    }
  }, []);

  // 保存头像到 localStorage
  const setAvatar = useCallback((base64: string) => {
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, base64);
      setAvatarState(base64);
    } catch {
      // 存储空间不足时静默失败
    }
  }, []);

  // 删除头像
  const removeAvatar = useCallback(() => {
    try {
      localStorage.removeItem(AVATAR_STORAGE_KEY);
    } catch {
      // 静默失败
    }
    setAvatarState(null);
  }, []);

  return { avatar, setAvatar, removeAvatar, avatarLoading };
}
