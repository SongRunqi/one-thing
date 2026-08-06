# 事件系统

> 状态：现状描述（2026-08-06 走读代码写成，非提案）。
> 覆盖：`packages/core/events/`、`packages/shared/events/`、`packages/onething-runtime/src/app/events/`，以及两条出口（Electron IPC / Server SSE）。

---

## 0. 一句话

**所有会话内发生的事，都以「不可变事实 + 单调序号」的形式经 EventBus 广播；唯一的例外是每秒数百条的流式增量，它们走一条无持久、无重放的旁路 StreamChannel。**

命令（意图）与事件（事实）**共用同一条总线**——这是本系统一个反直觉但关键的设计，见 §4。

---

## 1. 三层分工

事件系统横跨仓库的三层，职责切得很干净：

| 层 | 位置 | 管什么 | 不管什么 |
| --- | --- | --- | --- |
| **骨架** | `packages/core/events/` | 机制：EventBus、RingBuffer、StreamChannel、泛型 handler 类型 | 具体有哪些事件（core 只认识 `{ type: string }`） |
| **契约** | `packages/shared/events/` | 词表：~50 个 `SessionEvent`、12 个 `SessionCommand`、12 个 `GlobalEvent`、3 个 `StreamChunk`、信封 | 任何行为（纯 `.d.ts` 级别的 interface，零运行时代码） |
| **装配** | `packages/onething-runtime/src/app/events/` | 把 core 的泛型用 shared 的联合类型实例化，加单例生命周期 + 合批器 | 新增事件类型（这层一个 interface 都不定义） |

装配层薄到几乎只有一行：

```ts
// packages/onething-runtime/src/app/events/event-bus.ts —— 全文
export class EventBus extends CoreEventBus<SessionEvent, GlobalEvent> {}
```

`stream-channel.ts` 和 `ring-buffer.ts` 同理。这层真正有内容的只有两个文件：`index.ts`（单例）和 `stream-coalescer.ts`（合批）。

**为什么 core 不认识具体事件？** 因为 core 要能被 gateway、CLI、评估工具复用，它一旦 import `@shared/events` 就绑死了本产品的词表。边界检查器（`bun run boundary`）会拦这条边。

---

## 2. 两条通道，以及为什么必须是两条

```
                    ┌──────────────────────────────────────┐
   引擎 / 工具 /     │           EventBus                   │
   权限 / 协作  ────▶│  拦截 → 提交(seq+信封+环形缓冲) → 扇出 │───▶ 有序、可重放
                    └──────────────────────────────────────┘
                    ┌──────────────────────────────────────┐
   provider 增量 ───▶│         StreamChannel                │───▶ 即发即忘、无序号
                    │  同步扇出，无缓冲、无重放              │
                    └──────────────────────────────────────┘
```

| | EventBus | StreamChannel |
| --- | --- | --- |
| 载荷 | `SessionEvent`（结构化事实） | `StreamChunk`（文本/思考/工具参数增量） |
| 频率 | 一次对话几十~几百条 | 每秒数百条 |
| 序号 | 有，按会话单调递增 | 无 |
| 缓冲 | 每会话 1000 条环形缓冲 | 无 |
| 重放 | `replay(sessionId, fromSeq)` | 不可能，掉了就是掉了 |
| 提交 | `async`（拦截器可 async） | `push()` 同步 |
| 丢失后果 | 状态机错乱（要靠重放补） | 少一段文字（下一条 `content:part` 会带全量补正） |

把增量塞进 EventBus 的后果是：1000 条环形缓冲会在两秒内被 delta 冲干净，重放就废了。所以分道，是为了保住重放能力，不是为了性能。

---

## 3. 数据形状

### 3.1 信封 —— `shared/events/envelope.ts`

存进环形缓冲、通过 IPC/SSE 发出去的，永远是信封而不是裸事件：

```ts
interface SessionEventEnvelope {
  sessionId: string   // 属于哪个会话
  sequence: number    // 该会话内单调递增，从 1 开始
  timestamp: number   // 提交进环形缓冲的时刻（Date.now()）
  event: SessionEvent // 领域载荷
}
```

