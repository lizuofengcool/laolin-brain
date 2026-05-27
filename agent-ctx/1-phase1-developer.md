---
Task ID: 1
Agent: Phase 1 Developer
Task: Drag-drop sorting, Markdown support, Password security upgrade

Work Log:
- Installed @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, bcryptjs
- **Feature 1A - Drag & Drop:**
  - Added `reorderFiles` and `moveFileToFolder` actions to `src/stores/app-store.ts`
  - Rewrote `src/components/files/FileGrid.tsx` with DndContext, SortableContext, useSortable, DragOverlay
  - Created SortableFileCard and SortableFileListItem wrappers
  - Rewrote `src/components/files/FolderTree.tsx` with DroppableFolderItem and DroppableAllFiles using useDroppable
  - Visual feedback: ring highlight + "放置" text on folder hover during drag
  - DragOverlay shows semi-transparent card with rotation effect

- **Feature 1B - Markdown Rendering:**
  - Created `src/lib/markdown.ts` — regex-based GFM renderer supporting headers, bold, italic, strikethrough, lists, code blocks, inline code, links, images, blockquotes, tables, horizontal rules
  - Updated `src/components/files/FilePreview.tsx` — markdown detection, tab toggle between "渲染"/"源码", rendered HTML with `dangerouslySetInnerHTML`
  - Updated `src/lib/storage/indexeddb.ts` — reads .md/.txt files as text via `file.text()`
  - Updated `src/app/api/files/route.ts` — markdown/txt file type detection, `buffer.toString("utf-8")` text extraction
  - Added comprehensive markdown CSS styles in `src/app/globals.css` (.markdown-body with dark mode support)

- **Feature 1C - Password Security Upgrade:**
  - Created `src/lib/auth.ts` — bcryptjs hash/verify, HMAC-SHA256 token with 24h expiry, timing-safe comparison
  - Created `src/lib/api-auth.ts` — authenticateRequest middleware extracting token from Authorization header or query param
  - Updated `src/app/api/auth/register/route.ts` — replaced simpleHash with bcryptjs hashPassword
  - Updated `src/app/api/auth/login/route.ts` — replaced simpleHash check with verifyPassword, generateToken
  - Updated `src/app/api/files/route.ts` — POST and GET now require authentication, use authenticated userId
  - Updated `src/app/api/files/[id]/route.ts` — GET, PUT, DELETE require authentication
  - Updated `src/lib/storage/server.ts` — all API calls now include Authorization header
  - Updated `src/stores/app-store.ts` — hydrateAuth now validates token expiry client-side, folder refresh sends auth header
  - Updated `src/components/files/UploadZone.tsx` — cloud mode uploads include Authorization header

Stage Summary:
- All 3 features implemented: drag-drop sorting, markdown preview, bcrypt password security
- 0 new lint errors (all 11 existing errors are pre-existing from prior work)
- Dev server compiles successfully
- Files modified: 12 files created/modified
  - New: src/lib/auth.ts, src/lib/api-auth.ts, src/lib/markdown.ts
  - Modified: src/stores/app-store.ts, src/components/files/FileGrid.tsx, src/components/files/FolderTree.tsx, src/components/files/FilePreview.tsx, src/components/files/UploadZone.tsx, src/lib/storage/indexeddb.ts, src/lib/storage/server.ts, src/app/api/files/route.ts, src/app/api/files/[id]/route.ts, src/app/api/auth/register/route.ts, src/app/api/auth/login/route.ts, src/app/globals.css, src/components/auth/LoginForm.tsx
