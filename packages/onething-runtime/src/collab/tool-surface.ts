/**
 * 房面 / 工作台面的**工具地板**(D5 + W14b §4.5)——两张常量表,不是一条规则。
 *
 * 这里只答一件事:一间房、一个工作台会话**至少**要有哪几个工具。答「这一回合
 * 最终能用哪些工具」的是 `agents/profile.ts`:这两张表在那边登记成 capability
 * grant(`AGENT_TOOL_GRANTS`),由 `resolveAgentToolSurface` 一处做并集 —— union
 * 语义(collab-team-v2 §2.1)也归它:地板叠在 agent 自己的白名单上,没配白名单
 * 就是不限制,agent 的真工具永远不会被顶掉。
 *
 * 2026-08-03(架构收敛 C2「工具面单点」)之前,这个文件里还有一份
 * `resolveCollabToolAllowlist`,把同一条 kind → 工具面的规则又写了一遍,两个文件
 * 在注释里互相要求对方保持一致。生产链路早就只走 profile.ts 那一份,这一份只剩
 * 测试在引用;而那份人肉对齐的义务**真的漂移过一次**(房面加 `history` 时只有
 * 一边跟上了)。函数已删,表留下:一条规则一处实现,漂不动才是对齐。
 */

/**
 * The tools every room turn must have, whatever else the agent carries.
 *
 * `say` + `board` are the original pair, and W22 is why it was not three for a
 * while. W18b briefly added `stay_silent` so that the forced opening call would
 * leave silence reachable; the model then looped on it (77 calls in four turns,
 * 真机 2026-07-28) because an inert tool whose result says "now stop" is still a
 * legal next move. The tool stayed retired when the forced opening call itself
 * was removed (2026-07-30, see turn.ts): silence is now simply "call nothing",
 * which leaves a turn no landing spot to spin on at all.
 *
 * `dm` joined on 2026-07-30 (agent-im-dm.md §3.4 / D5) and left again on
 * 2026-08-02: it is now the `to` parameter of `send_message`
 * (collab-send-channel-and-wake.md §2 —— 一个带 channel 的发送面)。旧名保留为
 * **隐藏真工具**(`tools/builtin/dm.ts`),刻意不在这张表里 —— 进来就等于进
 * 请求的 tools 参数,模型会看见两个同义工具,而合并的全部意义就是只有一个。
 */
/**
 * `history` 于 2026-08-02 加入(collab-history-search.md),取代同年 08-01 那个
 * 只查当前房折叠段的 `room_history`。它先是**按天折叠的配套**——投影不再逐字带
 * 四天历史了,那就必须留一条翻回去的路,否则折叠就是静默截断;取消默认隔离之后
 * 它同时是**跨房的那条路**:同一位同事在群里、在私聊里说过的话,查得回来。
 *
 * 进 floor 是安全的,因为它只读、且授权由数据推(`collabRoomVisibleUntil`):
 * 它能查的恒等于「我在场过的房」,别人之间的对话对它不存在。
 */
/**
 * `say` 于 2026-08-02 改名 `send_message`(collab-turn-protocol-and-identity.md A)。
 * 旧名保留为**静默别名**(`COLLAB_SEND_MESSAGE_LEGACY_TOOL_NAME`),但它刻意
 * **不进这张表** —— 进来就等于进请求的 tools 参数,模型会看见两个同义工具。
 */
export const COLLAB_ROOM_TOOLS: readonly string[] = ['send_message', 'board', 'history']

/**
 * Tools a work session must have on top of whatever its agent was given:
 * 交付协议要 `board`(complete/block),而 W14b 把交付本身变成了 worker 自己的
 * 话,所以 `send_message` 也是必需的。同样是**加**在白名单上,不是替换它。
 */
export const COLLAB_WORK_REQUIRED_TOOLS: readonly string[] = ['board', 'send_message']
