/**
 * 房间编排的**仲裁者调用** —— docs/design/collab-coordinator-plan.md。
 *
 * 一条用户消息 → 一次调用 → 一份 waves。它取代的是 N 路意愿判定:后者一条消息
 * 买 N 次调用,而且**天然表达不了次序与互斥**(三个人各自说"我想说",谁先谁后
 * 只能靠队列顺序碰运气)。
 *
 * 与 `willingness-runner` / `digest-runner` 同一族纪律:
 *  - 有死线,超时/报错/解析不出**一律降级**(不是失败,是回落 N 路判定);
 *  - 计费打 `collab-plan`,与 `collab-willingness` 并排 —— 换算法省了多少要看得见;
 *  - `thinking: false`,理由与那两处一字不差:推理模型会把预算烧在思维链上,
 *    而这里要的是一个 JSON。
 *
 * 一处**刻意不同**:它不套任何 agent 的模型绑定。编排是房间的事,不是某位同事的
 * 事 —— 套了的话,同一间房的编排会随"最后是谁说话"换模型,而它决定的是所有人
 * 的去留。这与摘要那侧同一条理由。
 */
import {
  buildCollabPlanPrompt,
  collabAgentSessionId,
  isCollabProjectedRoomMessage,
  parseCollabPlanReply,
  selectRecentCollabConversationMessages,
  COLLAB_SELF_ELECT_COOLDOWN,
  type CollabAgentLike,
  type CollabMessageLike,
  type CollabPlan,
  type CollabPlanMemberState,
} from '@onething/runtime/collab'
import type { AppSettings, ChatMessage, ChatSession } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { generateChatResponse } from '../providers/index.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
} from '../engine/stream/provider-helpers.js'
import { billCollabPlanUsage } from '../usage/bill-side-line.js'
import { collabUserPromptFields } from './user-identity.js'
import { loadCollabBoard } from './board-store.js'
import { getCollabDigests } from './digest-store.js'
import { maxChainFor, peekRoomRuntime, roomMembers, roomOccupancy } from './room-runtime.js'

/** 一次编排调用的死线。比判定的 8s 宽一点 —— 它只发一次,而且全房在等它。 */
const PLAN_TIMEOUT_MS = 12_000
/** 输出是一个小 JSON。给得比判定宽,是因为 waves 本身有长度。 */
const PLAN_MAX_TOKENS = 300
type GenerateConfig = Parameters<typeof generateChatResponse>[1]

/** 为什么没拿到编排 —— 与判定那侧同一条纪律:失败要说得出是哪一种。 */
export type CollabPlanFailure =
  | 'unresolved'
  | 'timeout'
  | 'unparsable'
  | 'aborted'
  | 'error'

export interface CollabPlanOutcome {
  plan: CollabPlan | null
  failure?: CollabPlanFailure
  /** 计费与账本用。 */
  providerId?: string
  model?: string
}

/**
 * 编排用哪个模型。
 *
 * 优先 `settings.tools.toolCallModel`(便宜模型),回落房间会话自己的有效配置。
 * 两级而不是一级:配了就该省钱,没配也**必须能跑** —— 一个因为没配旁路模型就
 * 整间房不说话的形态,比多花一点钱糟得多。
 */
function resolvePlanCandidates(
  settings: AppSettings,
  roomSessionId: string,
): Array<{ providerId: string; providerConfig: unknown; model: string }> {
  const candidates: Array<{ providerId: string; providerConfig: unknown; model: string }> = []
  const toolCall = settings.tools?.toolCallModel
  const preferredId = toolCall?.providerId?.trim()
  if (preferredId && settings.ai?.providers?.[preferredId]) {
    const providerConfig = settings.ai.providers[preferredId]
    const model = toolCall?.model?.trim()
      || providerConfig?.model
      || providerConfig?.selectedModels?.[0]
      || ''
    if (model) candidates.push({ providerId: preferredId, providerConfig, model })
  }
  const effective = getEffectiveProviderConfig(settings, roomSessionId, null)
  if (effective.providerConfig && effective.model && effective.providerId !== preferredId) {
    candidates.push({
      providerId: effective.providerId,
      providerConfig: effective.providerConfig,
      model: effective.model,
    })
  }
  return candidates
}

/**
 * 每位同事此刻的状况 + 未读并集的起点。
 *
 * 四格全部现成、全部零 I/O(看板那份是内存缓存,游标在执行会话的 meta 上):
 * 在飞的卡、正在说话、刚说过、落后几条。判定那一路是每人一次调用各自带着
 * 自己那份;一次调用看全场之后,这一半必须在这里补回来。
 */
