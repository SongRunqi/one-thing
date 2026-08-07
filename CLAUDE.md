# CLAUDE.md
组件化而不是创建新的组件。
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
bun run dev                # unified dev: electron + web + server (scripts/dev-unified.mjs)
bun run dev:electron       # managed lane: electron only (can run alongside dev:web)
bun run dev:web            # managed lane: web frontend :5174 + headless server :8787
bun run electron:dev       # electron only (dev-with-logging.mjs → electron-vite dev, logs to ~/.onething/log/dev.log)
bun run web:dev            # bare vite for apps/web (no server, no cleanup)
bun run server:start       # node dist/server/main.js (run server:build first; port 8787)

# Production build
bun run build              # electron build (native mac panel + electron-vite → out/)
bun run web:build          # web build (→ dist/web)
bun run server:build       # headless server build (→ dist/server/main.js)
bun run build:check        # typecheck + build
bun run build:unpack       # build + electron-builder --dir
bun run build:mac          # build + electron-builder --mac
bun run build:win          # build + electron-builder --win
bun run build:linux        # build + electron-builder --linux
bun run build:native:mac   # macOS panel native module only (scripts/build-macos-panel.mjs)
bun run sign:dev:mac       # sign dev binaries

# Linting & Testing
bun run lint               # ESLint with auto-fix
bun run lint:ci            # eslint . --max-warnings 200
bun run test               # vitest run (rebuilds better-sqlite3 for Node ABI first)
bun run test:watch         # vitest (watch mode)
bun run typecheck          # typecheck:node + typecheck:web

# Guardrails
bun run boundary           # full static boundary checker (scripts/headless-boundary-check.ts)
bun run boundary:gate      # ratchet gate: diffs checker output vs baseline, fails only on NEW reds

# Evals
bun run evals              # bun evals/run.mjs
bun run evals:diagnose     # scripts/diagnose-weekly.mjs
```

Dev ports: Electron renderer dev server **5173**, web frontend **5174**, server **8787** (apps/web dev proxies `/api` → `ONETHING_API_URL` || `http://127.0.0.1:8787`).

## Architecture Overview

This is **onething**, an AI chat app with multi-provider support, tool calling, and an event-driven streaming engine. The product lives in packages; the apps are thin sockets. Three-layer mental model:

- **packages/core** — engine skeleton. Zero dependencies, zero Electron. Event bus, session, permission, tool-loop, storage primitives.
- **packages/onething-runtime/src** — the product itself (prompts, memory, sessions, tools, providers, themes, …). Electron-free; bans `@shared/ipc` (checker-enforced); must not import the assembly tree.
- **packages/onething-runtime/src/app** — the assembly layer (`@onething/app`). All migrated main-process glue (engine, events, stores, tool/provider/permission wiring). `@shared` IS allowed here. Exposes `createOnethingBackend`, the single assembly recipe.
- **apps/\*** — thin sockets: Electron (window/IPC/native panel), server (HTTP/SSE), web (browser build of the renderer), CLI daemon.

```
apps/*  (thin sockets)
┌───────────────┬────────────────┬──────────────┬─────────────────────┐
│ apps/electron │ apps/server    │ apps/web     │ CLI daemon          │
│ window/IPC/   │ HTTP + SSE     │ browser      │ bin/onething.mjs →  │
│ native panel  │ :8787          │ build        │ out/main/cli.js     │
└──────┬────────┴───────┬────────┴──────┬───────┴──────────┬──────────┘
       │ createOnethingBackend(...)     │ /api → server    │
┌──────┴────────────────┴───────────────┴──────────────────┴──────────┐
│ packages/onething-runtime/src/app        ASSEMBLY ('@onething/app') │
│  backend.ts (factory) + engine/ events/ stores/ tools/ providers/   │
│  permission/ mcp/ …  — @shared allowed; hosts inject surfaces via   │
│  configure*Host ports (never imports electron/@main/@preload)       │
├──────────────────────────────────────────────────────────────────────┤
│ packages/onething-runtime/src/*          PRODUCT ('@onething/runtime')│
│  prompts, memory, sessions, agent-loop providers, tools, themes, …   │
│  Electron-free; no @shared/ipc; MUST NOT import @onething/app        │
├──────────────────────────────────────────────────────────────────────┤
│ packages/core                            SKELETON ('@onething/core') │
│  engine, events, session, permission, tools, storage. Zero deps.     │
└──────────────────────────────────────────────────────────────────────┘
```

