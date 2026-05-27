# Task 4a: Tauri Desktop Version Foundation

## Summary
Created the complete Tauri v2 desktop app foundation for the "智能文档知识库" project. All files are ready for local Rust compilation when the user installs the Rust toolchain.

## Files Created (9 new)

### Tauri Core Files (`src-tauri/`)
| File | Description |
|------|-------------|
| `tauri.conf.json` | Tauri v2 config - app name "知识库", window 1200x800, CSP, bundle settings |
| `Cargo.toml` | Rust project config - tauri 2, serde, serde_json dependencies |
| `build.rs` | Tauri build script |
| `src/main.rs` | App entry point - registers 12 Rust commands |
| `src/lib.rs` | ~450 lines of Rust backend logic - file CRUD, versions, folders, search, JSON database, UUID/date/base64 utils without external deps |

### TypeScript Adapter
| File | Description |
|------|-------------|
| `src/lib/storage/tauri.ts` | ~350 lines - Full StorageAdapter implementation using `window.__TAURI__.core.invoke()`, with automatic IndexedDB fallback |
| `src/types/tauri.d.ts` | Global type declarations for `window.__TAURI__` (core, event, path) |
| `docs/TAURI_SETUP.md` | ~200 lines Chinese setup guide (prerequisites, platform deps, config, data paths, troubleshooting) |

## Files Modified (4)
| File | Change |
|------|--------|
| `src/lib/storage/factory.ts` | Added `getStorageAdapterAsync()` with Tauri detection; kept sync version for backward compat |
| `src/lib/storage/index.ts` | Exported `TauriStorageAdapter`, `isTauriEnvironment`, `getStorageAdapterAsync` |
| `package.json` | Added scripts: `tauri`, `tauri:dev`, `tauri:build` |
| `tsconfig.json` | Added `src-tauri` to exclude list |

## Architecture
```
Frontend (React/Next.js)
  └── StorageAdapter Factory
       ├── TauriStorageAdapter (uses window.__TAURI__.core.invoke)
       │     ↓ on failure
       └── IndexedDBAdapter (browser fallback)

Rust Backend (Tauri v2)
  ├── File operations (JSON database + binary storage)
  ├── Version management
  ├── Folder management
  ├── Search (filename/content/tags)
  └── UUID v4 / ISO 8601 / Base64 (no external crates)
```

## Verification
- ✅ ESLint: 0 new errors (27 pre-existing, all from prior tasks)
- ✅ Tests: 533/534 pass (1 pre-existing failure in use-keyboard-shortcuts)
- ✅ Dev server: Running, HTTP 200
- ✅ `src-tauri` excluded from TypeScript compilation
