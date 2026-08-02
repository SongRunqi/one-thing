/**
 * Response-willingness runner — docs/design/multi-agent-collab-im.md §2.2.
 *
 * One cheap utility call per member per real message: "would you speak now?".
 * Everything here is cost engineering and failure containment:
 *  - small context (persona + room note + ≤8 projected lines), tiny output
 *  - per-member 8s deadline; timeout / error / unparsable reply all mean NO
 *    (a missed reply costs the user one @; a spurious one costs tokens+noise)
 *  - provider resolution mirrors the drive: the agent's model binding wins,
 *    otherwise the room session's effective config
 *  - billed as 'collab-willingness' so this spend is visible in the usage panel
 *
 * The gates (frozen / budget / chain) live in the coordinator: this module is
 * only ever called once the caller has decided a judgement round is allowed.
 */
import {
  buildWillingnessPrompt,
  isAgentPairDmRoom,
  isUserDmRoom,
  parseWillingnessReply,
  type CollabAgentLike,
  type CollabMessageLike,
  type CollabWillingnessOutcomeKind,
  type CollabWillingnessVerdict,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { collabRoomMembers } from './members.js'
import { generateChatResponse } from '../providers/index.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
} from '../engine/stream/provider-helpers.js'
import { billCollabWillingnessUsage } from '../usage/bill-side-line.js'
import { getCollabSelfTaskFacts } from './board-store.js'
import { collabUserPromptFields } from './user-identity.js'

/** Per-member deadline. Judgement is a latency tax on every room message. */
const WILLINGNESS_TIMEOUT_MS = 8_000
/** The reply is one tiny JSON object. */
const WILLINGNESS_MAX_TOKENS = 64
/** Extreme-room protection (§2.2): above this, only the lead is asked. */
const WILLINGNESS_MAX_PARALLEL = 8

type GenerateConfig = Parameters<typeof generateChatResponse>[1]

function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    void work.then(
      value => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/**
 * 沉默,并说清是**哪一种**沉默(collab-coordinator-inspector.md §8)。
 *
 * 行为上五种失败仍然等价 —— 都不说话,这是安全方向。变的只是它们**留下的账**:
 * 此前全部塌缩成一个 `respond:false`,于是「它们不想说」和「这条链断了」在
 * 状态条上一模一样,而后者是必须修的 bug。
 */
function silent(outcome: CollabWillingnessOutcomeKind): CollabWillingnessVerdict {
  return { respond: false, react: null, outcome }
}

async function judgeOne(options: {
  roomSessionId: string
  roomName: string
  self: CollabAgentLike
  members: readonly CollabAgentLike[]
  recent: readonly CollabMessageLike[]
  pmAgentId?: string
  /** Caller's cancel(用户喊停,见 wake 路由表)。Aborted = 这轮判定不算数了。 */
  signal?: AbortSignal
}): Promise<CollabWillingnessVerdict> {
  // 已经作废就一个字节都别发:抢占发生在 provider 解析/鉴权之前的概率不低
  // (那两步都要 await),而这一句是它唯一的止损点。
  if (options.signal?.aborted) return silent('aborted')
  // 退休的人不被判定(域模型 §3.2):一次意愿判定就是一次模型调用,为一个
  // 永远不会开口的成员付费是纯浪费。`roomMembers` 已经把它筛出候选面,这里是
  // 第二道 —— 直接构造 request 的调用方(测试、将来的别的入口)也拦得住。
  const agent = findAgent(options.self.id)
  if (!agent || !isActiveAgent(agent)) return silent('unresolved')

  const settings = store.getSettings()
  // Same resolution as the drive: the agent's binding wins, otherwise the
  // room session's effective provider/model.
  const override = agent.model?.providerId
    ? { providerId: agent.model.providerId, model: agent.model.modelId }
    : null
  const { providerId, providerConfig, model } = getEffectiveProviderConfig(
    settings,
    options.roomSessionId,
    override,
  )
  // 这两条是「调用根本没发出去」—— 真机 2026-08-02 怀疑的正是它们,而在有
  // `unresolved` 之前,它们和"模型说了不想说"在任何地方都长得一样。
  if (!providerConfig || !model) return silent('unresolved')

  const auth = await resolveProviderAuth(providerId, providerConfig)
  if (!auth) return silent('unresolved')

  const config = {
    ...providerConfig,
    model,
    selectedModels: providerConfig.selectedModels?.length ? providerConfig.selectedModels : [model],
    apiKey: auth.kind === 'api-key' ? auth.apiKey : '',
    authContext: auth,
    oauthToken: auth.kind === 'oauth' ? auth.token : providerConfig.oauthToken,
  } as unknown as GenerateConfig

  // 房形态与真回合同源(app/engine/prompt/system-prompt.ts 那两行推导)。不传的
  // 代价在 pair 房最明显:群版情况说明把用户说成"群成员",判定于是在一个错误的
  // 场子里回答"要不要开口"。
  const roomShape = store.getSession(options.roomSessionId)?.room
  const { system, user } = buildWillingnessPrompt({
    self: options.self,
    members: options.members,
    roomName: options.roomName,
    ...(isUserDmRoom(roomShape) ? { dm: true } : {}),
    ...(isAgentPairDmRoom(roomShape) ? { dmPair: true } : {}),
    // 判定窗口里的用户发言按 label 署名(agent-dm-user.md §2.3)。与真回合共用
    // 同一份身份:判定看到「一天: …」而回合看到「用户: …」,同一条消息在两拍里
    // 就成了两个人说的。
    ...collabUserPromptFields(),
    personaPrompt: agent.systemPrompt || '',
    // P2-16: a speaker who has left the room is still an agent this process
    // knows. Without this the window signed its past lines with a raw id.
    resolveAgentName: agentId => findAgent(agentId)?.name,
    recent: options.recent,
    pmAgentId: options.pmAgentId,
    // 判定够不着变量通道(它走裸 generateChatResponse),所以卡在这里现取 ——
    // 房间回合那侧同一批事实是走 `my_cards` 变量来的。
    selfCards: getCollabSelfTaskFacts(options.roomSessionId, options.self.id),
  })

  const controller = new AbortController()
  // 死线是不是我们自己踩的 —— `withDeadline` 只会给回一个空串,分不出"超时了"
  // 和"模型回了个空"。这个标记是唯一能把两者分开的东西。
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, WILLINGNESS_TIMEOUT_MS)
  // 外部取消(用户插话)与内部 8s 死线共用一个 controller:任一先到都是同一个
  // 结果 —— 请求断掉、`withDeadline` 兜到 '',解析成 SILENT。
  const cancelExternally = () => controller.abort()
  options.signal?.addEventListener('abort', cancelExternally, { once: true })
  try {
    const reply = await withDeadline(
      generateChatResponse(
        providerId,
        config,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        {
          temperature: 0,
          maxTokens: WILLINGNESS_MAX_TOKENS,
          // Judgement must be reflexive, not deliberative: with the provider's
          // thinking config inherited, a reasoning model burns the entire 64
          // token budget (and the 8s deadline) on chain-of-thought and every
          // member reads as silent (真机实测:全员静默即此因).
          thinking: false,
          abortSignal: controller.signal,
          debugPurpose: 'collab-willingness',
          debugSessionId: options.roomSessionId,
          onUsage: billCollabWillingnessUsage(providerId, model, options.roomSessionId),
        },
      ),
      WILLINGNESS_TIMEOUT_MS,
      '',
    )
    if (timedOut) return silent('timeout')
    if (options.signal?.aborted) return silent('aborted')
    return parseWillingnessReply(reply)
  } catch (error) {
    console.error('[collab] willingness judgement failed:', error)
    return silent(timedOut ? 'timeout' : 'error')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancelExternally)
  }
}

