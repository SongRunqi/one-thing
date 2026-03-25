# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development (electron-vite handles all three processes)
bun run dev

# Production build
bun run build              # electron-vite build (renderer + main + preload)
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

This is **0neThing**, an Electron-based AI chat desktop app with multi-provider support, tool calling, and an event-driven streaming engine.

### Three-Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (Vue 3 + Pinia)                               │
│  src/renderer/                                                   │
│  - UI components, stores, composables                           │
│  - Calls window.electronAPI.* for IPC                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Electron IPC
┌─────────────────────┴───────────────────────────────────────────┐
│  Preload Script                                                  │
│  src/preload/index.ts + create-api.ts                           │
│  - contextBridge exposes electronAPI object                     │
│  - Type-safe bridge between renderer and main                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  src/main/                                                       │
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

The core architecture uses a central **EventBus** (`src/main/events/`) with:

- **Commands** (`src/shared/events/session-commands.ts`): Actions initiated by the renderer (send-message, edit-and-resend, retry-message, resume-after-confirm, permission-respond)
- **Events** (`src/shared/events/session-events.ts`): State changes emitted by the engine (message:created, content:part, step:updated, stream:start/end, permission:request, etc.)
- **Per-session ring buffers** for event replay
- **Stream channels** for per-session event routing

Key subscribers:
- **StreamEngine** (`src/main/engine/stream-engine.ts`): Listens to commands, orchestrates streaming
- **IPCBridge** (`src/main/bridges/ipc-bridge.ts`): Routes events from EventBus to renderer via WebContents

### IPC Communication Pattern

1. **Channel definitions**: `src/shared/ipc/channels.ts` - all channel constants
2. **Type definitions**: `src/shared/ipc/*.ts` - request/response types per domain
3. **Event/Command types**: `src/shared/events/*.ts` - stream lifecycle types
4. **Main handlers**: `src/main/ipc/*.ts` - handler implementations
5. **Preload bridge**: `src/preload/index.ts` + `create-api.ts` - exposes typed `window.electronAPI`

To add a new IPC channel:
1. Add channel name to `src/shared/ipc/channels.ts`
2. Add types in corresponding `src/shared/ipc/[domain].ts`
3. Implement handler in `src/main/ipc/[domain].ts`
4. Expose API in `src/preload/create-api.ts`

### Directory Structure

```
src/
├── main/                      # Electron main process
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
├── renderer/                  # Vue 3 frontend
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
├── shared/                    # Shared between main/renderer
│   ├── ipc/                   # IPC type definitions & channel constants
│   └── events/                # Event & command type definitions
│       ├── session-commands.ts  # Command types (send-message, retry, etc.)
│       ├── session-events.ts    # Event types (content, steps, stream lifecycle)
│       ├── stream-chunks.ts     # Stream chunk types
│       └── envelope.ts          # Event wrapping
│
└── preload/                   # Electron preload
    ├── index.ts
    └── create-api.ts          # electronAPI factory
```

### Key Systems

**StreamEngine** (`src/main/engine/`): Single owner of active stream lifecycle. Commands arrive via EventBus → StreamEngine handlers → persist messages → emit events → IPCBridge sends to renderer. Handles send-message, edit-and-resend, retry-message, resume-after-confirm.

**EventBus** (`src/main/events/`): Central pub/sub with per-session ring buffers, sequence counters, typed and wildcard handlers. Decouples command producers from consumers.

**Providers** (`src/main/providers/`): Pluggable AI provider system using Vercel AI SDK. Add new providers in `builtin/` implementing `ProviderDefinition`.

**Tools** (`src/main/tools/`): Built-in tools (bash, read, write, edit, glob, grep, calculator, web-search, skill) with permission system. Add tools in `builtin/` implementing the `Tool` interface.

**Permission** (`src/main/permission/`): Directory-based permission system for tool execution. Permission requests flow through EventBus to renderer for user approval.

**MCP** (`src/main/mcp/`): Model Context Protocol support for external tool servers.

**Skills** (`src/main/skills/`): Claude Code-style skills system for extensibility.

**Themes** (`src/main/themes/`): Built-in and custom theme support.

### State Management

- **Main Process**: Stores in `src/main/stores/` (app-state, settings, sessions, paths, caches)
- **Renderer Process**: Pinia stores in `src/renderer/stores/` (chat, sessions, settings, themes, media)
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
|-------|-----------|
| Desktop | Electron |
| Frontend | Vue 3 + TypeScript + Pinia |
| AI SDK | Vercel AI SDK (`ai`) |
| Storage | File-based (JSON) |
| Build | electron-vite (Vite renderer + tsc main + esbuild preload) |
| Test | Vitest |
| Virtual Scroll | @tanstack/vue-virtual |
