# 模型面身份句柄：@名字#句柄

> 状态：H0–H2 已实施未提交，H3 真机走查待跑
> 日期：2026-07-31（设计）/ 2026-08-01（实施）
> 相关：`multi-agent-collab-im.md` §4.5（W14a 身份 id 化）、`collab-team-v2.md` §6.2（消息信封）、`agent-im-dm.md` D5（dm 工具）

## 1. 问题

**提示词全链路零 id。** 模型能看到成员身份的每一处，看到的都是裸名字：

| 位置 | 模型实际看到的 | 代码 |
| --- | --- | --- |
| 花名册（情况说明） | `群成员:用户、小李(后端)、阿明(测试)` | `collab/roster.ts` `buildCollabRoomContext` |
| 消息信封 | `<msg from="小李">…</msg>` | `collab/projection.ts` `wrapCollabMessageEnvelope` |
| 正文里的 @ | `@小李`（按当前名字重绘） | `collab/mentions.ts` `renderCollabMentionText` |
| 意愿判定窗口 | `小李: 内容` | `collab/willingness.ts` `buildWillingnessWindow` |
| 看板摘要 | `- [doing] #a1b2c3d4 rev2「标题」 @小李` | `collab/board.ts` `renderCollabBoardDigest` |
| 系统行 | `小李 加入群聊` | `collab/system-lines.ts` |
| drive 尾行 | `(小李 · 被 @ 激活)` | `app/collab/turn.ts` |

id 只在**数据层**流动（`ChatMessage.mentions[{agentId,label}]`、`room.memberAgentIds`、`task.assigneeAgentId`），模型侧一个字符都拿不到。

而工具契约却按「模型知道 id」写：

- `say.mentions` — `"Agent ids to address (from the roster)."`（`tools/builtin/say.ts`）
- `dm.to` — `"Agent id of the colleague to talk to (from the roster). **Not a name.**"`（`tools/builtin/dm.ts`）
- `board.assignee` — `"member NAME (as shown in the roster) or agent id"`（`tools/builtin/board.ts`）

三条里只有 board 那条能成立，因为它的适配器 `resolveMember` 同时接受名字（`app/collab/board-tool.ts`）。

### 1.1 由此产生的三个真问题

**(a) dm 工具在提示词层面不可用（硬失败）。** `sendCollabDm` 走 `findAgent(targetId)`，而 `findAgent` 是严格 id 比对（`agents/store.ts`：`agents.find(a => a.id === agentId)`），无名字兜底。花名册里从来没有 id ⇒ 模型只能填名字 ⇒ 必然拿到「没有 id 为「小李」的同事;to 要填 id,不是名字。」。这条链路是断的。

**(b) `say.mentions` 名存实亡。** 模型拿不到 id，只能靠正文里的 `@名字` 走 `buildCollabMentions` 的文本兜底。参数在，能力不在。

**(c) 重名不可分辨。** `parseCollabMentions` 对同名成员**返回全部**（注释里明说这是刻意的：文本分辨不了两个「小李」）。于是 agent 想点一个人，实际把两个都叫醒了；`mergeCollabMentions` 的 per-label 授权只在**有显式 id** 时才救得回来——而 agent 恰恰没有 id。

改名不是问题：出站重绘走 `mentions[]`，这条 W14a 已经对了。

## 2. 方案

**一层双向编解码，存储与 UI 一个字节不动。**

- **出站**（进模型）：投影层把成员身份渲染成 `名字#句柄`。
- **入站**（模型写的）：工具执行器边界把 `#句柄` 解析成 agentId，**并从正文里剥掉**再落库。

两个方向互为逆运算。房间转录、UI 气泡、用户视野里永远是干净的 `@小李`；id 走 `mentions[]`，句柄只是它在模型面的可见投影。

### 2.1 句柄形式

```
@小李#3f9c1e2a
```

`agent id = agent-<uuid v4>`（`agents/ipc-operations.ts`：``id: `agent-${createId()}` ``，electron 侧 `createId: uuidv4`）。

句柄规则：

1. 去掉 `agent-` 前缀；
2. 取前 8 个字符（id 本身更短就原样用——内置 `default` agent 的 id 就是 `'default'`，不是 uuid）；
3. **不做作用域内冲突消解**。

