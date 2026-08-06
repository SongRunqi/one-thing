/**
 * Team (room) settings form — pure logic (W6,
 * docs/design/multi-agent-collab-im.md §4 W6 / §3.5 C).
 *
 * The dialog owns pixels only. What changed, whether the draft is legal, and
 * which IPC calls a save needs are decided here so they are testable without a
 * DOM — same split as the agent config form (W5).
 *
 * Save discipline: only changed items are sent. Membership writes post 群公告
 * lines and freezing aborts live streams, so a no-op save must stay a no-op.
 */
import type { PermissionMode } from '@shared/ipc.js'

/** Displayed default when the room has no explicit budget (coordinator's own). */
export const ROOM_DEFAULT_DAILY_COST_USD = 5

/** Displayed defaults when the room has no explicit 回合断路器 caps — mirrors
 *  `COLLAB_TURN_MAX_TOOL_CALLS` / `COLLAB_TURN_MAX_SAY_CALLS` in
 *  onething-runtime `collab/circuit-breaker.ts`, the same way the budget default
 *  above mirrors the coordinator's. */
export const ROOM_DEFAULT_MAX_TURN_TOOL_CALLS = 40
export const ROOM_DEFAULT_MAX_TURN_SAY_CALLS = 20

/**
 * 连续发言上限(链长闸)的默认值。
 *
 * 镜像 `COLLAB_DEFAULT_MAX_CHAIN`(onething-runtime `collab/types.ts`)与
 * `maxChainFor()`,与上面几个默认值同一条纪律:表单显示引擎真正会用的那个数。
 * 引擎侧的三条规则这里一条都不重写——**0 = 不限**、正数原样生效**不夹上限**、
 * 负数按没配处理。此前这里写 100 并声称引擎会夹到 `默认 × 4`,两条都已不成立,
 * 后果是没配过的房在弹窗里显示 100 而引擎按 32 跑。
 *
 * 双成员 dm 房引擎另有默认(`COLLAB_DM_PAIR_MAX_CHAIN` = 6):一对一免判激活之后
 * 唯一拦得住客套乒乓的就是这道闸。这个弹窗是群房设置,那一档不在这里露面。
 */
export const ROOM_DEFAULT_MAX_CHAIN = 32

/** 镜像 `COLLAB_MAX_CONCURRENT_TURNS`(onething-runtime `app/collab/room-runtime.ts`),
 *  与上面几个默认值同一条纪律:表单显示引擎真正会用的那个数。 */
export const ROOM_DEFAULT_MAX_CONCURRENT_TURNS = 6

export interface RoomSettingsDraft {
  name: string
  memberAgentIds: string[]
  /** '' = no PM. */
  pmAgentId: string
  /** 响应模式(docs/design/collab-speaking-order.md)。 */
  responseMode: 'auto' | 'parallel' | 'serial'
  /** 顺序模式的接力次序。表单里始终是**完整**的一份(名册全员),便于上下移动。 */
  speakOrder: string[]
  /** 一趟接力最多几圈, 0 = 不限. */
  relayLoops: number
  /** 并行模式的同时发言上限, 0 = 不限. */
  maxConcurrentTurns: number
  /** 0 = 不限额. */
  dailyCostUSD: number
  /** 回合断路器: 单轮工具调用上限, 0 = 不限. */
  maxTurnToolCalls: number
  /** 回合断路器: 单轮发言(say)上限, 0 = 不限. */
  maxTurnSayCalls: number
  /** 链长闸: 无人类输入时连续几条就按住讨论, 0 = 不限. */
  maxChain: number
  permissionMode: PermissionMode
  frozen: boolean
}

/** The room fields the form reads; a SessionMeta/SessionDetails satisfies it. */
export interface RoomSettingsSource {
  name?: string
  permissionMode?: PermissionMode
  room?: {
    memberAgentIds?: string[]
    pmAgentId?: string
    responseMode?: 'auto' | 'parallel' | 'serial'
    speakOrder?: string[]
    relayLoops?: number
    budgets?: {
      dailyCostUSD?: number
      maxChain?: number
      maxTurnToolCalls?: number
      maxTurnSayCalls?: number
      maxConcurrentTurns?: number
    }
    frozen?: boolean
  }
}

/**
 * 接力环的次序:配置里列过的(还在册的)在前,没列过的成员按名册序接在后面。
 *
 * 与引擎的 `buildCollabRelayRing` 是同一条规则,**刻意重写而不是复用**:渲染层
 * 不能 import runtime(架构边界,checker 会拦)。规则本身只有五行且是纯次序,
 * 真源在引擎那边 —— 这里若与它分家,后果只是表单显示的次序与实际发言次序不一致,
 * 所以两处都写了对方的位置。
 */
