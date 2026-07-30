import { buildCollabCommonRules } from './agent-rules.js'
import type { CollabAgentLike } from './types.js'

/** In-flight card statuses an agent can be told about (W9.3). */
export type CollabSelfTaskStatus = 'doing' | 'blocked'

/** One card assigned to the agent being prompted. */
export interface CollabSelfTaskFact {
  id: string
  title: string
  status: CollabSelfTaskStatus
}

/**
 * Stated in the FIRST person (W10): the background worker running the card IS
 * this agent, so the fact line says so literally — 「你正在工作会话里执行」,
 * not 「(进行中)」. A status token invites the model to narrate its own card in
 * the third person; a sentence about 你 does not.
 */
const SELF_TASK_STATUS_LABELS: Record<CollabSelfTaskStatus, string> = {
  doing: '你正在工作会话里执行',
  blocked: '你的执行受阻',
}

/**
 * The agent's own in-flight cards, as one factual line (W9.3).
 *
 * 事故背景:执行会话与房间会话是两条流,房间侧的 agent 对自己正在飞的任务
 * 零感知——被 @ 时它只能凭想象作答,于是"已交付,文件写好了"这种纯编造被
 * 说得斩钉截铁。这行是把看板上的事实摆到它面前,**只陈述,不指挥**
 * (persona 原文 + 情况说明的铁律):没有"你应该…",没有角色扮演口径。
 *
 * Returns '' when the agent has no in-flight card — a member with nothing on
 * its plate should not be told about an empty plate.
 */
export function formatCollabSelfTaskFacts(facts: readonly CollabSelfTaskFact[]): string {
  if (facts.length === 0) return ''
  // 分隔符是「;」而非「、」:每条事实自己带一个「——…」小句,顿号串起来会
  // 让后一条的破折号读成前一条的续写。
  const items = facts
    .map(fact => `#${fact.id.slice(0, 8)}「${fact.title}」——${SELF_TASK_STATUS_LABELS[fact.status]}`)
    .join(';')
  return `(你名下的任务:${items}。以看板上的状态为准。)`
}

export interface BuildCollabRoomContextOptions {
  self: CollabAgentLike
  /** All room members, self included. */
  members: readonly CollabAgentLike[]
  roomName: string
  /** Label the human user goes by in relayed messages. Default: 用户 */
  userLabel?: string
  /** The agent's own in-flight cards (W9.3). App layer reads the board. */
  taskFacts?: readonly CollabSelfTaskFact[]
  /**
   * 这间房是**用户 ↔ 你的托管式私聊**吗(单成员 dm 房,agent-im-dm.md §2.3)。
   *
   * true 时情况说明换成私聊那一版:场子里只有用户和你,没有花名册可念、没有
   * "@ 某位成员"可用、没有"指派给别人"这件事。群房那一版一个字不动 —— 两个
   * 场子的事实本来就不一样,共用一段文案的代价是两边各有一半是假话。
   */
  dm?: boolean
  /**
   * 这间房是**你和另一位同事的私聊**吗(双成员 dm 房,agent-im-dm.md §3.1/D4)。
   *
   * 单独一支而不是复用群版花名册,是因为 D4 的透明制必须进 agent 的认知:这间房
   * 里有一个不说话的第三方(用户)在旁观,而群版情况说明会把用户说成"群成员"之一
   * ——那会让 agent 以为用户是这场对话的参与者,进而对着 TA 汇报/请示。
   *
   * 与 `dm` 互斥(人数即形态);两者都为 true 时以 pair 为准,因为它更具体。
   */
  dmPair?: boolean
}

/**
 * The factual room-context note appended after the persona (v3, 用户反馈):
 * the agent's OWN prompt is the entire identity — verbatim, untouched. This
 * note only states the situation: which room, who is in it, how messages are
 * relayed. No rules, no role-play framing, no behavioral instructions —
 * impersonation/narration/mechanics are handled STRUCTURALLY by the harness
 * (other voices arrive as user turns; drives and pass turns never enter the
 * projection; un-addressed agents are simply not activated).
 */
/**
 * 托管私聊的情况说明(agent-im-dm.md §2.3 + §5 规则 1)。
 *
 * 与群版同源同体例:**只陈述事实,不指挥**——这是什么场子、消息怎么走、手上有
 * 什么工具。唯一的行为线索是轻重活分界,而它有机械兜底(断路器 + 墙钟 + 工作台
 * 的可恢复性),照 agent-rules.ts 那张"每条规则都要指得出防线"的表是合格的。
 *
 * 工具面措辞与 D7 的 union 严格一致:私聊里 agent 的全部工具都在,所以这里说的
 * 是"你平时的工具都在",绝不能出现群房曾经短暂用过的"除 say 和 board 外没有
 * 其他工具"那类收紧口径——那会与实际工具面直接对撞。
 */
