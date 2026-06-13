import type { AppSettings } from '../../../shared/ipc.js'

export const DEFAULT_SKILL_REVIEW_INTERVAL = 10

interface SessionSkillReviewState {
  iterationsSinceSkillManage: number
  running: boolean
}

export interface SkillReviewCounterInput {
  sessionId: string
  settings?: AppSettings
  toolIterations: number
  skillManageAvailable: boolean
  skillManageCalled: boolean
}

const states = new Map<string, SessionSkillReviewState>()

function getState(sessionId: string): SessionSkillReviewState {
  let state = states.get(sessionId)
  if (!state) {
    state = { iterationsSinceSkillManage: 0, running: false }
    states.set(sessionId, state)
  }
  return state
}

export function getSkillReviewInterval(settings?: AppSettings): number {
  const raw = settings?.skills?.creationNudgeInterval
  if (raw === undefined || raw === null) return DEFAULT_SKILL_REVIEW_INTERVAL
  const interval = Number(raw)
  return Number.isFinite(interval) ? Math.floor(interval) : DEFAULT_SKILL_REVIEW_INTERVAL
}

export function resetSkillReviewCounter(sessionId: string): void {
  getState(sessionId).iterationsSinceSkillManage = 0
}

export function getSkillReviewCounter(sessionId: string): number {
  return getState(sessionId).iterationsSinceSkillManage
}

export function clearSkillReviewState(): void {
  states.clear()
}

export function isSkillReviewRunning(sessionId: string): boolean {
  return getState(sessionId).running
}

export function markSkillReviewRunning(sessionId: string, running: boolean): void {
  getState(sessionId).running = running
}

export function recordSkillReviewCounter(input: SkillReviewCounterInput): boolean {
  const interval = getSkillReviewInterval(input.settings)
  const state = getState(input.sessionId)

  if (input.skillManageCalled) {
    state.iterationsSinceSkillManage = 0
    return false
  }

  if (interval <= 0 || !input.skillManageAvailable || input.toolIterations <= 0) {
    return false
  }

  state.iterationsSinceSkillManage += input.toolIterations
  if (state.iterationsSinceSkillManage < interval) {
    return false
  }

  state.iterationsSinceSkillManage = 0
  return true
}
