# Pi-style Tool Definition Unification Plan

## Implementation status

Implemented in this iteration:

- Canonical shared `ToolResult` / `ToolPartialResult` IPC shape.
- Tool definition fields: `executionMode`, `promptSnippet`, `promptGuidelines`, `renderShell`, `renderKind`.
- Built-in tools declare execution mode and render/prompt hints.
- Tool orchestrator resolves barriers through registry `getToolExecutionMode(...)` instead of direct hard-coded lookup.
- Dedicated structured execution events: `tool:execution-start`, `tool:execution-update`, `tool:execution-end`.
- Renderer consumes dedicated tool execution events and stores structured results on `Step.partialResult`.
- `ToolResultRenderer.vue` renders structured text/file/image result parts.
- Bash, read, edit, write, grep, glob, web_search, variable, todo_plan, time, project_dirs, skill, and fart emit structured partial updates where useful.
- Prompt available-tool snippets are sourced from tool definitions through registry helpers.

## Goal

Move our tool system toward Pi's model before broadening streaming support to every tool.

Target direction:

- Tools declare their own execution behavior instead of external hard-coded gates.
- Partial and final tool results share one structured `ToolResult` shape.
- Tool UI rendering is driven by result shape + tool render hints/renderers instead of scattered `step.result`/metadata conventions.
- Tool streaming events become first-class (`tool:execution-update`, `tool:execution-end`) rather than only piggybacking on `step:updated`.
- Existing tools migrate incrementally without breaking current chat/session UI.

## Pi reference model

Pi uses three related concepts:

```ts
interface AgentToolResult<TDetails> {
  content: (TextContent | ImageContent)[]
  details: TDetails
  terminate?: boolean
}

type AgentToolUpdateCallback<TDetails> = (partialResult: AgentToolResult<TDetails>) => void

interface ToolDefinition<TParams, TDetails, TState> {
  name: string
  label: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters: TParams
  executionMode?: 'sequential' | 'parallel'
  renderShell?: 'default' | 'self'
  prepareArguments?: (args: unknown) => TParams
  execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TDetails>>
  renderCall?(args, theme, context): Component
  renderResult?(result, options, theme, context): Component
}
```

Important points:

- `onUpdate` and final `execute` result use the same result shape.
- UI receives `tool_execution_update` and calls `updateResult(partialResult, true)`.
- UI receives `tool_execution_end` and calls `updateResult(result, false)`.
- Tool definitions own prompt snippets, execution mode, and rendering behavior.

## Current state in this repo

Current unified definition entry point:

- `src/main/tools/core/tool.ts`
  - `Tool.define(...)`
  - `ToolInfo`, `ToolContext`, `ToolResult`
- `src/main/tools/registry.ts`
  - static/async registries
  - validation
  - execution forwarding
- `src/main/tools/builtin/index.ts`
  - built-in tool list

Current gaps:

- `ToolResult` is still legacy:
  ```ts
  { title: string; output: string; metadata: M; attachments?: ... }
  ```
- Partial result shape exists, but final result is not yet unified with it.
- `executionMode` is hard-coded externally through `needsOrderedSideEffectGate(toolName)`.
- UI rendering is distributed across helpers by tool name and legacy fields.
- Streaming currently uses `Step.partialResult` plus `step:updated`; no dedicated `tool:execution-update` event yet.

## Proposed target types

### 1. Shared result content

Location: `src/shared/ipc/tools.ts`

```ts
export interface ToolResultContentPart {
  type: 'text' | 'image' | 'file'
  text?: string
  data?: string
  mimeType?: string
  path?: string
}

export interface ToolResult<TDetails = Record<string, unknown> | undefined> {
  content: ToolResultContentPart[]
  details?: TDetails
  terminate?: boolean
}

export type ToolPartialResult<TDetails = Record<string, unknown> | undefined> = ToolResult<TDetails>
```

Notes:

- This should become the canonical model-facing and UI-facing result.
- During migration, keep a converter from legacy `{ title, output, metadata }` to structured `ToolResult`.

