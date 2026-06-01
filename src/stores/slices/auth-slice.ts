import type { UserInfo, ViewType, StoreSet, StoreGet } from "./types";
import { useNotificationStore } from "@/stores/notification-store";
import { useActivityStore } from "@/stores/activity-store";
import { resetAdapter } from "@/lib/storage/factory";

export function createAuthSlice(set: StoreSet, get: StoreGet) {
  return {
    // ── Auth State ───────────────────────────────────────────────────────
    user: null as UserInfo | null,
    token: null as string | null,
    isAuthenticated: false,

    // ── Navigation ───────────────────────────────────────────────────────
    currentView: "login" as ViewType,
    setCurrentView: (view: ViewType) => {
      set({ currentView: view });
    },

    // ── Auth Actions ─────────────────────────────────────────────────────
    login: (user: UserInfo, token: string) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("kb_token", token);
        localStorage.setItem("kb_user", JSON.stringify(user));
      }
      set({ user, token, isAuthenticated: true, currentView: "dashboard" });
      // Rehydrate user-specific stores
      useNotificationStore.getState().rehydrate();
      useActivityStore.getState().rehydrate();
    },

    logout: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("kb_token");
        localStorage.removeItem("kb_user");
      }
      // Clear service worker caches on logout
      if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
      }
      resetAdapter();
      useNotificationStore.getState().rehydrate();
      useActivityStore.getState().rehydrate();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        currentView: "login",
        files: [],
        folders: [],
      });
    },

    hydrateAuth: () => {
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("kb_token");
      const userStr = localStorage.getItem("kb_user");
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);

          // Verify token is still valid (check expiry)
          try {
            const parts = token.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
              if (payload.exp && Date.now() > payload.exp) {
                // Token expired
                localStorage.removeItem("kb_token");
                localStorage.removeItem("kb_user");
                return;
              }
            }
          } catch {
            // Token format invalid, clear it
            localStorage.removeItem("kb_token");
            localStorage.removeItem("kb_user");
            return;
          }

          set({
            user,
            token,
            isAuthenticated: true,
            currentView: "dashboard",
            storageMode: user.storageMode || "local",
            autoAiProcessing: JSON.parse(localStorage.getItem("kb_auto_ai") || "true"),
          });
          get().refreshFiles();
          get().refreshFolders();
        } catch {
          localStorage.removeItem("kb_token");
          localStorage.removeItem("kb_user");
        }
      }
    },

    // ── Cross-tab auth sync ──────────────────────────────────────────────
    _setupCrossTabSync: () => {
      if (typeof window === "undefined") return;
      const handler = (event: StorageEvent) => {
        if (event.key === "kb_token") {
          if (event.newValue === null) {
            // Token was cleared by another tab → logout
            get().logout();
          } else if (event.newValue) {
            // Token was set by another tab → hydrate auth
            get().hydrateAuth();
          }
        }
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}
