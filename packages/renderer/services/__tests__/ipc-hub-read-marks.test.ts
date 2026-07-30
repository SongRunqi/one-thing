// @vitest-environment happy-dom
/**
 * 落库消息 → 已读水位的喂料(docs/design/agent-im-dm.md P4)。
 *
 * 这里钉的是一条容易被写错的事实:**事件名证明不了谁在说话**。房间里 agent 的
 * say 走的正是 `message:user-created` 这条通道(`app/collab/say-tool.ts`),按事件名
 * 分派会把 agent 说的话当成"用户自己说的",未读从此永远不亮。判定按 role。
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type SessionEventCallback = (envelope: {
  sessionId: string
  event: Record<string, unknown>
}) => void

const T0 = 1_700_000_000_000

describe('IPC hub → 已读水位', () => {
  let sessionEventCallback: SessionEventCallback | undefined

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
    sessionEventCallback = undefined
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        onSessionEvent: vi.fn((callback: SessionEventCallback) => {
          sessionEventCallback = callback
          return vi.fn()
        }),
        onSessionStream: vi.fn(() => vi.fn()),
        saveUIState: vi.fn(async () => ({ success: true })),
      },
    })
  })

  async function bootRoom() {
    const { initializeIPCHub } = await import('../ipc-hub')
    const { useSessionsStore } = await import('@/stores/sessions')
    const sessionsStore = useSessionsStore()
    sessionsStore.sessions.push({
      id: 'room-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe'] },
      createdAt: T0,
      updatedAt: T0,
    } as never)
    sessionsStore.hydrateReadMarks(null)
    initializeIPCHub()
    return sessionsStore
  }

  /** 事件经 dynamic import 才落到 store(hub 一贯的解环手法),等模块解析完。 */
  async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  it('agent 的 say(role=assistant,却走 user-created 通道)算未读', async () => {
    const sessionsStore = await bootRoom()
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: {
        type: 'message:user-created',
        message: { id: 'm1', role: 'assistant', agentId: 'fe', content: '好了', timestamp: T0 + 100 },
      },
    })
    await settle()
    expect(sessionsStore.isUnreadSession('room-1')).toBe(true)
  })

  it('用户自己说话推进水位,把未读清掉', async () => {
    const sessionsStore = await bootRoom()
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: {
        type: 'message:user-created',
        message: { id: 'm1', role: 'assistant', content: '好了', timestamp: T0 + 100 },
      },
    })
    await settle()
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: {
        type: 'message:user-created',
        message: { id: 'm2', role: 'user', content: '收到', timestamp: T0 + 200 },
      },
    })
    await settle()
    expect(sessionsStore.isUnreadSession('room-1')).toBe(false)
  })

  it('系统台账行(预算/断路器,role=system)不是有人跟你说话', async () => {
    const sessionsStore = await bootRoom()
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: {
        type: 'message:user-created',
        message: { id: 'm3', role: 'system', content: '本房预算已用尽', timestamp: T0 + 300 },
      },
    })
    await settle()
    expect(sessionsStore.isUnreadSession('room-1')).toBe(false)
  })

  it('流式 chunk 不碰水位 —— 徽标只认落库消息,生成过程中不闪', async () => {
    const sessionsStore = await bootRoom()
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: { type: 'stream:start', messageId: 'm4' },
    })
    sessionEventCallback?.({
      sessionId: 'room-1',
      event: { type: 'content:part', part: { type: 'text', content: 'hi' } },
    })
    await settle()
    expect(sessionsStore.readMarks.size).toBe(0)
    expect(sessionsStore.isUnreadSession('room-1')).toBe(false)
  })
})
