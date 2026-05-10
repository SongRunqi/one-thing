# Long Session Storage And Rendering

This document designs the production path for long chat sessions. The goal is
to make session switching, history navigation, and large assistant outputs fast
without regressing the streaming scroll stability documented in
`docs/design/streaming-scroll-stability.md`.

## Problem

Sessions are currently persisted as one JSON file per session:

```text
~/.onething/sessions/index.json
~/.onething/sessions/{sessionId}.json
```

The session file contains metadata, token usage, variables, and the full
`messages` array. Long sessions are slow because switching can require:

- reading and parsing one large JSON object;
- sending the full message array over IPC;
- rebuilding `contentParts` and tool-call links for every historical message;
- mounting every message, markdown block, code block, and tool component in the
  renderer.

The current native `MessageList.vue` rendering is intentional. A previous
generic virtual list interacted poorly with dynamically growing streaming
markdown/code blocks. Any long-session fix must preserve the current bottom
follow model and avoid making streaming content depend on estimated heights.

## Design Principles

1. **Storage is indexed by stable semantic order.**
   Use `session_id + seq` for timeline order. Never use array offsets as an API
   contract.

2. **The timeline and large message bodies are separate concerns.**
   Timeline pagination solves many turns. Block/chunk rendering solves one huge
   assistant message, code block, table, diff, or tool output.

3. **Scroll state is semantic, not global pixels.**
   Store anchors such as `{ messageId, seq, blockId, offsetWithinAnchor }`.
   Pixel offsets are only local corrections inside an anchor.

4. **Streaming bottom-follow remains native.**
   Do not reintroduce generic virtualization as the first fix. Prepending older
   history uses a separate top-anchor transaction.

5. **Migration is lazy and reversible.**
   Legacy JSON remains readable. SQLite becomes the primary store only after a
   session has been migrated successfully.

## Target Storage

SQLite becomes the primary store:

```text
~/.onething/onething.sqlite
```

Legacy JSON files stay in place for import, rollback, and user safety.

### Tables

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  parent_session_id TEXT,
  branch_from_message_id TEXT,
  last_model TEXT,
  last_provider TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  working_directory TEXT,
  summary TEXT,
  summary_up_to_message_id TEXT,
  summary_created_at INTEGER,
  migration_state TEXT NOT NULL DEFAULT 'pending',
  migrated_from_json_at INTEGER,
  legacy_json_path TEXT
);

CREATE TABLE session_usage (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_input_tokens INTEGER NOT NULL DEFAULT 0,
  context_size INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE session_variables (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at INTEGER,
  PRIMARY KEY (session_id, name)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  timestamp INTEGER NOT NULL,
  reasoning TEXT,
  is_streaming INTEGER NOT NULL DEFAULT 0,
  is_thinking INTEGER NOT NULL DEFAULT 0,
  error_details TEXT,
  model TEXT,
  thinking_time INTEGER,
  thinking_start_time INTEGER,
  skill_used TEXT,
  content_parts_json TEXT,
  tool_calls_json TEXT,
  steps_json TEXT,
  attachments_json TEXT,
  usage_json TEXT,
  UNIQUE (session_id, seq)
);

CREATE TABLE message_blocks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  block_seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT,
  json TEXT,
  line_count INTEGER,
  byte_length INTEGER,
  is_large INTEGER NOT NULL DEFAULT 0,
  UNIQUE (message_id, block_seq)
);

CREATE TABLE block_chunks (
  block_id TEXT NOT NULL REFERENCES message_blocks(id) ON DELETE CASCADE,
  chunk_seq INTEGER NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  text TEXT NOT NULL,
  PRIMARY KEY (block_id, chunk_seq)
);

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

### Indexes

```sql
CREATE INDEX idx_sessions_active_updated
  ON sessions(is_archived, is_pinned, updated_at DESC);

CREATE INDEX idx_messages_session_seq
  ON messages(session_id, seq);

CREATE INDEX idx_messages_session_role_seq
  ON messages(session_id, role, seq);

CREATE INDEX idx_blocks_message_seq
  ON message_blocks(message_id, block_seq);
```

