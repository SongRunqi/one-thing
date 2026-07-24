# CLAUDE.md
组件化而不是创建新的组件。
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
bun run dev                # unified dev: electron + web + server (scripts/dev-unified.mjs)
bun run dev:electron       # managed lane: electron only (can run alongside dev:web)
bun run dev:web            # managed lane: web frontend :5174 + headless server :8787
bun run electron:dev       # electron only (electron-vite, all three processes, no lane cleanup)
bun run web:dev            # bare vite for apps/web (no server, no cleanup)
bun run server:start       # headless core server (apps/server, port 8787)

# Production build
bun run build              # electron build (native mac panel + electron-vite)
bun run web:build          # web build
bun run server:build       # headless server build
bun run build:check        # typecheck + build
bun run build:unpack       # build + electron-builder --dir
bun run build:mac          # build + electron-builder --mac
bun run build:win          # build + electron-builder --win
bun run build:linux        # build + electron-builder --linux

# Linting & Testing
bun run lint               # ESLint with auto-fix
bun run test               # vitest run
bun run test:watch         # vitest (watch mode)
bun run typecheck          # typecheck:node + typecheck:web
```

## Architecture Overview

This is **onething**, an AI chat app with multi-provider support, tool calling, and an event-driven streaming engine. The primary host is an Electron desktop app; a headless server and a browser build share the same runtime packages.

### Monorepo Layout

```
packages/core/               # Bottom layer: engine, session, permission, tools, storage primitives.
                             # No Electron, no imports from runtime/gateway.
packages/onething-runtime/   # App runtime on top of core: prompts, themes, memory, media,
                             # scheduler, agents, agent-loop. Electron-free.
packages/gateway/            # WeChat/Telegram channel gateway. Depends on core only.
                             # Remote permission approval (reply 1/2/3), markdown-safe streaming.
packages/shared/             # Shared IPC/event contracts + defaults (aliased as '@shared').
packages/renderer/           # Shared Vue 3 renderer UI (aliased as '@' / '@renderer'),
                             # consumed by the Electron host and the web build.
apps/electron/               # Electron host: preload, windows, and the main-process app
                             # (apps/electron/src/main, aliased as '@main').
