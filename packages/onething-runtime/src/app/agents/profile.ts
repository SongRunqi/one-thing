/**
 * Assembly-side entry to the agent capability profile.
 *
 * The rule itself is a pure function in the product layer
 * (`@onething/runtime/agents` → agents/profile.ts). This module is the only
 * thing allowed to feed it the live stores, and it exists so the profile is
 * resolved ONCE per turn: the snapshot rides on StreamContext and every
 * downstream consumer reads it instead of re-deriving its own answer.
 */

import {
  resolveAgentProfile,
  type EffectiveAgentProfile,
} from '@onething/runtime/agents'
import { isUserDmRoom } from '@onething/runtime/collab'
import type { ChatSession } from '@shared/ipc.js'
import { getSession } from '../stores/sessions.js'
import { getSettings } from '../stores/settings.js'
import { defaultAgent, findAgent } from './store.js'

export type { EffectiveAgentProfile }

/**
 * 这一回合答的是单成员 dm 房吗(agent-im-dm.md D7 的输入)。
 *
 * 与提示词那边同一条推导:房间会话读自己的 `room`,常驻执行会话读它的归属指针
 * `collab.roomSessionId`——W18 之后回合跑在执行会话里,而 dm 与否是**房**的属性。
 */
function isDmRoomTurn(session: ChatSession): boolean {
  const kind = (session as ChatSession & { kind?: string }).kind
  if (kind === 'room') return isUserDmRoom(session.room)
  if (kind !== 'agent') return false
  const roomSessionId = session.collab?.roomSessionId
  if (!roomSessionId) return false
  return isUserDmRoom(getSession(roomSessionId)?.room)
}

function sessionProfileInput(session: ChatSession | null | undefined) {
  if (!session) return undefined
  return {
    kind: (session as ChatSession & { kind?: string }).kind,
    dm: isDmRoomTurn(session),
    permissionMode: session.permissionMode,
    modelPinned: session.modelPinned,
  }
}

/** Resolve the profile for a session from the live agent/session/settings stores. */
export function resolveAgentProfileForSession(sessionId: string): EffectiveAgentProfile {
  const session = getSession(sessionId)
  return resolveAgentProfile({
    // 功能兜底(域模型 §3.3,非解析 fallback):无 agentId 或查无此人的会话由
    // default persona 接手 —— 这是 default agent 的既有职责,显式写出。
    agent: findAgent(session?.agentId) ?? defaultAgent(),
    session: sessionProfileInput(session),
    settings: getSettings(),
  })
}