`messages` keeps enough JSON columns to preserve the current `ChatMessage`
surface without immediately normalizing every nested structure. `message_blocks`
and `block_chunks` are added early so very large content can move out of the
ordinary markdown path incrementally.

## Repository Layer

Introduce a storage interface under `src/main/stores/session-repository/`:

```ts
interface SessionRepository {
  getSessionsList(): SessionMeta[]
  getSessionDetails(sessionId: string): SessionDetails | undefined
  getSessionMessagesPage(params: GetSessionMessagesPageRequest): GetSessionMessagesPageResponse
  getSessionForGeneration(sessionId: string): ChatSession | undefined
  getUserMessageMarkers(sessionId: string): UserMessageMarker[]
  createSession(sessionId: string, name: string): ChatSession
  addMessage(sessionId: string, message: ChatMessage): void
  updateMessage(sessionId: string, messageId: string, patch: Partial<ChatMessage>): boolean
  updateMessageAndTruncate(sessionId: string, messageId: string, newContent: string): boolean
  updateSessionTokenUsage(sessionId: string, usage: TokenUsage, lastTurnUsage?: TurnUsage): void
  flushSessionSave(sessionId: string): Promise<void>
  flushAllPendingSaves(): Promise<void>
}
```

Implementation phases:

- `JsonSessionRepository`: wraps existing JSON behavior.
- `SqliteSessionRepository`: new primary implementation.
- `HybridSessionRepository`: reads JSON lazily, migrates that session into
  SQLite, then serves future reads from SQLite.

The existing `src/main/stores/sessions.ts` should become a facade so the engine,
IPC handlers, variables subsystem, and tools can move gradually.

`getSessionMessagesPage()` is a UI/read-model API. It must not replace the
engine's model-context read path. Streaming, retry, resume-after-confirm,
edit-and-resend, and title generation still need a complete effective
conversation history, including summaries and truncation rules. Keep that path
behind `getSessionForGeneration()` until prompt construction is redesigned.

## SQLite Driver

Use `better-sqlite3` unless packaging constraints reject native modules. It is
sync, fast, and simple for Electron main-process storage. Writes are short and
transactional, and existing code already assumes main-process synchronous store
APIs in many places.

If native packaging becomes a blocker, fall back to `sqlite3`/`node:sqlite`
when available, but keep the repository API unchanged.

## IPC API

Keep legacy channels for compatibility, but introduce page-first APIs.

```ts
export interface GetSessionMessagesPageRequest {
  sessionId: string
  cursor?: string | null
  limit?: number
  direction?: 'older' | 'newer'
  anchor?: 'tail' | {
    messageId?: string
    seq?: number
    before?: number
    after?: number
  }
}

export interface SessionMessagePageCursor {
  sessionId: string
  seq: number
  includeAnchor: boolean
}

export interface GetSessionMessagesPageResponse {
  success: boolean
  messages?: ChatMessage[]
  nextCursor?: string | null
  backwardsCursor?: string | null
  hasMoreBefore?: boolean
  hasMoreAfter?: boolean
  totalCount?: number
  error?: string
}

export interface UserMessageMarker {
  id: string
  seq: number
  timestamp: number
  preview: string
}
```

Cursor tokens are opaque strings at the IPC boundary. Internally they encode a
semantic anchor, not an offset.

### Queries

Tail page:

```sql
SELECT *
FROM messages
WHERE session_id = ?
ORDER BY seq DESC
LIMIT ?;
```

Older page:

```sql
SELECT *
FROM messages
WHERE session_id = ?
  AND seq < ?
ORDER BY seq DESC
LIMIT ?;
```

Newer page:

```sql
SELECT *
FROM messages
WHERE session_id = ?
  AND seq > ?
ORDER BY seq ASC
LIMIT ?;
```

Around anchor:

```sql
SELECT seq
FROM messages
WHERE session_id = ?
  AND id = ?;

SELECT *
FROM messages
WHERE session_id = ?
  AND seq BETWEEN ? AND ?
ORDER BY seq ASC;
```

User markers:

```sql
SELECT id, seq, timestamp, substr(content, 1, 80) AS preview
FROM messages
WHERE session_id = ?
  AND role = 'user'
ORDER BY seq ASC;
```

## Renderer State

