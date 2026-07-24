# 会话标题（侧栏预览）生成链路

记录"发送一条消息后，侧栏里显示的会话预览文字是怎么来的"这条链路，供后续排查/改造时查阅。

## 一句话总结

侧栏 `SessionItem` 上显示的会话名，本质是**首条用户消息触发的一次异步标题生成**：优先让小模型总结出标题，任何一环失败都会兜底成"截取原文前 30 字符"。整个过程不阻塞当轮流式回复，通过 `session:renamed` 事件推到渲染层。

## 触发时机

`packages/core/engine/core-stream-engine.ts:475-511`（`handleSendMessage` 内）

用户消息落库、`message:user-created` 事件发出之后：

```ts
const isFirstUserMessage = session && session.messages.filter(m => m.role === 'user').length === 0
const isBranchFirstMessage = session?.parentSessionId && session.messages.length > 0 &&
  !session.messages.some(m => m.role === 'user' && m.timestamp > session.createdAt)

if ((isFirstUserMessage || isBranchFirstMessage) && !cmd.suppressTitleGeneration) {
  this.generateAndApplySessionTitle(
    sessionId,
    resolvedPromptRefs.displayContent,
    session?.name || '',
  ).catch(err => this.logError('chat title generation failed:', err))
}
```

- 只在**会话的第一条用户消息**、或**分支会话的第一条消息**时触发。
- `cmd.suppressTitleGeneration` 可以显式关闭（例如程序化发消息、测试等场景）。
- `.catch(...)` 说明这是 fire-and-forget：不会 await，不阻塞当轮的流式生成。

## 生成与清洗

`packages/core/engine/core-stream-engine.ts:941-1020`

```
generateAndApplySessionTitle(sessionId, displayContent, expectedSessionName)
  └─ generateSessionTitle(sessionId, displayContent)
       ├─ 解析 toolCallModel 配置的 provider/model（resolveToolCallModel）
       │    → 没配置 / provider 不支持 / 鉴权失败 → 直接返回 generateTitleFromMessage(displayContent)（本地截断兜底）
       └─ 配置齐全 → 调用 runtime.provider.generateTitle(...) 让小模型总结标题
  └─ title = normalizeSessionTitle(generatedTitle) || generateTitleFromMessage(displayContent)
  └─ canApplyGeneratedSessionTitle(session.name, expectedSessionName) 判断是否允许覆盖
  └─ store.renameSession(sessionId, title)
  └─ eventBus.emit(sessionId, { type: 'session:renamed', name: title })
```

出错时（catch 块）同样会退回 `generateTitleFromMessage(displayContent)` 兜底并 rename、emit 一次，保证侧栏至少有内容。

### 两个"洗文本"的工具函数

`packages/core/engine/title.ts`

| 函数 | 用途 | 处理内容 |
| --- | --- | --- |
| `generateTitleFromMessage(content, maxLength=30)` | 本地兜底：直接从用户原文截标题 | 合并空白 → trim → 超过 30 字符截断并加 `...` |
| `normalizeSessionTitle(title)` | 清洗小模型生成的标题 | 合并空白、去掉首尾引号/`#`/`-`/`title:` 前缀、截到 60 字符 |
| `canApplyGeneratedSessionTitle(current, expected)` | 覆盖保护 | 只有当前会话名为空或仍是 `"New Chat"` 时才允许覆盖，避免打断用户手动改过的标题 |

### 竞态保护

`titleGenerationSeq` / `sessionTitleGenerations`（`core-stream-engine.ts:946-947, 954, 974, 985-987`）用一个自增序号 + Map 记录"这个会话当前生效的是第几次生成请求"，防止用户连续发消息触发多次异步标题生成时，旧请求的结果覆盖新请求的结果。

## 推送到渲染层

1. `eventBus.emit(sessionId, { type: 'session:renamed', name })` 通过 IPCBridge 路由到渲染进程。
2. `src/renderer/stores/chat.ts:2432-2446` 的 `handleSessionRenamed`：
   ```ts
   async function handleSessionRenamed(data: { sessionId: string; name: string }) {
     const { useSessionsStore } = await import("./sessions");
     const sessionsStore = useSessionsStore();
     sessionsStore.updateSessionNameAnimated(data.sessionId, data.name);
   }
   ```
3. `sessions` store 更新会话名 → 侧栏 `SessionItem.vue` 渲染出新标题，即用户看到的"预览"文字。

## 其他出口

`apps/server/src/runtime.ts:2771` 把 `generateTitleFromMessage` 这个纯本地截断函数直接暴露成 headless API，供无 LLM / 无 provider 配置的场景（比如网关消息）直接截取预览用，不走完整的小模型总结链路。

## 相关文件一览

- `packages/core/engine/core-stream-engine.ts` — 触发点 + `generateAndApplySessionTitle` / `generateSessionTitle`
- `packages/core/engine/title.ts` — 三个纯函数：截断、清洗、覆盖保护
- `src/renderer/stores/chat.ts` — `session:renamed` 事件接收
- `src/renderer/stores/sessions.ts` — `updateSessionNameAnimated`，实际改会话名的地方
- `src/renderer/components/sidebar/SessionItem.vue` — 侧栏渲染会话名
- `apps/server/src/runtime.ts` — headless 场景下的兜底截断出口
