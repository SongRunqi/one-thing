# 房间投影改为 `<ChatRoom>` 载荷

> 规格。用户定的形态:`<ChatRoom><Members></Members><History></History></ChatRoom>`。
> 这是 2026-08-01 提示词整理(全英文 + XML)的第二步:上一步整的是 system prompt,
> 这一步整的是**消息载荷**。

## 0. 为什么这不只是换个壳

今天房间历史被投影成**一串假的多轮对话**:别人的消息 → `user` 轮(裹
`<msg from="X">`),自己过去说过的话 → `assistant` 轮(原样、结构化推入)。

这个形状本身在教模型一件错事:**你正在进行一场对话,你的 assistant 输出就是你的回复**。
而真相是它在后台会话里,输出没人看得见,只有 `say` 出得去。「意图判定答了 true 却没调
say」这个现象,和这个形状是同一件事的两面 —— 模型顺着 assistant 轮的坑写了一段回复,
以为已经说完了。

改成单块 `<ChatRoom>` 载荷之后,上下文里**一个 assistant 轮都没有**:它读到的是一份
房间快照,而快照里没有"该你接话"的槽位。要产生任何效果,只能调工具。这不是措辞层的
提醒,是结构层的堵。

## 1. 目标格式

整个房间投影 = **一条 `user` 消息**,内容:

```xml
<ChatRoom name="产品组">
<Members>
- 一天#yitian(用户)
- 小李#aaaa1111(产品经理) — you
- 小王#bbbb2222(工程师)
</Members>
<History>
<msg from="一天#yitian">hi</msg>
<msg from="小李#aaaa1111">在的,什么事?</msg>
<msg from="系统">「登录页」已指派给 小王</msg>
</History>
</ChatRoom>
```

要点:

- **`<msg from>` 信封留着**。它解决的是逐条消息的边界问题(多行正文在群里是常态,
  一行长得像 `别人: …` 会被读成新发言),`<History>` 解决不了那个;两层各司其职。
  转义防线不变:正文里的 `<` 落库时已是 `&lt;`,没人能伪造 `</msg><msg from="用户">`。
- **Members 含自己,标 `— you`**。旧的 system prompt 花名册刻意不列自己(紧跟在
  persona 后面,列自己是废话);而在一份房间快照里,列自己是对的 —— 它是模型认出
  `<History>` 里哪几条是自己说的唯一线索。
- **名字沿用 `名字#句柄` 可照抄形状**,与 say 的 `@`、dm 的 `to`、board 的 assignee
  逐字一致(collab-agent-handle.md)。

## 2. 六个结构性决定

| # | 决定 | 理由 |
|---|---|---|
| 1 | 整个投影塌成 **一条 user 消息**,房间侧不再有任何 assistant 轮 | §0。这是本次改动的全部意义所在 |
| 2 | **Members 从 room turn 的 system prompt 移走**,只在载荷里出现 | 不重复(刚花一轮删掉三份逐字副本,不能立刻造一份新的);且花名册变动不再让 system prompt 缓存失效 |
| 3 | 自己过去的发言进 `<History>`,**正文逐字原样** —— 不重绘 @、不加引用行、不加表情统计 | W14b 铁律:agent 读自己的历史输出必须与它当初写的一模一样。这条只是换了容器,没有松动 |
| 4 | 所有房间消息的 attachments **归拢到这一条上** | 单块之后没有别的行可挂;merge pass 本来就是这么合并 attachments 的 |
| 5 | 这条的 `id` 取**第一条房间消息的 id** | 与今天合并块的行为一致(merge 保留 target 即首行的字段),`summaryUpToMessageId` 的匹配面不变 |
| 6 | 驱动信封仍然追加在后面,并与这一条 **merge 成同一行** | 两条相邻 user 消息 = 严格交替 provider 的 400。merge 后形如 `</ChatRoom>\n\n<turn …>`,驱动天然落在房间标签**外面** —— 它是机器,不是房里的人说的话,这个位置正好说明这件事 |

## 3. 不动的东西

- **意愿判定**(`buildWillingnessPrompt`)维持原样:它的 system prompt 保留花名册,
  它的窗口仍是压缩过的 `名字: 内容`(8 条 × 200 字)。理由:判定是当前**正常工作的
  那一半**(它确实答 `respond: true`),而它是个只输出 JSON、不能调工具的小调用,
  §0 的病根不在它身上。动它是另一件事。
- **工作台会话**(`buildCollabWorkRules` + worker.ts 简报)不变。
- 三版 `<where_you_are>` / `<speaking>` / `<board>` / `<your_tools>` / `<rules>` 不变;
  群版 system prompt 只减掉 `<room>` 那一段的成员清单。
- 落库转义、say/dm/board 的工具契约、判定→驱动的机制链路,一律不动。

## 4. 落点

| 文件 | 改什么 |
|---|---|
| `packages/onething-runtime/src/collab/projection.ts` | 纯 spec:新增 `<ChatRoom>` 组装(Members + History),`projectRoomHistory` 返回单行 |
| `packages/onething-runtime/src/app/engine/stream/message-helpers.ts` | 生产适配器 `projectRoomMessagesForModel` 同形改造(两处必须逐字同源 —— 只改一边 = 测试全绿而真机没变) |
| `packages/onething-runtime/src/collab/roster.ts` | 群版 `<room>` 段落去掉成员清单(加显式 option,不靠 `includeCommonRules` 隐式耦合) |
| `packages/onething-runtime/src/app/engine/prompt/system-prompt.ts` | real turn 的调用点传上那个 option |

## 5. 验收

三门:`bun run typecheck` / `bun run test` / `bun run boundary:gate`(不得有新红;
树上已有 5 个与本改动无关的红:profile.test、file-revalidation、SayMessageRow.space ×3)。

测试要钉住的纪律:单块结构、Members 含自己且标 you、自己发言逐字、attachments 归拢、
驱动落在 `</ChatRoom>` 之外、纯 spec 与生产适配器同形。
