import { create } from "zustand";
import { useAppStore } from "./app-store";

const MAX_ACTIVITIES = 50;

function getActivitiesStorageKey(): string {
  if (typeof window === "undefined") return "kb_activities";
  const userId = useAppStore.getState().user?.id;
  return userId ? `kb_activities_${userId}` : "kb_activities";
}

export type ActivityType =
  | "upload"
  | "delete"
  | "restore"
  | "favorite"
  | "unfavorite"
  | "rename"
  | "share"
  | "tag";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  fileName: string;
  fileId?: string;
  timestamp: string;
  details?: string;
}

interface ActivityStore {
  activities: ActivityItem[];
  addActivity: (item: Omit<ActivityItem, "id" | "timestamp">) => void;
  rehydrate: () => void;
}

/** 从 localStorage 加载活动记录 */
function loadActivities(): ActivityItem[] {
  try {
    const stored = localStorage.getItem(getActivitiesStorageKey());
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
          (item): item is ActivityItem =>
            item && typeof item.id === 'string' && typeof item.type === 'string'
        );
      } catch {
        return [];
      }
    }
  } catch {
    // 静默失败
  }
  return [];
}

/** 保存活动记录到 localStorage */
function persistActivities(activities: ActivityItem[]) {
  try {
    localStorage.setItem(getActivitiesStorageKey(), JSON.stringify(activities));
  } catch {
    // 静默失败
  }
}

/**
 * 活动记录 Zustand Store
 * - 管理用户操作日志
 * - 最多保留 50 条记录
 * - 持久化到 localStorage
 */
export const useActivityStore = create<ActivityStore>((set) => {
  const initial: ActivityItem[] = [];

  return {
    activities: initial,

    addActivity: (item) => {
      const newActivity: ActivityItem = {
        ...item,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      set((state) => {
        const updated = [newActivity, ...state.activities].slice(0, MAX_ACTIVITIES);
        persistActivities(updated);
        return { activities: updated };
      });
    },

    rehydrate: () => {
      const stored = loadActivities();
      set({ activities: stored });
    },
  };
});
