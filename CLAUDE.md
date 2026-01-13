# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development (runs all watchers concurrently + Electron)
bun run dev:all

# Individual watchers (if needed separately)
bun run dev          # Vite dev server (renderer)
bun run dev:main     # TypeScript watch (main process)
bun run dev:preload  # esbuild watch (preload script)

# Production build
bun run build        # Full build (renderer + main + preload)
bun run build:electron  # Build + package with electron-builder

# Linting
bun run lint         # ESLint with auto-fix
```

## Architecture Overview

This is **0neThing**, an Electron-based AI chat desktop app with multi-provider support, tool calling, memory system, and custom agents.

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
│  src/preload/index.ts                                           │
│  - contextBridge exposes electronAPI object                     │
│  - Type-safe bridge between renderer and main                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  src/main/                                                       │
│  - IPC handlers, services, storage, tools, providers            │
│  - SQLite + sqlite-vec for vector search                        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

**Chat Message Flow:**
```
InputBox.vue → chatStore.sendMessage() → window.electronAPI.sendMessageStream()
  → IPC → chat.ts handler → Provider.streamChatResponse()
  → Stream chunks via IPC events → UI update
```

**Tool Call Flow:**
```
AI response with tool_call → ToolRegistry.execute() → Permission check
  → Tool execution → Result back to AI → Continue generation
```

### IPC Communication Pattern

1. **Channel definitions**: `src/shared/ipc/channels.ts` - all channel constants
2. **Type definitions**: `src/shared/ipc/*.ts` - request/response types per domain
3. **Main handlers**: `src/main/ipc/*.ts` - handler implementations
4. **Preload bridge**: `src/preload/index.ts` - exposes typed `window.electronAPI`

To add a new IPC channel:
1. Add channel name to `src/shared/ipc/channels.ts`
2. Add types in corresponding `src/shared/ipc/[domain].ts`
3. Implement handler in `src/main/ipc/[domain].ts`
4. Expose API in `src/preload/index.ts`

### Directory Structure

```
src/
├── main/                   # Electron main process
│   ├── ipc/               # IPC handlers (organized by domain)
│   │   └── chat/          # Chat-specific handlers (streaming, tools)
│   ├── providers/         # AI provider implementations
│   │   └── builtin/       # OpenAI, Claude, DeepSeek, Gemini, etc.
│   ├── storage/           # SQLite + sqlite-vec storage layer
│   ├── services/          # Business logic
│   │   ├── memory/        # Memory system (Mem0-style decay)
│   │   ├── auth/          # OAuth implementations
│   │   ├── custom-agent/  # CustomAgent system
│   │   └── triggers/      # Post-chat triggers
│   ├── tools/             # Tool system
│   │   ├── core/          # Base classes, registry
│   │   └── builtin/       # bash, read, write, edit, glob, grep, etc.
│   ├── plugins/           # Plugin system
│   ├── mcp/               # Model Context Protocol support
│   └── stores/            # Main process state
│
├── renderer/              # Vue 3 frontend
│   ├── stores/            # Pinia stores (chat, sessions, settings, etc.)
│   ├── components/        # Vue components
│   │   ├── chat/          # Chat UI components
│   │   └── settings/      # Settings UI
│   ├── composables/       # Vue composables
│   └── services/          # Frontend services
│       └── commands/      # Command implementations
│
├── shared/                # Shared between main/renderer
│   └── ipc/               # IPC type definitions & channel constants
│
└── preload/               # Electron preload (CommonJS)
```

### Key Systems

**Providers** (`src/main/providers/`): Pluggable AI provider system using Vercel AI SDK. Add new providers in `builtin/` implementing `ProviderDefinition`.

**Tools** (`src/main/tools/`): Built-in tools (bash, read, write, edit, glob, grep) with permission system. Add tools in `builtin/` implementing the `Tool` interface.

**Memory** (`src/main/services/memory/`): Mem0-style memory with semantic search via sqlite-vec. Extracts user facts and agent memories from conversations.

**CustomAgents** (`src/main/services/custom-agent/`): User-definable agents with custom prompts, tools, and memory isolation.

**MCP** (`src/main/mcp/`): Model Context Protocol support for external tool servers.

**Skills** (`src/main/skills/`): Claude Code-style skills system for extensibility.

### State Management

- **Main Process**: Stores in `src/main/stores/` (settings, sessions, paths)
- **Renderer Process**: Pinia stores in `src/renderer/stores/`
- **Cross-process sync**: Via IPC events and explicit fetch calls

### Build Output

```
dist/
├── renderer/      # Vite SPA output
├── main/          # TypeScript compiled main process
│   └── index.js
└── preload/       # esbuild bundled preload (CommonJS)
    └── index.js
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Frontend | Vue 3 + TypeScript + Pinia |
| AI SDK | Vercel AI SDK (`ai`) |
| Database | SQLite (better-sqlite3) + sqlite-vec |
| Build | Vite (renderer) + tsc (main) + esbuild (preload) |
