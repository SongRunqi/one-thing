# Event-Driven Interaction System Design

> Status: Draft | Date: 2026-03-16

---

## Table of Contents

1. [Motivation](#motivation)
2. [Core Principles](#core-principles)
3. [Event vs Stream Separation](#event-vs-stream-separation)
4. [Architecture](#architecture)
5. [Event Inventory](#event-inventory)
6. [Core Components](#core-components)
7. [Session: The State Owner](#session-the-state-owner)
8. [Lifecycle & Durability](#lifecycle--durability)
9. [Plugin System](#plugin-system)
10. [Renderer Integration](#renderer-integration)
11. [Key Flows](#key-flows)
12. [External Integration (Bridge Pattern)](#external-integration-bridge-pattern)
13. [Settings & Naming (No More "Cache")](#settings--naming-no-more-cache)
14. [AI-Driven Configuration (Skills + File Watcher)](#ai-driven-configuration-skills--file-watcher)
15. [Migration Strategy](#migration-strategy)
16. [File Structure](#file-structure)
17. [Open Questions](#open-questions)

---

## Motivation

Current architecture has tight coupling between `WebContents.sender` and the streaming pipeline:

1. **Sender fragility** — If BrowserWindow closes mid-stream, `sender.send()` silently fails. No recovery.
2. **Race conditions** — Concurrent streams overwrite `activeStreams[sessionId]`. Resume after tool confirmation reconstructs state from store (fragile).
3. **Two-phase inconsistency** — `store.update()` then `sender.send()` has no atomicity. Store changed but IPC may fail.
4. **Global listeners** — Renderer listens to ALL events, manually filters by sessionId.
5. **No replay** — If renderer reconnects (window reload), all in-flight state is lost.
6. **Plugin unfriendly** — The current hook system is separate from the core data flow. Plugins can't observe, intercept, or trigger the same actions that internal components can.
7. **Store writes scattered** — `store.update()` calls are spread across 6+ files (tool-loop, stream-processor, tool-execution, etc.). No single place to understand state transitions.

---

## Core Principles

### 1. Everything is an event

User actions (send message, abort, permission respond) are command events. AI responses, tool calls, and state changes are session events. There is no imperative API — only events flowing through the bus.

### 2. Events and Streams are separate

**Events** represent meaningful state changes. They are logged, replayable, and interceptable.

**Streams** are high-frequency ephemeral data (text deltas). They are not logged, not replayable, and not interceptable.

### 3. Plugins are first-class citizens

Plugins subscribe to EventBus directly with the same API as internal components. No separate hook system.

### 4. Session owns its state

Each Session is a self-contained state machine. It subscribes to its own events, applies them to its own state, and decides when to persist to disk. There is no external "store projection" layer — the Session IS the projection.

---

## Event vs Stream Separation

| | Events | Streams |
|---|---|---|
| **Nature** | "Something happened" | "Data is being transmitted" |
| **Example** | `tool:call`, `stream:complete` | `text-delta`, `reasoning-delta` |
| **Frequency** | Low (tens per conversation) | High (hundreds per response) |
| **Log** | Written to ring buffer | Not logged |
| **Replay** | Yes — for reconnect/recovery | No — use Session state for recovery |
| **Intercept** | Yes — plugins can modify/abort | No — no meaningful use case |
| **Lifetime** | Permanent within ring buffer | Gone after delivery |

### The video streaming analogy

- **Stream chunks = video frames** — real-time transmission, not stored individually
- **`stream:complete` = keyframe** — stored in event log, self-contained, can recover from here
- **Session state = frame buffer** — accumulates frames in real-time, readable at any point

---

## Architecture

```
┌─ Main Process ──────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─ EventBus ──────────────────┐    ┌─ StreamChannel ────────────┐  │
│  │  Session + Global events     │    │  text-delta                │  │
│  │  Ring buffer (event log)     │    │  reasoning-delta           │  │
│  │  Intercept → Commit → Fan out│    │  tool-input-delta          │  │
│  └──────────┬───────────────────┘    └──────────┬─────────────────┘  │
│             │                                    │                    │
│    ┌────────┼────────────────────────────────────┼──────────┐        │
│    │        ↓                                    ↓          │        │
│    │  ┌─ Session ────────────────────────────────────────┐  │        │
│    │  │                                                   │  │        │
│    │  │  applyEvent(env)    ← EventBus                   │  │        │
│    │  │  applyChunk(chunk)  ← StreamChannel              │  │        │
│    │  │                                                   │  │        │
│    │  │  state: SessionState    (in-memory, always fresh) │  │        │
│    │  │  persist()              (to disk, on complete)    │  │        │
│    │  │  checkpoint()           (to disk, every 5s dirty) │  │        │
│    │  │                                                   │  │        │
│    │  └───────────────────────────────────────────────────┘  │        │
│    │                                                         │        │
│    │  SessionManager: Map<sessionId, Session>                │        │
│    │    getOrCreate() / evict() / flushAll()                 │        │
│    └─────────────────────────────────────────────────────────┘        │
│                                                                      │
│    ┌─ StreamEngine ────────────┐    ┌─ IPCBridge ──────────────┐    │
│    │  subscribes: command:*     │    │  subscribes: all events  │    │
│    │  emits: session events     │    │  subscribes: all chunks  │    │
│    │  pushes: stream chunks     │    │  → sender.send()         │    │
│    │  owns: AbortControllers    │    │  → coalesces text-delta  │    │
│    │  owns: pending permissions │    │  → auto-cleanup on       │    │
│    └────────────────────────────┘    │    window destroyed      │    │
│                                      └──────────────────────────┘    │
│    ┌─ Plugins ─────────────────┐                                    │
│    │  subscribe/intercept events│                                    │
│    │  optionally subscribe stream│                                   │
│    │  can emit events + commands│                                    │
│    └────────────────────────────┘                                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Roles

| Component | Identity | Subscribes to | Produces |
|-----------|----------|---------------|----------|
| **Session** | State owner | EventBus (all own events) + StreamChannel (own chunks) | Nothing (consumer only) |
| **StreamEngine** | Streaming pipeline | EventBus (command:\*) | Events + Chunks |
| **IPCBridge** | Renderer proxy | EventBus (all) + StreamChannel (all) | IPC messages |
| **Plugin** | Extension | EventBus (selective) + StreamChannel (optional) | Events + Commands |
| **EventBus** | Event router | — | — |
| **StreamChannel** | Chunk router | — | — |
| **SessionManager** | Lifecycle manager | EventBus (stream:start for auto-vivify) | — |

---

## Event Inventory

### What is core vs what is a plugin?

**Core event**: without it the system cannot send messages, call tools, or display results.

**Plugin**: without it the system still works, just with less capability.

| Capability | Core or Plugin | Reason |
|-----------|---------------|--------|
| Stream lifecycle | Core | Without it, no AI response |
| Tool calls | Core | Without it, no tool execution |
| Permission | Core | Without it, dangerous tools run unchecked |
| Messages | Core | Without it, no conversation |
| Commands (abort, send) | Core | Without it, user can't interact |
| **Memory** | **Plugin** | Disable it, conversations still work (just no context) |
| **Context Compacting** | **Plugin** | Disable it, conversations still work (until context overflow) |
| **Agent Memory** | **Plugin** | Disable it, agents still work (just stateless) |

### Session Events (21 types, logged, interceptable)

**Stream lifecycle:**
```
stream:start                   messageId, model
stream:params-resolving        messageId, params (THE core extension point — plugins intercept here)
stream:complete                messageId, content, reasoning?, usage?
stream:error                   messageId, error, details?
stream:aborted                 messageId, reason?
```

**Tool lifecycle:**
```
tool:input-start               toolCallId, toolName
tool:call                      toolCallId, toolName, args (interceptable)
tool:executing                 toolCallId, title
tool:metadata                  toolCallId, metadata
tool:result                    toolCallId, result
tool:error                     toolCallId, error
```

**Permission:**
```
permission:request             requestId, toolCallId, permissionType, metadata, timeoutMs
permission:timeout             requestId
```

**Steps (UI tracking):**
```
step:added                     step
step:updated                   stepId, updates
```

**Content structure:**
```
content:part                   messageId, part
content:continuation           messageId, turnIndex
```

**Message lifecycle:**
```
message:user-created           message
message:assistant-created      message
message:updated                messageId, updates
```

**Session:**
```
session:renamed                name
```

> Note: `memory:*` and `session:compacting` are NOT core events. Memory and context compacting
> are plugins that use `stream:params-resolving` (intercept) and `stream:complete` (observe).
> Plugins can emit their own events under the `plugin:` namespace (e.g. `plugin:memory:updated`).

### Command Events (4 types, logged, interceptable)

```
command:send-message           content, attachments?
command:edit-and-resend        messageId, content
command:abort                  reason?
command:permission-respond     requestId, decision
```

> Note: `subscribe` and `unsubscribe` are IPC management operations handled by
> `SessionManager.handleCommand()`, NOT event types. They don't flow through EventBus
> because they are about the subscription itself, not session state.

### Stream Chunks (3 types, NOT logged, NOT interceptable)

```
text-delta                     messageId, delta
reasoning-delta                messageId, delta
tool-input-delta               toolCallId, delta
```

### Global Events (11 types)

```
app:initialized
app:quitting
settings:changed               changedKeys[]
session:created                sessionId, name, agentId?
session:switched               fromSessionId?, toSessionId
session:deleted                sessionId
mcp:server-connected           serverId
mcp:server-disconnected        serverId, error?
mcp:server-error               serverId, error
plugin:loaded                  pluginId
plugin:error                   pluginId, error
plugins:refreshed              loaded[] (after scan + reload)
```

**Total: 21 session events + 4 commands + 3 chunks + 12 global = 40 core types**

Plugins can emit custom events under `plugin:{pluginId}:{eventName}` namespace.

---

## Core Components

### EventBus

```typescript
class EventBus {
  // === Session-scoped ===

  // Emit: intercept → commit to log → fan out to observers
  async emit(sessionId: string, event: SessionEvent | SessionCommand): Promise<EmitResult>

  // Observe: passive, fire-and-forget, errors isolated
  on(sessionId: string, eventType: string, handler: ObserveHandler): Unsubscribe
  onAny(sessionId: string, handler: ObserveHandler): Unsubscribe

  // Cross-session observe (e.g., SessionManager listens for all stream:start)
  onAnySession(eventType: string, handler: ObserveHandler): Unsubscribe

  // Intercept: runs BEFORE commit, can modify event or abort
  intercept(sessionId: string, eventType: string, handler: InterceptHandler): Unsubscribe

  // Replay: return logged events from sequence number
  replay(sessionId: string, fromSequence: number): SessionEventEnvelope[]

  // Lifecycle
  destroySession(sessionId: string): void

  // === Global ===

  async emitGlobal(event: GlobalEvent): Promise<EmitResult>
  onGlobal(eventType: string, handler: ObserveHandler): Unsubscribe
  interceptGlobal(eventType: string, handler: InterceptHandler): Unsubscribe
}
```

**Emit flow:**
```
emit(sessionId, event)
  │
  ├─ Phase 1: INTERCEPT (sequential, ordered by priority)
  │   Each interceptor can modify event or abort
  │   Timeout per interceptor: 5 seconds
  │   If aborted → return { aborted: true }, event never committed
  │
  ├─ Phase 2: COMMIT
  │   Assign monotonic sequence number
  │   Write to ring buffer (per-session event log)
  │
  └─ Phase 3: FAN OUT (parallel, errors isolated)
      Notify all observers
      Observer failure does not affect other observers
```

### StreamChannel

```typescript
class StreamChannel {
  push(sessionId: string, chunk: StreamChunk): void
  subscribe(sessionId: string, handler: (chunk: StreamChunk) => void): Unsubscribe
  destroySession(sessionId: string): void
}
```

No log. No intercept. Push and subscribe only.

### IPCBridge

One per BrowserWindow. Auto-cleans up on window destruction. Coalesces text deltas per animation frame.

```typescript
class IPCBridge {
  private sender: Electron.WebContents
  private unsubscribers: Unsubscribe[] = []

  constructor(sender: Electron.WebContents) {
    this.sender = sender
    sender.on('destroyed', () => this.dispose())
  }

  attachSession(sessionId: string): void {
    // Events: forward all
    this.unsubscribers.push(
      eventBus.onAny(sessionId, (envelope) => {
        if (!this.sender.isDestroyed()) {
          this.sender.send('session:event', envelope)
        }
      })
    )

    // Stream: coalesce text-delta per frame (16ms)
    let textBuffer = ''
    let currentMessageId = ''
    let flushTimer: NodeJS.Timeout | null = null

    this.unsubscribers.push(
      streamChannel.subscribe(sessionId, (chunk) => {
        if (this.sender.isDestroyed()) return

        if (chunk.type === 'text-delta') {
          textBuffer += chunk.delta
          currentMessageId = chunk.messageId
          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              this.sender.send('session:stream', {
                type: 'text-delta',
                messageId: currentMessageId,
                delta: textBuffer,
              })
              textBuffer = ''
              flushTimer = null
            }, 16)  // One animation frame
          }
        } else {
          // reasoning-delta, tool-input-delta: send immediately
          this.sender.send('session:stream', chunk)
        }
      })
    )
  }

  detachSession(sessionId: string): void {
    // Remove subscribers for this session (track per-session for selective detach)
  }

  dispose(): void {
    this.unsubscribers.forEach(u => u())
    this.unsubscribers = []
  }
}
```

### StreamEngine

Subscribes to `command:*` events. Drives the streaming pipeline. Owns AbortControllers and pending permissions.

```typescript
class StreamEngine {
  private controllers: Map<string, AbortController> = new Map()
  private activeMessageIds: Map<string, string> = new Map()
  private pendingPermissions: Map<string, { resolve: (d: PermissionDecision) => void }> = new Map()

  attach(sessionId: string): Unsubscribe {
    const unsubs = [
      eventBus.on(sessionId, 'command:send-message', (env) => this.handleSend(sessionId, env)),
      eventBus.on(sessionId, 'command:edit-and-resend', (env) => this.handleEditResend(sessionId, env)),
      eventBus.on(sessionId, 'command:abort', (env) => this.handleAbort(sessionId, env)),
      eventBus.on(sessionId, 'command:permission-respond', (env) => this.handlePermission(sessionId, env)),
    ]
    return () => {
      unsubs.forEach(u => u())
      this.controllers.get(sessionId)?.abort()
      this.controllers.delete(sessionId)
      this.activeMessageIds.delete(sessionId)
    }
  }

  private async handleSend(sessionId: string, env: SessionEventEnvelope): Promise<void> {
    const cmd = env.event as Extract<SessionCommand, { type: 'command:send-message' }>
    const controller = new AbortController()
    this.controllers.set(sessionId, controller)

    const userMsg = createUserMessage(cmd.content, cmd.attachments)
    await eventBus.emit(sessionId, { type: 'message:user-created', message: userMsg })

    const assistantMsg = createAssistantMessage(model)
    await eventBus.emit(sessionId, { type: 'message:assistant-created', message: assistantMsg })

    this.activeMessageIds.set(sessionId, assistantMsg.id)
    await this.runStream(sessionId, assistantMsg.id, controller.signal)
  }

  private async handleAbort(sessionId: string, env: SessionEventEnvelope): Promise<void> {
    const cmd = env.event as Extract<SessionCommand, { type: 'command:abort' }>
    const controller = this.controllers.get(sessionId)
    if (controller) {
      controller.abort()
      this.controllers.delete(sessionId)

      for (const [reqId, pending] of this.pendingPermissions) {
        pending.resolve('reject')
        this.pendingPermissions.delete(reqId)
      }

      await eventBus.emit(sessionId, {
        type: 'stream:aborted',
        messageId: this.activeMessageIds.get(sessionId) || '',
        reason: cmd.reason,
      })
      this.activeMessageIds.delete(sessionId)
    }
  }

  private async handlePermission(sessionId: string, env: SessionEventEnvelope): Promise<void> {
    const cmd = env.event as Extract<SessionCommand, { type: 'command:permission-respond' }>
    const pending = this.pendingPermissions.get(cmd.requestId)
    if (pending) {
      pending.resolve(cmd.decision)
      this.pendingPermissions.delete(cmd.requestId)
    }
  }

  private async runStream(sessionId: string, messageId: string, signal: AbortSignal): Promise<void> {
    // 1. Resolve params (THE extension point — plugins inject memory, compact, etc.)
    const baseParams = await this.buildBaseParams(sessionId, messageId)
    const paramsResult = await eventBus.emit(sessionId, {
      type: 'stream:params-resolving',
      messageId,
      params: baseParams,  // systemPrompt, messages, tools, temperature, etc.
    })
    // Params may have been modified by interceptors (MemoryPlugin, CompactingPlugin, etc.)
    const finalParams = paramsResult.aborted ? null : (paramsResult.envelope!.event as any).params
    if (!finalParams) return  // Aborted by plugin

    // 2. Register tools (plugins can add tools)
    const toolsResult = await eventBus.emit(sessionId, {
      type: 'tools:registering',
      builtinTools: finalParams.enabledTools,
      mcpTools: finalParams.mcpTools,
    })
    const registeredTools = (toolsResult.envelope!.event as any)

    // 3. Start stream
    await eventBus.emit(sessionId, { type: 'stream:start', messageId, model: finalParams.model })

    let fullContent = ''
    let fullReasoning = ''

    try {
      // 4. Multi-turn tool loop
      let currentTurn = 0
      const MAX_TURNS = 100
      let conversationMessages = finalParams.messages

      while (currentTurn < MAX_TURNS) {
        currentTurn++
        if (currentTurn > 1) {
          await eventBus.emit(sessionId, { type: 'content:continuation', messageId, turnIndex: currentTurn })
        }

        const stream = streamFromProvider({ ...finalParams, messages: conversationMessages })
        let turnContent = ''
        let turnToolCalls: ToolCallData[] = []

        for await (const chunk of stream) {
          if (signal.aborted) break

          switch (chunk.type) {
            case 'text-delta':
              fullContent += chunk.text
              turnContent += chunk.text
              streamChannel.push(sessionId, { type: 'text-delta', messageId, delta: chunk.text })
              break

            case 'reasoning-delta':
              fullReasoning += chunk.reasoning
              streamChannel.push(sessionId, { type: 'reasoning-delta', messageId, delta: chunk.reasoning })
              break

            case 'tool-call-streaming-start':
              await eventBus.emit(sessionId, { type: 'tool:input-start', toolCallId: chunk.toolCallId, toolName: chunk.toolName })
              break

            case 'tool-call-streaming-delta':
              streamChannel.push(sessionId, { type: 'tool-input-delta', toolCallId: chunk.toolCallId, delta: chunk.argsTextDelta })
              break

            case 'tool-call':
              const callResult = await eventBus.emit(sessionId, {
                type: 'tool:call',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
              })
              if (!callResult.aborted) {
                const toolResult = await this.executeTool(sessionId, chunk, signal)
                turnToolCalls.push({ ...chunk, result: toolResult })
              }
              break
          }
        }

        // No tool calls this turn → done
        if (turnToolCalls.length === 0) break

        // Build continuation: add assistant message + tool results to conversation
        conversationMessages = this.buildContinuation(conversationMessages, turnContent, turnToolCalls)
      }

      await eventBus.emit(sessionId, {
        type: 'stream:complete',
        messageId,
        content: fullContent,
        reasoning: fullReasoning || undefined,
        usage: stream.usage,
      })
    } catch (err) {
      await eventBus.emit(sessionId, {
        type: 'stream:error',
        messageId,
        error: err.message,
      })
    } finally {
      this.controllers.delete(sessionId)
      this.activeMessageIds.delete(sessionId)
    }
  }

  private async requestPermission(
    sessionId: string,
    toolCallId: string,
    metadata: PermissionMetadata,
  ): Promise<PermissionDecision> {
    const requestId = crypto.randomUUID()
    const timeoutMs = 60_000

    const result = await eventBus.emit(sessionId, {
      type: 'permission:request',
      requestId, toolCallId,
      permissionType: metadata.type,
      metadata, timeoutMs,
    })

    if (result.aborted) return 'once'  // Plugin intercepted (auto-approved)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(requestId)
        eventBus.emit(sessionId, { type: 'permission:timeout', requestId })
        resolve('reject')
      }, timeoutMs)

      this.pendingPermissions.set(requestId, {
        resolve: (decision) => {
          clearTimeout(timer)
          resolve(decision)
        },
      })
    })
  }

  getActiveSessions(): string[] {
    return [...this.controllers.keys()]
  }

  abortAll(): void {
    for (const [sessionId, controller] of this.controllers) {
      controller.abort()
    }
    this.controllers.clear()
    this.activeMessageIds.clear()
  }
}
```

---

## Session: The State Owner

Session is not just a data container — it is a self-contained state machine that subscribes to its own events, applies state transitions, and manages its own persistence.

### Why Session owns state (not a separate StoreProjection)

A "StoreProjection" subscriber that translates events into store operations is an unnecessary abstraction layer. The Session itself is the natural owner of its state:

- It knows its own state transitions
- It knows when to persist (on `stream:complete`, not on every delta)
- It manages its own dirty tracking and checkpointing
- It can be tested as a pure state machine: `applyEvent(state, event) → newState`

### Implementation

```typescript
class Session {
  id: string
  state: SessionState
  private dirty: boolean = false
  private checkpointTimer: NodeJS.Timeout | null = null
  private unsubscribers: Unsubscribe[] = []
  private _hasActiveStream: boolean = false

  constructor(id: string) {
    this.id = id
    this.state = createEmptySessionState(id)
  }

  // --- Lifecycle ---

  loadFromDisk(): void {
    const saved = sessionStore.load(this.id)
    if (saved) this.state = saved
  }

  attach(eventBus: EventBus, streamChannel: StreamChannel): void {
    this.unsubscribers = [
      eventBus.onAny(this.id, (env) => this.applyEvent(env)),
      streamChannel.subscribe(this.id, (chunk) => this.applyChunk(chunk)),
    ]
  }

  detach(): void {
    this.checkpoint()
    this.unsubscribers.forEach(u => u())
    this.unsubscribers = []
    if (this.checkpointTimer) {
      clearTimeout(this.checkpointTimer)
      this.checkpointTimer = null
    }
  }

  get hasActiveStream(): boolean { return this._hasActiveStream }

  get idleTime(): number {
    return Date.now() - (this.state.updatedAt || this.state.createdAt)
  }

  // --- Event → State (pure transitions) ---

  private applyEvent(envelope: SessionEventEnvelope): void {
    const event = envelope.event

    switch (event.type) {
      // Messages
      case 'message:user-created':
      case 'message:assistant-created':
        this.state.messages.push(event.message)
        this.markUpdated()
        break

      case 'message:updated':
        const msg = this.state.messages.find(m => m.id === event.messageId)
        if (msg) Object.assign(msg, event.updates)
        this.markUpdated()
        break

      // Stream lifecycle
      case 'stream:start':
        this._hasActiveStream = true
        this.startCheckpointTimer()
        break

      case 'stream:complete':
        this._hasActiveStream = false
        this.stopCheckpointTimer()
        // Final content from event is the source of truth
        const assistantMsg = this.state.messages.find(m => m.id === event.messageId)
        if (assistantMsg) {
          assistantMsg.content = event.content
          if (event.reasoning) assistantMsg.reasoning = event.reasoning
          assistantMsg.isStreaming = false
          assistantMsg.usage = event.usage
        }
        this.persist()  // Immediate persist on completion
        break

      case 'stream:error':
      case 'stream:aborted':
        this._hasActiveStream = false
        this.stopCheckpointTimer()
        const errorMsg = this.state.messages.find(m => m.id === event.messageId)
        if (errorMsg) {
          errorMsg.isStreaming = false
          errorMsg.status = event.type === 'stream:error' ? 'failed' : 'aborted'
          if (event.type === 'stream:error') errorMsg.error = event.error
        }
        this.persist()
        break

      // Tools
      case 'tool:call':
        this.addToolCall(event.toolCallId, event.toolName, event.args)
        break

      case 'tool:result':
        this.updateToolCallResult(event.toolCallId, event.result)
        break

      case 'tool:error':
        this.updateToolCallError(event.toolCallId, event.error)
        break

      // Steps
      case 'step:added':
        this.addStep(event.step)
        break

      case 'step:updated':
        this.updateStep(event.stepId, event.updates)
        break

      // Session
      case 'session:renamed':
        this.state.name = event.name
        this.persist()
        break
    }
  }

  // --- Chunk → Real-time accumulation (high frequency, memory only) ---

  private applyChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text-delta':
        this.appendContent(chunk.messageId, chunk.delta)
        this.markDirty()
        break

      case 'reasoning-delta':
        this.appendReasoning(chunk.messageId, chunk.delta)
        this.markDirty()
        break
    }
  }

  // --- Persistence ---

  private markUpdated(): void {
    this.state.updatedAt = Date.now()
  }

  private markDirty(): void {
    this.dirty = true
  }

  private startCheckpointTimer(): void {
    if (this.checkpointTimer) return
    this.checkpointTimer = setInterval(() => {
      this.checkpoint()
    }, 5_000)
  }

  private stopCheckpointTimer(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer)
      this.checkpointTimer = null
    }
    this.checkpoint()  // Final flush
  }

  checkpoint(): void {
    if (this.dirty) {
      this.persist()
      this.dirty = false
    }
  }

  persist(): void {
    this.markUpdated()
    sessionStore.save(this.id, this.state)
  }

  // --- State accessors (for renderer reconnect) ---

  getMessageContent(messageId: string): { content: string; reasoning?: string } | null {
    const msg = this.state.messages.find(m => m.id === messageId)
    if (!msg) return null
    return { content: msg.content, reasoning: msg.reasoning }
  }

  getCurrentStreamingMessageId(): string | null {
    const msg = this.state.messages.find(m => m.isStreaming)
    return msg?.id || null
  }
}
```

### SessionManager

Manages Session lifecycle: creation, lazy loading, eviction, and graceful shutdown.

```typescript
class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private streamEngine: StreamEngine

  constructor(
    private eventBus: EventBus,
    private streamChannel: StreamChannel,
  ) {
    this.streamEngine = new StreamEngine(eventBus, streamChannel)

    // SessionManager is the orchestrator: it ensures Session + StreamEngine
    // are attached BEFORE commands are delivered.
    //
    // IPC handler for 'session:command' calls sessionManager.handleCommand()
    // which vivifies everything before emitting the command event.
  }

  // Called by IPC handler BEFORE emitting command events.
  // Guarantees Session + StreamEngine are attached before the event flows.
  async handleCommand(sessionId: string, command: SessionCommand): Promise<EmitResult> {
    this.ensureAlive(sessionId)
    return this.eventBus.emit(sessionId, command)
  }

  getOrCreate(sessionId: string): Session {
    if (!this.sessions.has(sessionId)) {
      const session = new Session(sessionId)
      session.loadFromDisk()
      session.attach(this.eventBus, this.streamChannel)
      // Also attach StreamEngine to listen for commands on this session
      this.streamEngine.attach(sessionId)
      this.sessions.set(sessionId, session)
    }
    return this.sessions.get(sessionId)!
  }

  ensureAlive(sessionId: string): void {
    this.getOrCreate(sessionId)
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  // Graceful shutdown: flush all dirty sessions
  flushAll(): void {
    for (const session of this.sessions.values()) {
      session.checkpoint()
    }
  }

  // Mark interrupted messages on app quit
  markAllInterrupted(): void {
    for (const session of this.sessions.values()) {
      if (session.hasActiveStream) {
        const msgId = session.getCurrentStreamingMessageId()
        if (msgId) {
          const msg = session.state.messages.find(m => m.id === msgId)
          if (msg) {
            msg.isStreaming = false
            msg.status = 'interrupted'
          }
        }
        session.persist()
      }
    }
  }

  // LRU eviction for memory management
  // Sessions with active streams are NEVER evicted
  evict(): void {
    const TEN_MINUTES = 10 * 60 * 1000
    for (const [id, session] of this.sessions) {
      if (!session.hasActiveStream && session.idleTime > TEN_MINUTES) {
        session.detach()
        this.sessions.delete(id)
      }
    }
  }
}
```

---

## Lifecycle & Durability

### Persistence Model: Two Layers

```
┌─ Session State (In-Memory) ─────────────────────┐
│                                                   │
│  Updated by:                                      │
│    applyEvent() ← EventBus events                │
│    applyChunk() ← StreamChannel chunks           │
│                                                   │
│  Read by:                                         │
│    Renderer on reconnect (getMessageContent)     │
│    StreamEngine (conversation history)           │
│                                                   │
│  Always fresh. High frequency writes.            │
│                                                   │
└─────────────────┬─────────────────────────────────┘
                  │ persist triggers:
                  │   - stream:complete (immediate)
                  │   - stream:error (immediate)
                  │   - stream:aborted (immediate)
                  │   - session:renamed (immediate)
                  │   - checkpoint timer (every 5s, only if dirty)
                  │   - app before-quit (forced flush)
                  ↓
┌─ Session State (Disk) ──────────────────────────┐
│                                                   │
│  JSON file per session.                          │
│  Survives app restart.                           │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Component Lifecycle Matrix

```
                      Window open   Window close   App quit        App restart
                      ───────────   ────────────   ────────        ───────────
StreamEngine          running       continues      abortAll()      new instance
Session (in-memory)   alive         alive          flushAll()      loadFromDisk()
Session (disk)        checkpoint    checkpoint     forced flush    read
IPCBridge             alive         destroyed      destroyed       new instance
EventBus log          alive         alive          lost            empty
StreamChannel         alive         alive          stopped         empty
Plugins               alive         alive          cleanup()       re-init()
```

### Durability Guarantees

| Scenario | Content completeness | Recovery method |
|----------|---------------------|-----------------|
| Window close → reopen (stream active) | Complete | Session in-memory + StreamChannel resume |
| Window close → reopen (stream done) | Complete | Session in-memory or disk |
| Session switch → switch back (stream active) | Complete | Session in-memory + StreamChannel resume |
| App normal quit (stream active) | Complete | before-quit: flush + mark interrupted |
| App force quit (stream active) | At most 5s loss | Last checkpoint + interrupted status |
| App crash (SIGKILL) | At most 5s loss | Last checkpoint + interrupted status |
| App restart (stream was done) | Complete | Load from disk |

### App Quit Handler

```typescript
app.on('before-quit', async () => {
  // 1. Abort all active streams (triggers stream:aborted events)
  streamEngine.abortAll()

  // 2. Mark any remaining interrupted messages
  sessionManager.markAllInterrupted()

  // 3. Force flush all dirty sessions to disk
  sessionManager.flushAll()

  // 4. Shutdown plugins
  await pluginManager.cleanup()
})
```

### App Restart Recovery

```typescript
app.on('ready', async () => {
  // Find and handle interrupted messages from last session
  const allSessions = sessionStore.listAll()
  for (const sessionMeta of allSessions) {
    const state = sessionStore.load(sessionMeta.id)
    if (!state) continue

    for (const msg of state.messages) {
      if (msg.isStreaming || msg.status === 'interrupted') {
        msg.isStreaming = false
        msg.status = 'incomplete'
        // Content preserved from last checkpoint
      }
    }
    sessionStore.save(sessionMeta.id, state)
  }
})
```

---

## Plugin System

### Plugins subscribe to EventBus directly

The current hook system (`tool:pre`, `message:post`, `params:pre`, etc.) is replaced by EventBus subscriptions. Plugins get the same API as internal components.

### Current Hooks → EventBus Mapping

| Current Hook | EventBus Equivalent | Mode |
|-------------|--------------------|----|
| `app:init` | `app:initialized` (global) | Observe |
| `app:quit` | `app:quitting` (global) | Observe |
| `config:change` | `settings:changed` (global) | Observe |
| `message:pre` | `command:send-message` | Intercept |
| `message:post` | `stream:complete` | Observe |
| `params:pre` | `stream:params-resolving` | Intercept |
| `tool:pre` | `tool:call` | Intercept |
| `tool:post` | `tool:result` | Observe |
| `tool:register` | `tools:registering` | Collect |
| `permission:check` | `permission:request` | Intercept |
| `session:create` | `session:created` (global) | Observe |
| `session:switch` | `session:switched` (global) | Observe |

### The Core Extension Point: `stream:params-resolving`

This single event is where all "modify before sending to AI" logic converges. Multiple plugins intercept it, each modifying `params` and passing it to the next:

```
StreamEngine emits stream:params-resolving { params: { systemPrompt, messages, ... } }
    ↓
Interceptor 1: MemoryPlugin      → inject memory context into systemPrompt
    ↓
Interceptor 2: CompactingPlugin  → compact messages if tokens > 85%
    ↓
Interceptor 3: UserPlugin        → override temperature, add custom prompt
    ↓
Final params used by StreamEngine to call provider
```

StreamEngine does not know what modifications were made. It simply uses whatever params come out of the intercept chain.

### Plugin API

```typescript
interface PluginEventAPI {
  // Session-scoped
  on(eventType: string, handler: ObserveHandler): Unsubscribe
  onAny(handler: ObserveHandler): Unsubscribe
  intercept(eventType: string, handler: InterceptHandler): Unsubscribe

  // Global
  onGlobal(eventType: string, handler: ObserveHandler): Unsubscribe
  interceptGlobal(eventType: string, handler: InterceptHandler): Unsubscribe

  // Stream (optional, most plugins don't need this)
  onStream(handler: (chunk: StreamChunk) => void): Unsubscribe

  // Replay (read event log)
  replay(sessionId: string, fromSequence?: number): SessionEventEnvelope[]

  // Emit (plugins can trigger actions and custom events)
  emit(sessionId: string, event: SessionEvent): Promise<EmitResult>
  command(sessionId: string, command: SessionCommand): Promise<EmitResult>
  emitGlobal(event: GlobalEvent): Promise<EmitResult>
}

interface PluginDefinition {
  meta: PluginMetadata
  init: (input: PluginInput, events: PluginEventAPI) => Promise<Cleanup>
}

type Cleanup = () => Promise<void>
```

### Built-in Plugin: Memory

Memory is a plugin, not a core feature. Disable it and conversations still work.

```typescript
const MemoryPlugin: PluginDefinition = {
  meta: { id: 'memory', name: 'Memory System', version: '1.0.0' },

  async init(input, events) {

    // === 1. Inject memory context before AI call ===
    // Intercept stream:params-resolving to add memory to system prompt

    events.intercept('stream:params-resolving', async (env) => {
      if (env.event.type !== 'stream:params-resolving') return {}
      if (!settings.embedding?.memoryEnabled) return {}

      const session = sessionManager.get(env.sessionId)
      const lastUserMessage = getLastUserMessage(session)
      const agentId = session?.state.agentId

      // Retrieve relevant memories
      const memory = await loadMemoryForChat(lastUserMessage, agentId, env.event.params.providerConfig)
      const memoryPrompt = formatMemoryPrompt(memory)

      // Modify system prompt — StreamEngine doesn't know this happened
      const modifiedParams = {
        ...env.event.params,
        systemPrompt: env.event.params.systemPrompt + '\n\n' + memoryPrompt,
      }

      return { event: { ...env.event, params: modifiedParams } }
    })

    // === 2. Register Memory Tool for AI to use directly ===

    events.intercept('tools:registering', async (env) => {
      if (env.event.type !== 'tools:registering') return {}
      return {
        event: {
          ...env.event,
          builtinTools: [...env.event.builtinTools, 'memory'],
        },
      }
    })

    // === 3. Auto-extract memories after conversation ===
    // Observe stream:complete, use event log to check if Memory tool already used

    events.on('stream:complete', async (env) => {
      if (env.event.type !== 'stream:complete') return
      if (!settings.embedding?.memoryEnabled) return

      // Check event log: skip if Memory tool was already used in this conversation
      const recentEvents = events.replay(env.sessionId)
      const memoryToolUsed = recentEvents.some(e =>
        e.event.type === 'tool:call' && e.event.toolName === 'memory'
      )
      if (memoryToolUsed) return

      if (env.event.content.length < 30) return

      // Extract and save
      const extraction = await callLLMForExtraction(env.event.content)
      if (extraction.shouldRemember) {
        const updatedFiles = await applyMemoryUpdates(extraction)

        // Emit custom plugin event (other plugins can observe)
        await events.emit(env.sessionId, {
          type: 'plugin:memory:updated',
          files: updatedFiles,
          source: 'trigger',
        })
      }
    })

    // === 4. Record agent interactions ===

    events.on('stream:complete', async (env) => {
      const session = sessionManager.get(env.sessionId)
      if (session?.state.agentId) {
        await recordAgentInteraction(session.state.agentId)
      }
    })

    return async () => { /* auto-unsubscribe */ }
  }
}
```

### Built-in Plugin: Context Compacting

Compacts conversation history when token count approaches the model's context limit.

```typescript
const CompactingPlugin: PluginDefinition = {
  meta: { id: 'compacting', name: 'Context Compacting', version: '1.0.0' },

  async init(input, events) {

    events.intercept('stream:params-resolving', async (env) => {
      if (env.event.type !== 'stream:params-resolving') return {}

      const { messages, maxContextTokens } = env.event.params
      const estimatedTokens = estimateTokenCount(messages)
      const threshold = settings.chat?.contextCompactThreshold || 0.85

      if (estimatedTokens > maxContextTokens * threshold) {
        // Compact: summarize older messages, keep recent ones
        const compacted = await compactConversation(messages, {
          targetTokens: maxContextTokens * 0.5,
          preserveRecent: 4,  // Keep last 4 messages intact
          providerConfig: env.event.params.providerConfig,
        })

        return {
          event: {
            ...env.event,
            params: { ...env.event.params, messages: compacted },
          },
        }
      }

      return {}
    })

    return async () => {}
  }
}
```

### Example Plugin: Auto-approve read-only bash

```typescript
events.intercept('permission:request', async (envelope) => {
  const event = envelope.event
  if (event.permissionType === 'bash' && event.metadata.commandType === 'read-only') {
    events.command(envelope.sessionId, {
      type: 'command:permission-respond',
      requestId: event.requestId,
      decision: 'once',
    })
    return { abort: true }
  }
  return {}
})
```

### Example Plugin: Token budget enforcement

```typescript
let totalTokens = 0

events.on('stream:complete', (env) => {
  if (env.event.usage) totalTokens += env.event.usage.totalTokens
})

events.intercept('command:send-message', async (env) => {
  if (totalTokens > 1_000_000) {
    return { abort: true, abortReason: 'Token budget exceeded' }
  }
  return {}
})
```

### Example Plugin: Tool call logger

```typescript
events.on('tool:result', (env) => {
  console.log(`[Tool] ${env.event.toolCallId}: ${JSON.stringify(env.event.result).slice(0, 200)}`)
})
```

### Plugin Custom Events

Plugins emit events under the `plugin:` namespace. Other plugins can observe them:

```
plugin:memory:updated          files[], source ('tool' | 'trigger')
plugin:memory:context-loaded   files[], topicCount
plugin:compacting:compacted    tokensBefore, tokensAfter, messagesRemoved
```

These are not core events — they only exist when the respective plugin is loaded.

---

## Renderer Integration

### Composable: useSessionEvents

```typescript
function useSessionEvents(sessionId: Ref<string>) {
  const content = ref('')
  const reasoning = ref('')
  const isStreaming = ref(false)
  const activeToolCalls = ref<Map<string, ToolCall>>(new Map())
  const steps = ref<Step[]>([])
  let lastSequence = 0

  // --- Event handling (state machine) ---
  function handleEvent(envelope: SessionEventEnvelope) {
    lastSequence = envelope.sequence
    const event = envelope.event

    switch (event.type) {
      case 'stream:start':
        isStreaming.value = true
        content.value = ''
        reasoning.value = ''
        break
      case 'stream:complete':
        isStreaming.value = false
        content.value = event.content         // Source of truth
        reasoning.value = event.reasoning || ''
        break
      case 'stream:error':
      case 'stream:aborted':
        isStreaming.value = false
        break
      case 'tool:call':
        activeToolCalls.value.set(event.toolCallId, {
          id: event.toolCallId, name: event.toolName,
          args: event.args, status: 'executing',
        })
        break
      case 'tool:result':
        const tc = activeToolCalls.value.get(event.toolCallId)
        if (tc) { tc.result = event.result; tc.status = 'completed' }
        break
      case 'permission:request':
        showPermissionDialog(event)
        break
      case 'step:added':
        steps.value.push(event.step)
        break
      case 'step:updated':
        const step = steps.value.find(s => s.id === event.stepId)
        if (step) Object.assign(step, event.updates)
        break
    }
  }

  // --- Stream handling (real-time display) ---
  function handleStreamChunk(chunk: StreamChunk) {
    switch (chunk.type) {
      case 'text-delta':
        content.value += chunk.delta
        break
      case 'reasoning-delta':
        reasoning.value += chunk.delta
        break
    }
  }

  // --- Subscription lifecycle ---
  watch(sessionId, async (newId, oldId) => {
    if (oldId) await electronAPI.unsubscribeSession(oldId)
    if (newId) await reconnect(newId)
  }, { immediate: true })

  async function reconnect(sid: string) {
    const missed = await electronAPI.subscribeSession(sid, lastSequence)
    for (const envelope of missed) handleEvent(envelope)

    // If stream in progress, read accumulated content from Session
    if (isStreaming.value) {
      const current = await electronAPI.getMessageContent(sid)
      if (current) {
        content.value = current.content
        reasoning.value = current.reasoning || ''
      }
    }
  }

  // --- User commands ---
  function sendMessage(text: string, attachments?: Attachment[]) {
    electronAPI.emitCommand(sessionId.value, {
      type: 'command:send-message', content: text, attachments,
    })
  }

  function abort() {
    electronAPI.emitCommand(sessionId.value, { type: 'command:abort' })
  }

  function respondPermission(requestId: string, decision: PermissionDecision) {
    electronAPI.emitCommand(sessionId.value, {
      type: 'command:permission-respond', requestId, decision,
    })
  }

  const cleanupEvent = electronAPI.onSessionEvent(handleEvent)
  const cleanupStream = electronAPI.onSessionStream(handleStreamChunk)

  onUnmounted(() => {
    electronAPI.unsubscribeSession(sessionId.value)
    cleanupEvent()
    cleanupStream()
  })

  return {
    content, reasoning, isStreaming, activeToolCalls, steps,
    sendMessage, abort, respondPermission,
  }
}
```

### Preload Bridge

```typescript
// Two IPC channels: events and stream
onSessionEvent: (callback) => {
  const listener = (_e: any, envelope: SessionEventEnvelope) => callback(envelope)
  ipcRenderer.on('session:event', listener)
  return () => ipcRenderer.removeListener('session:event', listener)
},

onSessionStream: (callback) => {
  const listener = (_e: any, chunk: StreamChunk) => callback(chunk)
  ipcRenderer.on('session:stream', listener)
  return () => ipcRenderer.removeListener('session:stream', listener)
},

// Commands
emitCommand: (sessionId, command) =>
  ipcRenderer.invoke('session:command', sessionId, command),

// Subscription
subscribeSession: (sessionId, fromSequence?) =>
  ipcRenderer.invoke('session:subscribe', sessionId, fromSequence),

unsubscribeSession: (sessionId) =>
  ipcRenderer.invoke('session:unsubscribe', sessionId),

// Recovery
getMessageContent: (sessionId) =>
  ipcRenderer.invoke('session:get-message-content', sessionId),
```

---

## Key Flows

### Send Message

```
Renderer                    EventBus              StreamEngine    Session        IPCBridge     Plugin
   │                            │                      │             │              │            │
   ├─ command:send-message ───→ │                      │             │              │            │
   │                            ├─ intercept ─────────────────────────────────────────────────→  │
   │                            │  (can modify/abort)  │             │              │            │
   │                            ├─ commit + fan out ─→ │             │              │            │
   │                            │                      │             │              │            │
   │                            │ ← emit(message:user-created)      │              │            │
   │                            │                      │             ├─ addMessage() │            │
   │  ← session:event ─────────│──────────────────────────────────────────────────→│            │
   │                            │                      │             │              │            │
   │                            │ ← emit(stream:start) │             │              │            │
   │  ← session:event ─────────│                       │             ├─ startTimer()│            │
   │                            │                      │             │              │            │
   │                            │               StreamChannel        │              │            │
   │                            │                      ├─ push(text-delta) ×N       │            │
   │  ← session:stream (16ms) ─│                       │             ├─ append()    │            │
   │                            │                      │             │ (in-memory)  │            │
   │                            │                      │             │              │            │
   │                            │ ← emit(stream:complete, {content}) │              │            │
   │  ← session:event ─────────│                       │             ├─ overwrite() │            │
   │                            │                      │             │  persist()   │      ←───  │
   │                            │                      │             │              │  (observe) │
```

### Abort

```
Renderer                    EventBus              StreamEngine    Session
   │                            │                      │             │
   ├─ command:abort ──────────→ │                      │             │
   │                            ├─ commit + fan out ─→ │             │
   │                            │                      ├─ abort()    │
   │                            │                      ├─ cancel permissions
   │                            │ ← emit(stream:aborted)             │
   │  ← session:event ─────────│                       │             ├─ mark aborted
   │                            │                      │             │  persist()
```

### Reconnect (window reload during active stream)

```
Renderer                    Main Process
   │                            │
   ├─ subscribeSession(sid,     │
   │    fromSequence=42) ─────→ │
   │                            ├─ replay events from seq 42:
   │  ← stream:start            │     { stream:start, tool:call, tool:result, ... }
   │  ← tool:call               │     (no stream:complete → still active)
   │  ← tool:result             │
   │                            │
   │  renderer: isStreaming=true │
   │                            │
   ├─ getMessageContent(sid) ──→│  ← Session.getMessageContent()
   │  ← "accumulated text..."   │     (read from Session in-memory state)
   │                            │
   │  renderer displays content │
   │                            │
   │  ← session:stream ────────│  (new deltas from StreamChannel)
   │  ← session:stream ────────│
   │  ← session:event ─────────│  stream:complete { content: "full text" }
   │                            │
   │  content = event.content   │  (source of truth overwrites accumulated)
```

### Window close → reopen (stream still active)

```
1. Window closes
   → IPCBridge.dispose() (auto via 'destroyed' event)
   → StreamEngine: continues running (unaffected)
   → Session: continues applying events + chunks (unaffected)
   → Checkpoint timer: continues (Session is alive in SessionManager)

2. User reopens window
   → New IPCBridge created
   → subscribeSession(sid, fromSequence=0)
   → Replay all events from log → rebuild UI state
   → If streaming: read Session.getMessageContent() for accumulated text
   → Subscribe to StreamChannel for future deltas
```

---

## External Integration (Bridge Pattern)

### The Bridge Abstraction

Every external system integrates the same way — as a **Bridge** that subscribes to EventBus/StreamChannel and emits commands. Zero changes to core components.

```
┌──────────────────────────────────────────────────────────────┐
│                      EventBus + StreamChannel                 │
├───────────┬───────────┬───────────┬───────────┬──────────────┤
│           │           │           │           │              │
│ IPCBridge │ Telegram   │ Slack     │ REST API  │ CLI          │
│           │ Bridge     │ Bridge    │ Bridge    │ Bridge       │
│           │           │           │           │              │
│ Electron  │ Bot API   │ Webhook   │ HTTP      │ stdin/       │
│ Window    │           │           │ Server    │ stdout       │
└───────────┴───────────┴───────────┴───────────┴──────────────┘
```

Every Bridge does three things:
1. **Inbound**: External message → `command:send-message` event
2. **Outbound**: `stream:complete` event → External delivery
3. **Interaction**: `permission:request` → External approval → `command:permission-respond`

### Bridge Requirements by Platform

| Bridge | text-delta? | stream:complete? | Permission UX | Streaming display |
|--------|-------------|------------------|---------------|-------------------|
| **IPCBridge** (Electron) | Yes | Yes | UI dialog | Real-time typing |
| **TelegramBridge** | No (typing indicator only) | Yes | Inline keyboard | Full message on complete |
| **SlackBridge** | No | Yes | Thread reply | Full message on complete |
| **APIBridge** (sync) | No | Yes (await) | Auto-approve or reject | JSON response |
| **APIBridge** (SSE) | Yes | Yes | Not supported / webhook | SSE events |
| **CLIBridge** | Yes | No (already streamed) | stdin prompt | stdout stream |

Key: each Bridge **chooses** what to subscribe to. No text-delta needed? Don't subscribe to StreamChannel. Zero cost.

### TelegramBridge Example

```typescript
class TelegramBridge {
  private bot: TelegramBot
  private chatSessionMap: Map<string, string> = new Map()  // telegramChatId → sessionId

  constructor(
    private eventBus: EventBus,
    private streamChannel: StreamChannel,
    private sessionManager: SessionManager,
  ) {
    // Listen for incoming Telegram messages
    this.bot.on('message', (msg) => this.handleTelegramMessage(msg))
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query))
  }

  // === Inbound: Telegram → EventBus ===

  private async handleTelegramMessage(msg: TelegramMessage) {
    const chatId = String(msg.chat.id)
    const sessionId = this.getOrCreateSession(chatId)

    await this.eventBus.emit(sessionId, {
      type: 'command:send-message',
      content: msg.text || '',
      attachments: msg.photo ? [this.convertPhoto(msg.photo)] : undefined,
    })
  }

  // === Outbound: EventBus → Telegram ===

  private attachSession(sessionId: string, chatId: string) {
    // Complete response → send full message
    this.eventBus.on(sessionId, 'stream:complete', (env) => {
      if (env.event.type === 'stream:complete') {
        this.bot.sendMessage(chatId, env.event.content)
      }
    })

    // Tool execution → status update
    this.eventBus.on(sessionId, 'tool:executing', (env) => {
      if (env.event.type === 'tool:executing') {
        this.bot.sendMessage(chatId, `🔧 ${env.event.title}`)
      }
    })

    // Error → error message
    this.eventBus.on(sessionId, 'stream:error', (env) => {
      if (env.event.type === 'stream:error') {
        this.bot.sendMessage(chatId, `❌ Error: ${env.event.error}`)
      }
    })

    // Permission → inline keyboard
    this.eventBus.on(sessionId, 'permission:request', (env) => {
      if (env.event.type === 'permission:request') {
        this.bot.sendMessage(chatId,
          `🔐 Permission required: ${env.event.permissionType}\n${env.event.metadata.title || ''}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Allow', callback_data: `perm:${env.event.requestId}:once` },
                { text: '❌ Reject', callback_data: `perm:${env.event.requestId}:reject` },
              ]]
            }
          }
        )
      }
    })

    // Typing indicator (subscribe to StreamChannel, lightweight)
    this.streamChannel.subscribe(sessionId, (chunk) => {
      if (chunk.type === 'text-delta') {
        this.bot.sendChatAction(chatId, 'typing')
      }
    })
  }

  // === Interaction: Telegram callback → EventBus command ===

  private async handleCallbackQuery(query: TelegramCallbackQuery) {
    const chatId = String(query.message?.chat.id)
    const data = query.data || ''
    const [prefix, requestId, decision] = data.split(':')

    if (prefix === 'perm') {
      const sessionId = this.chatSessionMap.get(chatId)
      if (sessionId) {
        await this.eventBus.emit(sessionId, {
          type: 'command:permission-respond',
          requestId,
          decision: decision as PermissionDecision,
        })
        this.bot.answerCallbackQuery(query.id, { text: decision === 'once' ? 'Allowed' : 'Rejected' })
      }
    }
  }
}
```

### REST API Bridge Example

Turns 0neThing into a programmable AI backend accessible via HTTP.

```typescript
class APIBridge {
  constructor(
    private eventBus: EventBus,
    private streamChannel: StreamChannel,
    private sessionManager: SessionManager,
  ) {}