`sequence` 是重放的锚：SSE 客户端断线重连时带 `?after=<最后收到的 seq>`，服务端从环形缓冲里补齐。

### 3.2 四张词表

| 联合类型 | 文件 | 条数 | 说明 |
| --- | --- | --- | --- |
| `SessionEvent` | `session-events.ts:505` | ~50 | 主表，**并且在末尾并入了 `SessionCommand`** |
| `SessionCommand` | `session-commands.ts:203` | 12 | 意图，见 §4 |
| `GlobalEvent` | `global-events.ts:85` | 12 | 非会话级，见 §7 |
| `StreamChunk` | `core/events/stream-chunks.ts:37` | 3 | `text-delta` / `reasoning-delta` / `tool-input-delta` |

`shared/events/index.ts` 统一 `export *`，外部一律 `import type { … } from '@shared/events'`，不要深链具体文件。

---

## 4. 命令与事件同管道

`session-events.ts:552` 这一行是理解整个系统的钥匙：

```ts
export type SessionEvent =
  | StreamStartEvent
  | …
  | SessionCommand      // ← 命令是事件联合的一个成员
```

**后果（全部是刻意的）：**

1. 命令走 `eventBus.emit()`，和事件走同一个三阶段管道，拿同一个 `sequence`，进同一个环形缓冲。
2. 于是命令也会被 `onAnySessionAny` 的订阅者看到——IPCBridge 因此会把 `command:send-message` 原样转发给渲染层。渲染层的 `switch` 不认识它，落到 default 忽略掉。**这是无害的冗余，不是 bug**，但排查"为什么渲染层收到自己发出去的命令"时要知道。
3. 时间线天然是一条：命令和它引发的事件在同一个序号轴上，重放一次就能重建"用户点了发送 → 引擎开始流 → 工具要审批"的完整因果。
4. 任何进程内的订阅者都能拦命令。调度器（`scheduler/agent-task-runner.ts:209`）就是这么干的：它 `onAny` 监听工作会话，看到 `permission:request` 就立刻 emit 一条 `command:permission-respond` 把它拒掉——定时任务只能用已授权的工具。

**谁订阅命令：**

| 命令 | 订阅方 | 位置 |
| --- | --- | --- |
| `command:send-message`<br>`command:edit-and-resend`<br>`command:retry-message`<br>`command:compact-context`<br>`command:abort`<br>`command:resume-after-confirm`<br>`command:inject-steering`<br>`command:retract-steering`<br>`command:inject-followup` | StreamEngine | `core/engine/headless-stream-engine.ts:195` `subscribeToCommands()`，全部用 `onAnySession`（跨会话按类型订阅） |
| `command:permission-respond` | Permission | `core/permission/index.ts:246` |
| `command:interaction-respond` | InteractionRegistry | `core/interaction/registry.ts:205` |
| `command:confirm-tool` | —— | 无订阅方（见 §10 遗留） |

**通道亲和**（唯一一处内核级鉴权）：每条命令都带可选的 `channel`（`'ipc' | 'telegram' | 'cli' | 'api' | 'scheduler' | …`）。权限请求在挂起时记下 `targetChannel = engine.getChannel(sessionId)`；`respond` 时内核校验 `cmd.channel` 与之相等，不等则拒。这挡的是**跨通道冒批**——总线是进程内广播，没有这道校验，任何能 emit 的代码都能替用户批准一个来自另一条通道的审批。提问（interaction）走同一套。

> 服务端 HTTP 应答是特例：它在转发前把 ask 的 `targetChannel` 抄到命令上（`apps/server/src/runtime.ts:3230`）。理由是所有权已在 HTTP 边界认证过了，亲和校验在这里防的不是它。

---

## 5. EventBus 机制

`packages/core/events/event-bus.ts`，410 行，无依赖。

### 5.1 emit 的三个阶段

