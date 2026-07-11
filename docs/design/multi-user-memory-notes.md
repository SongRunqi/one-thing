# 多用户记忆：memory/users/&lt;userId&gt;/ 方案

状态：设计待确认（2026-07-07）
取代：c4bff4a4 中随 channel identity routing 一起落地的 per-profile agentsDir workspace + canonical scope 前缀双层隔离。

## 1. 背景与目标

### 1.1 需求原意

- agent 是**同一个**：同一个 SOUL、同一套主记忆，不给每个用户克隆一个 agent。
- 记忆根目录从 `notes` 改名为 `memory`（默认 `~/.onething/memory`）。
- 每个用户在 **memory 根目录**下有一个子目录，目录名 = userId，只存"关于这个用户的记忆笔记"。
- 通过渠道（微信/Telegram）聊天时，memory review 把关于该用户的信息写进他的目录；措辞用 `user_id <id> 怎么样`，而不是 `user 怎么样`。
- 发消息（组装 prompt）时带上 `user_id <id>` 的身份信息及其记忆。

### 1.2 c4bff4a4 的偏差

| 维度 | 原意 | 现实现 |
|---|---|---|
| 存储位置 | memory 根目录下的 `<userId>/` 子目录 | `agentsDir/<profileId>/` 完整平行 workspace |
| 粒度 | 只有该用户的记忆笔记 | 每用户独立 SOUL.md/USER.md/sqlite 全套（人格分裂） |
| review 措辞 | `user_id xxx …` | 沿用主人视角的 "user" 口吻 |
| 隔离机制 | 目录即隔离 | 目录 + canonical key `scope_<sha16>__` 前缀双层 |

### 1.3 已对齐的决定

1. 用户目录**只放记忆笔记**（用户画像 + 每日 review 笔记）；SOUL、主 USER.md/MEMORY.md、canonical 库沿用主 workspace，不给用户克隆。
2. 陌生渠道用户**自动录入**（保持现状：首次来消息自动建 profile），目录在首次写入时惰性创建。
3. 旧双层机制**全部拆掉**：profile→agentsDir workspace 的映射、canonical `scope_` 前缀过滤（含 apps/server 里的镜像实现）。identity/profile/link 体系保留——它负责"认人"，是对的。
4. agentsDir 的 per-agent workspace 机制本身**保留**（那是 agent 功能，不是用户功能），只是不再把用户 profile 塞进去。

## 2. 目标设计

### 2.1 目录布局

```
<memoryRoot>/                       # 原 aiNoteDir，目录名 notes → memory，默认 ~/.onething/memory
├── SOUL.md                         # 共享，只有 owner 会话能改
├── USER.md                         # 主人（owner）的画像
├── MEMORY.md                       # 主人的长期记忆
├── DREAMS.md
├── daily/                          # 原 memory/ 子目录改名，避免 memory/memory 嵌套
│   └── 2026-07-07.md               # 主人的每日笔记
├── plugin-data/…（sqlite 在 storePath/plugin-data，不变）
└── users/
    ├── alice/                      # 手动录入的 client profile，userId = profile id
    │   ├── MEMORY.md               # 关于 alice 的画像/长期记忆（hermes 条目格式）
    │   └── daily/
    │       └── 2026-07-07.md       # 与 alice 对话的每日 review 笔记
    └── channel-wechat-default-oXyz/  # 自动录入的渠道用户
        ├── MEMORY.md
        └── daily/…
```

- 根目录改名涉及 `getAiNoteDir()` 默认值（`~/.onething/notes` → `~/.onething/memory`）与 `settings.directoryMode`；启动时若旧目录存在且新目录不存在则整体 rename，一次性完成。
- 每日笔记子目录 `memory/` → `daily/`（`planSoulMemoryWorkspacePaths` 里 `memoryDir = join(root, 'memory')` 一行改动；index watcher 跟随 `workspace.memoryDir` 自动生效，FTS 索引里的相对路径失效需触发一次全量重建）。迁移随根目录 rename 一起 mv。
- `users/` 前缀避免与主目录既有内容（daily/、SOUL.md 等）冲突，也让"这是关于别人的记忆"一眼可辨。
- userId = ChannelIdentityStore 的 profile id（已做过路径安全 sanitize，`identity-store.ts:38`）。
- 用户目录里**没有** SOUL.md、DREAMS.md、sqlite。

### 2.2 身份链路（保留，不改）

```
渠道消息 → MessageOrigin(actor, conversation)
  → ChannelSessionRouter.route()                    src/main/channel/session-router.ts
  → ChannelIdentityService.resolve() → profile      src/main/channel/identity-service.ts
  → session.memoryProfileId = profile.id            （memoryScopeId 字段废弃，见 §4）
  → 会话固定路由到 identity:im:<connector>:<workspace>:<profileId>
```

link 机制语义不变：渠道用户绑定到 client profile 后共用该 profile 的用户目录；绑定到 `local-owner` 即"这是我自己"，走 owner 路径。