### 2. Tool execution mode

Location: `src/main/tools/core/tool.ts`

```ts
export type ToolExecutionMode = 'parallel' | 'sequential'
```

Add to `ToolInfo` and async init result:

```ts
executionMode?: ToolExecutionMode
```

Semantics:

- `parallel`: may run concurrently with other parallel tools in the same segment.
- `sequential`: acts as a barrier; later tools wait until it settles.
- Default should be conservative during migration:
  - If missing, infer from current `needsOrderedSideEffectGate` for compatibility.
  - After all built-ins declare it, remove the external hard-coded function.

Initial built-in declarations:

| Tool | executionMode | Reason |
|---|---|---|
| `read` | `parallel` by default, but sensitive reads still permission-barrier by effect | Read-only |
| `grep` | `parallel` | Read-only search |
| `glob` | `parallel` | Read-only listing |
| `calculator` | `parallel` | Pure |
| `get-current-time` / `time` | `parallel` | Pure/read-only |
| `skill` | `parallel` | Read-only skill docs |
| `todo-plan` | `sequential` | Mutates user notes |
| `variable` | `sequential` | Changes session variables/workdir; later tools must observe new value |
| `write` | `sequential` | File mutation |
| `edit` | `sequential` | File mutation |
| `bash` | `sequential` | Process + filesystem/network side effects |
| MCP tools | `sequential` default | Opaque external side effects |
| `web-search` | `parallel` or `sequential` depending remote policy; recommend `parallel` unless rate limiting requires otherwise |

### 3. Prompt fields

Add to `ToolInfo`:

```ts
promptSnippet?: string
promptGuidelines?: string[]
```

Migration path:

1. Keep prompt builder output unchanged.
2. Add fields to tools.
3. Move hard-coded tool prompt snippets from prompt context into definitions.
4. Build available-tools/guidelines sections from active tool definitions.

### 4. Render metadata hooks

Electron renderer cannot use Pi's terminal `Component` API directly. Use serializable render hints first.

Add to `ToolInfo`:

```ts
renderShell?: 'default' | 'self'
renderKind?: 'text' | 'bash' | 'diff' | 'file' | 'search' | 'image' | 'custom'
```

Optional later:

```ts
renderCall?: ToolRenderDescriptorFactory
renderResult?: ToolRenderDescriptorFactory
```

Where descriptors are plain JSON, e.g.:

```ts
interface ToolRenderDescriptor {
  kind: 'text' | 'bash' | 'diff' | 'file' | 'search' | 'image' | 'custom'
  props: Record<string, unknown>
}
```

Short-term renderer migration:

- Continue using Vue helpers for now.
- Prefer `step.partialResult` / `toolCall.result` structured content.
- Use `renderKind` as a hint instead of many `toolName === ...` branches.

## Dedicated execution events

Add event types in `src/shared/events/session-events.ts`:

```ts
export interface ToolExecutionStartEvent {
  type: 'tool:execution-start'
  toolCallId: string
  stepId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ToolExecutionUpdateEvent {
  type: 'tool:execution-update'
  toolCallId: string
  stepId: string
  partialResult: ToolPartialResult
}

export interface ToolExecutionEndEvent {
  type: 'tool:execution-end'
  toolCallId: string
  stepId: string
  result?: ToolResult
  isError?: boolean
  error?: string
}
```

Compatibility choice:

- Phase 1: emit both `tool:execution-update` and `step:updated`.
- Phase 2: renderer consumes dedicated events and updates `Step.partialResult` locally.
- Phase 3: remove `step:updated` partial-result piggyback if no longer needed.

## Migration phases

### Phase 1 — Type foundation

- Add canonical shared `ToolResult<TDetails>`.
- Make `ToolPartialResult` an alias of `ToolResult`.
- Add `executionMode`, `promptSnippet`, `promptGuidelines`, `renderShell`, `renderKind` to `ToolInfo`/`ToolInfoAsync`/`ToolInitResult`.
- Add helper:
  ```ts
  legacyToolResultToStructured(result: { output?: string; metadata?: unknown; attachments?: unknown }): ToolResult
  ```