Dependency direction is one-way: product ← assembly ← hosts. Product code never imports `@onething/app`.

### Monorepo Layout

```
packages/core/               # Bottom layer, zero deps. No src/ — files at package root:
                             # agent-loop/ (provider-agnostic loop), engine/ (CoreStreamEngine,
                             # HeadlessStreamEngine), events/, session/ (+storage/jsonl),
                             # permission/, tools/, plugins/, mcp/, storage/ primitives.
packages/onething-runtime/   # src/ = the product (prompts, memory, sessions, agent-loop
                             # providers, tools, themes, voice, music, …). Electron-free.
                             # src/app/ = assembly layer: createOnethingBackend + all
                             # migrated main-process glue ('@onething/app').
packages/gateway/            # WeChat/Telegram channel gateway. Depends on core only.
                             # Remote permission approval (reply 1/2/3), markdown-safe streaming.
packages/shared/             # Shared IPC/event contracts + defaults ('@shared'). Also
                             # backend/ (store-lock for CLI), cli/, defaults/, types/, voice/.
packages/renderer/           # Shared Vue 3 renderer UI ('@' / '@renderer'), consumed by
                             # the Electron renderer build and apps/web.
apps/electron/               # Electron host. src/main ('@main') = ipc/bridges/cli only;
                             # the rest of src/* (window, app, voice, menu, search, …) is
                             # the '@onething/electron-host/*' alias family.
apps/server/                 # Headless host running the REAL StreamEngine in-process via
                             # createOnethingBackend (HTTP + SSE, ONETHING_SERVER_PORT=8787).
apps/web/                    # Browser build of packages/renderer; talks to apps/server /api.
```

### createOnethingBackend — the single assembly recipe

`packages/onething-runtime/src/app/backend.ts`. Every host boots through this function; ordering constraints (variables before tools, engine before Permission) live here and nowhere else. **Importing `@onething/app` modules performs no configuration** — enforced by `packages/onething-runtime/src/app/__tests__/import-side-effect-free.test.ts`.

Options (`OnethingBackendOptions`):

- `sandboxHost?: { getPath?(name) }` — downloads/home surface
- `toolRegistry?: 'full' | 'headless' | 'readonly'` — full = every builtin (desktop), headless = reduced set (default when omitted), readonly = zero-local-side-effect tools (server degradation)
- `promptVersion?` — stamp eval traces with live minimal-scene prompt output
- `sessionSkills?`, `mcpAcp?` — opt-in subsystems (hosts may instead init MCP/ACP post-window)
- `sender?: BindableStreamSender` — `engine.bind(sender)`; EventBus-observing hosts pass a noop (the engine drops commands silently with no sender bound)
- `hooks?: { afterSettings, afterEngine, afterTools }` — host-specific steps injected into the sequence

Boot order: `configureAppRuntimeAdapters()` (idempotent) → stores → settings → afterSettings → event system → session layer → StreamEngine → triggers → afterEngine → `Permission.initialize` → variable system → goal breakers → project dirs → tool registry by tier → afterTools → optional sessionSkills / MCP+ACP / bind. Returns `{ engine, eventBus, streamChannel, shutdown() }`.

Host call sites:

| Host | Call site | Config |
| --- | --- | --- |
| Electron desktop | `apps/electron/src/app/main-process.ts` | `toolRegistry: 'full'`, `promptVersion: true`, hooks: shortcuts+proxy / `initializeIPC()`+todo watcher; engine binds to window later via `getStreamEngine().bind(webContents)` |
| Headless server | `apps/server/src/runtime.ts` (`createRealServerBackend`) | `toolRegistry: ONETHING_SERVER_TOOLS === 'readonly' ? 'readonly' : 'full'` (desktop parity by default), `sessionSkills: true`, noop sender (SSE observes the bus directly) |
| CLI daemon | `packages/onething-runtime/src/app/headless/backend.ts` (`HeadlessBackend`, used by `apps/electron/src/main/cli/daemon-server.ts`) | `toolRegistry: 'headless'`, `sessionSkills: true`, `mcpAcp: true`, noop sender |

