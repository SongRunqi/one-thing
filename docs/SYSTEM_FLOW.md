# 0neThing - Complete System Flow Documentation

> Generated: 2026-03-16 | AI SDK: v6.0.3 | Electron Three-Process Model

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Chat Message Flow (Complete)](#2-chat-message-flow)
3. [Tool Call System](#3-tool-call-system)
4. [Permission System](#4-permission-system)
5. [Memory System](#5-memory-system)
6. [Custom Agent System](#6-custom-agent-system)
7. [Skills System](#7-skills-system)
8. [MCP (Model Context Protocol)](#8-mcp-model-context-protocol)
9. [Provider & Settings System](#9-provider--settings-system)
10. [Post-Chat Triggers](#10-post-chat-triggers)
11. [Complete Request Lifecycle](#11-complete-request-lifecycle)

---

## 1. Architecture Overview

### Three-Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (Vue 3 + Pinia)                               │
│  src/renderer/                                                   │
│  - UI components, stores, composables                           │
│  - Calls window.electronAPI.* for IPC                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Electron IPC (contextBridge)
┌─────────────────────┴───────────────────────────────────────────┐
│  Preload Script (src/preload/index.ts)                          │
│  - Type-safe bridge: electronAPI object                         │
│  - Event listeners + invoke wrappers                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  src/main/                                                       │
│  - IPC handlers, providers, tools, storage, services            │
│  - SQLite + sqlite-vec for vector search                        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Subsystems

| Subsystem | Location | Purpose |
|-----------|----------|---------|
| **Providers** | `src/main/providers/` | AI model abstraction (OpenAI, Claude, Gemini, etc.) |
| **Tools** | `src/main/tools/` | Built-in tools (bash, read, write, edit, glob, grep, etc.) |
| **Memory** | `src/main/services/memory-text/` | Text-based Markdown memory system |
| **CustomAgents** | `src/main/services/custom-agent/` | User-definable agents with custom tools |
| **Skills** | `src/main/skills/` | Claude Code-style skills (SKILL.md files) |
| **MCP** | `src/main/mcp/` | Model Context Protocol external tool servers |
| **Plugins** | `src/main/plugins/` | Hook-based plugin system |
| **Triggers** | `src/main/services/triggers/` | Post-chat automatic actions |

---

## 2. Chat Message Flow

### 2.1 User Input → IPC

```
InputBox.vue (sendMessage event)
    ↓
ChatWindow catches event
    ↓
chatStore.sendMessage(sessionId, messageContent, attachments)
    ↓
window.electronAPI.sendMessageStream(sessionId, message, attachments)
    ↓
IPC invoke → IPC_CHANNELS.SEND_MESSAGE_STREAM
```

**Key files:**
- `src/renderer/components/chat/InputBox.vue` — User input component
- `src/renderer/stores/chat.ts` — Chat state management (Pinia)
- `src/preload/index.ts` — IPC bridge

### 2.2 Main Process Handler

**File:** `src/main/ipc/chat.ts` → `handleSendMessageStream()`

```
1. Create user message (id: temp-${Date.now()})
2. Save to session store
3. Auto-rename session if first message
4. Validate provider config:
   - getEffectiveProviderConfig(settings, sessionId)
   - getApiKeyForProvider() (handles OAuth token refresh)
5. Create assistant message (empty, isStreaming: true)
6. Return immediately: { success, userMessage, messageId }
7. process.nextTick() → start async streaming
```

### 2.3 Stream Execution

**File:** `src/main/ipc/chat/stream-executor.ts` → `executeMessageStream()`

```
1. Create AbortController, register in activeStreams
2. Detect mode: image generation vs text streaming
3. Call executeStreamGeneration(ctx, historyMessages, sessionName)
```

### 2.4 Tool Loop (Core Engine)

**File:** `src/main/ipc/chat/tool-loop.ts` → `runStream()`

This is the heart of the chat system — a multi-turn loop that handles streaming, tool execution, and context management.

```
executeStreamGeneration():
  1. Load enabled skills for session (getSkillsForSession)
  2. Initialize async tools (SkillTool, CustomAgentTool)
  3. Load all enabled tools (builtin + MCP)
  4. Build system prompt (buildSystemPromptV2)
  5. Call runStream()

runStream() — max 100 turns:
  Per turn:
  ┌─────────────────────────────────────────────┐
  │ 1. Pre-request compacting (if >85% context) │
  │ 2. Send continuation indicator (turn > 1)   │
  │ 3. Get model params + execute hooks         │
  │ 4. streamChatResponseWithTools()            │
  │ 5. Process stream chunks:                   │
  │    - text → accumulate + IPC emit           │
  │    - reasoning → accumulate + IPC emit      │
  │    - tool-input-start/delta → stream args   │
  │    - tool-call → execute immediately        │
  │    - finish → capture usage/finishReason    │
  │ 6. Persist content parts to store           │
  │ 7. Post-turn compacting if needed           │
  │ 8. Loop control:                            │
  │    - No tool calls → exit                   │
  │    - Tool needs confirmation → pause        │
  │    - Max turns reached → exit               │
  │    - Else → build continuation, next turn   │
  └─────────────────────────────────────────────┘
```

### 2.5 Provider Streaming

**File:** `src/main/providers/index.ts` → `streamChatResponseWithTools()`

```
Input:
  - providerId, config (apiKey, baseUrl, model)
  - messages: ToolChatMessage[]
  - tools: Record<toolId, { description, parameters }>
  - options: { temperature, maxTokens, abortSignal }

Flow:
  1. Convert messages to AI SDK 6.x format (convertToModelMessages)
     - System → string
     - User → string or multimodal array (text, image, file)
     - Assistant → content array with text + tool-call parts
     - Tool → output with { type: 'json', value: ... }
  2. Handle system merge (for Zhipu: system → first user message)
  3. Build Zod schemas for tool parameters
  4. Call streamText() from Vercel AI SDK
  5. Iterate stream.fullStream, yield typed chunks:
     - text-delta, reasoning-delta
     - tool-input-start, tool-input-delta
     - tool-call (with parsed args)
     - finish (with usage stats)
```

### 2.6 Stream Back to Renderer

**File:** `src/main/ipc/chat/ipc-emitter.ts` → `createIPCEmitter()`

All events sent via `sender.send(channel, data)`:

| Event | Channel | Data |
|-------|---------|------|
| Text chunk | `STREAM_CHUNK` | `{ type: 'text', content, messageId, sessionId }` |
| Reasoning | `STREAM_CHUNK` | `{ type: 'reasoning', reasoning, ... }` |
| Tool call | `STREAM_CHUNK` | `{ type: 'tool_call', toolCall, ... }` |
| Tool result | `STREAM_CHUNK` | `{ type: 'tool_result', toolCall, ... }` |
| Tool input start | `STREAM_CHUNK` | `{ type: 'tool_input_start', toolCallId, toolName }` |
| Tool input delta | `STREAM_CHUNK` | `{ type: 'tool_input_delta', toolCallId, argsTextDelta }` |
| Continuation | `STREAM_CHUNK` | `{ type: 'continuation', ... }` |
| Content part | `STREAM_CHUNK` | `{ type: 'content_part', contentPart, ... }` |
| Complete | `STREAM_COMPLETE` | `{ messageId, sessionId, usage, aborted? }` |
| Error | `STREAM_ERROR` | `{ messageId, sessionId, error, errorDetails }` |
| Step added | `STEP_ADDED` | `{ sessionId, messageId, step }` |
| Step updated | `STEP_UPDATED` | `{ sessionId, messageId, stepId, updates }` |

### 2.7 Renderer Processing

**File:** `src/renderer/stores/chat.ts`

```
Listeners (setup on mount):
  electronAPI.onStreamChunk()    → handleStreamChunk()
  electronAPI.onStreamComplete() → handleStreamComplete()
  electronAPI.onStreamError()    → handleStreamError()
  electronAPI.onStepAdded()      → handleStepAdded()
  electronAPI.onStepUpdated()    → handleStepUpdated()

handleStreamChunk(chunk):
  switch (chunk.type):
    'text'              → append to message.content
    'reasoning'         → append to message.reasoning
    'tool_call'         → create/update in message.toolCalls[]
    'tool_result'       → update toolCall status/result
    'tool_input_start'  → create toolCall with status 'input-streaming'
    'tool_input_delta'  → accumulate streamingArgs
    'content_part'      → add to message.contentParts[]
    'continuation'      → add { type: 'waiting' } contentPart
```

### 2.8 Edit and Resend

Nearly identical to send flow:
1. `store.updateMessageAndTruncate(sessionId, messageId, newContent)` — truncates messages after edit point
2. Creates new assistant message
3. Calls `executeMessageStream()` with rebuilt history

### 2.9 Abort

1. User calls `electronAPI.abortStream(sessionId)`
2. Handler finds `activeStreams[sessionId]`, calls `controller.abort()`
3. Cancels all pending steps
4. Sends `STREAM_COMPLETE { aborted: true }`

---

## 3. Tool Call System

### 3.1 Tool Registry

**File:** `src/main/tools/core/registry.ts`

Three registries coexist:
- `toolRegistry` — Legacy tools (Map)
- `toolRegistryV2` — Static V2 tools (Map)
- `toolRegistryV2Async` — Async V2 tools with dynamic init (Map)

Key functions:
- `registerToolV2(tool)` — Register V2 tool
- `getAllToolsAsync()` — Get all tools (initializes async tools)
- `getEnabledToolsAsync(toolSettings)` — Filter by settings
- `getToolsForAI(toolSettings)` — Format for Vercel AI SDK
- `executeTool(toolId, args, context)` — Execute any tool
- `canAutoExecute(toolId, toolSettings)` — Check auto-execute permission

### 3.2 Built-in Tools

| Tool ID | Auto-Execute | Category | Description |
|---------|-------------|----------|-------------|
| `bash` | No | builtin | Execute shell commands (classified: allow/ask/deny) |
| `read` | Yes | builtin | Read files with line numbers, images, PDFs |
| `write` | No | builtin | Write/overwrite files (shows diff) |
| `edit` | No | builtin | In-place string replacement (9-strategy fuzzy matching) |
| `glob` | Yes | builtin | Fast file pattern matching (ripgrep) |
| `grep` | Yes | builtin | Content search with regex (ripgrep) |
| `plan` | Yes | builtin | Create/manage structured task lists |
| `memory` | Yes | builtin | Update user profile, preferences, topics |
| `mouse` | No | builtin | Control mouse position, clicks, scrolling |
| `keyboard` | No | builtin | Simulate keyboard input |
| `screenshot` | No | builtin | Capture screen or element |
| `web_search` | Yes | builtin | Search web (Brave API) |
| `skill` | Yes (async) | builtin | Load skill instructions dynamically |
| `custom-agent` | No (async) | builtin | Invoke custom agents |

### 3.3 Tool Execution During Chat

**File:** `src/main/ipc/chat/tool-execution.ts` → `executeToolAndUpdate()`

```
When AI returns a tool_call:

1. Check abort signal
2. Detect skill usage (bash reading SKILL.md)
3. Get/create Step (UI tracking)
4. Check builtin mode permissions
5. Execute tool:pre hooks (plugins can modify/abort)
6. executeToolDirectly():
   ├─ If MCP tool → executeMCPTool(toolName, args)
   └─ If builtin → executeTool(toolName, args, context)
7. Handle result:
   ├─ requiresConfirmation → pause for user decision
   └─ completed/failed → update step, emit result
8. Execute tool:post hooks
9. Update store + emit IPC events
```

### 3.4 Bash Command Classification

**File:** `src/main/tools/builtin/bash-v2.ts`

```
classifyCommand(command):
  'allow' → Read-only (cat, ls, pwd, git status, npm list, ...)
  'ask'   → Dangerous (rm, mv, cp, git commit, npm install, ...)
  'deny'  → Forbidden (sudo, shutdown, reboot, mkfs, iptables, ...)
```

Forbidden patterns: `rm -rf /`, pipes to shell, command substitution with rm.

Sandbox boundary: `ctx.workingDirectory` > `settings.defaultWorkingDirectory` > `process.cwd()`

Output limits: 30,000 chars max; exceeding writes to file and shows HEAD+TAIL preview.

---

## 4. Permission System

**File:** `src/main/permission/index.ts`

### Flow

```
Tool calls Permission.ask({ type, pattern, sessionId, ... })
    ↓
Check workspace approvals (~/.claude/permissions/workspace-{hash}.json)
    ↓ (not found)
Check session approvals (in-memory)
    ↓ (not found)
Emit PERMISSION_REQUEST IPC event → Frontend shows dialog
    ↓
User responds: 'once' | 'session' | 'workspace' | 'reject'
    ↓
Permission.respond() → resolve/reject Promise
    ↓
If approved: tool continues execution
If rejected: throw RejectedError → tool fails gracefully
```

### Permission Levels

| Level | Scope | Persistence |
|-------|-------|-------------|
| `once` | Single operation | None |
| `session` | Current session | In-memory |
| `workspace` | Working directory | File on disk |
| `reject` | Deny with reason | None |

### Workspace Storage

- Path: `~/.claude/permissions/workspace-{md5hash12}.json`
- Pattern matching: exact or wildcard (`pattern*`)
- In-memory cache with disk change detection

---

## 5. Memory System

### 5.1 Architecture

Two independent memory systems coexist:

| System | Storage | Status | Purpose |
|--------|---------|--------|---------|
| **Text-based** | Markdown files (`~/.0nething/memory/`) | Active | Long-term, human-readable |
| **Agent memory** | SQLite (`agentMemory` table) | Active | Per-agent state (trust, mood) |
| **Embedding-based** | SQLite + vectors | Dead code (removed) | Was Mem0-style, replaced |

### 5.2 Text-Based Memory

**Directory:** `src/main/services/memory-text/`

**File Structure:**
```
~/.0nething/memory/
├── _core/
│   ├── profile.md          # User personal info
│   └── preferences.md      # User preferences
├── topics/
│   ├── vue.md              # Topic-specific notes
│   └── electron.md
└── agents/{agentId}/
    ├── relationship.md     # Agent relationship data
    └── topics/             # Agent-specific topics
```

**File Format:** YAML frontmatter + Markdown content
```yaml
---
created: 2026-01-15T10:00:00Z
updated: 2026-03-16T14:30:00Z
source: conversation
tags: [frontend, vue, pinia]
importance: 3
accessCount: 5
---
## Section Heading
- Memory point content
```

**Key Components:**

| File | Purpose |
|------|---------|
| `text-memory-storage.ts` | Core CRUD, file parsing, section operations |
| `memory-retriever.ts` | Keyword extraction + relevance scoring + context injection |
| `memory-writer.ts` | Write profile/preferences/topics, append/replace sections |
| `memory-manager.ts` | High-level CRUD operations |
| `memory-index.ts` | Full-text search index (`_index.json`) |
| `memory-feedback.ts` | Track helpful/unhelpful memory feedback |

### 5.3 Memory Retrieval for Chat

**File:** `memory-retriever.ts` → `loadMemoryForChat()`

```
New chat message arrives
    ↓
Parallel loads:
  - loadCoreMemory() → _core/* files
  - loadAgentMemory(agentId) → agents/{id}/relationship.md
  - retrieveRelevantMemoryWithFiles(message):
      1. Extract keywords (AI-powered or rule-based fallback)
      2. Load _index.json
      3. Score files by: tag match (100pts), keyword (50pts), related (20pts)
      4. Boost by importance and access count
      5. Load top 10 files, parse sections
    ↓
formatMemoryPrompt() → inject into system prompt:
  ## User Profile
  {coreMemory}
  ## Agent Relationship
  {agentMemory}
  ## Relevant Context
  {topicMemory}
```

### 5.4 Memory Tool (AI Direct Access)

**File:** `src/main/tools/builtin/memory.ts`

Auto-execute tool with 6 actions:
- `update_profile` — Append to profile section
- `update_preferences` — Append to preferences section
- `create_topic` — Create/update topic file
- `list_topics` — List existing topics
- `read_memory` — Read specific memory file
- `edit_section` — Replace section content

### 5.5 Agent Memory (SQLite)

**File:** `src/main/ipc/agent-memory.ts`

Per-agent data stored in SQLite with:
- Memory entries (strength, decay, emotional weight, vividness)
- Relationship data (trust, familiarity, mood, interaction count)

7 IPC channels for CRUD operations.

### 5.6 Embedding Service

**File:** `src/main/services/memory/embedding-service.ts`

Still active — used for keyword extraction. Supports 4 providers:

| Provider | Model | Dimensions | Batch |
|----------|-------|------------|-------|
| OpenAI | text-embedding-3-small | 384 | Yes |
| Zhipu | embedding-3 | - | No |
| Gemini | text-embedding-004 | - | No |
| Local | Xenova/all-MiniLM-L6-v2 | 384 | No |

Fallback chain: API provider → Local.

---

## 6. Custom Agent System

### 6.1 Overview

Custom agents are user-definable AI sub-agents with isolated tools and custom system prompts. The main LLM can delegate tasks to them via the `custom-agent` tool.

**Directory:** `src/main/services/custom-agent/`

### 6.2 Agent Storage (Dual)

| Source | Path | Format | Priority |
|--------|------|--------|----------|
| File-based (user) | `~/.0nething/agents/*.json` | Individual JSON files | Lower |
| File-based (project) | `{workDir}/.0nething/agents/*.json` | Individual JSON files | Higher |
| Store-based (user) | `{electronStore}/custom-agents/index.json` | Array in single file | Highest |

Merge strategy: deduplicate by name, higher priority wins.

### 6.3 Agent Definition

```typescript
{
  id: string              // "source:name" or "custom-agent-{ts}-{rand}"
  name: string
  description: string
  systemPrompt: string    // Agent's personality/instructions
  customTools: CustomToolDefinition[]
  allowBuiltinTools?: boolean        // Default: false
  allowedBuiltinTools?: string[]     // Whitelist of builtin tool IDs
  maxToolCalls?: number              // Default: 20
  timeoutMs?: number                 // Default: 120000 (2 min)
  enableMemory?: boolean             // Default: true
}
```

### 6.4 Execution Flow

**File:** `executor.ts` → `executeCustomAgent()`

```
Main LLM calls CustomAgentTool with { agent: "name", task: "..." }
    ↓
CustomAgentTool.execute() finds agent from merged list
    ↓
executeCustomAgent(agent, request, context, events):

  1. Build tools:
     - Convert custom tools (bash, http, builtin types)
     - If allowBuiltinTools: load specified builtins
     - Merge: custom tools override builtins

  2. Build system prompt + tool descriptions

  3. Tool loop (while turns < maxToolCalls/3):
     Per turn:
     ┌──────────────────────────────────────────┐
     │ streamChatResponseWithTools()            │
     │   ↓                                      │
     │ Process chunks:                          │
     │   text → accumulate                      │
     │   tool-call →                            │
     │     ├─ Custom? → executeCustomTool()     │
     │     ├─ Builtin? → executeTool()          │
     │     │   └─ requiresConfirmation?         │
     │     │       → IPC permission request     │
     │     │       → await user decision        │
     │     └─ Unknown? → error                  │
     │   ↓                                      │
     │ Build continuation messages              │
     │ If no tool calls → break                 │
     └──────────────────────────────────────────┘

  4. Return: { success, summary, steps, toolCallCount, executionTimeMs }
    ↓
Steps converted to UI Steps and forwarded via onStepStart/onStepComplete
```

### 6.5 Custom Tool Types

| Type | Execution | Example |
|------|-----------|---------|
| `bash` | Shell command with `{{param}}` interpolation | `git log --oneline -{{count}}` |
| `http` | HTTP request with template URL/body | `GET https://api.example.com/{{id}}` |
| `builtin` | Delegate to built-in tool with args mapping | `toolId: "grep"` |

### 6.6 Permission Flow

```
Agent tool execution needs confirmation
    ↓
onPermissionRequired(stepId, toolCall) callback
    ↓
Store in pendingPermissionRequests Map
    ↓
Send IPC: CUSTOM_AGENT_PERMISSION_REQUEST to all windows
    ↓
Frontend shows dialog
    ↓
User responds → IPC: CUSTOM_AGENT_PERMISSION_RESPOND
    ↓
Resolve pending Promise → continue or reject execution
```

---

## 7. Skills System

### 7.1 What is a Skill?

A Skill is a directory containing a `SKILL.md` file with YAML frontmatter + instructions:

```markdown
---
name: my-skill
description: Does something useful
allowed-tools:
  - bash
  - read
---

Instructions for the AI to follow when this skill is activated...
```

### 7.2 Skill Sources (Priority Order)

| Source | Path | Priority |
|--------|------|----------|
| Project | `.claude/skills/` (upward traversal) | Highest |
| User | `~/.claude/skills/` | High |
| Environment | `$CLAUDE_SKILLS_DIR` | Medium |
| Plugin | `~/.claude/plugins/cache/.../skills/` | Low |
| Builtin | `resources/skills/` | Lowest |

**File:** `src/main/skills/loader.ts` → `loadAllSkills(workingDirectory?)`

### 7.3 Skill Integration in Chat

```
Session starts
    ↓
getSkillsForSession(workingDirectory)
  → loads from all sources, deduplicates by name, applies enabled state
    ↓
buildSystemPromptV2() includes skills awareness
  → AI sees skill descriptions in system prompt
    ↓
AI decides to use a skill:
  Option A: Reads SKILL.md via bash tool (cat path/SKILL.md)
  Option B: Uses skill tool directly
    ↓
AI follows instructions from skill, executes required tools
```

### 7.4 Skill Tool (Async)

**File:** `src/main/tools/builtin/skill.ts`

- Dynamically builds parameter schema from available skills
- Auto-execute: yes (returns instructions only)
- Respects agent `allowedSkills` restrictions

### 7.5 IPC Channels

| Channel | Purpose |
|---------|---------|
| `SKILLS_GET_ALL` | Get all cached skills |
| `SKILLS_REFRESH` | Reload from filesystem |
| `SKILLS_READ_FILE` | Read file from skill directory |
| `SKILLS_OPEN_DIRECTORY` | Open in file manager |
| `SKILLS_CREATE` | Create new skill |
| `SKILLS_DELETE` | Delete skill |
| `SKILLS_TOGGLE_ENABLED` | Toggle enabled state |

---

## 8. MCP (Model Context Protocol)

### 8.1 Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│ MCP Manager          │     │ External MCP Servers  │
│ (src/main/mcp/)      │────→│ - stdio processes     │
│                      │     │ - SSE endpoints       │
│ - Server lifecycle   │←────│                       │
│ - Tool aggregation   │     └──────────────────────┘
│ - Bridge to registry │
└──────────┬───────────┘
           │ registerMCPTools()
┌──────────┴───────────┐
│ Tool Registry        │
│ ID: mcp:{server}:{tool} │
└──────────────────────┘
```

### 8.2 Server Configuration

```typescript
interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  enabled: boolean
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  // sse
  url?: string
  headers?: Record<string, string>
}
```

### 8.3 Key Components

| File | Purpose |
|------|---------|
| `manager.ts` | Singleton MCPManager — server lifecycle, tool aggregation |
| `client.ts` | MCPClient — connection, capability fetching, tool execution |
| `bridge.ts` | Bridge — converts MCP tools ↔ internal format, registers with tool registry |
| `types.ts` | Type definitions |

### 8.4 MCP Flow

```
App startup → initializeMCP()
    ↓
MCPManager.initialize(settings)
  → Connect to each enabled server
  → Fetch capabilities (listTools, listResources, listPrompts)
    ↓
registerMCPTools()
  → Convert MCPToolInfo → ToolDefinition
  → Register with tool registry (id: "mcp:{serverId}:{toolName}")
  → Generate tools catalog markdown
    ↓
During chat:
  getMCPToolsForAI() → include in streamText() tools parameter
    ↓
AI calls mcp tool → parseMCPToolId() → MCPManager.callTool(serverId, toolName, args)
    ↓
MCPClient.callTool() → MCP SDK client.callTool({ name, arguments })
    ↓
Result returned to AI for next turn
```

### 8.5 Tool Name Format

```
Internal: mcp:{serverId}:{toolName}
AI-facing: mcp_{serverId}_{toolName} (sanitized for API compatibility)
```

Bidirectional mapping maintained in `sanitizedToOriginalMap`.

---

## 9. Provider & Settings System

### 9.1 Settings Structure

**File:** `src/shared/defaults/settings.ts`

```
AppSettings
├── ai
│   ├── provider          # Active provider ID
│   ├── temperature       # Default temperature
│   ├── providers         # Per-provider configs (apiKey, model, selectedModels, baseUrl)
│   └── customProviders   # User-defined providers
├── general
│   ├── sendShortcut      # Enter / Ctrl+Enter / Cmd+Enter
│   ├── darkThemeId       # Theme selection
│   ├── lightThemeId
│   ├── chatFontSize
│   ├── userProfile       # Name, timezone, language
│   └── shortcuts         # Keyboard shortcuts
├── chat
│   ├── temperature, maxTokens, topP
│   ├── presencePenalty, frequencyPenalty
│   └── contextCompactThreshold (85%)
├── tools
│   ├── enableToolCalls
│   ├── tools             # Per-tool enabled/autoExecute settings
│   └── bash              # Sandbox settings
├── embedding
│   ├── provider          # openai/zhipu/gemini/local
│   ├── memoryEnabled     # Master toggle
│   └── model, dimensions
├── theme                 # light/dark/system
├── mcp?                  # MCP server configs
└── skills?               # Skill enabled states
```

### 9.2 Settings Flow

```
Main Process:
  initializeSettings() → load from disk, merge with defaults
  getSettings() → return cached settings (sync)
  saveSettings() → write to disk + update cache

Renderer Process (Pinia):
  loadSettings() → IPC fetch from main
  saveSettings() → IPC save to main + apply theme
```

### 9.3 Built-in Providers

| Provider | SDK | Auth | Special |
|----------|-----|------|---------|
| **OpenAI** | `@ai-sdk/openai` | API Key | Custom base URL |
| **Claude** | `@ai-sdk/anthropic` | API Key | Custom base URL |
| **DeepSeek** | `@ai-sdk/deepseek` | API Key | Reasoning support |
| **Kimi** | `@ai-sdk/openai` (compat) | API Key | Long context (128k) |
| **Zhipu** | Custom V2 impl | API Key | System merge required with tools |
| **Gemini** | `@ai-sdk/google` | API Key | Vision support |
| **OpenRouter** | `@ai-sdk/openai-compatible` | API Key | Multi-provider routing |
| **Claude Code** | `@ai-sdk/anthropic` + OAuth | OAuth PKCE | Uses Claude Pro/Max subscription |
| **GitHub Copilot** | `@ai-sdk/openai-compatible` | OAuth Device | Two-step token exchange |
| **Custom** | Dynamic | API Key | User-defined OpenAI/Anthropic compatible |

### 9.4 Provider Selection Priority

```
1. Session cached config (fastest)
   └─ getCachedProviderConfig(sessionId)
2. Session lastProvider + lastModel
   └─ session.lastProvider, session.lastModel
3. Global settings
   └─ settings.ai.provider + settings.ai.providers[provider].model
```

### 9.5 OAuth

**File:** `src/main/services/auth/oauth-manager.ts`

| Provider | Flow | Token Storage |
|----------|------|---------------|
| Claude Code | PKCE (Authorization Code) | Encrypted file |
| GitHub Copilot | Device Flow → Token Exchange | Encrypted file |

Tokens encrypted via `safeStorage.encryptString()`, stored in `oauth-tokens.json`. Auto-refresh with 5-minute expiry buffer.

---

## 10. Post-Chat Triggers

### 10.1 Trigger Interface

**File:** `src/main/services/triggers/index.ts`

```typescript
interface Trigger {
  id: string
  name: string
  priority: number  // Lower = runs first

  shouldTrigger(ctx: TriggerContext): Promise<boolean>
  execute(ctx: TriggerContext): Promise<void>
}
```

TriggerContext: `{ sessionId, session, messages, lastUserMessage, lastAssistantMessage, providerId, providerConfig, agentId? }`

### 10.2 Active Trigger: Text Memory Update

**File:** `src/main/services/triggers/text-memory-update.ts`

**Priority:** 5 (early execution)

```
After assistant response completes:
    ↓
shouldTrigger():
  - Check settings.embedding.memoryEnabled
  - Check if Memory tool already used (skip if yes)
  - Check message lengths (user > 10 chars, assistant > 30 chars)
    ↓
execute():
  1. Get existing topics list
  2. Call LLM with extraction prompt
  3. Parse JSON response: { shouldRemember, profile, preferences, topic, agentMemory }
  4. Apply updates:
     - updateUserProfile(section, content, tags)
     - updateUserPreferences(section, content, tags)
     - createTopicFile(name, content, agentId, tags)
     - addAgentMemoryPoint(agentId, observation)
```

### 10.3 Registration

```
// src/main/ipc/chat.ts
triggerManager.register(textMemoryUpdateTrigger)

// After stream completes:
triggerManager.runPostResponse(triggerContext)
```

---

## 11. Complete Request Lifecycle

```
┌─ USER INPUT ──────────────────────────────────────────────────┐
│ InputBox.vue → chatStore.sendMessage() → IPC invoke           │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─ MAIN PROCESS HANDLER ───────────────────────────────────────┐
│ handleSendMessageStream():                                    │
│   1. Create user + assistant messages                        │
│   2. Validate provider config + credentials                  │
│   3. Return immediately → async streaming begins             │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─ STREAM INITIALIZATION ──────────────────────────────────────┐
│ executeStreamGeneration():                                    │
│   1. Load skills for session                                 │
│   2. Initialize async tools (SkillTool, CustomAgentTool)     │
│   3. Load enabled tools (builtin + MCP)                      │
│   4. Build system prompt:                                     │
│      - Base instructions                                      │
│      - Skills awareness                                       │
│      - Memory context (profile + topics + agent)             │
│      - Workspace system prompt                               │
│      - Tool descriptions                                      │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─ TOOL LOOP (max 100 turns) ──────────────────────────────────┐
│                                                               │
│  ┌─ PER TURN ───────────────────────────────────────────┐    │
│  │                                                       │    │
│  │  [Pre-request compacting if >85% context]            │    │
│  │            ↓                                          │    │
│  │  streamChatResponseWithTools()                        │    │
│  │    → Provider creates LanguageModel instance          │    │
│  │    → Vercel AI SDK streamText()                      │    │
│  │    → Iterate stream.fullStream                       │    │
│  │            ↓                                          │    │
│  │  Process chunks:                                     │    │
│  │    text ──→ accumulate + IPC emit to renderer        │    │
│  │    reasoning ──→ accumulate + IPC emit               │    │
│  │    tool-call ──→ executeToolAndUpdate():              │    │
│  │      ┌─────────────────────────────────────┐         │    │
│  │      │ Check abort signal                  │         │    │
│  │      │ Run tool:pre hooks                  │         │    │
│  │      │ executeToolDirectly():              │         │    │
│  │      │   MCP? → MCPManager.callTool()      │         │    │
│  │      │   Builtin? → executeTool()          │         │    │
│  │      │     bash? → classify + permission   │         │    │
│  │      │     read/glob/grep? → auto-execute  │         │    │
│  │      │     write/edit? → show diff + perm  │         │    │
│  │      │     custom-agent? → agent loop      │         │    │
│  │      │     skill? → load instructions      │         │    │
│  │      │ Run tool:post hooks                 │         │    │
│  │      │ Update step + emit IPC              │         │    │
│  │      └─────────────────────────────────────┘         │    │
│  │            ↓                                          │    │
│  │  Loop control:                                       │    │
│  │    No tool calls → EXIT                              │    │
│  │    Tool needs confirmation → PAUSE                   │    │
│  │    More tools → build continuation → NEXT TURN       │    │
│  │                                                       │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─ POST-RESPONSE ──────────────────────────────────────────────┐
│ 1. Send STREAM_COMPLETE event                                 │
│ 2. Save final message to session store                       │
│ 3. Run triggers:                                              │
│    - textMemoryUpdateTrigger:                                │
│      → LLM extracts facts from conversation                  │
│      → Updates profile/preferences/topics                    │
│ 4. Record agent interaction (if agent session)               │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─ RENDERER UPDATE ────────────────────────────────────────────┐
│ handleStreamComplete():                                       │
│   - Finalize message content                                  │
│   - Update usage stats                                        │
│   - Mark stream as complete                                   │
│   - Vue reactivity updates UI                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Appendix: Key File Reference

| Component | File | Key Function |
|-----------|------|--------------|
| IPC Handler | `src/main/ipc/chat.ts` | `handleSendMessageStream()` |
| Stream Executor | `src/main/ipc/chat/stream-executor.ts` | `executeMessageStream()` |
| Tool Loop | `src/main/ipc/chat/tool-loop.ts` | `runStream()`, `executeStreamGeneration()` |
| Tool Execution | `src/main/ipc/chat/tool-execution.ts` | `executeToolAndUpdate()` |
| Stream Processor | `src/main/ipc/chat/stream-processor.ts` | `createStreamProcessor()` |
| IPC Emitter | `src/main/ipc/chat/ipc-emitter.ts` | `createIPCEmitter()` |
| Provider | `src/main/providers/index.ts` | `streamChatResponseWithTools()` |
| Provider Registry | `src/main/providers/registry.ts` | `createProviderInstance()` |
| Tool Registry | `src/main/tools/core/registry.ts` | `executeTool()`, `getToolsForAI()` |
| Permission | `src/main/permission/index.ts` | `Permission.ask()`, `Permission.respond()` |
| Memory Retriever | `src/main/services/memory-text/memory-retriever.ts` | `loadMemoryForChat()` |
| Memory Writer | `src/main/services/memory-text/memory-writer.ts` | `updateUserProfile()` |
| Memory Tool | `src/main/tools/builtin/memory.ts` | `MemoryTool.execute()` |
| Agent Loader | `src/main/services/custom-agent/loader.ts` | `loadCustomAgents()` |
| Agent Executor | `src/main/services/custom-agent/executor.ts` | `executeCustomAgent()` |
| Skill Loader | `src/main/skills/loader.ts` | `loadAllSkills()` |
| MCP Manager | `src/main/mcp/manager.ts` | `MCPManager.callTool()` |
| MCP Bridge | `src/main/mcp/bridge.ts` | `registerMCPTools()`, `getMCPToolsForAI()` |
| Trigger Manager | `src/main/services/triggers/index.ts` | `TriggerManager.runPostResponse()` |
| Memory Trigger | `src/main/services/triggers/text-memory-update.ts` | `textMemoryUpdateTrigger` |
| Chat Store | `src/renderer/stores/chat.ts` | `handleStreamChunk()` |
| Settings | `src/shared/defaults/settings.ts` | Default values |
| OAuth | `src/main/services/auth/oauth-manager.ts` | Token management |
| Preload | `src/preload/index.ts` | `electronAPI` bridge |