function buildCollabDmContext(options: BuildCollabRoomContextOptions): string {
  const userLabel = options.userLabel ?? '用户'
  return [
    `(情况说明:这是你和${userLabel}的私聊,只有你们两个人。${userLabel}在这里交代的事就是你的活,你替 TA 办。`,
    `${userLabel}的消息会以「名字: 内容」的形式转发给你。`,
    // say 的机制与群里逐字同义(同一个工具、同一条通道),措辞跟着场子改。
    `发言用 say 工具:调用 say 才会把内容发出去,一轮可以调用多次(想连发几条短消息就调几次);replyTo 参数填某条消息的 id 可以引用它。不调用 say 就是保持沉默,${userLabel}那边不会出现任何来自你的消息;你这一轮说的其他内容都只是你的思考过程,${userLabel}看不到。`,
    // D7 union:私聊常驻会话就是"替 TA 干活"的地方,工具面完整。
    `你平时可用的工具在这里全都可用:轻活(查个资料、看个文件、小改)直接做完,再用 say 把结果告诉 TA。`,
    // §5 规则 1 的重活那一半:兜底是断路器/墙钟,以及工作台会话本身的可恢复性。
    `成规模的活(要动多个文件、要跑很久)先用 board 的 start 开工——那会给你一个独立的工作会话(没有回合上限,现场留得住);没有卡就 start 一个,顺手立卡。干到节点用 say 汇报。)`,
    formatCollabSelfTaskFacts(options.taskFacts ?? []),
  ].filter(line => line.length > 0).join('\n')
}

/**
 * agent ↔ agent 私聊的情况说明(agent-im-dm.md §3.1 + D4 透明制)。
 *
 * 体例与另外两版同源:只陈述事实。这一版必须说清的三件事,每一件都对应一条真实
 * 的机制,漏了哪一条 agent 就会按错误的世界模型行动:
 *
 *  1. **对面是谁**——两个人的花名册,名字/职位与群版取值一致;
 *  2. **用户在旁边**——dm 房在侧栏可见、用户随时能插话(D4)。不说这一条,agent
 *     会以为这是背着人的暗通道,而系统里根本不存在那种通道;
 *  3. **没有搬运上下文**——`dm` 工具刻意不转运群历史(§3.4 防滥用),所以对面
 *     很可能不知道你在说哪件事。这句直接决定了它会不会先交代背景。
 *
 * 工具面走群房那一路(D7:union 是单成员私聊的特权),所以措辞与群版一致:
 * "平时的工具都在",但正经活回大群立卡 —— 后半句的兜底是通用规则那三条。
 */
function buildCollabPairDmContext(options: BuildCollabRoomContextOptions): string {
  const userLabel = options.userLabel ?? '用户'
  const peer = options.members.find(member => member.id !== options.self.id)
  const peerLabel = peer
    ? (peer.title ? `${peer.name}(${peer.title})` : peer.name)
    : '另一位同事'
  return [
    `(情况说明:这是你和${peerLabel}的私聊,只有你们两个人。${userLabel}看得见这场对话,也随时可能插进来说话。`,
    `对方和${userLabel}的消息会以「名字: 内容」的形式转发给你。`,
    `发言用 say 工具:调用 say 才会把内容发出去,一轮可以调用多次(想连发几条短消息就调几次);replyTo 参数填某条消息的 id 可以引用它。不调用 say 就是保持沉默,这间私聊里不会出现任何来自你的消息;你这一轮说的其他内容都只是你的思考过程,别人看不到。`,
    // §3.4:dm 不自动搬运上下文 —— 这是事实陈述,不是叮嘱。
    `这间房是单独开的,对方看不到你在别处的上下文;要谈哪件事,自己在消息里说清楚。`,
    `你平时可用的工具在这里同样可用;这里是沟通的地方,要动手的正经活回大群立卡再干。)`,
    formatCollabSelfTaskFacts(options.taskFacts ?? []),
  ].filter(line => line.length > 0).join('\n')
}