### 2.3 核心抽象：用户记忆视图（UserMemoryView）

整条 memory 管线（review、capture、daily-context、flush、hermes 读写）都只依赖 `MemoryWorkspace` 的路径字段。新方案不复制管线，只提供第二种 workspace 构造：

```ts
// 概念签名，落在 packages/onething-runtime/src/plugins/soul-memory.ts
planUserMemoryNotesPaths({ memoryRoot, userId }): MemoryWorkspace 变体
// root       = <memoryRoot>/users/<userId>
// userPath   = root/MEMORY.md      ← hermes 'user' 与 'memory' 两个 target 合并指向同一文件
// memoryPath = root/MEMORY.md        （用户目录不需要 USER/MEMORY 两分；画像即长期记忆）
// todayPath  = root/daily/<date>.md
// soulPath   = <memoryRoot>/SOUL.md ← 只读引用，供 review 输入上下文；写入被禁（见 2.5）
// dreamsPath = 无效路径占位，target 被禁
// dbPath     = 不使用（非 owner 会话不做 canonical/graph 捕获，见 2.6）
```

> 备选：用户目录也拆 USER.md + MEMORY.md 两个文件，与主 workspace 对称。默认取单文件 MEMORY.md（用户画像和长期记忆对"别人"来说是一回事）；如果你想保持两分，实现时只是路径不同，成本一样。

每个会话解析一次记忆目标：

```ts
resolveSessionMemoryTarget(sessionId): 
  | { kind: 'owner',        workspace: 主workspace }              // desktop/voice、local-owner、link 到 local-owner 的渠道用户
  | { kind: 'channel-user', workspace: UserMemoryView, identity }  // 其余（identity 含 userId、displayName、connector）
```

判定依据只有 `session.memoryProfileId`（router 已写入）：等于 `local-owner` 或缺省 → owner；否则 → channel-user。

### 2.4 Memory review（渠道会话）

- 触发条件、间隔、provider 解析全部沿用现有 review 管线（`runMemoryReview`），只是传入 UserMemoryView。
- review 输入（`buildSoulMemoryReviewInputWithAdapters`，`packages/onething-runtime/src/plugins/soul-memory.ts:6324`）读取：共享 SOUL（上下文）、该用户的 MEMORY.md、近期对话。
- review 系统提示词（`CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT`，同文件 :5154）增加 subject 参数化段落，channel-user 会话时追加：

  ```
  The conversation counterpart is NOT the owner. It is user_id <id> (display name: <name>, via <connector>).
  Record facts about this person as "user_id <id> …", never as "user …" or "the user …".
  Allowed targets: user / memory (this person's notes). soul / dreams targets are forbidden.
  ```

- 候选应用（`applyMemoryReviewCandidate`）对 channel-user 视图硬性过滤 target：`soul`、`dreams` 直接丢弃并记 diagnostics；`user`/`memory` 写入用户目录 MEMORY.md；每日流水照常追加 `memory/<date>.md`。
- afterResponse 的 capture/append 路径（`capture-actions.ts`、`append.ts`）同样拿到 UserMemoryView，天然落到用户目录，无需改逻辑。

### 2.5 Prompt 注入（渠道会话）

owner 会话完全不变。channel-user 会话注入：

1. 共享 SOUL + memory 规则（现有 fragment，路径换成主 SOUL）。
2. **用户身份块**（合并/取代现在 `src/main/channel/prompt-context.ts` 的 Communication Context，删掉其中 memory scope 相关行）：

   ```
   # Conversation Counterpart
   - user_id: channel-wechat-default-oXyz
   - display name: 张三
   - channel: wechat (workspace: <botAccount>)
   - conversation: direct / group "<title>"
   You are talking to this person, not to your owner.
   ```

3. 该用户的 MEMORY.md（hermes fragment，标题标注 `Memory about user_id <id>`）+ 最近 N 天该用户目录的 daily 笔记（复用 `buildRecentDailyContextFragment`）。
4. **不注入**：主人的 USER.md/MEMORY.md/daily、canonical graph 画像、active-memory 召回（它们都指向主人）。隐私守则一句话保留：群聊中不主动透露与当前对话者无关的私人信息。

### 2.6 Canonical/graph、索引与检索