- Keep existing tool return signatures initially to reduce churn.

### Phase 2 — Declare execution mode on built-ins

- Add `executionMode` to each built-in tool definition.
- Change `ToolOrchestrator` to resolve mode from registry:
  ```ts
  getToolExecutionMode(toolName): 'parallel' | 'sequential'
  ```
- Keep current `needsOrderedSideEffectGate` only as fallback.
- Update scheduler tests to assert tool-declared modes.

### Phase 3 — Dedicated events

- Add `tool:execution-start/update/end` event types.
- Add emitter methods.
- Emit update/end from `executeToolAndUpdate`.
- Renderer store handles these events and updates an execution-result state on the step/tool call.
- Keep `step:updated` for status/title/diff compatibility until renderer no longer needs it for partial results.

### Phase 4 — Unified renderer path

- Introduce `ToolResultRenderer.vue` or helper equivalent.
- It accepts:
  ```ts
  result: ToolResult
  isPartial: boolean
  renderKind?: string
  isError?: boolean
  ```
- Implement initial render kinds:
  - `text`
  - `bash`
  - `diff`
  - `file`
  - `search`
- Update `ToolStepDetails.vue` to render structured result through the new component.

### Phase 5 — Tool result migration

Migrate tools one by one so final results return or are adapted into canonical `ToolResult`.

Priority order:

1. `bash` — already closest; use structured result for final and partial.
2. `grep` / `glob` — result kind `search` / `text`; add progress updates.
3. `read` — result kind `file`; optionally stream large-file preview.
4. `edit` / `write` — result kind `diff` / `file`; keep diff preview but encode in structured details.
5. `web-search` — stream phases and search results.
6. `todo-plan`, `skill`, `time`, `variable`, `calculator` — mostly final structured result, optional progress.

### Phase 6 — Prompt/tool definition cleanup

- Move tool snippets/guidelines into tool definitions.
- Build prompt available tools from registry definitions.
- Remove duplicated prompt snippets from prompt builder/context.

### Phase 7 — Remove legacy paths

After all built-ins are migrated:

- Remove legacy `ToolResult.output` requirement.
- Remove metadata-as-live-output conventions.
- Remove hard-coded `needsOrderedSideEffectGate` list.
- Remove partial-result piggyback through `step.result` if dedicated events fully cover UI.

## Open decisions

1. Naming: use `tool:execution-update` to match current event style, or exact Pi name `tool_execution_update`?
   - Recommendation: `tool:execution-update`.
2. Should `ToolResult.details` be optional?
   - Recommendation: yes, because many simple tools only return text.
3. Should final tool results immediately switch to structured shape, or use adapters first?
   - Recommendation: adapters first, then migrate tool-by-tool.
4. Should `executionMode` be only `parallel/sequential`, or also `barrier`?
   - Recommendation: use Pi's `parallel/sequential`; map `sequential` to scheduler barrier.
5. Should renderer custom renderers live in main tool definitions?
   - Recommendation: no direct functions across IPC. Use serializable `renderKind`/descriptors in main, Vue components in renderer.

## Validation plan

- Typecheck after each phase:
  ```bash
  bun run typecheck
  ```
- Focused tests:
  ```bash
  bunx vitest run \
    src/main/engine/__tests__/tool-execution-order.test.ts \
    src/main/engine/__tests__/tool-execution-scheduler.test.ts \
    src/main/engine/__tests__/tool-orchestrator.test.ts \
    src/main/tools/builtin/__tests__/bash-working-directory.test.ts \
    src/renderer/stores/__tests__/tool-step-view.test.ts \
    src/renderer/stores/__tests__/tool-activity-view.test.ts
  ```
- Add tests for:
  - tool-declared execution mode resolution
  - dedicated `tool:execution-update` propagation
  - structured final result conversion
  - renderer result component behavior for text/bash/diff/search
