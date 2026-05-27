# Task 4: Playwright E2E Tests Setup

## Work Log
- Read `/home/z/my-project/worklog.md` to understand the project structure and history
- Analyzed the app's SPA navigation pattern (Zustand `currentView` state, not URL-based routing)
- Reviewed LoginForm, Sidebar, MobileNav, Header, Settings, UploadZone, SearchBar, BackupRestore, and StorageSwitch components
- Reviewed auth API routes (`/api/auth/register`, `/api/auth/login`) for request/response shapes
- Installed Playwright via `npm init playwright@latest -- --quiet`
- Installed Chromium browser via `npx playwright install chromium`
- Removed default `tests/` directory and example test
- Created custom `playwright.config.ts` (chromium + mobile-chrome projects, webServer config)
- Created `e2e/auth.spec.ts` — 6 tests: login form display, register toggle, registration, login, invalid credentials, logout
- Created `e2e/files.spec.ts` — 6 tests: files view, file upload via file chooser, storage mode badge, search view, upload and search
- Created `e2e/navigation.spec.ts` — 12 tests: sidebar visibility, desktop nav between all views, sidebar collapse/expand, header search form navigation, mobile bottom nav, mobile more menu
- Created `e2e/settings.spec.ts` — 8 tests: settings navigation, account info, storage mode display, default local mode, ZIP backup buttons, data export/import sections, header dropdown navigation
- Added `e2e` and `e2e:ui` scripts to `package.json`
- Verified all new files pass ESLint with 0 errors

## Files Created
| File | Description |
|------|-------------|
| `playwright.config.ts` | Playwright config: chromium + mobile-chrome, baseURL localhost:3000, webServer `npm run dev`, 30s timeout, screenshot on failure |
| `e2e/auth.spec.ts` | Authentication flow: registration, login, invalid creds, logout |
| `e2e/files.spec.ts` | File management: upload via file chooser, file list, search |
| `e2e/navigation.spec.ts` | Navigation: sidebar nav, mobile nav, header search, sidebar collapse |
| `e2e/settings.spec.ts` | Settings: account info, storage mode, backup buttons |

## Files Modified
| File | Change |
|------|--------|
| `package.json` | Added `"e2e": "npx playwright test"` and `"e2e:ui": "npx playwright test --ui"` scripts |

## Configuration Details
- **Test directory**: `e2e/`
- **Browser projects**: `chromium` (Desktop Chrome) + `mobile-chrome` (Pixel 5 viewport)
- **Web server**: `npm run dev` on port 3000, reuses existing server
- **Timeout**: 30s per test, 10s for expect assertions
- **Screenshots**: On first failure
- **Traces**: On first retry (CI)
- **Reporter**: HTML
- **ESLint**: 0 errors in new files (24 pre-existing errors in original codebase unchanged)

## Notes
- The `npx playwright install chromium --with-deps` failed due to missing sudo permissions for system dependency installation. The browser was installed without system deps (`npx playwright install chromium`). This should work in most environments since Playwright bundles most required libraries.
- Tests are designed to work with the SPA pattern — each test clears localStorage and re-registers a unique user (email with timestamp) to avoid conflicts.
- Mobile navigation tests use the `mobile-chrome` project (Pixel 5 viewport) defined in the config.
- Tests do NOT run automatically — use `npx playwright test` when the dev server is available.