function collectMemberState(
  roomSessionId: string,
  session: ChatSession,
  members: readonly CollabAgentLike[],
): { state: CollabPlanMemberState[]; unreadFrom?: string } {
  const messages = session.messages ?? []
  const runtime = peekRoomRuntime(roomSessionId)
  // **看板读一次,不是每人一次**(审查 #6)。`getCollabSelfTaskFacts` 内部每次都
  // `loadCollabBoard` → `fs.readFileSync` + `JSON.parse`,而 board-store 没有任何
  // 缓存 —— 八人房就是八次全盘同步读盘,压在每条用户消息的关键路径上。
  const cardsByAgent = new Map<string, Array<{ id: string; title: string; status: string }>>()
  for (const task of loadCollabBoard(roomSessionId).tasks) {
    if (!task.assigneeAgentId) continue
    if (task.status !== 'doing' && task.status !== 'blocked') continue
    const list = cardsByAgent.get(task.assigneeAgentId) ?? []
    list.push({ id: task.id, title: task.title, status: task.status })
    cardsByAgent.set(task.assigneeAgentId, list)
  }
  /**
   * 「落后 N 条」必须与 `<history>` **同一把尺子**(审查 #3/#4/#5)。
   *
   * `planCollabHistoryWindow` 的未读集合数的是原始候选(只剔"自己说的"与 drive),
   * 而 `<history>` 印的是**投影**行 —— 运营系统行、`[pass]`、思考记录都不在里面。
   * 两个口径落进同一张表,就会出现「落后 12 条」而底下只数得出 8 行的自相矛盾。
   */
  const unreadAfter = (cursorIndex: number): number =>
    messages.slice(cursorIndex + 1).filter(isCollabProjectedRoomMessage).length
  // 「谁在说」走**占用视图**(room-runtime.ts),与泵的"这个人有活在手上"、
  // 链闸的预占同一张表 —— 只读 `activeTurns` 会漏掉刚发牌、还卡在闸/锁上的那
  // 几位,而仲裁者据此排批次时它们已经注定要开口了(架构审查 A1)。
  const speaking = runtime ? roomOccupancy(runtime) : new Set<string>()
  // 「刚说过」与冷却同一口径 —— 两处分家的话,仲裁者看到的"刚说过"与并行那侧
  // 筛人用的"刚说过"会是两个答案。
  const recent = selectRecentCollabConversationMessages(messages, COLLAB_SELF_ELECT_COOLDOWN)
  const spokeRecently = new Set(
    recent.filter(entry => entry.role === 'assistant' && entry.agentId).map(entry => entry.agentId!),
  )

  const state: CollabPlanMemberState[] = []
  /** 最落后那位的游标 —— 未读并集的起点(其他人的未读都是它的后缀)。 */
  let laggardIndex = messages.length
  let unreadFrom: string | undefined

  for (const member of members) {
    const execId = collabAgentSessionId(member.id, roomSessionId)
    const seenMessageId = execId
      ? store.getSession(execId)?.collab?.seenMessageId
      : undefined
    // 游标缺席,**或者存在但定位不到**(那条消息被删了),都算"整段都没读过"
    // —— 报成「跟上了」是最糟的读法:那位同事会被排除在未读并集之外,而他其实
    // 一条都没看过(审查 #8)。
    const at = seenMessageId
      ? messages.findIndex(entry => entry.id === seenMessageId)
      : -1
    const unread = unreadAfter(at)
    if (at < 0) {
      laggardIndex = -1
      unreadFrom = undefined
    } else if (at < laggardIndex) {
      laggardIndex = at
      unreadFrom = seenMessageId
    }

    const cards = cardsByAgent.get(member.id) ?? []
    const entry: CollabPlanMemberState = { agentId: member.id }
    if (cards.length > 0) entry.cards = cards
    if (speaking.has(member.id)) entry.speaking = true
    else if (spokeRecently.has(member.id)) entry.recentlySpoke = true
    if (unread > 0) entry.unread = unread
    state.push(entry)
  }

  return laggardIndex < 0 ? { state } : { state, ...(unreadFrom ? { unreadFrom } : {}) }
}

/** 编排材料里的约束段:仲裁者该知道这间房还剩多少余量。 */
function buildConstraints(session: ChatSession, chainCount: number): string[] {
  const constraints: string[] = []
  const maxChain = maxChainFor(session)
  if (Number.isFinite(maxChain)) {
    const left = Math.max(0, maxChain - chainCount)
    constraints.push(`没有人类插话时,他们最多还能连着说 ${left} 条。`)
  }
  return constraints
}

/**
 * 问协调器:这一轮该谁说、什么次序。
 *
 * 返回 `plan: null` 时 `failure` 说明是哪一种 —— 调用方据此降级到 N 路判定。
 * **`plan.waves: []` 不是失败**:那是"读懂了,答案是这轮没人该说",与"链断了"
 * 必须分开(判定那一路正是因为把两者折在一起,才有了答不出所以然的「都没接话」)。
 */