第 3 条是实施时改掉的（H0）。初版按「本次渲染看到的名册」消解冲突（撞车整组延长到 12 位）。问题在于唯一性范围随调用点变化：房内渲染看到 2 个人、全局解析看到 40 个人，同一个 agent 因此可能在花名册里是 `#aaaaaaaa`、在 dm 解析时却要求 `#aaaaaaaa1111` —— 于是一个**写对了**的句柄会解析失败，且没有任何线索。

现在句柄在任何地方都是同一个值。代价是前 8 位真撞车时两人显示同一句柄（uuid v4 需上万个 agent 才有可观概率），而那种情况下花名册里肉眼可见两个相同句柄，解析也会明确报「不止一个人对得上」并列出候选——响亮的失败，不是安静的错人。**确定性 > 理论唯一性。**

为什么不是全 id：每个 mention 多 ~15 token，而信封是**按条**计费的全量投影。为什么不是房内序号（`@小李#3`）：跨房、跨看板不稳定，一个 agent 在两间房里两个号，模型会当成两个人。8 位十六进制与看板既有的 `#${task.id.slice(0,8)}` 同构，模型见过这个形状。

### 2.2 新模块 `collab/handles.ts`（纯逻辑）

```ts
/** 句柄本体：id 的纯函数，处处同值（见 2.1 第 3 条）。 */
collabAgentIdKey(agentId): string          // 去掉 agent- 前缀
collabAgentHandle(agentId): string

/** 出站：'小李' + id → '小李#3f9c1e2a'；没有 id = 原样返回名字 */
formatCollabAgentHandle(agentId, name): string

/** 入站：全 id / 句柄 / 名字#句柄 / 裸名字 → agentId（歧义时 error 列出候选） */
resolveCollabAgentHandle(query, agents): { ok: true; agentId } | { ok: false; error }

/** 入站：正文里所有 @名字#句柄 → mentions[]（按 id，重名精确） */
parseCollabHandleMentions(text, members): CollabMentionLike[]

/** 入站：把已解析的 @名字#句柄 还原成 @名字（未解析成功的原样留着） */
stripCollabAgentHandles(text, members): string
```

`resolveCollabAgentHandle` 的解析顺序是**优先级**而非试探：全 id → 句柄 → `名字#句柄`（以句柄为准，名字仅作显示）→ 裸名字（唯一命中才算，重名返回 error 并把候选句柄列出来）。

### 2.3 出站：五处，只在投影层

| 处 | 改成 | 落地 |
| --- | --- | --- |
| `roster.ts` 花名册 | `小李#3f9c1e2a(后端)、阿明#7b41c8d9(测试)` | ✅ |
| 信封 `from`（`projection.ts` + `message-helpers.ts`） | `<msg from="小李#3f9c1e2a">` | ✅ 由 `resolveCollabSpeakerLabel` 一处覆盖 |
| `willingness.ts` 判定窗口 | `小李#3f9c1e2a: 内容` | ✅ 同上，同一个 helper |
| 正文 `@` 重绘 | `@小李#3f9c1e2a` | ✅ 复用 `renderHit` |
| `board.ts` 看板摘要 | `… @小李#3f9c1e2a` | ✅ 自己那格不带 |

句柄拼在**名字**后面而不是整个标签后面（`小李#3f9c…(后端)`）：花名册里出现的 token 与正文里要写的逐字一致，模型照抄即可。

**不加句柄的三处**（初稿列错了，实施时纠正）：

- **系统行**（`system-lines.ts`）——那些是**持久化进房间的系统消息**，UI 渲染给用户看。加句柄 = 把 id 摆到用户脸上，违反「UI 干净」这条主线。
- **drive 尾行**（`turn.ts`）——只提 agent 自己的名字，自指不需要句柄。
- **看板里自己那一格**（`你(小研)`）——同上；而且这个第一人称形状本身是 W10 事故的修复产物，塞进十六进制会把它读回第三人称。

**关键约束**：`renderCollabMentionText` 是 UI 与模型**共用**的（`MessageItem.vue` 与两个投影都调它）。实施时发现它已经长出了 `renderHit` 这个缝（房间 UI 画 mention 胶囊用的），所以句柄直接复用它，**不需要**新增 `withHandles` 参数——UI 那一路不传 renderer，气泡里仍是 `@小李`。同一次遍历、同一套最长名优先与歧义判定，只有末端写法不同。