```
emit(sessionId, event)
  │
  ├─ 阶段一 拦截 ──── 依次 await 每个 interceptor
  │                   ├ 返回 { suppress: true } → 事件被吞，返回 { envelope: null }
  │                   ├ 返回 { replacement }    → 换成新事件继续
  │                   └ 抛错                    → console.error，用**原事件**继续（不中断）
  │
  ├─ 阶段二 提交 ──── seq = ++sequences[sessionId]
  │                   包信封 → 推进该会话的 RingBuffer（满则覆盖最旧）
  │
  └─ 阶段三 扇出 ──── 同步遍历四类订阅者（下表顺序即投递顺序）
```

`emit` 返回 `Promise`（因为拦截器可以是 async），但**扇出本身完全同步**——handler 里做的事会阻塞后面的 handler 和 emit 的返回。所以 handler 必须快；要做慢活自己 `void`（如 IPCBridge 的 `safeSend` 只是往 IPC 塞一下）。

拦截器目前**生产代码里一个都没有注册**（`intercept()` 已实现，`interceptors` 数组常为空）。它是留给"发出前改写/丢弃"这类需求的口子。

### 5.2 四类订阅

| API | 粒度 | 典型订阅方 |
| --- | --- | --- |
| `on(sessionId, type, handler, label?)` | 单会话 + 单类型 | 一次性等待（如等某个 `stream:complete`） |
| `onAny(sessionId, handler, label?)` | 单会话 + 全类型 | 调度器盯一个任务会话；服务端 SSE 指定 sessionId 时 |
| `onAnySession(type, handler, label?)` | 全会话 + 单类型 | **StreamEngine 订阅命令的方式**；Permission / Interaction |
| `onAnySessionAny(handler, label?)` | 全会话 + 全类型 | IPCBridge（桌面唯一出口）；服务端 SSE 的 `*` 模式 |

四个都返回 `Unsubscribe`，且都接受一个 `label` 字符串——它只用于日志。日志形如：

```
[EventBus] emit session=a1b2c3d4 seq=42 type=tool:execution-start
[EventBus]   → StreamEngine (onAnySession)
[EventBus]   → IPCBridge (onAnySessionAny)
```

`HIGH_FREQ_TYPES`（`content:part`、`content:continuation`、`step:updated`、`tool:execution-update`、`tool:metadata`）会跳过这些日志行。**注意：它只影响打印，不影响投递**——这五类照常走完整扇出。

### 5.3 handler 隔离

每个 handler 调用都包在 try/catch 里，抛错只 `console.error`，不影响同批其它 handler，也不影响 `emit` 的返回值。**一个订阅方炸了不会拖垮总线**——但也意味着它会静默失败，排查时要盯 `[EventBus] Handler error:`。

### 5.4 环形缓冲与重放

`ring-buffer.ts`，每会话一个实例，默认容量 **1000**。

```ts
push(envelope)              // O(1)，满则覆盖最旧
replay(fromSequence)        // O(n) 扫全缓冲，过滤 sequence >= fromSequence
```

**重放的三条边界，都会真的咬人：**

1. **只能回溯最近 1000 条。** 一次带大量工具调用的长对话轻松超过；`after=` 早于窗口的部分会静默缺失，客户端不会收到任何"我丢了东西"的信号。
2. **`destroySession()` 会删掉 `sequences` 计数器**，所以同 id 会话若被重建，序号从 1 重新开始。任何跨重建持有旧 seq 的客户端都会拿到错乱的重放。
3. **`replay` 是全缓冲线性扫描**，不是二分。容量 1000 时无所谓，调大要注意。

### 5.5 生命周期

- `destroySession(sessionId)` —— 清该会话的缓冲、序号、`typedHandlers`、`wildcardHandlers`。**不动** `anySession*` 那两类（它们本来就是跨会话的）。
- `shutdown()` —— 清一切，包括拦截器和全局 handler。装配层 `shutdownEventSystem()` 调它，并把单例置 null。

---

## 6. StreamChannel 与合批

### 6.1 StreamChannel

`core/events/stream-channel.ts`，100 行，比 EventBus 简单一个量级：