export function buildCollabRoomContext(options: BuildCollabRoomContextOptions): string {
  if (options.dmPair) return buildCollabPairDmContext(options)
  if (options.dm) return buildCollabDmContext(options)
  const userLabel = options.userLabel ?? '用户'
  const others = options.members.filter(member => member.id !== options.self.id)
  const memberList = [
    userLabel,
    ...others.map(member => member.title ? `${member.name}(${member.title})` : member.name),
  ].join('、')

  return [
    `(情况说明:你在群聊「${options.roomName}」里,群成员:${memberList}。`,
    // W14a: the @ mechanic is stated as the FACT it now is — the system pins
    // the member's id behind the name, so a rename never orphans a mention.
    // W14b: 说话即行动 — speaking is the say tool. Still only FACTS: what the
    // mechanism is, not what the agent ought to do with it (v3 铁律).
    `其他人的消息会以「名字: 内容」的形式转发给你。`,
    // W14b 说话即行动:发言是一个动作,不是这一轮的输出。这里只陈述机制。
    `发言用 say 工具:调用 say 才会把内容发进群里,一轮可以调用多次(想连发几条短消息就调几次);say 的 mentions 参数填成员 id 可以点名 TA,replyTo 参数填某条消息的 id 可以引用它。不调用 say 就是保持沉默,群里不会出现任何来自你的消息;你这一轮说的其他内容都只是你的思考过程,群里看不到。`,
    // W22:stay_silent 已退役(判定层已经决定了这一轮要不要说话),
    // 这里连带删掉它的事实行——群里没有的工具不该出现在情况说明里。
    `在消息里写「@名字」也可以让那位成员看到并回应(系统会自动带上该成员的 id,改名后依然有效)。`,
    `群里配有共享任务看板,用 board 工具查看/建卡/指派/评审。在群里 @ 某位成员只是请 TA 发言;要让 TA 动手执行,必须在看板上建卡并指派给 TA——指派后 TA 会在自己的工作会话里带完整工具(读写文件、执行命令等)去执行,完成后 TA 自己会在群里交付。`,
    `你平时可用的工具在群里同样可用,随手能做的轻活(查个资料、看个文件)可以直接做完再发言;成规模的活别在群回合里硬扛,建卡指派给合适的成员。)`,
    // W9.3: the agent's own in-flight cards, appended as a separate fact line.
    formatCollabSelfTaskFacts(options.taskFacts ?? []),
  ].filter(line => line.length > 0).join('\n')
}

export interface BuildCollabRoomSystemPromptOptions extends BuildCollabRoomContextOptions {
  /** The agent's own persona prompt (its systemPrompt field), used VERBATIM. */
  personaPrompt: string
  /**
   * Append the shared 通用规则 block (collab-team-v2 §8). Opt-IN because the
   * other caller of this builder is the willingness judgement — a yes/no call
   * that produces no `say`, writes no tags and reads no board, so every line of
   * it would be pure cost. A real room turn passes true.
   */
  includeCommonRules?: boolean
}

/**
 * The ENTIRE system message for a room turn: the agent's own prompt verbatim
 * (nothing prepended, nothing rewritten), then the factual room note, then —
 * for a real turn — the shared rules.
 */
export function buildCollabRoomSystemPrompt(options: BuildCollabRoomSystemPromptOptions): string {
  const persona = options.personaPrompt.trim() || `你是${options.self.name}。`
  return [
    persona,
    buildCollabRoomContext(options),
    // 私聊房拿的是同一块通用规则的 dm / pair 版:群版逐字不动(行为守恒),另两
    // 版只把「你在一个群聊里」这句事实与「结论回哪儿」的地名换掉,其余规则与
    // 兜底防线完全相同。
    ...(options.includeCommonRules
      ? [buildCollabCommonRules({
          ...(options.dmPair ? { pair: true } : {}),
          ...(options.dm ? { dm: true } : {}),
        })]
      : []),
  ].join('\n\n')
}

/**
 * Who said it, as the window signs the line (P2-16).
 *
 * The roster is the ROOM's current members, so a departed member's past lines
 * miss it — and the old fallback then signed them with the raw `agent-a1b2…`
 * id. A model reading that has to guess whether it is a person, and 事故-prone
 * guesses are exactly what an id in a prompt invites. So: the roster first, a
 * global lookup second (a former member still exists, it just left the room),
 * and only then the honest word for what it is.
 */
export function resolveCollabSpeakerLabel(
  agentId: string | undefined,
  agents: readonly CollabAgentLike[],
  resolveAgentName?: (agentId: string) => string | undefined,
): string {
  if (!agentId) return '成员'
  const agent = agents.find(candidate => candidate.id === agentId)
  if (agent) return agent.name
  const known = resolveAgentName?.(agentId)?.trim()
  if (known) return known
  return '前成员'
}
