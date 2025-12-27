/**
 * 工具状态映射
 *
 * 用于在旧的 ToolCall.status 和新的 ToolUIPart.state 之间转换
 */

import type { ToolUIState } from './ipc.js'

// ============================================================================
// 旧状态类型（来自现有 ToolCall）
// ============================================================================

export type LegacyToolStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'

// ============================================================================
// 状态映射
// ============================================================================

/**
 * 旧状态 → 新状态 映射
 */
export const LEGACY_TO_UI_STATE: Record<LegacyToolStatus, ToolUIState> = {
  pending: 'input-available',
  executing: 'input-available',
  completed: 'output-available',
  failed: 'output-error',
  cancelled: 'output-error',
}

/**
 * 新状态 → 旧状态 映射（用于向后兼容）
 */
export const UI_TO_LEGACY_STATE: Record<ToolUIState, LegacyToolStatus> = {
  'input-streaming': 'pending',
  'input-available': 'executing',
  'output-available': 'completed',
  'output-error': 'failed',
}

// ============================================================================
// 转换函数
// ============================================================================

/**
 * 将旧的 ToolCall.status 转换为新的 ToolUIPart.state
 */
export function legacyStatusToUIState(status: LegacyToolStatus): ToolUIState {
  return LEGACY_TO_UI_STATE[status] || 'input-available'
}

/**
 * 将新的 ToolUIPart.state 转换为旧的 ToolCall.status
 */
export function uiStateToLegacyStatus(state: ToolUIState): LegacyToolStatus {
  return UI_TO_LEGACY_STATE[state] || 'pending'
}

// ============================================================================
// 状态判断函数
// ============================================================================

/**
 * 判断是否为正在进行中的状态
 */
export function isToolInProgress(state: ToolUIState): boolean {
  return state === 'input-streaming' || state === 'input-available'
}

/**
 * 判断是否为已完成的状态（成功或失败）
 */
export function isToolFinished(state: ToolUIState): boolean {
  return state === 'output-available' || state === 'output-error'
}

/**
 * 判断是否为成功状态
 */
export function isToolSuccess(state: ToolUIState): boolean {
  return state === 'output-available'
}

/**
 * 判断是否为错误状态
 */
export function isToolError(state: ToolUIState): boolean {
  return state === 'output-error'
}

/**
 * 判断是否为等待输入状态
 */
export function isToolWaitingInput(state: ToolUIState): boolean {
  return state === 'input-streaming'
}

/**
 * 判断是否为等待执行状态（输入已完成）
 */
export function isToolWaitingExecution(state: ToolUIState): boolean {
  return state === 'input-available'
}