指向不唯一的 `@`（两位重名的都认领了这个 label）拿不到 agentId，原样保留成文字：转录本身就是歧义的，句柄编不出它没有的答案。

自身消息例外：投影对 self 消息保持结构原样（W14b：agent 读自己的历史输出必须与它当初写的一模一样），所以自己的旧发言里是干净的 `@小李`，别人的是带句柄的。这条不对称是刻意的。

### 2.4 入站：三个执行器 + 三份工具描述

| 工具 | 现在 | 改成 |
| --- | --- | --- |
| `say` | `mentions: string[]`（id，模型拿不到）+ 正文 `@名字` 兜底 | `resolveCollabSayMentions` 增加句柄扫描：**显式 mentions 参数 > 正文句柄 > 裸名字**；`normalizeCollabSayContent` 之后 `stripCollabAgentHandles` 再落库 |
| `dm` | `to` 严格 id ⇒ 硬失败 | `to` 走 `resolveCollabAgentHandle`（句柄/全 id/名字都行）；查无此人的错误文案改成「花名册里的写法是 `名字#句柄`」 |
| `board` | `assignee` 名字或 id | 同上换成 `resolveCollabAgentHandle`，顺带修掉重名指派的歧义（现在是遍历取第一个命中） |

三份工具描述同步改成「填花名册里的 `名字#句柄`，也可以只填 `#句柄`」。

剥离必须**只剥能解析的**：正文里一个普通的 `#标签` 不能被吃掉；解析失败的 `@名字#写错的` 原样保留（连同名字兜底），模型下一轮能从自己的转录里看见自己写错了。

### 2.5 用户侧：零改动

composer 的 `@` picker 已经产出 `{{member:<id>}}` → 送出时物化成 `@名字` + `mentions[]`（`usePickerOrchestration.ts` `materializeMemberReferences`）。用户手打的 `@名字` 仍走名字兜底。**用户永远看不到句柄**——它只存在于模型面。

## 3. 边界与代价

- **模型照抄句柄进正文** → 由 2.4 的剥离兜底；这是设计上的常态路径，不是异常。
- **token 成本**：每条消息信封 +1 句柄（~5 token），花名册 N×5。换来的是重名可分辨 + dm 可用。可接受。
- **转义**：句柄进 `from=` 属性走既有转义（`wrapCollabMessageEnvelope` 已转 `& < "`），句柄是十六进制，本身无需额外处理。
- **旧转录**：没有句柄照旧工作（纯加法，无迁移）。
- **`#` 与看板 task id 的形状撞车**：`#a1b2c3d4` 现在同时可能是任务号和 agent 句柄。缓解：agent 句柄永远紧跟在名字后面（`名字#句柄`），任务号永远独立成词（`#a1b2c3d4「标题」`）。解析入口也是分开的（board 的 `taskId` 参数 vs mention 扫描），不共用一个正则。写进注释，别再造第三种 `#`。

## 4. 实施顺序

| 期 | 内容 | 状态 |
| --- | --- | --- |
| **H0** | `collab/handles.ts` + 27 条单测。零接线。 | ✅ 2026-08-01 |
| **H1** | 出站五处（见 2.3） | ✅ 2026-08-01 |
| **H2** | 入站三个执行器 + 三份工具描述 | ✅ 2026-08-01 |
| **H3** | 真机走查 | ⬜ 待跑 |

**H3 走查清单**：

1. 重名群里 agent 点名一位「小李」，只有那一位被激活（另一位不该起来）；
2. 群里显示的是 `@小李`，气泡里没有任何 `#`；
3. agent 用 `dm` 找人成功——这条此前**从未通过**（`to` 要 id，而 agent 拿不到任何 id）；
4. 改名后旧转录的 `@` 仍重绘成新名字，句柄不变；
5. 看板 `assign` 用花名册里抄来的 `名字#句柄` 能派上活。

已知遗留：`say` 的 `mentions` 参数保留但退居次要（正文句柄够用），暂不删——它仍是优先级最高的那一档。