- **canonical/graph 捕获对 channel-user 会话关闭**。这是"拆掉 scope 前缀"的直接推论：不再有第二套逻辑隔离，就不能把别人的事实混进主库。用户记忆的结构化需求由 MEMORY.md 的 hermes 条目承担。
- 主库中已存在的 `scope_*__` 前缀记录：提供一次性清理（删除或导出到对应用户目录的 MEMORY.md），放在迁移脚本里，默认只删（功能上线仅一天，量应当极小）。
- FTS 索引：主 workspace 的 index watcher 监听 `memoryDir`（改名后为 `<memoryRoot>/daily`），不含 `users/`。第一期**不给用户目录建索引**——单用户的 MEMORY.md + 近几天 daily 直接全量注入即可，量级用不到检索。`memory_search` 工具在 channel-user 会话降级为对该用户目录做朴素文本扫描（文件数极小）。如果以后单用户笔记变大，再把 users/ 子树纳入索引并按目录过滤。
- Dreaming：主 dreaming 任务不变。`SCOPED_DREAMING_SCHEDULER_TASK_ID` 删除，替换为一个"用户笔记整理"任务：遍历 `users/*/memory/`，把过期 daily 提炼进各自的 MEMORY.md（复用 dreaming 提炼逻辑，workspace 参数换成 UserMemoryView）。第一期可以先不做提炼、只落 daily，任务位保留。

## 3. 拆除清单

| 位置 | 内容 |
|---|---|
| `src/main/memory/workspace.ts:65-87` | `profileIdFromMemoryScope`、`memoryWorkspaceIdForProfile`、`resolveSessionMemoryProfileId` 的 scope 回退、`resolveSessionAgentId` 的 profile 映射（收敛为只认 `session.agentId`，agent 功能保留） |
| `src/main/plugins/builtin/soul-memory.ts:354-459` | `memoryProfileIdFromScope`、`memoryWorkspaceIdFromProfile`、`resolveAfterResponseAgentId`（改为 `resolveSessionMemoryTarget`）、`shouldRestrictMemoryScope`/`scopedMemoryKeyPrefix`/`isScopedCanonicalMemory`/`filterCanonicalMemoryScope`/`withCanonicalMemoryScope` |
| 同文件 :1396-1423 及各处 | 面板/工具请求里的 `memoryScopeId` 过滤参数 |
| 同文件 | `SCOPED_DREAMING_SCHEDULER_TASK_ID` 任务注册（换新任务） |
| `apps/server/src/runtime.ts:518-571, 1948-1960` | `serverMemoryScope*` 全套镜像实现（换成与 electron 同构的 UserMemoryView 逻辑） |
| `src/shared/ipc/memory.ts` 等 | 请求类型上的 `memoryScopeId` 字段 |
| `src/main/channel/prompt-context.ts` | Communication Context 里 memory scope 相关行（身份块并入 §2.5，其余投递元数据保留） |
| session 元数据 | `session.memoryScopeId` 停写（字段可留作兼容读，`memoryProfileId` 是唯一事实来源） |
| 旧数据 | `agentsDir/<profileId>/`（channel-/client- 前缀的）不自动迁移；迁移脚本提示列出并可选搬运 MEMORY.md/daily 到 `users/<id>/` 后删除 |

identity-store、identity-service、session-router、outbound-reply-dispatcher、ChannelsSettingsTab 的 profile/link 管理全部保留。

## 4. 实施阶段

- **Phase 0 — runtime 基础**：`planUserMemoryNotesPaths` + review 提示词 subject 参数化（`packages/onething-runtime`，纯函数，先行落测试：路径规划、target 过滤、措辞注入）。
- **Phase 1 — electron 主进程接线**：根目录改名（`getAiNoteDir` 默认值 + 启动 rename 迁移 + `memory/`→`daily/` 子目录改名与索引重建）；`resolveSessionMemoryTarget`；soul-memory 插件四个 hook（promptContext / afterResponse review+capture / beforeContextCompact flush / 命令）按 target 分流；prompt-context.ts 身份块改造。
- **Phase 2 — 拆旧**：§3 清单全部执行 + 一次性清理脚本（scope_ 记录、agentsDir 用户残留）。
- **Phase 3 — server 同构**：apps/server/runtime.ts 镜像 Phase 1+2（memory IPC 代理到 headless server，两边必须同步）。
- **Phase 4（可选后续）**：用户笔记 dreaming 提炼任务、users/ 子树索引、设置页用户目录入口。

每阶段验收：Phase 1 后用 telegram/wechat 测试账号发消息 → 确认 `<memoryRoot>/users/<id>/daily/<date>.md` 生成、内容以 `user_id <id>` 措辞、主 MEMORY.md 无泄漏写入、owner 会话行为逐字节不变。

## 5. 默认掉的次级决策（有异议请标注）

1. 用户目录单文件 MEMORY.md（不拆 USER/MEMORY 两分）。
2. channel-user 会话禁写 SOUL/DREAMS；禁 canonical/graph 捕获；不注入主人任何私有记忆。
3. link 到 local-owner 的渠道账号 = owner 本人，走主记忆，无用户目录。
4. 第一期不做用户目录 FTS 索引与 dreaming 提炼。
5. 旧 agentsDir 用户 workspace 与 scope_ 记录：脚本清理，不做静默自动迁移。
6. 根目录改名连带每日笔记子目录 `memory/` → `daily/`（否则出现 `memory/memory/` 嵌套）；旧目录启动时自动 rename，FTS 索引全量重建一次。
