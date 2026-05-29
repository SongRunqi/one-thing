# Send Message Latency / Stutter Investigation

> Scope: investigation only. No production code changes made in this pass.
>
> User symptom: sending a message feels slow and/or streaming appears chunky/stuttery.

## Executive summary

The strongest suspected cause is **main-process synchronous persistence on the send hot path**, especially for large sessions with many tool calls/steps.

Current active session from `~/.onething/app-state.json`:

```txt
currentSessionId: 08f1fe09-13e6-4b8d-9d1b-a0121fbc61f9
name: iva dev
session json size: ~46 MB
messages: 233
steps JSON inside messages: ~31 MB
toolCalls JSON inside messages: ~11 MB
```

When sending a message, `StreamEngine.handleSendMessage()` calls `store.addMessage()` before emitting `message:user-created`. `addMessage()` currently triggers a full synchronous SQLite session sync when the session is SQLite-ready. For a large 46 MB session, this can block the main process for hundreds of milliseconds before the renderer even receives the user-message-created event.

This explains the perceived delay between pressing Send and seeing the user bubble / assistant placeholder.

## Send path reviewed

Renderer flow:

```txt
InputBox.handlePrimaryAction()
  -> InputBox.sendMessage()
  -> emit('sendMessage', content, 'send', attachments)
  -> ChatPanel.handleSendMessage()
  -> useChatSession.sendMessage()
  -> chatStore.sendMessage()
  -> window.electronAPI.emitCommand(sessionId, command:send-message)
```

Main flow:

```txt
IPC session:command
  -> EventBus.emit(command:send-message)
  -> StreamEngine.handleSendMessage()
    -> resolve prompt refs / skills
    -> create user message
    -> store.addMessage(sessionId, userMessage)
    -> EventBus.emit(message:user-created)
    -> maybe rename session
    -> resolve provider
    -> maybe compact context
    -> create assistant message
    -> store.addMessage(sessionId, assistantMessage)
    -> EventBus.emit(message:assistant-created)
    -> executeMessageStream()
```

Important: the renderer does **not** optimistically add the user message. It waits for `message:user-created` from main. Therefore anything before that event directly feels like send latency.

## Evidence

### Video review: `CleanShot 2026-05-29 at 13.29.00.mp4`

Reviewed extracted frames from:

```txt
/Users/yitiansong/Pictures/ss/CleanShot 2026-05-29 at 13.29.00.mp4
```

Observed timeline at ~4 fps:

```txt
~2.75s  cursor/click over send button, input still contains "stop"
~3.00s  input clears back to placeholder, but new user bubble is not visible yet
~3.25s  still no new user bubble
~3.50s  still no new user bubble
~3.75s  new user bubble "stop" appears
~4.00s  assistant waiting indicator appears, showing ~0.4s
~5.25s  waiting indicator shows ~1.2s
~6.00s+ waiting indicator continues (~2s+)
```

Visible interpretation:

- InputBox clears quickly, so the click handler and local input reset are not the slow part.
- The user message bubble appears roughly **0.5–0.8s after input clears**.
- DevTools logs visible in the video show `MessageList` render timings around **3–8ms** for `messageCount` changes, so renderer message rendering is not the main bottleneck.
- The lag is between local input clear and `message:user-created` reaching the renderer, matching the suspected main-process hot-path delay.
- After the bubble appears, the app waits on model/tool loop startup; the visible `Waiting 0.4s → 1.2s → 2.3s` looks like backend/provider wait rather than renderer freeze.

This video strongly supports the hypothesis that the initial send lag is caused before renderer state update, most likely in main-process persistence/pre-send work.

### Active session size

Command inspection of `~/.onething/sessions`:

```txt
~/.onething/sessions total: 108 MB
08f1fe09-13e6-4b8d-9d1b-a0121fbc61f9.json: 46 MB
onething.sqlite: 109 MB
onething.sqlite-wal: 46 MB
```

