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
  parseWillingnessReply,
  type CollabAgentLike,
  type CollabMessageLike,
  type CollabWillingnessVerdict,
} from '@onething/runtime/collab'
import { isActiveAgent, type ChatMessage } from '@shared/ipc.js'
import * as store from '../store.js'
import { findAgent } from '../agents/index.js'
import { generateChatResponse } from '../providers/index.js'
import {
  getEffectiveProviderConfig,
  resolveProviderAuth,
} from '../engine/stream/provider-helpers.js'
import { billCollabWillingnessUsage } from '../usage/bill-side-line.js'
import { getCollabSelfTaskFacts } from './board-store.js'

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

/** Every failure mode collapses to "stayed quiet, left nothing". */
const SILENT: CollabWillingnessVerdict = { respond: false, react: null }

async function judgeOne(options: {
  roomSessionId: string
  roomName: string
  self: CollabAgentLike
  members: readonly CollabAgentLike[]
  recent: readonly CollabMessageLike[]
  pmAgentId?: string
}): Promise<CollabWillingnessVerdict> {
  // 退休的人不被判定(域模型 §3.2):一次意愿判定就是一次模型调用,为一个
  // 永远不会开口的成员付费是纯浪费。`roomMembers` 已经把它筛出候选面,这里是
  // 第二道 —— 直接构造 request 的调用方(测试、将来的别的入口)也拦得住。
  const agent = findAgent(options.self.id)
  if (!agent || !isActiveAgent(agent)) return SILENT

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
  if (!providerConfig || !model) return SILENT

  const auth = await resolveProviderAuth(providerId, providerConfig)
  if (!auth) return SILENT

  const config = {
    ...providerConfig,
    model,
    selectedModels: providerConfig.selectedModels?.length ? providerConfig.selectedModels : [model],
    apiKey: auth.kind === 'api-key' ? auth.apiKey : '',
    authContext: auth,
    oauthToken: auth.kind === 'oauth' ? auth.token : providerConfig.oauthToken,
  } as unknown as GenerateConfig

  const { system, user } = buildWillingnessPrompt({
    self: options.self,
    members: options.members,
    roomName: options.roomName,
    personaPrompt: agent.systemPrompt || '',
    // P2-16: a speaker who has left the room is still an agent this process
    // knows. Without this the window signed its past lines with a raw id.
    resolveAgentName: agentId => findAgent(agentId)?.name,
    recent: options.recent,
    pmAgentId: options.pmAgentId,
    // Same facts as the room drive (W9.3): a member with a halted card of its
    // own has an obvious reason to speak, and cannot judge that blind.
    taskFacts: getCollabSelfTaskFacts(options.roomSessionId, options.self.id),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WILLINGNESS_TIMEOUT_MS)
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
    return parseWillingnessReply(reply)
  } catch (error) {
    console.error('[collab] willingness judgement failed:', error)
    return SILENT
  } finally {
    clearTimeout(timer)
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
  const members = (session.room.memberAgentIds ?? [])
    .map((id): CollabAgentLike | null => {
      const agent = findAgent(id)
      if (!agent || !isActiveAgent(agent)) return null
      return {
        id: agent.id,
        name: agent.name,
        title: agent.title,
        description: agent.description,
        avatar: agent.avatar,
        avatarImage: agent.avatarImage,
      }
    })
    .filter((member): member is CollabAgentLike => member !== null)

  const verdicts = await Promise.all(
    asked.map(candidate =>
      judgeOne({
        roomSessionId,
        roomName: session.name,
        self: candidate,
        members: members.length > 0 ? members : asked,
        recent: recent as readonly CollabMessageLike[],
        pmAgentId,
      }),
    ),
  )

  return asked.map((candidate, index) => ({
    agentId: candidate.id,
    respond: verdicts[index]?.respond === true,
    // A member that is about to speak has said its piece in words (§3.5 B).
    // Belt-and-braces: the coordinator refuses a speaker's react again at the
    // point of writing (that guard is the one under test), but an outcome that
    // CARRIES a react it must not use is a shape waiting to be misread.
    react: verdicts[index]?.respond === true ? null : verdicts[index]?.react ?? null,
  }))
}