export function orderRoomSpeakers(
  speakOrder: readonly string[] | undefined,
  memberAgentIds: readonly string[],
): string[] {
  const inRoom = new Set(memberAgentIds)
  const seen = new Set<string>()
  const listed: string[] = []
  for (const agentId of speakOrder ?? []) {
    if (!inRoom.has(agentId) || seen.has(agentId)) continue
    seen.add(agentId)
    listed.push(agentId)
  }
  return [...listed, ...memberAgentIds.filter(agentId => !seen.has(agentId))]
}

export const ROOM_PERMISSION_MODES: ReadonlyArray<{ value: PermissionMode; label: string }> = [
  { value: 'normal', label: '正常(每次确认)' },
  { value: 'auto-accept-edits', label: '自动接受文件修改' },
  { value: 'dangerously-allow-all', label: '全部自动允许' },
]

/** A configured cap, or the built-in default when the room never set one. */
function readCap(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function readRoomSettings(source: RoomSettingsSource | undefined): RoomSettingsDraft {
  const room = source?.room
  const budget = room?.budgets?.dailyCostUSD
  return {
    name: source?.name ?? '',
    memberAgentIds: [...(room?.memberAgentIds ?? [])],
    pmAgentId: room?.pmAgentId ?? '',
    dailyCostUSD: typeof budget === 'number' && budget >= 0 ? budget : ROOM_DEFAULT_DAILY_COST_USD,
    maxTurnToolCalls: readCap(room?.budgets?.maxTurnToolCalls, ROOM_DEFAULT_MAX_TURN_TOOL_CALLS),
    maxTurnSayCalls: readCap(room?.budgets?.maxTurnSayCalls, ROOM_DEFAULT_MAX_TURN_SAY_CALLS),
    maxChain: readCap(room?.budgets?.maxChain, ROOM_DEFAULT_MAX_CHAIN),
    maxConcurrentTurns: readCap(
      room?.budgets?.maxConcurrentTurns,
      ROOM_DEFAULT_MAX_CONCURRENT_TURNS,
    ),
    // 缺省仍然是并行:编排(auto)这一版是显式 opt-in,机制与默认翻转不放同一个改动。
    responseMode: room?.responseMode === 'serial'
      ? 'serial'
      : room?.responseMode === 'auto' ? 'auto' : 'parallel',
    // 表单里始终握着一份**完整**的次序(名册全员),否则"上移/下移"要在一个残缺
    // 列表上做,而用户看到的顺序也不是引擎真正会走的那个。
    speakOrder: orderRoomSpeakers(room?.speakOrder, room?.memberAgentIds ?? []),
    relayLoops: readCap(room?.relayLoops, 0),
    permissionMode: source?.permissionMode ?? 'normal',
    frozen: room?.frozen === true,
  }
}

/** 次序相等是**序列**相等 —— 换个顺序正是这张表存在的全部意义(名册那侧相反)。 */
export function sameRoomSpeakOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((agentId, index) => b[index] === agentId)
}

/** Human-readable reason the draft cannot be saved, or null when it can. */
export function validateRoomSettings(draft: RoomSettingsDraft): string | null {
  if (!draft.name.trim()) return '房间名不能为空'
  if (draft.memberAgentIds.length === 0) return '房间至少需要一名成员'
  if (draft.pmAgentId && !draft.memberAgentIds.includes(draft.pmAgentId)) return '负责人必须是房间成员'
  if (!Number.isFinite(draft.dailyCostUSD) || draft.dailyCostUSD < 0) return '日预算必须是不小于 0 的数字'
  if (!Number.isFinite(draft.maxTurnToolCalls) || draft.maxTurnToolCalls < 0) {
    return '单轮工具调用上限必须是不小于 0 的数字'
  }
  if (!Number.isFinite(draft.maxTurnSayCalls) || draft.maxTurnSayCalls < 0) {
    return '单轮发言上限必须是不小于 0 的数字'
  }
  if (!Number.isFinite(draft.maxChain) || draft.maxChain < 0) {
    return '连续发言上限必须是不小于 0 的数字'
  }
  if (!Number.isFinite(draft.maxConcurrentTurns) || draft.maxConcurrentTurns < 0) {
    return '同时发言上限必须是不小于 0 的数字'
  }
  if (!Number.isFinite(draft.relayLoops) || draft.relayLoops < 0) {
    return '轮次必须是不小于 0 的数字'
  }
  return null
}

