// @vitest-environment happy-dom
/**
 * 状态条「现在」那一行上的「停」—— 人级停止(E5)在界面上的第二个入口。
 *
 * 这颗按钮在 E5 之前 emit 的是**房级**喊停(换代 = 把在外的牌一起作废),而它画在
 * 某一行人旁边:点小李那一行,阿般和 Iris 一起被打断。语义与位置对不上,而这种错
 * 在真机上看起来完全正常 —— 房间确实"停了"。所以这一组钉的是**靶子**。
 *
 * 回落那条也要钉:v2 旧快照的行没有牌号,此时人级无从下手,只能走房级。少了这条
 * 分支,一间还没上 v3 的房里那颗「停」会变成一颗按了没反应的死控件。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollabCoordinatorState } from '@shared/ipc'
import CoordinatorStatusBar from '../CoordinatorStatusBar.vue'

const mocks = vi.hoisted(() => ({
  coordinator: null as CollabCoordinatorState | null,
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    displayAgent: (agentId: string) => ({ id: agentId, name: agentId === 'fe' ? '小李' : agentId }),
  }),
}))

vi.mock('@/stores/sessions', () => ({ useSessionsStore: () => ({ sessions: [] }) }))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    coordinatorFor: () => mocks.coordinator,
    agentActivityFor: () => null,
    ensureAgentActivity: vi.fn(),
    loadCoordinator: vi.fn(async () => {}),
  }),
}))

function coordinator(agentSessionId: string): CollabCoordinatorState {
  return {
    roomSessionId: 'room-1',
    mode: 'parallel',
    frozen: false,
    seq: 1,
    at: Date.now(),
    speaking: ['fe'],
    typing: [],
    turns: [{ agentId: 'fe', reason: 'mention', startedAt: Date.now() - 1_000, agentSessionId, executing: true }],
    queue: [],
    judging: 0,
    judgingAgentIds: [],
    gates: {
      chain: { value: 0, max: 32 },
      concurrency: { value: 1, max: 6 },
      budget: { value: 0, max: 5 },
    },
    plan: null,
    log: [],
    judgment: { state: 'idle' },
    deadLetterCount: 0,
    floorEpoch: 5,
  }
}

async function mountBar() {
  const wrapper = mount(CoordinatorStatusBar, {
    props: { roomSessionId: 'room-1' },
    global: { stubs: { Tooltip: { template: '<div><slot /></div>' } } },
  })
  await nextTick()
  // 「现在」那一段在展开面里 —— 条本身只有一行摘要。
  const toggle = wrapper.find('.cd-bar')
  if (toggle.exists()) await toggle.trigger('click')
  await nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.coordinator = coordinator('room-1#L1')
})

describe('状态条「停」的靶子(E5 人级停止)', () => {
  it('这一行有牌号就走人级 —— 只收这一张,不动同房其他人', async () => {
    const wrapper = await mountBar()
    const stop = wrapper.find('.cd-act')
    expect(stop.exists()).toBe(true)

    await stop.trigger('click')
    expect(wrapper.emitted('stopLease')).toEqual([['room-1#L1']])
    // 关键的**否定**:人级可达时绝不顺手把整间房也停了。
    expect(wrapper.emitted('stopTurn')).toBeUndefined()
  })

  it('没有牌号的行(v2 旧快照)回落房级,不变成死控件', async () => {
    mocks.coordinator = coordinator('')
    const wrapper = await mountBar()
    await wrapper.find('.cd-act').trigger('click')
    expect(wrapper.emitted('stopTurn')).toHaveLength(1)
    expect(wrapper.emitted('stopLease')).toBeUndefined()
  })

  /**
   * 挂点那一头:`stopLease` 要真的接到人级那条 store action 上。
   *
   * 结构性证据而不是再挂一次整棵工作台 —— 这条边一旦断了,按钮照样按得下去、
   * 照样什么都不会发生,而那正是最难在真机上发现的一类失败。
   */
  it('RoomThreadsWorkbench 把 stop-lease 接到 revokeLease 上', () => {
    // happy-dom 环境里 `import.meta.url` 不是 file: URL,只能从仓库根拼路径
    // (与 RoomThreadsWorkbench.test.ts 同一手法)。
    const source = readFileSync(
      resolve(process.cwd(), 'packages/renderer/components/workbench/RoomThreadsWorkbench.vue'),
      'utf8',
    )
    expect(source).toContain('@stop-lease="stopRoomLease"')
    expect(source).toContain('collabBoardStore.revokeLease(roomId.value, leaseId)')
  })
})
