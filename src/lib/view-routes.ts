import type { ViewType } from "@/stores/app-store";

/**
 * Maps ViewType to route path.
 * Used to convert legacy setCurrentView() calls to router.push() calls.
 */
export const viewToPath: Record<ViewType, string> = {
  login: "/",
  dashboard: "/dashboard",
  files: "/files",
  search: "/search",
  settings: "/settings",
  profile: "/profile",
  timeline: "/timeline",
  favorites: "/favorites",
  recycleBin: "/trash",
  albums: "/albums",
  faceGroups: "/faces",
  tags: "/tags",
  analytics: "/analytics",
  knowledgeGraph: "/graph",
};

/**
 * Maps route path back to ViewType (for active state matching in sidebar/mobile nav).
 */
export const pathToView: Record<string, ViewType> = Object.fromEntries(
  Object.entries(viewToPath).map(([view, path]) => [path, view as ViewType])
);

/**
 * Get the active ViewType from the current pathname.
 */
export function getViewFromPath(pathname: string): ViewType {
  // Exact match
  if (pathname in pathToView) return pathToView[pathname];
  // Default: strip leading slash
  const segment = pathname.replace(/^\//, "");
  if (segment in pathToView) return pathToView[segment];
  return "dashboard";
}