/** The IPC calls a save needs. Absent key = that channel is not called. */
export interface RoomSettingsSavePlan {
  roomUpdate?: {
    name?: string
    memberAgentIds?: string[]
    pmAgentId?: string | null
    permissionMode?: PermissionMode
    responseMode?: 'auto' | 'parallel' | 'serial'
    speakOrder?: string[]
    relayLoops?: number
  }
  /** Only the changed caps — the write is a patch, and an unsent key keeps
   *  whatever the room already had. */
  budgets?: {
    dailyCostUSD?: number
    maxChain?: number
    maxTurnToolCalls?: number
    maxTurnSayCalls?: number
    maxConcurrentTurns?: number
  }
  frozen?: boolean
}

/** Roster equality is set equality — reordering the checkbox list is not a change. */
export function sameRoomMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = new Set(a)
  return b.every(id => left.has(id))
}

export function diffRoomSettings(
  initial: RoomSettingsDraft,
  draft: RoomSettingsDraft,
): RoomSettingsSavePlan {
  const plan: RoomSettingsSavePlan = {}
  const roomUpdate: NonNullable<RoomSettingsSavePlan['roomUpdate']> = {}

  const name = draft.name.trim()
  if (name && name !== initial.name) roomUpdate.name = name
  if (!sameRoomMembers(initial.memberAgentIds, draft.memberAgentIds)) {
    roomUpdate.memberAgentIds = [...draft.memberAgentIds]
  }
  if (draft.pmAgentId !== initial.pmAgentId) {
    // '' means "no PM" — the wire contract clears with null, not with ''.
    roomUpdate.pmAgentId = draft.pmAgentId || null
  }
  if (draft.permissionMode !== initial.permissionMode) roomUpdate.permissionMode = draft.permissionMode
  if (draft.responseMode !== initial.responseMode) roomUpdate.responseMode = draft.responseMode
  // 次序只在**顺序模式**下有意义,所以并行模式的房间不写它 —— 一次无关的保存不该
  // 把一份用户从没编辑过的次序表钉进房间配置里。
  if (draft.responseMode !== 'parallel') {
    const nextOrder = orderRoomSpeakers(draft.speakOrder, draft.memberAgentIds)
    if (!sameRoomSpeakOrder(nextOrder, orderRoomSpeakers(initial.speakOrder, initial.memberAgentIds))) {
      roomUpdate.speakOrder = nextOrder
    }
    if (Number.isFinite(draft.relayLoops) && draft.relayLoops !== initial.relayLoops) {
      roomUpdate.relayLoops = draft.relayLoops
    }
  }
  if (Object.keys(roomUpdate).length > 0) plan.roomUpdate = roomUpdate

  const budgets: NonNullable<RoomSettingsSavePlan['budgets']> = {}
  if (Number.isFinite(draft.dailyCostUSD) && draft.dailyCostUSD !== initial.dailyCostUSD) {
    budgets.dailyCostUSD = draft.dailyCostUSD
  }
  if (Number.isFinite(draft.maxTurnToolCalls) && draft.maxTurnToolCalls !== initial.maxTurnToolCalls) {
    budgets.maxTurnToolCalls = draft.maxTurnToolCalls
  }
  if (Number.isFinite(draft.maxTurnSayCalls) && draft.maxTurnSayCalls !== initial.maxTurnSayCalls) {
    budgets.maxTurnSayCalls = draft.maxTurnSayCalls
  }
  if (Number.isFinite(draft.maxChain) && draft.maxChain !== initial.maxChain) {
    budgets.maxChain = draft.maxChain
  }
  // 同时发言上限在**每一种模式**下都生效了:编排之后串行由批边界保证,这一格
  // 回到它本来的意思(同时最多几个人说话),不再被顺序模式钉死成 1。
  if (
    Number.isFinite(draft.maxConcurrentTurns)
    && draft.maxConcurrentTurns !== initial.maxConcurrentTurns
  ) {
    budgets.maxConcurrentTurns = draft.maxConcurrentTurns
  }
  if (Object.keys(budgets).length > 0) plan.budgets = budgets
  if (draft.frozen !== initial.frozen) plan.frozen = draft.frozen
  return plan
}

export function hasRoomSettingsChanges(plan: RoomSettingsSavePlan): boolean {
  return Boolean(plan.roomUpdate || plan.budgets || plan.frozen !== undefined)
}