```ts
push(sessionId, chunk)            // 同步扇出给该会话订阅者 + 所有 wildcard 订阅者
subscribe(sessionId, handler)     // 按会话订阅（桌面 IPCBridge 用）
subscribeAny(handler)             // 跨会话订阅，回调收 { sessionId, chunk }（SSE 用）
destroySession(sessionId)
```

没有序号、没有缓冲、没有重放。`subscribeAny` 是为 SSE 加的：远端观察者连上来时还不知道会有哪些会话，没法逐会话订阅。

### 6.2 SessionStreamCoalescer —— 两条传输共用的合批器

`packages/onething-runtime/src/app/events/stream-coalescer.ts`。桌面 IPC 和服务端 SSE **各自 new 一个实例**（SSE 是每连接一个），但代码是同一份。它干三件事：

**① 16ms 有序合批。** 同类型且同 `turnIndex`（工具参数则同 `toolCallId`）的相邻增量就地拼接，不同类型则另起一格——**保序**是关键：一段文字里穿插的思考和工具参数不会被合并成错误的顺序。

```
进：text("你") text("好") reasoning("嗯") text("呀")
出：[text("你好"), reasoning("嗯"), text("呀")]   ← 三格，不是两格
```

**② 打 messageId。** 引擎推的 chunk 不带 `messageId`（引擎里那是隐含上下文），但渲染层要靠它把增量路由到正确的消息气泡上。合批器跟踪 `stream:start` 带来的 `assistantMessageId`，给每条发出的 chunk 盖章。

**③ flush-before-event。** 任何会话事件转发前，先把 pending 的增量冲出去。没有这条，`permission:request` 会抢在它前面那批 `tool-input-delta` 之前到达，UI 就会画出一张"参数还没收全就要审批"的卡。

```ts
handleEvent(envelope) {
  if (existing && event.type !== 'stream:start') flush(...)   // 先冲
  if (stream:start) start(sessionId, event.assistantMessageId)
  if (stream:complete|error|aborted) end(sessionId)           // end 也会冲
}
```

`stream:start` 被排除在这个 flush 之外，不是因为不冲，而是因为 `start()` 内部会先用**旧的 messageId** 冲掉上一条流的尾巴，再切换状态——顺序反了的话，上一条流的残余增量会被盖上新消息的 id。

**边界：没有活动流时收到 chunk**（`state` 为空），它会**直穿**，既不合批也不带 `messageId`。生产路径上不该发生，但图片生成等旁路推流时会走到这条。

---

## 7. 全局事件 —— 一条基本闲置的车道

`GlobalEvent`（`global-events.ts`）定义了 12 个非会话事件：app 生命周期、settings 变更、session 增删切、MCP 连接、插件。走 `emitGlobal()` / `onGlobal()`，**无环形缓冲、无重放、无 IPC 出口**（IPCBridge 只订阅了 `onAnySessionAny`）。

诚实地说：走读全仓库，生产代码里 `emitGlobal` 只有**一个**真实调用方（`app/plugins/api.ts:113`，插件通知），`onGlobal` **零个订阅方**。也就是说这条车道目前是定义完备但基本没跑起来的。跨进程的全局状态同步现在走的是显式 IPC/HTTP 调用（`settings:changed` 之类），不是这条总线。

要用它之前先确认：你真的需要广播语义，还是一次显式调用就够了。

---

## 8. 事件全表

### 8.1 流生命周期

| 事件 | 载荷要点 | 发出方 |
| --- | --- | --- |
| `stream:start` | `messageId` + `assistantMessageId`（同值，后者是兼容别名）、`model?` | `app/engine/stream/agent-loop-executor.ts:488` |
| `stream:complete` | `data`: `usage`（含 cache read/write、reasoning tokens）、`lastTurnUsage`、`sessionName?`、`aborted?` | `core/engine/event-only-emitter.ts` |
| `stream:error` | `data`: `error`、`errorDetails?`、`preserved?` | 同上 |
| `stream:aborted` | `reason?` | 同上 |
| `stream:params-resolving` | 本轮解析出的 provider/model/temperature/maxTokens | 引擎参数解析阶段 |

