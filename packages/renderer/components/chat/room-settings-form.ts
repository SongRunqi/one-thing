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
 * 连续发言上限(链长闸)的默认值与可填区间。
 *
 * 镜像 `COLLAB_DEFAULT_MAX_CHAIN` 与 `maxChainFor()` 的夹取规则:引擎把配置值
 * 夹到 `min(cap, 默认 × 4)`,所以表单也只让填到那儿——一个填得进去却不生效的
 * 数字比填不进去更糟。
 *
 * **这一格没有「0 = 不限」**,与上面几格不同,这是刻意的:链长闸是防失控的
 * 安全网(没有它,agent 之间可以无人类输入地一直聊下去),不该有关掉它的开关。
 * 0 在引擎里也不是"不限",而是"当作没配、回落默认 8"。
 */
export const ROOM_DEFAULT_MAX_CHAIN = 100
export const ROOM_MIN_MAX_CHAIN = 1
export const ROOM_MAX_MAX_CHAIN = ROOM_DEFAULT_MAX_CHAIN * 4

export interface RoomSettingsDraft {
  name: string
  memberAgentIds: string[]
  /** '' = no PM. */
  pmAgentId: string
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
    budgets?: {
      dailyCostUSD?: number
      maxChain?: number
      maxTurnToolCalls?: number
      maxTurnSayCalls?: number
    }
    frozen?: boolean
  }
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
    permissionMode: source?.permissionMode ?? 'normal',
    frozen: room?.frozen === true,
  }
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
  return null
}

/** The IPC calls a save needs. Absent key = that channel is not called. */
export interface RoomSettingsSavePlan {
  roomUpdate?: {
    name?: string
    memberAgentIds?: string[]
    pmAgentId?: string | null
    permissionMode?: PermissionMode
  }
  /** Only the changed caps — the write is a patch, and an unsent key keeps
   *  whatever the room already had. */
  budgets?: {
    dailyCostUSD?: number
    maxChain?: number
    maxTurnToolCalls?: number
    maxTurnSayCalls?: number
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
  if (Object.keys(budgets).length > 0) plan.budgets = budgets
  if (draft.frozen !== initial.frozen) plan.frozen = draft.frozen
  return plan
}

export function hasRoomSettingsChanges(plan: RoomSettingsSavePlan): boolean {
  return Boolean(plan.roomUpdate || plan.budgets || plan.frozen !== undefined)
}