Largest active session breakdown:

```txt
08f1fe09-13e6-4b8d-9d1b-a0121fbc61f9.json
size: 47091 KB
messages: 233
content: 191 KB
toolCalls: 11342 KB
steps: 31712 KB
contentParts: 844 KB
name: iva dev
```

The session is large mostly because `steps` and `toolCalls` are persisted as large JSON blobs.

### Approximate local cost

A local Python approximation using the active 46 MB JSON:

```txt
parse json:        ~85 ms
stringify rows:   ~111 ms
sqlite insert:    ~276 ms
```

This is not exactly the same runtime as Electron/better-sqlite3, but it confirms the operation is in the hundreds-of-ms range for this session size.

`addMessage()` does not need to parse the file if the session is cached, but full SQLite sync still serializes all message JSON and rewrites the session rows.

## Primary bottleneck: full SQLite sync on addMessage

File:

```txt
src/main/stores/sessions.ts
```

Current hot path:

```ts
export function addMessage(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId)
  if (!session) return

  session.messages.push(message)
  ...

  saveSessionToFile(sessionId, session)
  syncSessionToSqliteIfReady(session)

  const index = loadSessionsIndex()
  ...
  saveSessionsIndex(index)
}
```

`syncSessionToSqliteIfReady(session)` calls:

```ts
syncFullSessionToSqlite(session)
```

File:

```txt
src/main/stores/session-repository/sqlite-repository.ts
```

`syncFullSessionToSqlite()` does:

```ts
DELETE FROM session_usage WHERE session_id = ?
DELETE FROM session_variables WHERE session_id = ?
DELETE FROM messages WHERE session_id = ?
for every message:
  insertMessage(...)
```

Each `insertMessage` serializes:

```ts
content_parts_json
tool_calls_json
steps_json
attachments_json
usage_json
```

For the active session, this means rewriting/serializing tens of MB on every new user message and again on assistant message creation.

### Why this affects perceived send speed

`message:user-created` is emitted **after** `store.addMessage()`. So the renderer cannot show the user message until this persistence work completes.

Likely delay points per send:

1. user message `addMessage()` -> full SQLite sync
2. assistant placeholder `addMessage()` -> full SQLite sync
3. first message in a new session may also trigger rename persistence, but this is less relevant for long existing sessions

## Secondary bottlenecks / contributors

### 1. Synchronous media ingestion for attachments

File:

```txt
src/main/media/media-library-service.ts
```

`StreamEngine.handleSendMessage()` calls `mediaLibraryService.ingestMessageAttachments()` before `store.addMessage()`.

If attachments include `base64Data`, ingestion does synchronous work:

- base64 decode;
- SHA-256 hash;
- `fs.writeFileSync` stored asset;
- media index JSON read/write.

This directly delays `message:user-created` for messages with pasted/attached files or images.

### 2. Skills cache miss before user-created

File:

```txt
src/main/ipc/skills.ts
```

`StreamEngine.handleSendMessage()` calls:

```ts
getSkillsForSession(sessionForRefs?.workingDirectory)
resolvePromptReferences(...)
```

If the skill cache misses for the working directory, it logs:

```txt
[Skills] Cache MISS ... loading from filesystem
```

This filesystem traversal happens before creating/emitting the user message. It can make the first send in a project feel slow.

### 3. Provider resolution / context compaction delays assistant placeholder, not user bubble

After `message:user-created`, main does:

- resolve provider auth;
- check context compact thresholds;
- possibly run compaction.

This can delay `message:assistant-created` and first token, but should not delay user bubble once `message:user-created` has been emitted.

### 4. Renderer streaming stutter: message list observers + markdown rendering

Files:

```txt
src/renderer/components/chat/MessageList.vue
src/renderer/composables/useFollowScroll.ts
src/renderer/components/chat/message/StreamingMarkdown.vue
```

Potential sources:

