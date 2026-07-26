# Read-Before-Edit Guard

> **已废弃（2026-07-26）**：该机制已整体移除——`FileReadTracker` 及 `edit`/`write` 执行前的 read 检查均已删除，`edit`/`write` 不再要求先 `read`。本文仅作历史设计记录保留。

## Problem

AI 在调用 `edit`/`write` 工具修改文件时，经常不先 `read` 文件，而是依赖对话记忆中的文件内容来构造 `edit` 的 `oldText`。这导致：

1. `oldText` 与实际文件内容不匹配 → `edit` 失败
2. AI 失败后降级为 `write` 覆盖写 → 用户反感
3. 多次 `edit` 失败 → 触发 eval fixture 自动导出（`toolErrors` negative signal）

**真实案例**（session `f1d997eb`, turn `4aed38d7`）：

```
seq 21  用户: "整理下文档，格式不够整洁..."
seq 22  AI: write()          ← 没 read，直接覆盖写
seq 23  用户: cancel, "先说一下你的结构"
seq 28  AI: write()          ← 又没 read
seq 32  AI: write()          ← 又没 read
seq 33  用户: "edit please"
seq 34  AI: edit() → FAILED  ← oldText 基于记忆，不匹配
            read()            ← 亡羊补牢
            edit() → FAILED  ← 编辑块重叠
            write()          ← 退化回覆盖写
```

## Design

### Core Idea

在工具层增加一个轻量 guard：**`edit`/`write` 执行前，检查当前 session 中是否已经通过 `read` 工具读取过该文件。未读过则返回明确错误消息，引导 AI 先 `read`。**

读写完成后主动 invalidate 该文件的 read 记录，确保下一次 `edit` 前必须重新 `read`。

### State Machine

```
         read(path)
[未读] ────────────→ [已读]
  ↑                     │
  │   edit/write 成功    │
  └──(invalidate)───────┘
```

### Architecture

```
packages/onething-runtime/src/tools/
├── file-read-tracker.ts        ← 新增：核心追踪器
├── builtin/
│   ├── read.ts                 ← 修改：record()
│   ├── edit.ts                 ← 修改：check() + invalidate()
│   └── write.ts                ← 修改：check() + invalidate()

src/main/tools/builtin/
├── file-read-tracker.ts        ← 新增：主进程单例
├── read.ts                     ← 修改：注入 tracker
├── edit.ts                     ← 修改：注入 tracker
└── write.ts                    ← 修改：注入 tracker
```

### FileReadTracker

```typescript
// packages/onething-runtime/src/tools/file-read-tracker.ts

interface ReadRecord {
  hash: string       // read 时的文件内容 sha256
  timestamp: number  // 读取时间
}

export class FileReadTracker {
  // sessionId → filePath → ReadRecord
  private reads = new Map<string, Map<string, ReadRecord>>()
  private static SESSION_TTL_MS = 30 * 60 * 1000

  /** 记录一次 read */
  record(sessionId: string, filePath: string, contentHash: string): void

  /** 检查文件是否已读。返回 { read: true } 或 { read: false, reason: string } */
  check(sessionId: string, filePath: string): ReadCheckResult

  /** edit/write 成功后清除记录 */
  invalidate(sessionId: string, filePath: string): void

  /** session 结束时清理 */
  clearSession(sessionId: string): void

  /** 定期清理过期 session */
  cleanup(): void
}
```

### Integration Points

**read 工具 — `record()`**

在 `execute()` 确定为文本文件后、truncation 之前记录：

```typescript
// read.ts execute(), 在 content = buffer.toString('utf-8') 之后
import { hashTextFileSnapshot } from '../file-snapshot.js'

const content = buffer.toString('utf-8')
adapters.fileReadTracker?.record(
  ctx.sessionId,
  resolvedPath,
  hashTextFileSnapshot(true, content),
)
```

注意：

- Hash 必须使用 `hashTextFileSnapshot`（与 edit/write 内部一致，前缀 `file\0`），不能直接用 `crypto.createHash`。
- 仅对文本文件记录（跳过二进制、图片、PDF）。
- 记录的是**完整文件内容**的 hash，即使 read 只返回了 offset/limit 范围内的一部分。

**edit 工具 — `check()` + `invalidate()`**

```typescript
// edit.ts execute() 开头
if (adapters.fileReadTracker) {
  const result = adapters.fileReadTracker.check(ctx.sessionId, resolvedPath)
  if (!result.read) {
    return {
      title: `Edit blocked: ${basenamePath(resolvedPath)}`,
      output: result.reason,
      metadata: { path: resolvedPath, diff: '', additions: 0, deletions: 0 },
    }
  }
}

// edit.ts execute() — 在 withFileMutationQueue 内部，writeTextFileAsync 成功后
adapters.fileReadTracker?.invalidate(ctx.sessionId, resolvedPath)
```

**write 工具 — `check()` + `invalidate()`**

仅对**覆盖已有文件**检查（创建新文件不检查）。`snapshot.exists` 只有进入 `withFileMutationQueue` 并调用 `buildWritePlan` → `readTextFileSnapshot` 后才能确定，所以 check 放在 queue 内部：