apps/server/                 # Headless core server (HTTP, ONETHING_SERVER_PORT, default 8787)
apps/web/                    # Browser build of the renderer (vite aliases '@' → packages/renderer)
```

Dependency rules are enforced by `packages/core/__tests__/architecture-boundaries.test.ts`.

Notes:

- Session persistence is file-based: new sessions use per-session JSONL dirs
  (`sessions/<id>/meta.json` + `messages.jsonl`, append/suffix writes during streaming);
  legacy whole-file `sessions/<id>.json` is still readable and lazily migrated
  (originals kept in `sessions/legacy-backup/`). Toggle via
  `settings.storage.sessionFormat` ('jsonl' default | 'legacy-json' to roll back).
  See `docs/design/session-storage-jsonl.md`; conversion: `scripts/convert-sessions.mjs`.
  Cross-session search/indexing belongs in apps/server — do not add a database to the
  Electron main process.
- Memory is plain markdown (SOUL/USER/MEMORY.md + daily notes) owned by the soul-memory
  plugin; the Electron memory panel talks to it in-process (no server dependency).
  apps/server exposes the same 10 `/api/memory/*` endpoints for headless/web deployments
  via the shared `createOnethingMemoryIpcHandlers` factory in
  `packages/onething-runtime/src/memory/ipc.ts`.
- Renderer code accesses the host through `platformApi` (`packages/renderer/platform/`),
  never `window.electronAPI` directly.
- System prompt assembly is a single "directory at top, copy below" builder in
  `packages/onething-runtime/src/prompts/builder.ts`.

### Three-Process Model (Electron host)

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (Vue 3 + Pinia)                               │
│  packages/renderer/                                                   │
│  - UI components, stores, composables                           │
│  - Calls platformApi.* (wraps electronAPI) for IPC             │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Electron IPC
┌─────────────────────┴───────────────────────────────────────────┐
│  Preload Script                                                  │
│  apps/electron/src/preload.ts + preload/create-api.ts                           │
│  - contextBridge exposes electronAPI object                     │
│  - Type-safe bridge between renderer and main                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  apps/electron/src/main/                                                       │
│  - Event-driven architecture with EventBus                      │
│  - StreamEngine orchestrates chat lifecycle                     │
│  - IPCBridge: single unified IPC exit point                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

**Chat Message Flow (Event-Driven):**

```
InputBox.vue → chatStore.emitCommand('send-message')
  → IPC → EventBus.emit('command:send-message', { sessionId, content })
  → StreamEngine.handleSendMessage()
    → persist messages → emit 'message:user-created', 'message:assistant-created'
    → executeMessageStream() starts streaming
  → Stream chunks → EventBus.emit('content:part', 'step:updated', etc.)
  → IPCBridge routes events to renderer → UI update
```

**Tool Call Flow:**

```
AI response with tool_call → ToolRegistry.execute() → Permission check
  → EventBus.emit('permission:request') → IPCBridge → renderer
  → User responds → EventBus.emit('command:permission-respond')
  → Tool execution → Result back to AI → Continue generation
```

### Event-Driven Architecture

The core architecture uses a central **EventBus** (`apps/electron/src/main/events/`) with:

- **Commands** (`packages/shared/events/session-commands.ts`): Actions initiated by the renderer (send-message, edit-and-resend, retry-message, resume-after-confirm, permission-respond)
- **Events** (`packages/shared/events/session-events.ts`): State changes emitted by the engine (message:created, content:part, step:updated, stream:start/end, permission:request, etc.)
- **Per-session ring buffers** for event replay
- **Stream channels** for per-session event routing

Key subscribers:

- **StreamEngine** (`apps/electron/src/main/engine/stream-engine.ts`): Listens to commands, orchestrates streaming
- **IPCBridge** (`apps/electron/src/main/bridges/ipc-bridge.ts`): Routes events from EventBus to renderer via WebContents

### IPC Communication Pattern

1. **Channel definitions**: `packages/shared/ipc/channels.ts` - all channel constants
2. **Type definitions**: `packages/shared/ipc/*.ts` - request/response types per domain
3. **Event/Command types**: `packages/shared/events/*.ts` - stream lifecycle types
4. **Main handlers**: `apps/electron/src/main/ipc/*.ts` - handler implementations
5. **Preload bridge**: `apps/electron/src/preload.ts` + `preload/create-api.ts` - exposes typed `window.electronAPI`

To add a new IPC channel:

1. Add channel name to `packages/shared/ipc/channels.ts`
2. Add types in corresponding `packages/shared/ipc/[domain].ts`
3. Implement handler in `apps/electron/src/main/ipc/[domain].ts`
4. Expose API in `apps/electron/src/preload/create-api.ts`

### Directory Structure

```
apps/electron/src/main/        # Electron main-process app ('@main')
│   ├── bridges/               # IPCBridge - unified IPC exit point
│   ├── engine/                # Core streaming engine
│   │   ├── stream-engine.ts   # StreamEngine: owns active stream lifecycle
│   │   ├── stream/            # Stream processing modules
│   │   │   ├── tool-loop.ts           # Core generation loop with retry
│   │   │   ├── stream-processor.ts    # Event processing & state
│   │   │   ├── stream-executor.ts     # Provider execution
│   │   │   ├── message-helpers.ts     # Message formatting & history
│   │   │   ├── provider-helpers.ts    # Provider config resolution
│   │   │   ├── tool-execution.ts      # Tool call execution & permissions
│   │   │   ├── image-generation.ts    # Image generation support
│   │   │   └── image-stream.ts        # Image streaming
│   │   ├── prompt/            # Prompt building & management
│   │   └── triggers/          # Post-chat triggers
│   ├── events/                # Event system
│   │   ├── event-bus.ts       # Central EventBus with ring buffers
│   │   ├── stream-channel.ts  # Per-session channel routing
│   │   ├── ring-buffer.ts     # In-memory event replay
│   │   └── global-events.ts   # Global (non-session) events
│   ├── session/               # Session management
│   │   ├── session.ts         # Core Session class
│   │   ├── session-manager.ts # Session lifecycle
│   │   └── session-state.ts   # Session state tracking
│   ├── ipc/                   # IPC handlers (organized by domain)
│   ├── providers/             # AI provider implementations
│   │   ├── auth/              # OAuth implementations
│   │   └── builtin/           # OpenAI, Claude, DeepSeek, Gemini, Kimi, etc.
│   ├── tools/                 # Tool system
│   │   ├── core/              # Base classes, registry
│   │   └── builtin/           # bash, read, write, edit, glob, grep, etc.
│   ├── permission/            # Permission system
│   ├── skills/                # Skills system
│   ├── mcp/                   # Model Context Protocol support
│   ├── storage/               # File-based storage layer
│   ├── stores/                # Main process state
│   ├── themes/                # Theme system
│   └── utils/                 # Utilities (ripgrep, accessibility, etc.)
│
packages/renderer/             # Vue 3 frontend ('@' / '@renderer')
│   ├── stores/                # Pinia stores (chat, sessions, settings, themes, media)
│   ├── components/
│   │   ├── chat/              # Chat UI (MessageList, InputBox, StepsPanel, etc.)
│   │   │   └── message/       # Message sub-components (bubble, actions, thinking, diff)
│   │   ├── sidebar/           # Sidebar & session list
│   │   ├── settings/          # Settings UI
│   │   │   ├── provider/      # Provider settings
│   │   │   └── mcp/           # MCP settings
│   │   └── common/            # Shared components (Tooltip, ImagePreview, etc.)
│   ├── composables/           # Vue composables (autoScroll, shortcuts, attachments, etc.)
│   ├── services/              # Frontend services
│   │   ├── ipc-hub.ts         # IPC integration layer
│   │   └── commands/          # Command implementations
│   └── types/                 # Frontend type definitions
│
packages/shared/               # Shared between main/renderer ('@shared')
│   ├── ipc/                   # IPC type definitions & channel constants
│   └── events/                # Event & command type definitions
│       ├── session-commands.ts  # Command types (send-message, retry, etc.)
│       ├── session-events.ts    # Event types (content, steps, stream lifecycle)
│       ├── stream-chunks.ts     # Stream chunk types
│       └── envelope.ts          # Event wrapping
│
apps/electron/src/preload.ts   # Electron preload entry
apps/electron/src/preload/     # create-api.ts (electronAPI factory) + bridge.ts
```

### Key Systems

**StreamEngine** (`apps/electron/src/main/engine/`): Single owner of active stream lifecycle. Commands arrive via EventBus → StreamEngine handlers → persist messages → emit events → IPCBridge sends to renderer. Handles send-message, edit-and-resend, retry-message, resume-after-confirm.

**EventBus** (`apps/electron/src/main/events/`): Central pub/sub with per-session ring buffers, sequence counters, typed and wildcard handlers. Decouples command producers from consumers.

**Providers** (`apps/electron/src/main/providers/`): Pluggable AI provider system with hand-rolled fetch/SSE per provider (Vercel AI SDK was removed; see `packages/onething-runtime/src/agent-loop/providers/`). Add new providers in `builtin/` implementing `ProviderDefinition`.

**Tools** (`apps/electron/src/main/tools/`): Built-in tools (bash, read, write, edit, glob, grep, calculator, web-search, skill) with permission system. Add tools in `builtin/` implementing the `Tool` interface.

**Permission** (`apps/electron/src/main/permission/`): Directory-based permission system for tool execution. Permission requests flow through EventBus to renderer for user approval.

**MCP** (`apps/electron/src/main/mcp/`): Model Context Protocol support for external tool servers.

**Skills** (`apps/electron/src/main/skills/`): Claude Code-style skills system for extensibility.

**Themes** (`apps/electron/src/main/themes/`): Built-in and custom theme support.

### State Management

- **Main Process**: Stores in `apps/electron/src/main/stores/` (app-state, settings, sessions, paths, caches)
- **Renderer Process**: Pinia stores in `packages/renderer/stores/` (chat, sessions, settings, themes, media)
- **Cross-process sync**: Via EventBus → IPCBridge events and explicit IPC fetch calls

### Build Output

```
dist/
├── renderer/      # Vite SPA output
├── main/          # Compiled main process
│   └── index.js
└── preload/       # Bundled preload (CommonJS)
    └── index.js
```

### Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Desktop | Electron |
| Frontend | Vue 3 + TypeScript + Pinia |
| AI SDK | Hand-rolled fetch/SSE per provider (`packages/onething-runtime/src/agent-loop/providers/`) |
| Storage | File-based (JSON) |
| Build | electron-vite (Vite renderer + Vite main + esbuild preload) |
| Test | Vitest |
| Virtual Scroll | @tanstack/vue-virtual |