Replace the single `Map<sessionId, ChatMessage[]>` assumption with a loaded
window while preserving a computed `messages` array for components:

```ts
interface SessionMessageWindow {
  messages: ChatMessage[]
  oldestSeq: number | null
  newestSeq: number | null
  oldestMessageId: string | null
  newestMessageId: string | null
  hasMoreBefore: boolean
  hasMoreAfter: boolean
  isInitialLoading: boolean
  isLoadingOlder: boolean
  isLoadingAround: boolean
  loadedAroundMessageId?: string
}
```

Initial switch flow:

1. `activateSession(sessionId)` returns metadata only.
2. Set `currentSessionId` immediately.
3. Load `getSessionMessagesPage({ sessionId, anchor: 'tail', limit: 120 })`.
4. Restore a saved semantic anchor if it is inside the loaded window.
5. If it is outside, call `anchor: { messageId, before: 40, after: 80 }`.

Snapshots should move from index-based to semantic anchors:

```ts
interface SessionUISnapshot {
  mode: 'bottom' | 'anchor'
  anchorMessageId?: string
  anchorSeq?: number
  anchorBlockId?: string
  offsetWithinAnchor?: number
  navMessageId?: string
  messageInput: string
  quotedText: string
}
```

Active streaming state is merged into the loaded window. If a stream is running
for a message outside the current window, append or replace that message in the
window so live updates remain visible when the user is following bottom.

## Scroll Stability

There are two independent scroll modes.

### Bottom Follow

Streaming output keeps the current `useFollowScroll` model:

- native list rendering;
- natural browser scroll bottom;
- real bottom padding;
- `ResizeObserver` and `MutationObserver` nudges;
- no generic virtualizer as the first optimization.

### Prepend Older History

Loading older history uses a top-anchor transaction:

```ts
const anchor = captureTopAnchor()
isPrependingHistory.value = true
await chatStore.loadOlderMessages(sessionId)
await nextTick()
restoreTopAnchor(anchor)
isPrependingHistory.value = false
```

`captureTopAnchor()` records the first visible semantic element:

```ts
{
  messageId,
  seq,
  blockId?,
  offsetWithinAnchor
}
```

`restoreTopAnchor()` finds the same DOM node after prepend and writes:

```ts
scroller.scrollTop = anchorNode.offsetTop + anchor.offsetWithinAnchor
```

During the transaction:

- do not call `snapToBottom`;
- do not change `isFollowing`;
- do not treat the prepended content as streaming drift;
- do not update nav highlight from intermediate scroll events.

This uses real post-layout DOM positions. It does not estimate message heights.

## Large Content Rendering

Timeline pagination alone is not enough when one assistant message contains a
huge code block, log, diff, table, or tool output. The renderer needs block
boundaries.

### Block Model

Convert assistant content into stable blocks:

```ts
type RenderBlock =
  | { id: string; type: 'markdown'; text: string }
  | { id: string; type: 'code'; language?: string; lineCount: number; text?: string }
  | { id: string; type: 'tool-call'; toolCallId: string }
  | { id: string; type: 'table'; json: unknown }
  | { id: string; type: 'diff'; json: unknown }
```

Short blocks render inline. Large blocks use specialized viewers:

- code/log: read-only CodeMirror or a line-window viewer;
- tables: virtual table or collapsed preview;
- diffs: hunk/line viewer;
- tool output: summary plus open/full-output action.

Thresholds for the first pass:

- code block larger than 300 lines: specialized viewer;
- tool result larger than 32 KB: collapsed preview and externalized output;
- table larger than 200 rows: table viewer;
- markdown text block larger than 64 KB: split into paragraph chunks.

The chat list remains a timeline; it does not become responsible for rendering
every line of every large artifact.

## Migration

Use lazy migration:

1. Create SQLite and run schema migrations on startup.
2. Import `sessions/index.json` into `sessions` rows if absent.
3. Mark sessions as `migration_state = 'pending'`.
4. When opening a session, migrate that session's JSON file in one transaction:
   - insert/update `sessions`;
   - insert `session_usage`;
   - insert `session_variables`;
   - insert `messages` with monotonic `seq`;
   - derive initial `message_blocks` for assistant messages when cheap.
5. Keep the original JSON file.
6. On successful migration, set `migrated_from_json_at`.