```typescript
// write.ts execute() — 在 withFileMutationQueue 内部
return await withFileMutationQueue(resolvedPath, async () => {
  // ...
  const approvedPlan = buildWritePlan(resolvedPath, content, bytesWritten, lineCount,
    await readTextFileSnapshot(resolvedPath))

  // Guard: 仅覆盖已有文件时检查
  if (!approvedPlan.created && adapters.fileReadTracker) {
    const result = adapters.fileReadTracker.check(ctx.sessionId, resolvedPath)
    if (!result.read) {
      return {
        title: `Write blocked: ${basenamePath(resolvedPath)}`,
        output: result.reason,
        metadata: { path: resolvedPath, bytesWritten, lineCount, created: false, diff: '', additions: 0, deletions: 0 },
      }
    }
  }

  // ... revalidation loop, writeTextFileAsync ...

  // 写入成功后 invalidate
  adapters.fileReadTracker?.invalidate(ctx.sessionId, resolvedPath)

  // ... audit, return ...
})
```

注意：从 `withFileMutationQueue` 的 async callback 内部 `return` 是合法的，queue 的锁会正常释放。

### Error Messages

| 场景 | Message |
| ------ | --------- |
| edit 未读 | `File not read yet. Use read("/path/to/file") to get current content, then retry edit.` |
| write 覆盖未读 | `File not read yet. Use read("/path/to/file") to confirm current content, then retry write.` |
| write 创建新文件 | 不检查（文件不存在，无内容可读） |

短格式便于 AI 快速解析。消息中包含文件路径和明确的下一步操作。

### Adapter Interfaces

```typescript
// read.ts
export interface ReadToolAdapters {
  getDefaultWorkingDirectory?(): string | undefined
  getDefaultReadRoots?(): string[]
  fileReadTracker?: FileReadTracker  // ← 新增
}

// edit.ts
export interface EditToolAdapters {
  getDefaultWorkingDirectory?(): string | undefined
  getFileMutationsDir(): string
  fileReadTracker?: FileReadTracker  // ← 新增
}

// write.ts — 同理
```

`fileReadTracker` 为可选字段：不传则不启用 guard，保持向后兼容。

### Main Process Wiring

```typescript
// src/main/tools/builtin/file-read-tracker.ts
import { FileReadTracker } from '@onething/runtime/tools'
export const fileReadTracker = new FileReadTracker()

// src/main/tools/builtin/read.ts
import { fileReadTracker } from './file-read-tracker'
export const ReadTool = createReadTool({ ..., fileReadTracker })

// src/main/tools/builtin/edit.ts
import { fileReadTracker } from './file-read-tracker'
export const EditTool = createEditTool({ ..., fileReadTracker })

// src/main/tools/builtin/write.ts
import { fileReadTracker } from './file-read-tracker'
export const WriteTool = createWriteTool({ ..., fileReadTracker })
```

### Edge Cases

| Scenario | Behavior |
| ---------- | ---------- |
| App 重启 / Session 切换 | Tracker 在内存中自动清空 → AI 被引导重新 read |
| read → 外部修改文件 → edit | edit 自身 hash 重校验捕获（已有逻辑，不受 guard 影响） |
| read → edit 成功 → 再次 edit | 第二次 edit 触发 guard → 要求重新 read |
| read 后 compaction | Tracker 独立于消息历史，不受 compaction 影响 |
| 通过 bash cat/grep 访问文件 | 不追踪。guard 仅要求显式 `read` 工具调用 |
| 创建新文件 (write) | 不检查（文件尚不存在） |
| fileReadTracker 未注入 | 完全跳过，保持向后兼容 |
| 同一 session 大量文件 | TTL 自动清理（30min 无活动）+ session 销毁时 `clearSession()` |

### Expected Impact

回到 fixture 场景，seq 22 AI 试图 `write` 时：

> File not read yet. Use read("/Users/.../114.5 JP_PremiumCare_0363787300_0720.md") to confirm current content, then retry write.

AI 被引导先 `read`，拿到最新内容后再 `edit`。`oldText` 基于刚读到的内容，匹配成功。从根本上避免 fixture 中的两连 `edit` 失败。

### Implementation Checklist

| # | File | Action |
| --- | ------ | -------- |
| 1 | `packages/onething-runtime/src/tools/file-read-tracker.ts` | **New**: `FileReadTracker` class |
| 2 | `packages/onething-runtime/src/tools/index.ts` | Export `FileReadTracker` |
| 3 | `packages/onething-runtime/src/tools/builtin/read.ts` | Add `fileReadTracker?` to adapter; call `record()` on text read |
| 4 | `packages/onething-runtime/src/tools/builtin/edit.ts` | Add `fileReadTracker?` to adapter; call `check()` + `invalidate()` |
| 5 | `packages/onething-runtime/src/tools/builtin/write.ts` | Add `fileReadTracker?` to adapter; call `check()` (overwrite only) + `invalidate()` |
| 6 | `src/main/tools/builtin/file-read-tracker.ts` | **New**: singleton instance |
| 7 | `src/main/tools/builtin/read.ts` | Inject `fileReadTracker` |
| 8 | `src/main/tools/builtin/edit.ts` | Inject `fileReadTracker` |
| 9 | `src/main/tools/builtin/write.ts` | Inject `fileReadTracker` |
| 10 | Tests | Unit tests for `FileReadTracker` + integration tests for tools |
