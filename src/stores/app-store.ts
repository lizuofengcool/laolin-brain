import { create } from "zustand";
import { createAuthSlice } from "./slices/auth-slice";
import { createFileSlice } from "./slices/file-slice";
import { createUISlice } from "./slices/ui-slice";
import { createAISlice } from "./slices/ai-slice";
import { createLightboxSlice } from "./slices/lightbox-slice";

// Re-export types for backward compatibility
export type { ViewType, UserInfo, FolderItem, AppState } from "./slices/types";

import type { AppState } from "./slices/types";

/**
 * Combined app store composed from domain slices.
 *
 * All existing `useAppStore()` calls continue to work unchanged.
 * Each slice is defined in `src/stores/slices/` and receives `(set, get)`
 * so cross-slice access uses `get()` naturally.
 */
export const useAppStore = create<AppState>()((set, get) => ({
  ...createAuthSlice(set, get),
  ...createFileSlice(set, get),
  ...createUISlice(set, get),
  ...createAISlice(set, get),
  ...createLightboxSlice(set, get),
}));