三个终结事件（complete / error / aborted）是 IPCBridge 退订 StreamChannel、合批器收尾的触发点。**任何新的流终结路径都必须发出这三者之一**，否则订阅会泄漏、尾部增量永远冲不出去。

### 8.2 工具生命周期

一次工具调用的完整事件序列：

```
tool:input-start   ── 模型开始吐参数（toolCallId / toolName / toolCall 骨架）
  ⋮ tool-input-delta ×N          （走 StreamChannel，不是 EventBus）
tool:input-end     ── 参数收全。带主进程权威的 receivedAt + finalizedBy
                      ('parse' = 流中 JSON 自然闭合 | 'provider-done' = 靠 provider 的 done 事件兜底)
[permission:queued]── 若排在别人后面/被合并
[permission:request]── 若需审批
[permission:settled]── 审批结算
tool:execution-start ── 开始执行，带权威 startTime
  ⋮ tool:execution-update ×N     （partialResult，如 bash 的流式输出）
tool:execution-end ── result / isError / error + 权威 durationMs
```

**"权威时间戳"这件事是刻意的**：`receivedAt` / `startTime` / `durationMs` 全部由主进程 `Date.now()` 采样后随事件下发，渲染层**不许**自己算。IPC 抖动会让渲染层算出的耗时偏差数百毫秒，而工具卡上显示的是那个数字。同理 `tool:input-end` 是接收完成的唯一权威信号——卡片的 RECEIVING 态必须在它上面翻，不能靠前端猜参数完整性（这是 `project_tool_args_honesty` 那轮修的病根）。

另有两个细粒度事件：`tool:executing`（`toolCallId` + 展示标题）、`tool:metadata`（挂任意 `JsonObject`）。

### 8.3 内容与步骤

| 事件 | 说明 |
| --- | --- |
| `content:part` | 一个内容分片落定（文本段/思考段/工具卡的结构化表示） |
| `content:continuation` | 一轮结束但还要继续（多轮工具循环的轮次分界），带 `turnIndex` |
| `step:added` / `step:updated` | 步骤面板的增量。`step:updated` 只带 `Partial<Step>` 补丁 |

### 8.4 上下文与会话状态

| 事件 | 说明 |
| --- | --- |
| `context:size-updated` | 当前上下文 token 数 |
| `context:compact-completed` | 压缩结果：`success` / `skipped` / `summary` / `error`，带 `requestId` 对应命令 |
| `session:variables-updated` | 变量系统全量快照 + 工作目录 |
| `session:goal-updated` | `goal`（当前，清空后为 null）**+ `goals` 全量历史**。全量下发是刻意的："哪个是当前"的判定规则只存在于 `runtime/src/goals/records.ts` 一处，渲染层再抄一份就是第二个要同步的东西 |
| `session:renamed` | 新会话名 |
| `request:snapshot` | 出站模型请求的预检快照（消息逐条预览 + 工具清单 + thinking 配置），Inspector 面板用，每会话小环形缓冲 |
| `skill:activated` | 技能被激活 |

### 8.5 消息

`message:created` / `message:user-created` / `message:assistant-created` / `message:updated`（`Partial<ChatMessage>` 补丁）/ `message:deleted` / `messages:replaced`（整段替换，压缩和历史重建用）。

### 8.6 权限与提问

两条**并列**的等待链，不是一条的两个 case——审批的答案是「允许/拒绝」，提问的答案是「从 N 个选项里选，或自己写」。

| 事件 | 说明 |
| --- | --- |
| `permission:request` | 带 `targetChannel`（通道亲和的锚）、`requestId`、`toolCallId`、`permissionType`、`title`、`pattern`、`timeoutMs?` |
| `permission:queued` | 排在别的审批后面，或被合并到一个等价的挂起请求上。**此时不该画卡**，工具卡应显示"等待授权"而不是"执行中" |
| `permission:settled` | `toolCallIds` 是**数组**——头部请求加上所有被合并的跟随者。让每一个面（包括不是结算发起方的那些，比如远程批准时的桌面端）都能清掉卡片 |
| `permission:timeout` | 超时 |
| `interaction:requested` | 载**整份 `InteractionRequest`**而非摊平字段。`deadlineAt` 只给 UI 画倒计时——**结算不归 UI 管**，内核自己挂表 |
| `interaction:settled` | `toolCallId`（卡片归位键）+ `answer` |