Note: `backend.ts` carries static `import './tools/builtin/{index,headless,readonly}.js'` edges purely so single-file bundlers order the tool barrels before the factory's top-level await (the registry itself dynamic-imports them for test mocks). Do not remove them.

**Host injection ports** (`configure*Host`, all in `src/app`, late-bound and consulted per call — how hosts contribute Electron-only surfaces without the assembly layer importing electron):

| Port | File |
| --- | --- |
| `configureStorePathHost` | `app/stores/paths.ts` |
| `configureSandboxHost` | `app/tools/core/sandbox.ts` |
| `configureAuthHost` | `app/auth/host-ports.ts` |
| `configureVoiceHost` | `app/voice/host-ports.ts` |
| `configureAppLoggingHost` | `app/logging/index.ts` |
| `configureSkillsEnvironmentHost` | `app/skills/loader.ts` |
| `configureTodoPlanHost` | `app/todo-plan/store.ts` |

### Guardrails

- `bun run boundary` — `scripts/headless-boundary-check.ts`, the heavy static checker. Key rule sets: core bans electron/`shared/ipc`/better-sqlite3/mcp+acp SDKs/zod/diff/uuid; runtime outside `src/app` bans electron **and** `@shared/ipc`; `src/app` gets a relaxed set — `@shared/ipc` allowed, but electron, `@onething/electron-host`, `@main/`, `@preload/` banned (hosts inject via configure*Host ports).
- `bun run boundary:gate` — `scripts/boundary-gate.mjs` ratchet: diffs `[boundary] failed:` lines against `docs/audit/boundary-baseline-2026-07-25.txt` (28 known legacy reds). Exits 1 only on NEW failures; prints healed ones so the baseline can be re-tightened.
- UI 组件与样式规则见 `docs/design/ui-system.md`(浮层决策树、交互态配方、z-index 层级表、禁令清单),新代码须过 `bun run ui:gate` — `scripts/ui-gate.mjs` ratchet over `scripts/ui-style-check.mjs`'s 10 line-level rules (z-literal / z-fallback / raw-teleport / native-select / native-confirm / title-attr / ui-hex-fallback / transition-literal / shadow-literal-floating / focus-bare), baseline `docs/audit/ui-baseline-2026-08-06.txt` (P5 收官后 70 条,全部为逐条确认过的语义保留)。`bun run ui:check` prints the full list.
- `packages/core/__tests__/architecture-boundaries.test.ts`: core has no electron/host imports and sits at the bottom (no `@onething/runtime`/`@onething/gateway`); runtime is Electron/host/gateway-free; **the runtime product layer must not import `@onething/app`** (dependency points one way: product ← assembly); gateway depends on core only; renderer never touches `window.electronAPI` outside `packages/renderer/platform/`; apps/web and apps/server are Electron-free.

Notes:

- Session persistence is file-based: new sessions use per-session JSONL dirs
  (`sessions/<id>/meta.json` + `messages.jsonl`, append/suffix writes during streaming);
  legacy whole-file `sessions/<id>.json` is still readable and lazily migrated
  (originals kept in `sessions/legacy-backup/`). Toggle via
  `settings.storage.sessionFormat` ('jsonl' default | 'legacy-json' to roll back).
  Hybrid driver: `packages/onething-runtime/src/sessions/storage-driver.ts`; pure jsonl
  codec/pager in `packages/core/session/storage/jsonl/`. See
  `docs/design/session-storage-jsonl.md`; conversion: `scripts/convert-sessions.mjs`.
  Cross-session search/indexing belongs in apps/server — do not add a database to the
  Electron main process.
- Memory is plain markdown (SOUL/USER/MEMORY.md + daily notes) owned by the soul-memory
  plugin; the Electron memory panel talks to it in-process (no server dependency).
  apps/server exposes the same `/api/memory/*` endpoints via the shared
  `createOnethingMemoryIpcHandlers` factory in `packages/onething-runtime/src/memory/ipc.ts`.
