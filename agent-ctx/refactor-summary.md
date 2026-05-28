# Task: Refactor Monolithic SPA into Multi-Route Next.js Application

## Summary
Successfully refactored the 1596-line monolithic `page.tsx` into a proper Next.js multi-route application with 13 individual route pages, shared layout, and proper navigation via URL-based routing.

## Files Created (20 new files)

### Shared Components (`src/components/shared/`)
- `ConfirmDialog.tsx` — Reusable confirmation dialog
- `EmptyDashboard.tsx` — Empty state SVG illustration
- `DashboardSkeleton.tsx` — Loading skeleton for dashboard

### View Components (`src/components/views/`)
- `DashboardViewContent.tsx` — Dashboard overview (stats, charts, recent files)
- `FilesViewContent.tsx` — File management (grid, folders, batch ops, context menu)
- `SearchViewContent.tsx` — Search with suggestions and results
- `FavoritesViewContent.tsx` — Favorites grouped by type
- `RecycleBinViewContent.tsx` — Recycle bin with restore/delete
- `FaceGroupsViewContent.tsx` — Face recognition groups
- `SettingsViewContent.tsx` — Settings (4 tabs: general, storage, automation, about)
- `AnalyticsViewContent.tsx` — Analytics dashboard wrapper
- `TimelineViewContent.tsx` — Timeline view wrapper
- `GraphViewContent.tsx` — Knowledge graph wrapper
- `AlbumsViewContent.tsx` — Albums view wrapper
- `TagsViewContent.tsx` — Tag management wrapper

### Route Pages (`src/app/(dashboard)/`)
- `layout.tsx` — Shared sidebar+header layout with auth check, global overlays (lightbox, AI chat, shortcuts)
- `loading.tsx` — Skeleton loading state
- `page.tsx` — Dashboard route (`/dashboard`)
- `files/page.tsx` — Files route (`/files`)
- `search/page.tsx` — Search route (`/search`)
- `favorites/page.tsx` — Favorites route (`/favorites`)
- `trash/page.tsx` — Recycle bin route (`/trash`)
- `faces/page.tsx` — Face groups route (`/faces`)
- `settings/page.tsx` — Settings route (`/settings`)
- `analytics/page.tsx` — Analytics route (`/analytics`)
- `timeline/page.tsx` — Timeline route (`/timeline`)
- `graph/page.tsx` — Knowledge graph route (`/graph`)
- `albums/page.tsx` — Albums route (`/albums`)
- `tags/page.tsx` — Tags route (`/tags`)
- `profile/page.tsx` — Profile route (`/profile`)

### Utilities
- `src/lib/view-routes.ts` — ViewType-to-path mapping for backward compatibility

## Files Modified (8 files)
1. **`src/app/page.tsx`** — Replaced 1596-line monolith with 20-line redirect to `/dashboard`
2. **`src/stores/app-store.ts`** — Kept `currentView`/`setCurrentView` for backward compat, simplified `setCurrentView` to just update state
3. **`src/components/layout/Sidebar.tsx`** — Changed from `setCurrentView()` to `router.push()`, uses `usePathname()` for active state
4. **`src/components/layout/Header.tsx`** — Changed from `setCurrentView()` to `router.push()`
5. **`src/components/layout/MobileNav.tsx`** — Changed from `setCurrentView()` to `router.push()`, uses `usePathname()` for active state
6. **`src/hooks/use-keyboard-shortcuts.ts`** — Changed from `setCurrentView()` to `router.push()`
7. **`src/components/dashboard/RecentFiles.tsx`** — Changed from `setCurrentView()` to `router.push()`
8. **`src/components/files/FileContextMenu.tsx`** — Changed from `setCurrentView()` to `router.push()`
9. **`src/components/layout/ProfileView.tsx`** — Changed from `setCurrentView()` to `router.push()`
10. **`src/components/graph/KnowledgeGraph.tsx`** — Changed from `setCurrentView()` to `router.push()`
11. **`src/components/timeline/TimelineView.tsx`** — Changed from `setCurrentView()` to `window.location.href` (for non-hook context)

## Build Result
- **Lint**: ✅ PASS (0 errors, 3 warnings in unrelated coverage files)
- **Dev server**: ✅ Running, compiled successfully

## Key Architecture Decisions
1. **Route group `(dashboard)`**: Shared layout with sidebar/header, auth check, and global overlays
2. **Framer Motion**: Page transitions via `AnimatePresence` keyed on `pathname` in the layout
3. **Backward compatibility**: `currentView`/`setCurrentView` remain in store for any remaining usage
4. **Dynamic imports preserved**: Heavy components (Timeline, Analytics, Graph, etc.) remain code-split
5. **Profile as route**: Created `/profile` route since it was one of the nav views