`permission:settled` / `interaction:settled` 存在的理由是同一条：**结算方可能不是任何一个 UI**（超时自结算、远程通道批准、会话清理），所以必须有一条广播让所有面各自收尾。

### 8.7 引导（steering）

`steering:queued`（已落盘排队，可撤回）→ `steering:consumed`（`messageIds[]`，已被下一轮模型请求吞掉，不可撤回）/ `steering:retracted`（消费前撤回成功）。

### 8.8 协作（多 agent 房间）

| 事件 | 说明 |
| --- | --- |
| `collab:board-changed` | 看板**全量小快照** |
| `collab:typing` | `agentId` + `typing`。IM 语义：`true` 可能以"打了又删"收场，不保证后续有消息 |
| `collab:turn-active` | 房间回合窗口开合。房间会话**从不发 `stream:start`**（回合跑在成员的执行会话里），所以停止按钮曾经根本画不出来；这条的窗口正好等于 `runtime.activeTurn`——`abortRoomTurn` 打进去的那个窗口，于是"看得见的停止按钮永远有活靶子" |
| `collab:coordinator-changed` | 协调器运行时**全量快照**，按秒节流。"跑了多久"这种连续量由渲染层自己走秒，后端不为计时广播 |
| `collab:agent-changed` | 一位同事的活动快照。与协调器那本是**两本互不派生的账**：房间账按房广播，而大脑/信箱/工作卡是跨房的。按 agent 独立节流槽——一个话痨不该拖累别人那一格 |
| `session:collab-updated` | 房间配置全量快照 + 房名。加它之前，七处写入方（成员条、设置面板、建房对话框、联系人开私聊、看板两个开关…）各自写完手动 `loadSessions()` 全量重拉，散在五个文件里，新加一个写入口就漏一处，症状是"改完不生效，切一下会话又生效了" |

**协作这一组统一的快照哲学：全量小快照，不发增量补丁。** 理由写在 `session-events.ts:371` 的注释里——这些对象本来就小，而全量替换省掉了"增量合并"那一整类 bug。接收方只认最新那一份，按 id 就地替换。

---

## 9. 端到端

### 9.1 两条传输，同一个引擎

```
渲染层 chatStore
  └─ platformApi.emitCommand(sessionId, { type: 'command:send-message', … })
       │
       ├─【桌面】preload bridge → ipcRenderer.invoke('session:command')
       │         → apps/electron/src/main/ipc/handlers.ts:117
       │         → emitCoreSessionCommandForIpc({ sessionId, command, eventBus })
       │
       └─【Web】 POST /api/sessions/:id/commands
                 → 服务端**整条转发**（只有 command:abort 本地处理，不拆任何字段）
       │
       ▼
   EventBus.emit ──▶ StreamEngine.subscribeToCommands 里的 onAnySession 命中
       │
       ▼
   引擎跑：落盘消息 → emit 事件 + push 增量
       │
       ├─【桌面】IPCBridge.onAnySessionAny
       │         ├ coalescer.handleEvent(信封)    ← 先冲增量
       │         ├ stream:start → 订阅 StreamChannel；三个终结事件 → 退订
       │         └ safeSend('session:event', 信封)
       │           safeSend('session:stream', { sessionId, chunk })
       │
       └─【Web】 GET /api/events (SSE)
                 ├ runtime.events.subscribe('*' 或指定 id, …, { afterSeq })
                 ├ 每连接一个 coalescer
                 └ writeSse('session:event', 信封) / ('session:stream', { sessionId, chunk })
       │
       ▼
   渲染层 services/ipc-hub.ts —— 一个大 switch，把事件打进 Pinia store
```