- Plugin system (R0–R7 complete, 2026-08-07). The plugin's entire power is the injected
  `api` object. Current surface:
  - **AI capabilities**: tools, slash commands, events (+ plugin-namespaced custom events),
    prompt-context providers, skill roots, lifecycle hooks, scheduler.
  - **Its own product surface**: declarative workspace panels (`contributes.panels` +
    `api.registerWorkspacePanel`, pure-data description tree — the UI never executes
    plugin code), its own settings schema (`contributes.settings.schema`, JSON Schema
    subset, host renders and validates it), a unified request channel
    (`api.registerRequestHandler`; requestId is in use, while abort/progress are wired
    end-to-end but have no consumer yet — no renderer caller, no built-in producer), a
    per-plugin data directory
    (`api.storage`) plus the legacy KV store, in-stream status lines (`api.status`), and
    `ui.notify`.
  - **One opened host registry**: `api.registerIMConnector` (pilot; ids are namespaced
    `plugin:<id>:<name>`). **No production traffic flows through it yet** — no built-in
    plugin registers a connector and inbound is not wired, so the pilot validates the
    contract and teardown semantics, not the delivery path. Which registries are
    deliberately *not* open, and why, is in `PLUGIN_DEFERRED_REGISTRIES`
    (`packages/core/plugins/policy.ts`) — read it before opening another.
  - **Isolation**: timeout budgets, per-`pluginId+scope` failure breaker, and a severity
    policy table (`policy.ts`) deciding disable-plugin vs degrade-one-surface. Teardown is
    two-sided (code registries + data footprint) and guarded by a CI teardown test.
  - **Plugins execute on the Electron desktop host only** (plan A). Two caveats the
    earlier wording got wrong: apps/server is *not* a read-only mirror — its
    `/api/plugins/{enable,disable,refresh}` routes do write enable-flags to disk, and it
    scans a different tree (`owners/<uid>/<wid>/plugin-store/plugins`, not
    `<store>/plugins`), so toggling there changes a catalog the desktop never reads. The
    CLI daemon does not assemble the plugin system at all (it is not "UI-less" — it has
    no plugins).
  Design doc: `docs/design/plugin-system-redesign-2026-08.md` (§5.x carries the per-phase
  rulings and errata; §6 the multi-host decision).
  `docs/design/plugin-system-capabilities-and-evolution.md` is the pre-R0 survey — useful
  for history, superseded for current capabilities.
- apps/server is single-user: one server process assembles one backend and pins
  `ONETHING_STORE_PATH` before boot. Bearer auth via `ONETHING_SERVER_TOKEN` (warns when
  binding non-loopback without it). Tools ship with desktop parity by default;
  `ONETHING_SERVER_TOOLS=readonly` degrades to zero-side-effect tools (read/time/web only).
  The server's HTTP session store is backed by the same `@onething/app` store the engine
  uses in-process — a second repository over the same files would fork the in-memory truth.
- Store isolation: the store root resolves `ONETHING_STORE_PATH` → `~/.onething`
  (`packages/onething-runtime/src/storage/paths.ts`). All app-layer paths must resolve
  through `getOnethingStorePath()` / its `getOnething*Path` helpers — never hardcode.
  Single-instance safety via `StoreLock` (`acquire('desktop')` / `'daemon'` / `'server'`).
- Permission channel affinity gotcha: a permission ask records
  `targetChannel = engine.getChannel(sessionId)` (default `'ipc'`), and core rejects a
  respond whose channel doesn't match. When answering from another transport, adopt the
  ask's targetChannel (the server HTTP respond does this — owner is already authenticated
  at the HTTP boundary; affinity guards against cross-channel spoofing on the bus).
- Renderer code accesses the host through `platformApi` (`packages/renderer/platform/`),
  never `window.electronAPI` directly. `platformApi` resolves per access: electronAPI
  present → Electron bridge, else the web implementation over `fetch('/api/…')` + SSE.
- System prompt assembly is a single "directory at top, copy below" builder in
  `packages/onething-runtime/src/prompts/builder.ts`.