  // POST /api/sessions/:id/messages — Synchronous request/response
  async handleSendMessage(req: Request, res: Response) {
    const sessionId = req.params.id
    const { content, attachments } = req.body
    this.sessionManager.ensureAlive(sessionId)

    // Subscribe to completion BEFORE sending command
    const response = new Promise<StreamCompleteEvent>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 120_000)

      const unsubComplete = this.eventBus.on(sessionId, 'stream:complete', (env) => {
        if (env.event.type === 'stream:complete') {
          clearTimeout(timeout)
          unsubComplete()
          unsubError()
          resolve(env.event)
        }
      })

      const unsubError = this.eventBus.on(sessionId, 'stream:error', (env) => {
        if (env.event.type === 'stream:error') {
          clearTimeout(timeout)
          unsubComplete()
          unsubError()
          reject(new Error(env.event.error))
        }
      })
    })

    // Emit command
    await this.eventBus.emit(sessionId, {
      type: 'command:send-message',
      content,
      attachments,
    })

    // Wait and return
    try {
      const result = await response
      res.json({ content: result.content, usage: result.usage })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }

  // GET /api/sessions/:id/stream — Server-Sent Events (SSE)
  async handleSSE(req: Request, res: Response) {
    const sessionId = req.params.id
    this.sessionManager.ensureAlive(sessionId)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Events → SSE
    const unsub1 = this.eventBus.onAny(sessionId, (env) => {
      res.write(`event: ${env.event.type}\ndata: ${JSON.stringify(env.event)}\n\n`)
    })

    // Stream chunks → SSE
    const unsub2 = this.streamChannel.subscribe(sessionId, (chunk) => {
      res.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`)
    })

    // Cleanup on disconnect
    req.on('close', () => {
      unsub1()
      unsub2()
    })
  }
}
```

### CLI Bridge Example

```typescript
class CLIBridge {
  constructor(
    private eventBus: EventBus,
    private streamChannel: StreamChannel,
  ) {}

  async run(sessionId: string, prompt: string): Promise<void> {
    // Stream text to stdout
    const unsubStream = this.streamChannel.subscribe(sessionId, (chunk) => {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.delta)
      }
    })

    // Permission → stdin
    const unsubPerm = this.eventBus.on(sessionId, 'permission:request', async (env) => {
      if (env.event.type !== 'permission:request') return
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
      const answer = await rl.question(`\nAllow ${env.event.permissionType}? [y/n] `)
      rl.close()

      await this.eventBus.emit(sessionId, {
        type: 'command:permission-respond',
        requestId: env.event.requestId,
        decision: answer.toLowerCase() === 'y' ? 'once' : 'reject',
      })
    })

    // Completion
    const done = new Promise<void>((resolve) => {
      this.eventBus.on(sessionId, 'stream:complete', () => {
        process.stdout.write('\n')
        resolve()
      })
      this.eventBus.on(sessionId, 'stream:error', (env) => {
        if (env.event.type === 'stream:error') {
          process.stderr.write(`\nError: ${env.event.error}\n`)
        }
        resolve()
      })
    })

    // Send
    await this.eventBus.emit(sessionId, {
      type: 'command:send-message',
      content: prompt,
    })

    await done
    unsubStream()
    unsubPerm()
  }
}
```

### Multi-Endpoint Sync

Because all Bridges are independent subscribers of the same session, multi-endpoint sync is automatic:

```
User sends message via Telegram
    ↓
TelegramBridge → command:send-message → EventBus
    ↓
StreamEngine handles it (same as any other command)
    ↓
stream:complete event emitted
    ↓
Fan out to ALL subscribers:
  → TelegramBridge → sends reply to Telegram chat
  → IPCBridge      → updates Electron UI (if open)
  → APIBridge SSE  → pushes to connected HTTP clients
```

Same session, multiple endpoints, zero special handling.

### Creating a New Bridge (Checklist)

To integrate a new external system:

1. Create a class implementing inbound/outbound/interaction
2. **Inbound**: Convert external message → `command:send-message`
3. **Outbound**: Subscribe to `stream:complete` (and optionally `tool:executing`, `stream:error`)
4. **Interaction**: Subscribe to `permission:request`, convert to platform-native approval UX
5. **Optional**: Subscribe to `StreamChannel` for real-time streaming display
6. **Lifecycle**: Manage session mapping (external ID → sessionId), cleanup on disconnect

No changes to EventBus, StreamEngine, Session, or any other core component.

---

## Settings & Naming (No More "Cache")

### Problem: "Cache" is the wrong mental model

The old architecture calls everything a "cache":

| Old name | What it actually is | Why "cache" is wrong |
|----------|-------------------|---------------------|
| `settingsInstance` / `settingsCache` | Live application state | It IS the settings. Disk is the backup, not the source of truth. |
| `providerInstanceCache` (5-min TTL) | Object pool | TTL exists only because there's no change notification. |
| `sessionCache` (LRU 10) | Active working set | Sessions are loaded for operation, not for "caching". |
| `getCachedProviderConfig()` | Session override resolution | Not a cache — it's business logic. |

"Cache" implies staleness, invalidation, and inconsistency. These are the exact problems we're removing.

### New naming: state, pool, and manager

**Settings = live state.** Read it directly, update it explicitly. No invalidation, no TTL, no "is it fresh?" questions.

```typescript
class Settings {
  private state: AppSettings

  // Read: always current, always synchronous
  get(): Readonly<AppSettings> {
    return this.state
  }

  // Resolve session-level overrides (provider, model)
  getForSession(sessionId: string): ResolvedSessionSettings {
    const session = sessionManager.get(sessionId)
    const global = this.state
    const providerId = session?.state.lastProvider || global.ai.provider
    return {
      providerId,
      model: session?.state.lastModel || global.ai.providers[providerId]?.model,
      temperature: global.chat.temperature,
      apiKey: global.ai.providers[providerId]?.apiKey,
      baseUrl: global.ai.providers[providerId]?.baseUrl,
      toolSettings: global.tools,
      // ... all resolved values
    }
  }

  // Write: update state → persist to disk → broadcast change event
  update(patch: Partial<AppSettings>): void {
    this.state = deepMerge(this.state, patch)
    this.persistToDisk()
    eventBus.emitGlobal({
      type: 'settings:changed',
      changedKeys: Object.keys(flatten(patch)),
    })
  }

  // Startup: restore from disk
  loadFromDisk(): void {
    const saved = readFromDisk()
    this.state = mergeWithDefaults(saved)
  }
}
```

**ProviderPool = object pool.** Instances are derived from config. Config changes → pool clears → next acquire creates fresh instance. No TTL needed.

```typescript
class ProviderPool {
  private instances: Map<string, ProviderInstance> = new Map()

  constructor(eventBus: EventBus) {
    // Config changes → discard old instances
    eventBus.onGlobal('settings:changed', (env) => {
      if (env.event.changedKeys.some(k => k.startsWith('ai.providers'))) {
        this.instances.clear()
      }
    })
  }

  // Get or create. Key derived from config — different config = different key = new instance.
  acquire(config: ResolvedProviderConfig): ProviderInstance {
    const key = `${config.providerId}#${config.apiKey}#${config.baseUrl}`

    if (!this.instances.has(key)) {
      this.instances.set(key, createProviderInstance(config))
    }
    return this.instances.get(key)!
  }
}
```

**SessionManager = lifecycle manager.** Already designed in [Session: The State Owner](#session-the-state-owner). Sessions are active objects, not cached data.

### How components access settings

```
┌─ Settings (singleton) ──────────────────────────────────────┐
│                                                              │
│  .get()              → current app settings                 │
│  .getForSession(id)  → resolved with session overrides      │
│  .update(patch)      → mutate + persist + emit event        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  StreamEngine                                                │
│    buildBaseParams() → settings.getForSession(sessionId)    │
│                                                              │
│  MemoryPlugin                                                │
│    intercept → settings.get().embedding?.memoryEnabled       │
│    onGlobal('settings:changed') → reload index if needed    │
│                                                              │
│  ProviderPool                                                │
│    onGlobal('settings:changed') → clear instances           │
│    acquire(config) → create/reuse provider instance         │
│                                                              │
│  IPCBridge                                                   │
│    onGlobal('settings:changed') → notify renderer           │
│                                                              │
│  Renderer                                                    │
│    IPC invoke → settings.get() → Pinia store                │
│    onGlobal('settings:changed') → refresh Pinia store       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Settings change propagation

```
User changes API key in Settings UI
    ↓
Renderer → IPC invoke('settings:update', { ai: { providers: { openai: { apiKey: 'sk-new' } } } })
    ↓
Settings.update(patch)
  ├─ state = deepMerge(state, patch)
  ├─ persistToDisk()
  └─ eventBus.emitGlobal({ type: 'settings:changed', changedKeys: ['ai.providers.openai.apiKey'] })
    ↓
Global observers react:
  ├─ ProviderPool     → clear instances (next acquire creates fresh)
  ├─ IPCBridge        → sender.send('settings:changed') → Renderer refreshes
  ├─ MemoryPlugin     → ignore (not embedding-related)
  └─ TelegramBridge   → ignore
```

### The only real cache

`modelNameCache` in the renderer store is the only thing that deserves to be called a cache — it stores API responses from external model listing endpoints (OpenRouter, etc.) where the source of truth is remote. It can genuinely be stale and needs refresh.

Everything else is either **live state** (Settings), **derived objects** (ProviderPool), or **active entities** (SessionManager).

---

## AI-Driven Configuration (Skills + File Watcher)

### Design Philosophy

No special "Settings Tool" or "Plugin Tool". The AI uses existing tools (`read`, `edit`, `write`, `bash`) to modify configuration files directly. It only needs **knowledge** — provided via Skills that document file locations, schemas, and rules.

```
Tool = capability (read, edit, write, bash)
Skill = knowledge (where are the files, what's the format, what are the rules)
Tool + Skill = AI can configure anything
```

The system detects changes via **file watchers** and reloads automatically.

### Settings Skill

A built-in skill that teaches the AI how to read and modify settings.

```markdown
---
name: settings
description: Configure application settings, providers, models, and preferences
---

## Settings Location

Settings file: `{{settingsPath}}/settings.json`

## Schema

{
  "ai": {
    "provider": "openai",               // Active provider ID
    "providers": {
      "<providerId>": {
        "apiKey": "...",
        "model": "gpt-4o",
        "baseUrl": "...",               // Optional custom endpoint
        "selectedModels": [...]
      }
    },
    "customProviders": [
      {
        "id": "custom-xxx",
        "name": "My Provider",
        "apiType": "openai" | "anthropic",
        "baseUrl": "https://...",
        "apiKey": "...",
        "model": "..."
      }
    ]
  },
  "chat": {
    "temperature": 0.7,
    "maxTokens": 4096,
    "contextCompactThreshold": 0.85
  },
  "tools": {
    "enableToolCalls": true,
    "tools": { "<toolId>": { "enabled": true, "autoExecute": false } }
  },
  "embedding": {
    "memoryEnabled": true,
    "provider": "openai"
  }
}

## Rules

1. Always read settings.json before making changes
2. Use `edit` tool to modify specific fields — never rewrite the entire file
3. Never delete or empty the settings file
4. Sensitive fields (apiKey): confirm with user before writing
5. If user provides an API key, write it directly — don't ask twice
6. Changes are auto-detected via file watcher — no manual reload needed

## Common Tasks

### Switch model
Read settings.json → edit the "model" field under the active provider

### Add a custom provider
Read settings.json → append to "customProviders" array

### Change temperature
Edit settings.json: "temperature": 0.7 → "temperature": 1.0
```

### Plugin Skill

A built-in skill that teaches the AI how to create and manage plugins.

```markdown
---
name: plugins
description: Create, install, and manage plugins
---

## Plugin Location

User plugins: `{{userPluginsPath}}/`
Each plugin is a directory with an `index.ts` entry point.

## Plugin Structure

my-plugin/
├── index.ts          # Entry point (required)
├── package.json      # Optional
└── README.md         # Optional

## How to Write a Plugin

// index.ts
export default {
  meta: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'What this plugin does',
  },

  async init(input, events) {
    // Observe events
    events.on('stream:complete', (env) => { ... })

    // Intercept events (modify or abort)
    events.intercept('tool:call', async (env) => {
      return {}  // pass-through, or { abort: true }, or { event: modified }
    })

    // Cleanup
    return async () => { }
  }
}

## Available Events

### Observe (read-only)
- stream:complete — AI finished responding (content, usage)
- tool:result — Tool finished executing
- step:added / step:updated — UI tracking

### Intercept (can modify or abort)
- stream:params-resolving — Modify prompt, messages, temperature before AI call
- tool:call — Modify args or block tool execution
- permission:request — Auto-approve or block
- command:send-message — Modify or block user messages

### Global
- settings:changed — Settings file was modified
- session:created / session:deleted

## Plugin Examples

### Auto-approve read-only bash
events.intercept('permission:request', async (env) => {
  if (env.event.metadata.commandType === 'read-only') {
    events.command(env.sessionId, {
      type: 'command:permission-respond',
      requestId: env.event.requestId,
      decision: 'once',
    })
    return { abort: true }
  }
  return {}
})

### Token logger
events.on('stream:complete', (env) => {
  if (env.event.usage) {
    fs.appendFileSync('tokens.log',
      `${new Date().toISOString()} ${env.event.usage.totalTokens}\n`)
  }
})

## How to Enable

1. Create plugin directory in {{userPluginsPath}}/my-plugin/
2. Write index.ts
3. New plugins are auto-detected, or click Refresh in Settings > Plugins
```

### File Watcher: The Bridge Between AI and System

When the AI edits `settings.json` or creates a plugin file, the system must detect and react. File watchers bridge this gap.

```typescript
class Settings {
  private watcher: fs.FSWatcher

  constructor(private eventBus: EventBus) {
    // Watch for external modifications (AI, user, any process)
    this.watcher = fs.watch(this.filePath, debounce(() => {
      this.reloadFromDisk()
    }, 500))
  }

  // Also callable explicitly (UI refresh button)
  refresh(): void {
    this.reloadFromDisk()
  }

  private reloadFromDisk(): void {
    const newState = readAndMergeWithDefaults(this.filePath)
    const changedKeys = diffKeys(this.state, newState)
    if (changedKeys.length === 0) return

    this.state = newState
    this.eventBus.emitGlobal({ type: 'settings:changed', changedKeys })
  }
}
```

```typescript
class PluginManager {
  private watcher: fs.FSWatcher

  constructor(private eventBus: EventBus) {
    // Watch plugins directory for new/removed/changed plugins
    this.watcher = fs.watch(userPluginsPath, { recursive: true }, debounce(() => {
      this.refresh()
    }, 1000))
  }

  // Also callable explicitly (UI refresh button)
  async refresh(): Promise<void> {
    const discovered = await this.scanPlugins()

    // Unload removed plugins
    for (const [id, plugin] of this.loaded) {
      if (!discovered.has(id)) {
        await plugin.cleanup()
        this.loaded.delete(id)
      }
    }

    // Load new plugins
    for (const [id, path] of discovered) {
      if (!this.loaded.has(id)) {
        await this.loadPlugin(id, path)
      }
    }

    this.eventBus.emitGlobal({
      type: 'plugins:refreshed',
      loaded: [...this.loaded.keys()],
    })
  }
}
```

### Change Detection Flow

```
AI edits settings.json (via edit tool)
    ↓
fs.watch fires (debounced 500ms)
    ↓
Settings.reloadFromDisk()
  ├─ read file
  ├─ diff with current state
  ├─ update in-memory state
  └─ eventBus.emitGlobal('settings:changed')
    ↓
Subscribers react:
  ├─ ProviderPool     → clear (next acquire creates fresh)
  ├─ IPCBridge        → notify renderer → UI refreshes
  ├─ MemoryPlugin     → reload index if embedding config changed
  └─ CompactingPlugin → update threshold
```

```
AI creates plugin file (via write tool)
    ↓
fs.watch fires on plugins directory (debounced 1000ms)
    ↓
PluginManager.refresh()
  ├─ scan directories
  ├─ detect new plugin
  ├─ load + init
  └─ eventBus.emitGlobal('plugins:refreshed')
    ↓
New plugin starts receiving events immediately
```

### Example: Full AI Configuration Session

```
User: "帮我配置 DeepSeek，API key 是 sk-xxx"

AI:   → read ~/.0nething/settings.json    (看当前配置)

AI:   → edit settings.json
        "provider": "openai" → "provider": "deepseek"
      → edit settings.json
        providers.deepseek.apiKey → "sk-xxx"
      → edit settings.json
        providers.deepseek.model → "deepseek-chat"

      [fs.watch → Settings.reloadFromDisk() → settings:changed]
      [ProviderPool clears → UI refreshes automatically]

AI:   "已配置好 DeepSeek，下条消息开始生效。"
```

```
User: "写一个插件，让所有读命令自动审批"

AI:   → bash: mkdir -p ~/.0nething/plugins/auto-approve-readonly
      → write ~/.0nething/plugins/auto-approve-readonly/index.ts
        (writes plugin code following the skill template)

      [fs.watch → PluginManager.refresh() → loads new plugin]
      [plugins:refreshed event → UI shows new plugin]

AI:   "插件已创建并自动加载。读命令现在会自动审批。"
```

```
User: "帮我把 bash tool 的自动执行打开"

AI:   → read ~/.0nething/settings.json
      → edit settings.json
        tools.tools.bash.autoExecute: false → true

      [settings:changed → tool registry updates]

AI:   "已启用 bash 的自动执行。"
```

### Skill Template Variables

Skills reference paths via template variables that are resolved at load time:

| Variable | Value | Example |
|----------|-------|---------|
| `{{settingsPath}}` | App user data directory | `~/.0nething` |
| `{{userPluginsPath}}` | User plugins directory | `~/.0nething/plugins` |
| `{{userSkillsPath}}` | User skills directory | `~/.claude/skills` |
| `{{workingDirectory}}` | Current session working directory | `/Users/me/project` |
| `{{memoryPath}}` | Memory files directory | `~/.0nething/memory` |

### UI: Refresh Buttons

Both Settings and Plugins pages have explicit refresh buttons as fallback:

- **Settings page**: "Reload from disk" button → `Settings.refresh()`
- **Plugins page**: "Refresh plugins" button → `PluginManager.refresh()`

These are for cases where:
- File watcher missed a change (rare but possible)
- User wants to force reload after manual file editing
- AI instructions say "click refresh" (degraded path)

---

## Migration Strategy

### Phase 1: EventBus + StreamChannel + Session (parallel with existing)

1. Create `EventBus`, `StreamChannel`, `Session`, `SessionManager`
2. Modify `ipc-emitter.ts` to also emit events / push chunks (dual-write)
3. Session subscribes and validates consistency with existing store
4. Zero renderer changes — existing IPC paths still work

### Phase 2: IPCBridge replaces direct sender.send()

1. Create `IPCBridge` with coalescing and auto-cleanup
2. Route IPC through `session:event` + `session:stream` channels
3. Remove individual `STREAM_CHUNK`, `STREAM_COMPLETE` etc. channels

### Phase 3: StreamEngine replaces tool-loop

1. Create `StreamEngine` subscribing to `command:*`
2. Migrate `runStream()` to emit events / push chunks
3. Remove `activeStreams` Map, `ipc-emitter.ts`, `stream-processor.ts`

### Phase 4: Renderer migration

1. Create `useSessionEvents()` composable
2. Commands via `emitCommand()` instead of `sendMessageStream()`
3. Replay support for reconnect

### Phase 5: Plugin migration

1. Create `PluginEventAPI`
2. Migrate plugins from hook system to EventBus
3. Remove old hook manager

---

## File Structure

```
src/main/
├── events/
│   ├── event-bus.ts             # EventBus (session + global)
│   ├── stream-channel.ts       # StreamChannel (high-frequency push)
│   ├── plugin-api.ts           # PluginEventAPI
│   ├── ring-buffer.ts          # Ring buffer for event log
│   └── types.ts                # Subscriber, EmitResult, InterceptResult
├── engine/
│   ├── stream-engine.ts        # StreamEngine (command handler + streaming)
│   └── tool-executor.ts        # Tool execution (emits events, pushes chunks)
├── session/
│   ├── session.ts              # Session (state owner, event consumer)
│   ├── session-manager.ts      # SessionManager (lifecycle, eviction, orchestration)
│   └── session-state.ts        # SessionState type + createEmptySessionState()
├── settings/
│   └── settings.ts             # Settings (live state, not cache)
├── providers/
│   ├── provider-pool.ts        # ProviderPool (object pool, not cache)
│   └── builtin/                # Provider definitions (unchanged)
├── skills/
│   └── builtin/
│       ├── settings/SKILL.md   # Settings skill (schema, rules, examples)
│       └── plugins/SKILL.md    # Plugin skill (API, structure, examples)
├── bridges/
│   ├── ipc-bridge.ts           # Electron renderer
│   ├── telegram-bridge.ts      # Telegram Bot API
│   ├── api-bridge.ts           # REST API + SSE
│   └── cli-bridge.ts           # CLI stdin/stdout

src/shared/
├── events/
│   ├── session-events.ts       # SessionEvent type
│   ├── session-commands.ts     # SessionCommand type
│   ├── global-events.ts        # GlobalEvent type
│   ├── stream-chunks.ts        # StreamChunk type
│   └── envelope.ts             # Envelope types

src/renderer/
├── composables/
│   └── useSessionEvents.ts     # Per-session subscription composable
```

---

## Open Questions

1. **Ring buffer size** — Suggest 1000 events per session (~100 tool-call turns).
2. **Event log persistence** — Currently in-memory only. Future: persist for undo/replay/crash recovery.
3. **Multi-window** — Multiple IPCBridges for same session. Permission responses: first responder wins.
4. **Interceptor ordering** — Plugins declare `priority: number`? Or first-registered-first-called?
5. **Interceptor timeout** — Suggest 5 seconds. Timeout = pass-through.
6. **Plugin sandboxing** — Misbehaving interceptor can block events. Worker thread with timeout?
7. **Session eviction strategy** — LRU with 10-minute idle threshold? Or memory-pressure based?
8. **Interrupted message UX** — Show "Generation interrupted" banner? Allow "Continue generating"?