两条出口的 IPC 事件名**完全一致**（`session:event` / `session:stream`，`shared/ipc/channels.ts:301-302`），载荷也一致。渲染层的 `ipc-hub.ts` 一份代码同时服务两端，靠 `platformApi` 抹平订阅方式的差异（`ipcRenderer.on` vs `EventSource`）。

`emitCoreSessionCommandForIpc`（`core/events/ipc-operations.ts:48`）只做一件事：把 `emit` 的抛错转成 `{ success: false, error }`，让 IPC 调用方拿到结构化失败而不是 rejected promise。

### 9.2 一次带工具审批的完整对话

```
seq  事件                          谁发                 渲染层反应
───────────────────────────────────────────────────────────────────────
 1   command:send-message          渲染层               （忽略，是自己发的）
 2   message:user-created          引擎                 插入用户气泡
 3   stream:start                  agent-loop-executor  建助手气泡 / 合批器记 messageId
     ⋯ text-delta ×N               provider             （16ms 一批）追加文字
 4   tool:input-start              工具执行器           画工具卡，进 RECEIVING
     ⋯ tool-input-delta ×N         provider             追加参数预览
 5   tool:input-end                工具执行器           RECEIVING → RECEIVED（权威时刻）
 6   permission:request            Permission           画审批卡
     ————— 用户点允许 —————
 7   command:permission-respond    渲染层               （通道亲和校验：ipc == ipc ✓）
 8   permission:settled            Permission           清审批卡
 9   tool:execution-start          工具执行器           卡片进 RUNNING，用权威 startTime 起表
     ⋯ tool:execution-update       工具                 追加流式输出
10   tool:execution-end            工具执行器           DONE，显示权威 durationMs
11   content:part                  引擎                 内容分片落定
     ⋯ text-delta ×N                                    继续正文
12   stream:complete               引擎                 收尾 + usage 计费
```

第 6 步前的 flush-before-event 保证第 5 步那批 `tool-input-delta` 一定先于审批卡到达。

---

## 10. 扩展指南

### 加一个会话事件

1. 在 `packages/shared/events/session-events.ts` 定义 interface（`type` 用 `域:动作` kebab 格式）。
2. 加进文件末尾 `SessionEvent` 联合。
3. 发出方 `getEventBus().emit(sessionId, { type: '…', … })`。
4. 渲染层在 `packages/renderer/services/ipc-hub.ts` 的 switch 里加一 case。

做完这四步，**桌面 IPC 和 Web SSE 两条链路自动通**——两条出口都是全类型订阅 + 原样转发，没有需要登记的白名单。

### 加一个命令

1. 在 `session-commands.ts` 定义 interface，加进 `SessionCommand` 联合（它会自动并入 `SessionEvent`）。
2. 带上 `channel?: string`（除非你确定不需要通道亲和）。
3. 订阅方用 `eventBus.onAnySession('command:…', handler, 'YourLabel')`。
4. 发起方 `platformApi.emitCommand(sessionId, cmd)`。

⚠️ **服务端有一处白名单**：`apps/server/src/runtime.ts` 的 `applySessionPatch` 之类的字段过滤会**静默吞掉**未登记的字段（`project_agent_capability_profile` 那轮踩过）。命令转发本身是整条透传的，但如果你的命令路径经过任何字段级投影，检查一遍。

### 加一个 StreamChunk 类型

`core/events/stream-chunks.ts` 加类型并入 `StreamChunk` 联合，然后**必须**同步 `stream-coalescer.ts:40` 的 `appendStreamBufferChunk`——它对三种已知类型做拼接，其余返回 `false`。忘了同步的话新 chunk 会绕过合批直穿（不带 `messageId`），症状是"增量到了但不知道往哪个气泡贴"。

---

## 11. 陷阱清单

按踩到的概率排序：