### Three-Process Model (Electron host)

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (Vue 3 + Pinia)                               │
│  packages/renderer/                                             │
│  - UI components, stores, composables                           │
│  - Calls platformApi.* (wraps electronAPI) for IPC              │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Electron IPC
┌─────────────────────┴───────────────────────────────────────────┐
│  Preload Script                                                 │
│  apps/electron/src/preload.ts → preload/bridge.ts               │
│  - installOnethingPreloadBridge(): contextBridge exposes        │
│    electronAPI (create-api.ts only generates router wrappers)   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│  Main Process (Node.js)                                         │
│  apps/electron/src/main/ ('@main': ipc/ bridges/ cli/ only)     │
│  - boots createOnethingBackend (engine/events live in           │
│    packages/onething-runtime/src/app/)                          │
│  - IPCBridge: single unified IPC exit point                     │
└─────────────────────────────────────────────────────────────────┘
```

Desktop boot: `apps/electron/src/main.ts` → `startOnethingElectronMain()` in `apps/electron/src/app/main-process.ts` — wires configure*Host ports, acquires the desktop `StoreLock`, calls `createOnethingBackend`, then post-window services (plugins, scheduler, MCP, ACP, gateway, skills) non-blocking.

### Key Data Flows

**Chat Message Flow (both transports, same engine):**

```
renderer chatStore → platformApi.emitCommand(sessionId, { type: 'command:send-message', … })
  desktop: preload bridge → ipcRenderer.invoke('session:command')
           → apps/electron/src/main/ipc/handlers.ts → emitCoreSessionCommandForIpc
  web:     POST /api/sessions/:id/commands → server forwards the command WHOLE
           (only command:abort is handled locally; no field is destructured away)
→ EventBus (packages/onething-runtime/src/app/events/, per-session ring buffers)
→ StreamEngine.handleSendMessage (packages/onething-runtime/src/app/engine/stream-engine.ts)
  → persist messages → emit events + stream chunks
→ desktop: IPCBridge → 'session:event' / 'session:stream' to WebContents
  web:     GET /api/events SSE (same event names; ?after= replays from ring buffers)