- `useFollowScroll` observes the entire message list content with both `ResizeObserver` and `MutationObserver`.
- During streaming, text DOM changes can trigger frequent mutation callbacks and scroll pinning.
- `MessageList` also schedules nav marker updates, assistant outline updates, and user-message measurement refreshes.
- `StreamingMarkdown` reparses/render markdown segments and wraps streaming words using DOM/template traversal. It already logs when segment/html rendering exceeds 16ms:

```txt
[Perf][Markdown][segments]
[Perf][Markdown][html]
```

This more likely explains **chunky streaming / frame drops** after the send has started, rather than initial user-message latency.

### 5. Smooth scroll on send may compete with first render

File:

```txt
src/renderer/components/chat/ChatPanel.vue
```

On send:

```ts
messageListRef.value?.scrollToBottom()
```

`MessageList.scrollToBottom()` uses smooth scrolling:

```ts
scrollCoordinator.setTail({ behavior: 'smooth' })
```

If the user sends while detached from the bottom, a smooth scroll animation starts before the user message/assistant placeholder arrives. This can contribute to perceived stutter, especially in long or split panels.

## Recommended fix order

### P0: Remove full SQLite session sync from addMessage hot path

Change `addMessage()` to avoid `syncFullSessionToSqlite(session)` for normal append.

Preferred behavior:

```txt
addMessage:
  update memory session
  schedule async JSON save
  sync only the new message row to SQLite
  sync/update session metadata only
  update index metadata, preferably throttled/async
```

Potential implementation direction:

```ts
saveSessionToFile(sessionId, session)
syncMessageToSqliteIfReady(session, message)
syncSessionMetadataToSqlite(session)
```

Use full session sync only for structural operations that reorder/delete/replace many messages or migration repair.

Expected impact:

- User bubble should appear much faster in large sessions.
- Main-process stalls during send should drop substantially.

### P0: Add timing instrumentation around send hot path

Add temporary or gated perf logs in `StreamEngine.handleSendMessage()`:

```txt
resolve refs / skills ms
media ingest ms
store.addMessage(user) ms
emit user-created ms
resolve provider ms
maybe compact ms
store.addMessage(assistant) ms
emit assistant-created ms
first stream start ms
```

This will confirm exactly where the delay is on the user's machine.

### P1: Move attachment media ingestion off the blocking path

Options:

- Emit/persist user message first, then ingest attachments asynchronously and update `mediaAssetId` later.
- Or at least do ingestion after `message:user-created` so UI feedback is immediate.

### P1: Warm skill cache earlier

Options:

- Warm `getSkillsForSession(workingDirectory)` on session activation/switch.
- Or move skill ref resolution after user-created if possible.

### P1: Reduce renderer streaming stutter

Potential directions:

- Avoid `MutationObserver` for every characterData change during streaming; rely more on `ResizeObserver` + store scroll version.
- Skip assistant outline/nav measurement while following tail and active streaming.
- Consider instant scroll-to-bottom on explicit send instead of smooth scroll.
- Reduce word wrapping animation cost for long streaming markdown.

## Quick diagnostics to run during reproduction

Watch main/renderer logs for:

```txt
[Skills] Cache MISS
[Perf][Markdown][segments]
[Perf][Markdown][html]
[Perf][SessionPage][renderer]
[Perf][SessionSwitch]
```

Recommended new logs:

```txt
[Perf][SendMessage][main] addUserMs=... addAssistantMs=... totalToUserCreatedMs=...
[Perf][SQLite][syncFullSession] sessionSize=... messages=... ms=...
```

## Conclusion

The main issue is likely not the InputBox event chain itself. The event chain is straightforward. The slow point is that the backend currently performs large synchronous persistence work before sending UI events back to the renderer.

For the active `iva dev` session, the data size is large enough that full-session SQLite sync on every `addMessage()` can plausibly create visible send latency and stutter. The highest-impact fix is to make append operations incremental instead of full-session synchronous syncs.