This avoids blocking app startup on every historical session.

Migration states:

- `pending`: metadata exists, messages still come from JSON on demand.
- `migrating`: a migration transaction is in progress.
- `ready`: SQLite is authoritative for that session.
- `failed`: fall back to JSON and surface diagnostics in logs.

## Write Path

Streaming should not write SQLite for every token.

- Keep the active streaming message in memory.
- Debounce message writes per `sessionId/messageId` around 300 ms.
- Use a transaction for each flush.
- Force flush on `stream:complete`, abort, session delete, and app quit.

Message append transaction:

```sql
BEGIN;
SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE session_id = ?;
INSERT INTO messages (...);
UPDATE sessions SET updated_at = ? WHERE id = ?;
COMMIT;
```

Message update transaction:

```sql
BEGIN;
UPDATE messages
SET content = ?, content_parts_json = ?, tool_calls_json = ?, steps_json = ?
WHERE session_id = ? AND id = ?;
COMMIT;
```

Truncation after edit:

```sql
BEGIN;
DELETE FROM messages WHERE session_id = ? AND seq > ?;
UPDATE session_usage SET ...;
UPDATE sessions SET updated_at = ? WHERE id = ?;
COMMIT;
```

## Branching

Branch creation currently copies all messages up to a message id. With SQLite:

1. Resolve branch point `seq`.
2. Create new session row.
3. Copy messages `WHERE parent.session_id = ? AND seq <= branchSeq` into the
   branch session with new contiguous `seq`.
4. Copy related blocks and usage.

For very large branches, this can later become copy-on-write, but the first
SQLite implementation should preserve current behavior.

## Rollout Plan

### Phase 1: Storage Foundation

- Add SQLite dependency and packaging verification.
- Add `src/main/stores/session-repository/`.
- Add schema migrations and SQLite connection lifecycle.
- Add lazy JSON migration for metadata and messages.
- Add `getSessionForGeneration()` so prompt construction can keep using a full
  effective history while the UI moves to pages.
- Keep the existing JSON facade working.

### Phase 2: Page API

- Add shared IPC types and channels for message pages and user markers.
- Add main-process handlers.
- Add tests for tail, older, newer, around, empty, and invalid cursor cases.
- Keep `GET_SESSION_MESSAGES` for legacy callers.

### Phase 3: Renderer Window

- Add `SessionMessageWindow` to `chatStore`.
- Change `switchSession` to activate first and load tail page second.
- Add `loadOlderMessages` with duplicate protection.
- Change snapshots to semantic anchors.

### Phase 4: Scroll Transactions

- Add `captureTopAnchor` and `restoreTopAnchor` to `MessageList.vue`.
- Add `isPrependingHistory` guard.
- Trigger older-page loads near the top threshold.
- Verify `bun run test:streaming-scroll` still passes.

### Phase 5: Large Blocks

- Derive `message_blocks` for historical assistant messages.
- Route large code/tool/table/diff blocks to specialized viewers.
- Externalize very large tool outputs.

### Phase 6: Cleanup

- Move remaining direct JSON session reads behind the repository.
- Make SQLite the default store.
- Add export/import path for JSON sessions.

## Verification

Unit tests:

- cursor encoding/decoding;
- SQLite migrations;
- JSON-to-SQLite migration;
- message append/update/truncate;
- page queries and duplicate merging;
- semantic snapshot conversion.

Renderer tests:

- initial tail load renders newest messages;
- prepend older messages preserves first visible anchor;
- around-message load restores a saved anchor;
- streaming appends while following bottom;
- streaming does not trigger older-page loading.

Existing scroll harness:

```bash
bun run test:streaming-scroll
```

Performance targets:

- 5,000-message migrated session opens with a visible tail page in under 500 ms
  on a typical dev machine.
- Initial IPC payload stays under 150 messages.
- Prepending 80 older messages does not move the previously first visible
  message by more than 1 px after restoration.

## Non-Goals For The First Implementation

- Generic timeline virtualization.
- Perfect line-level virtualization for every markdown block.
- Deleting legacy JSON files.
- Copy-on-write branching.
- Full-text search indexing.

Those can be added after storage pagination and scroll anchoring are stable.