```

Both fan-outs share **`SessionStreamCoalescer`** (`packages/onething-runtime/src/app/events/stream-coalescer.ts`): text/reasoning/tool-input deltas batched on a 16ms ordered buffer, active stream's `messageId` stamped onto every chunk, and pending deltas flushed before any session event goes out. Consumers: `apps/electron/src/main/bridges/ipc-bridge.ts` and `apps/server/src/http.ts` (per-SSE-connection instance).

**Tool Call + Permission Flow:**

```
AI tool_call → tool executor → core Permission.ask
  → targetChannel = channelResolver(sessionId) (wired to engine.getChannel; default 'ipc')
  → 'permission:request' event (carries targetChannel) → IPCBridge / SSE → UI
  → respond: 'command:permission-respond' — core enforces channel affinity
    (response channel must equal the ask's targetChannel)
  → tool executes → result back to AI → continue generation
```

`Permission.getPendingPrompts(sessionId)` (core) is the source of truth for pending asks on both desktop IPC and server HTTP (incl. actionable/queued promptState). On the real engine the server skips local grant persistence — core `Permission.respond()` persists itself.

### IPC Communication Pattern

1. **Channel definitions**: `packages/shared/ipc/channels.ts` — all channel constants (incl. the unified `SESSION_COMMAND: 'session:command'`)
2. **Type definitions**: `packages/shared/ipc/*.ts` — request/response types per domain
3. **Event/Command types**: `packages/shared/events/*.ts` — stream lifecycle types
4. **Main handlers**: `apps/electron/src/main/ipc/*.ts` — one handler file per domain + `handlers.ts` (`initializeIPC()`)
5. **Preload bridge**: `apps/electron/src/preload.ts` → `preload/bridge.ts` (`installOnethingPreloadBridge`, exposes typed `window.electronAPI`; `preload/create-api.ts` only generates invoke wrappers from `@onething/core/ipc` domain routers)

To add a new IPC channel:

1. Add channel name to `packages/shared/ipc/channels.ts`
2. Add types in corresponding `packages/shared/ipc/[domain].ts`
3. Implement handler in `apps/electron/src/main/ipc/[domain].ts`
4. Expose API in `apps/electron/src/preload/bridge.ts`
5. For web parity, implement the same surface over `/api` in `packages/renderer/platform/web.ts`

Note: `apps/electron/src/ipc/*` is a second, portable tree (`register*IpcHandler` factories + channel-shape interfaces) consumed by the `@main` handlers — don't confuse the two.

### Alias Registry

`onething.aliases.ts` (repo root) is the **single source of truth** for all `@onething/*` resolution, consumed by all four build/test configs: `electron.vite.config.ts`, `vitest.config.ts`, `apps/web/vite.config.ts`, `apps/server/vite.config.ts`. Families: `@onething/app` (ONE prefix entry — do not add per-file entries), `@onething/core` + explicit subpaths, `@onething/gateway`, `@onething/runtime` (~110 explicit subpaths), `@onething/electron-host/*` (per-file entries → `apps/electron/src/<domain>/<file>.ts`). `@shared`/`@main`/`@renderer`/`@`/`@preload` are declared per-config, not here. Package.json "exports" maps are dead (no npm workspaces).

**Adding a new runtime subpath:**

1. Add the entry in `onething.aliases.ts`, keeping longer prefixes above shorter siblings (string finds are prefix matchers, first match wins). That single edit propagates to all four configs.
2. tsconfig wildcards (`@onething/runtime/*` etc. in `tsconfig.json`) already accept any subpath — no tsconfig edit for a subpath. Only a brand-new top-level family needs a `paths` entry in `tsconfig.json` (and `tsconfig.web.json` if renderer-visible — it redeclares its own paths and has no `@onething/app`).

Failure mode: a missing aliases entry fails only at build/run time, never at typecheck (the wildcards accept everything).

### Directory Structure

```
packages/core/                 # no src/ — files at the package root
│   ├── agent-loop/            # provider-agnostic loop: runner, stream, retry, scheduler
│   ├── engine/                # CoreStreamEngine, HeadlessStreamEngine, context-compact, history
│   ├── events/                # event-bus, ring-buffer, stream-channel, stream-chunks
│   ├── session/               # Session class, manager, state, storage/ (jsonl codec+pager)
│   ├── permission/            # capability-registry, permission-grants, permission-policy
│   ├── tools/                 # registry, executor, tool-loop, policy, diff-hunks
│   ├── plugins/  mcp/  context/  storage/  providers/ (types)  http/
│   └── gateway-runtime.ts  runtime-facade.ts  slash-commands.ts
│
packages/onething-runtime/src/ # PRODUCT layer ('@onething/runtime')
│   ├── prompts/               # system prompt builder + content/*.md
│   ├── sessions/              # session-repository, storage-driver (jsonl/legacy hybrid)
│   ├── agent-loop/providers/  # hand-rolled fetch/SSE providers (claude/codex/deepseek/
│   │                          # gemini/openai-compatible/acp) + factory + thinking-options
│   ├── memory/  media/  scheduler/  agents/  auth/  settings/  storage/ (paths, store-lock)
│   ├── tools/  skills/  plugins/  providers/  themes/  variables/  goals/  voice/  music/
│   ├── mcp/  acp/  external-agents/  files/  search/  usage/  evals/  headless/  …
│   └── stream-engine.ts       # OnethingStreamEngine over CoreStreamEngine
│
packages/onething-runtime/src/app/  # ASSEMBLY layer ('@onething/app'; @shared allowed)
│   ├── backend.ts             # createOnethingBackend — the single assembly recipe
│   ├── engine/                # StreamEngine (extends OnethingStreamEngine) + stream/
│   │   ├── stream/            # stream-executor, stream-processor, tool-execution(+scheduler,
│   │   │                      # +order), tool-orchestrator, agent-loop-*, message-helpers,
│   │   │                      # provider-helpers, resume-history, image-generation/stream
│   │   ├── prompt/            # prompt building & management
│   │   └── triggers/          # post-chat triggers
│   ├── events/                # event-bus, stream-channel, ring-buffer, stream-coalescer
│   ├── stores/                # sessions (repository wiring), settings cache, app-state, paths
│   ├── tools/                 # registry + builtin/ barrels + core/ (sandbox, bash-executor)
│   ├── providers/  permission/  mcp/  acp/  skills/  plugins/  variables/  goals/
│   ├── memory/  media/  music/  voice/  search/  scheduler/  agents/  external-agents/
│   ├── channel/               # gateway identity, session-router, outbound dispatch
│   ├── headless/backend.ts    # HeadlessBackend for the CLI daemon
│   └── logging/  auth/  session/  usage/  toc/  todo-plan/  practice/  …
│
apps/electron/src/
│   ├── main/                  # '@main' — ONLY: ipc/ (per-domain handlers + handlers.ts),
│   │                          # bridges/ (ipc-bridge), cli/ (daemon), __tests__/
│   ├── app/                   # boot: main-process.ts, ready.ts, bootstrap.ts, …
│   ├── window/                # main/settings/search/todo-plan windows, macos-panel, state
│   ├── preload.ts + preload/  # bridge.ts (electronAPI factory) + create-api.ts (routers)
│   ├── ipc/                   # portable typed host surface (register*IpcHandler factories)
│   └── voice/ music/ menu/ search/ gateway/ auth/ shell/ …   # '@onething/electron-host/*'
│
apps/server/src/               # http.ts (routes/SSE), runtime.ts (createRealServerBackend,
│                              # session/settings/permission facades), main.ts, mcp-client.ts
apps/web/                      # package.json + vite.config.ts only (builds packages/renderer)
│
packages/renderer/             # Vue 3 frontend ('@' / '@renderer')
│   ├── stores/                # Pinia (workspace, chat, sessions, settings, themes, media, …)
│   ├── components/ composables/ services/ (ipc-hub) editor/ types/
│   └── platform/              # platformApi: electron.ts + web.ts (fetch/SSE) + index.ts proxy
│
packages/shared/               # '@shared'
│   ├── ipc/                   # channels.ts + ~30 domain type files + router.ts
│   ├── events/                # session-commands, session-events, stream-chunks, envelope
│   └── backend/ (store-lock)  cli/  defaults/  types/  voice/
```

### Key Systems

**StreamEngine** (`packages/onething-runtime/src/app/engine/stream-engine.ts`): Single owner of active stream lifecycle. Commands arrive via EventBus → engine handlers → persist → emit events → IPCBridge (desktop) or SSE (server). Handles send-message, edit-and-resend, retry-message, resume-after-confirm, steering, compact.

**EventBus** (`packages/onething-runtime/src/app/events/`): Central pub/sub with per-session ring buffers, sequence counters, typed and wildcard handlers; primitives in `packages/core/events/`.

**Providers**: registry wiring in `packages/onething-runtime/src/app/providers/`; the hand-rolled fetch/SSE implementations live in `packages/onething-runtime/src/agent-loop/providers/` (Vercel AI SDK was removed). New providers implement `ProviderDefinition`.

**Tools**: registry + builtins in `packages/onething-runtime/src/app/tools/` (three tiers: full/headless/readonly); tool core (executor, policy, permission-guards) in `packages/core/tools/`.

**Permission**: core `Permission` in `packages/core/permission/` (channel-affinity enforcement); app wiring in `packages/onething-runtime/src/app/permission/`.

**MCP / ACP / Skills / Themes**: app wiring under `packages/onething-runtime/src/app/{mcp,acp,skills,themes}/`, product logic under `packages/onething-runtime/src/`.

**CLI daemon**: `bin/onething.mjs` → `out/main/cli.js` (built from `apps/electron/src/main/cli/index.ts`). NDJSON RPC over a unix socket at `<store>/run/daemon.sock`; `StoreLock.acquire('daemon')`; assembles via `HeadlessBackend`.

### State Management

- **Backend**: app-layer stores in `packages/onething-runtime/src/app/stores/` (sessions repository with LRU + 300ms throttled async saves, settings cache with sync hot path, app-state)
- **Renderer**: Pinia stores in `packages/renderer/stores/`
- **Cross-process sync**: EventBus → IPCBridge/SSE events + explicit IPC/HTTP fetch calls

### Build Output

```
out/                   # electron-vite output (packaged by electron-builder → release/)
├── main/index.js      # main process
├── main/cli.js        # CLI daemon entry (bin/onething.mjs imports this)
├── preload/index.js   # bundled preload (CommonJS)
└── renderer/          # Vite SPA output

dist/
├── server/main.js     # apps/server single-file SSR bundle (inlineDynamicImports —
│                      # chunk-split + top-level await deadlocks module evaluation)
└── web/               # apps/web browser build
```

### Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Desktop | Electron |
| Frontend | Vue 3 + TypeScript + Pinia |
| AI SDK | Hand-rolled fetch/SSE per provider (`packages/onething-runtime/src/agent-loop/providers/`) |
| Storage | File-based (JSON + per-session JSONL) |
| Build | electron-vite (Vite renderer + Vite main + esbuild preload); vite SSR for apps/server |
| Test | Vitest |
| Virtual Scroll | Hand-rolled, tables only (`packages/renderer/components/common/virtual-table/useVirtualAxis.ts`). The message list is NOT virtualized — it is a plain `v-for` inside `Scrollbar`. |