export async function requestCollabPlan(options: {
  roomSessionId: string
  /** 触发这次编排的那条消息 @ 到了谁。 */
  mentionedAgentIds?: readonly string[]
  chainCount: number
  /** 续排:上一份编排跑完后的"要不要继续",提问句整个换掉(plan.ts)。 */
  continuation?: boolean
  signal?: AbortSignal
}): Promise<CollabPlanOutcome> {
  if (options.signal?.aborted) return { plan: null, failure: 'aborted' }

  const session = store.getSession(options.roomSessionId)
  if (session?.kind !== 'room' || !session.room) return { plan: null, failure: 'unresolved' }

  const members: CollabAgentLike[] = roomMembers(session)
  if (members.length === 0) return { plan: null, failure: 'unresolved' }

  const settings = store.getSettings()
  // 两级回落要**带着鉴权一起试**(审查 #13):旁路模型在设置里"存在"却没有可用
  // 凭证是很常见的一档(填过 model、没填 key),而只在第一级上试鉴权的话,
  // 这类房间会永久降级回 N 路判定 —— 而且没有任何地方说明为什么。
  const candidates = resolvePlanCandidates(settings, options.roomSessionId)
  let picked: { providerId: string; providerConfig: unknown; model: string } | undefined
  let auth: Awaited<ReturnType<typeof resolveProviderAuth>> | undefined
  for (const candidate of candidates) {
    const resolvedAuth = await resolveProviderAuth(candidate.providerId, candidate.providerConfig as never)
    if (resolvedAuth) {
      picked = candidate
      auth = resolvedAuth
      break
    }
  }
  if (!picked || !auth) return { plan: null, failure: 'unresolved' }
  const { providerId, providerConfig, model } = picked

  const config = {
    ...(providerConfig as Record<string, unknown>),
    model,
    selectedModels: (providerConfig as { selectedModels?: string[] }).selectedModels?.length
      ? (providerConfig as { selectedModels?: string[] }).selectedModels
      : [model],
    apiKey: auth.kind === 'api-key' ? auth.apiKey : '',
    authContext: auth,
    oauthToken: auth.kind === 'oauth'
      ? auth.token
      : (providerConfig as { oauthToken?: string }).oauthToken,
  } as unknown as GenerateConfig

  const { state: memberState, unreadFrom } = collectMemberState(
    options.roomSessionId,
    session,
    members,
  )
  const { system, user } = buildCollabPlanPrompt({
    roomName: session.name || '房间',
    members,
    // 整段历史交给窗口自己裁:边界由最落后那位的游标定,两侧各有 backdrop 与
    // 预算兜底。这里再 slice 一刀会把那个边界白白截掉。
    recent: (session.messages ?? []) as readonly CollabMessageLike[],
    memberState,
    ...(unreadFrom ? { unreadFromMessageId: unreadFrom } : {}),
    // 「这屋子在聊什么」——逐字段之前那些话折成一个数 + 每日摘要,几十 token
    // 换回整段背景。房间投影已经在用同一份摘要,这里不另生产。
    digests: getCollabDigests(options.roomSessionId),
    ...collabUserPromptFields(),
    ...(options.mentionedAgentIds?.length ? { mentionedAgentIds: options.mentionedAgentIds } : {}),
    ...(session.room.speakOrder?.length ? { orderHint: session.room.speakOrder } : {}),
    ...(options.continuation ? { continuation: true } : {}),
    constraints: buildConstraints(session, options.chainCount),
    resolveAgentName: agentId => findAgent(agentId)?.name,
    // 花名册的"他是谁"那一格:`description` 优先,没有就从 persona 开头节选。
    // 真机上在用的同事 description 全空 —— 不接这一条,仲裁者看到的是一串名字。
    resolvePersona: agentId => findAgent(agentId)?.systemPrompt,
  })

  const controller = new AbortController()
  // 死线是不是我们自己踩的 —— 与判定那侧同一个手法:`withDeadline` 只给回空串,
  // 分不出"超时了"和"模型回了个空"。
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, PLAN_TIMEOUT_MS)
  const cancelExternally = () => controller.abort()
  options.signal?.addEventListener('abort', cancelExternally, { once: true })

  try {
    const reply = await generateChatResponse(
      providerId,
      config,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        temperature: 0,
        maxTokens: PLAN_MAX_TOKENS,
        thinking: false,
        abortSignal: controller.signal,
        debugPurpose: 'collab-plan',
        debugSessionId: options.roomSessionId,
        onUsage: billCollabPlanUsage(providerId, model, options.roomSessionId),
      },
    )
    if (timedOut) return { plan: null, failure: 'timeout', providerId, model }
    if (options.signal?.aborted) return { plan: null, failure: 'aborted', providerId, model }

    const plan = parseCollabPlanReply(reply, {
      members,
      ...(options.mentionedAgentIds?.length ? { mentionedAgentIds: options.mentionedAgentIds } : {}),
    })
    if (!plan) return { plan: null, failure: 'unparsable', providerId, model }
    return { plan, providerId, model }
  } catch (error) {
    console.error('[collab] plan request failed:', error)
    return {
      plan: null,
      failure: timedOut ? 'timeout' : options.signal?.aborted ? 'aborted' : 'error',
      providerId,
      model,
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancelExternally)
  }
}

/** 便于测试与调用方复用:这条消息 @ 到的成员 id(只留在册的)。 */
export function collabMentionedMemberIds(
  session: ChatSession,
  message: Pick<ChatMessage, 'mentions'>,
): string[] {
  const inRoom = new Set(roomMembers(session).map(member => member.id))
  return [...new Set((message.mentions ?? []).map(mention => mention.agentId))]
    .filter(agentId => inRoom.has(agentId))
}