/** One member's answer, carried back with its identity attached. */
export interface CollabWillingnessOutcome extends CollabWillingnessVerdict {
  agentId: string
}

/**
 * Ask each candidate whether it wants to speak. Returns ONE outcome per member
 * actually asked, in candidate order (deterministic queueing beats race order).
 *
 * Non-speakers are returned too, rather than filtered out here: their `react`
 * is the second half of the same paid-for judgement (§3.5 B), and the caller is
 * the layer that knows which message it belongs to.
 */
export async function judgeWillingness(
  roomSessionId: string,
  candidates: readonly CollabAgentLike[],
  recent: readonly ChatMessage[],
  options: { signal?: AbortSignal } = {},
): Promise<CollabWillingnessOutcome[]> {
  if (candidates.length === 0) return []
  const session = store.getSession(roomSessionId)
  if (session?.kind !== 'room' || !session.room) return []

  const pmAgentId = session.room.pmAgentId
  // Extreme-room protection: a huge roster would fan out into a huge bill.
  const asked = candidates.length > WILLINGNESS_MAX_PARALLEL
    ? candidates.filter(candidate => candidate.id === pmAgentId)
    : candidates
  if (asked.length === 0) return []

  // 判定材料里的花名册:退休的成员不列(域模型 §3.2)。它还在
  // memberAgentIds 里、成员条上还看得见墓碑,但对模型来说房间里已经没有这个
  // 人可以指望了 —— 列出来只会诱导它把活儿推给一个永远不会应答的名字。
  //
  // 带 `description`:这是**模型面**的材料,一句职责说明正是"这件事该谁接"
  // 的依据。
  const members = collabRoomMembers(session.room.memberAgentIds, { withDescription: true })

  const verdicts = await Promise.all(
    asked.map(candidate =>
      judgeOne({
        roomSessionId,
        roomName: session.name,
        self: candidate,
        members: members.length > 0 ? members : asked,
        recent: recent as readonly CollabMessageLike[],
        pmAgentId,
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    ),
  )

  return asked.map((candidate, index) => ({
    agentId: candidate.id,
    respond: verdicts[index]?.respond === true,
    // 结果缺席只可能是 Promise.all 的形状出了岔子 —— 记成 error 而不是悄悄读成"不说"。
    outcome: verdicts[index]?.outcome ?? 'error',
    // A member that is about to speak has said its piece in words (§3.5 B).
    // Belt-and-braces: the coordinator refuses a speaker's react again at the
    // point of writing (that guard is the one under test), but an outcome that
    // CARRIES a react it must not use is a shape waiting to be misread.
    react: verdicts[index]?.respond === true ? null : verdicts[index]?.react ?? null,
  }))
}