1. **重放窗口只有 1000 条/会话，且超窗静默。** 长对话 SSE 重连会缺事件，客户端收不到任何提示。要判断是否需要"重连后全量重拉一次会话"而不是依赖 `after=`。
2. **`sessionId='*'` 的 SSE 不做重放。** `apps/server/src/http.ts:1983` → `runtime.ts:3250`：重放分支写的是 `if (sessionId !== '*' && options?.afterSeq !== undefined)`。通配订阅带 `after=` 是**静默无效**的。
3. **命令会回流给渲染层。** 因为 `SessionCommand ⊂ SessionEvent`，IPCBridge 全类型转发。看到自己发的命令从 `session:event` 回来是正常的。
4. **handler 抛错被静默吞掉。** 只有 `[EventBus] Handler error:` 一行日志，订阅方自此什么都不做但总线一切正常。
5. **扇出是同步的。** 在 handler 里干重活会阻塞整条总线（包括后续所有订阅方和 emit 的返回）。
6. **`destroySession` 重置序号。** 同 id 重建后 seq 从 1 开始，跨重建持有旧 seq 的客户端重放会错乱。
7. **StreamChannel 无重放。** 掉线期间的增量永久丢失；靠后续 `content:part` 的全量分片补正，不要试图从 EventBus 补。
8. **单例未初始化即抛。** `getEventBus()` / `getStreamChannel()` 在 `initializeEventSystem()` 之前调用会抛。装配顺序由 `createOnethingBackend`（`app/backend.ts`）唯一持有，别在模块顶层调这两个 getter——`import-side-effect-free.test.ts` 会拦。
9. **`HIGH_FREQ_TYPES` 只影响日志。** 别以为它做了节流。
10. **`command:confirm-tool` 无订阅方。** 定义在联合里但没有任何消费者，权限走的是 `command:permission-respond`。是历史遗留，发它等于什么都没发生。
11. **全局事件车道基本空跑。** 一个真实生产者、零订阅者（§7）。不要假设 `emitGlobal` 出去的东西有人在听。

---

## 12. 文件索引

```
packages/core/events/
├── types.ts              泛型骨架：EventBase / 信封 / handler 类型 / 拦截结果
├── event-bus.ts          EventBus（410 行，本系统核心）
├── ring-buffer.ts        定容环形缓冲
├── stream-channel.ts     增量旁路
├── stream-chunks.ts      3 个 chunk 类型
└── ipc-operations.ts     emitCoreSessionCommandForIpc / emitCoreSessionEventSafely

packages/shared/events/
├── session-events.ts     ~50 个事件 + SessionEvent 联合（:505）
├── session-commands.ts   12 个命令 + SessionCommand 联合（:203）
├── global-events.ts      12 个全局事件（基本闲置）
├── envelope.ts           信封
├── stream-chunks.ts      从 core 转出
└── index.ts              统一出口

packages/onething-runtime/src/app/events/
├── index.ts              单例 + initialize/shutdownEventSystem
├── event-bus.ts          class EventBus extends CoreEventBus<SessionEvent, GlobalEvent>
├── stream-channel.ts     同上模式
├── ring-buffer.ts        同上模式
├── types.ts              把 core 泛型用 shared 联合实例化
├── stream-coalescer.ts   16ms 合批 + messageId 盖章 + flush-before-event
└── event-only-emitter.ts 注入主进程单例与 store 副作用

出口
├── apps/electron/src/main/bridges/ipc-bridge.ts   桌面：onAnySessionAny → session:event/stream
├── apps/server/src/http.ts:1983                   Web：GET /api/events（SSE）
├── apps/server/src/runtime.ts:3239                events/streams adapter（含权限过滤 + 重放）
└── packages/renderer/services/ipc-hub.ts          渲染层唯一消费点

发出方（主要）
├── packages/core/engine/event-only-emitter.ts     工具/内容/步骤/流终结
├── app/engine/stream/agent-loop-executor.ts:488   stream:start
├── packages/core/permission/index.ts              permission:*
├── packages/core/interaction/registry.ts          interaction:*
└── app/collab/board-store.ts                      collab:*
```

**相关文档**：`docs/design/history-rebuild.md`（历史重建与轮次分界）、`docs/design/collab-actor-v3.md`（协作事件的上游）、`docs/design/session-storage-jsonl.md`（事件之外的落盘链路）。
