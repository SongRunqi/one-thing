// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomBackstagePanel from '../RoomBackstagePanel.vue'

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  generating: new Set<string>(),
  board: null as Record<string, unknown> | null,
  pendingAsks: new Set<string>(),
  unread: new Set<string>(),
  dmRooms: {} as Record<string, { id: string }>,
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: (id: string) => mocks.generating.has(id) }),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    sessions: mocks.sessions,
    findUserDmRoom: (agentId: string) => mocks.dmRooms[agentId],
    isUnreadSession: (id: string) => mocks.unread.has(id),
  }),
}))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    ensureSubscribed: vi.fn(),
    load: vi.fn(),
    boardFor: () => mocks.board,
    hasPendingAsk: (id: string) => mocks.pendingAsks.has(id),
  }),
}))

/* 三格的内容各有各的单测;这一层的契约是"哪几格 / 在哪一格 / 亮不亮点"。 */
vi.mock('../RoomThreadsWorkbench.vue', () => ({
  default: {
    name: 'RoomThreadsWorkbench',
    props: ['roomSessionId', 'focusSessionId', 'grouped', 'backTo'],
    emits: ['focus', 'openFile'],
    template: '<div class="mock-threads">{{ focusSessionId }}</div>',
  },
}))

vi.mock('../MembersWorkbench.vue', () => ({
  default: {
    name: 'MembersWorkbench',
    props: ['sessionId', 'focusAgentId'],
    emits: ['focus', 'open-session', 'open-file', 'open-thread'],
    template: `
      <div class="mock-members">
        {{ focusAgentId }}
        <button class="mock-open-thread" @click="$emit('open-thread', 'work-7', 't')">线程</button>
      </div>
    `,
  },
}))

vi.mock('../RoomBoardWorkbench.vue', () => ({
  default: {
    name: 'RoomBoardWorkbench',
    props: ['roomSessionId'],
    emits: ['openThread'],
    template: `
      <div class="mock-board">
        <button class="mock-board-row" @click="$emit('openThread', 'work-3')">卡</button>
      </div>
    `,
  },
}))

/** v-show 是内联 display:none —— 这一层用它判断"看得见的是哪一格"。 */
function visible(wrapper: ReturnType<typeof mount>, selector: string): boolean {
  const el = wrapper.find(selector)
  return el.exists() && (el.element as HTMLElement).style.display !== 'none'
}

const GROUP_ROOM = {
  id: 'room-1',
  kind: 'room',
  room: { memberAgentIds: ['lin', 'che'] },
}

describe('RoomBackstagePanel — 分段器,不是页签', () => {
  beforeEach(() => {
    mocks.sessions = [{ ...GROUP_ROOM }]
    mocks.generating = new Set()
    mocks.board = { tasks: [] }
    mocks.pendingAsks = new Set()
    mocks.unread = new Set()
    mocks.dmRooms = {}
  })

  it('群房三格、私聊房两格,格子上没有 ✕ 也没有 ＋', () => {
    const group = mount(RoomBackstagePanel, { props: { roomSessionId: 'room-1' } })
    expect(group.findAll('.seg-cell').map(cell => cell.text())).toEqual(['线程', '成员', '看板'])
    expect(group.find('.app-tabs-close').exists()).toBe(false)
    expect(group.html()).not.toContain('tab-add')

    const dm = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin' },
    })
    expect(dm.findAll('.seg-cell').map(cell => cell.text())).toEqual(['线程', '空间'])
  })

  it('私聊房的「空间」格直接停在那一个人的空间页(没有成员表)', () => {
    const wrapper = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin' },
    })
    expect(wrapper.find('.mock-members').text()).toContain('lin')
  })

  /**
   * 页签形态的第四个症状:下钻后标题变长,把自己挤出可视区。
   * 分段器的反面保证 —— 下钻不动格子,一个字都不改。
   */
  it('下钻不改标题、不动格数', async () => {
    const wrapper = mount(RoomBackstagePanel, { props: { roomSessionId: 'room-1' } })
    const before = wrapper.findAll('.seg-cell').map(cell => cell.text())

    await wrapper.find('.seg-cell:nth-child(3)').trigger('click')
    await wrapper.find('.mock-board-row').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.seg-cell').map(cell => cell.text())).toEqual(before)
    expect(wrapper.find('.mock-threads').text()).toBe('work-3')
  })

  it('换格不丢另一格里的位置(三格常驻挂着,不是销毁重建)', async () => {
    const wrapper = mount(RoomBackstagePanel, { props: { roomSessionId: 'room-1' } })
    await wrapper.find('.seg-cell:nth-child(2)').trigger('click')
    await wrapper.find('.mock-open-thread').trigger('click')
    await nextTick()
    // 「打开线程」把人带去线程格
    expect(visible(wrapper, '.mock-threads')).toBe(true)
    expect(wrapper.find('.mock-threads').text()).toBe('work-7')

    // 回到成员格:那一格还在原地(DOM 一直在)
    await wrapper.find('.seg-cell:nth-child(2)').trigger('click')
    expect(visible(wrapper, '.mock-members')).toBe(true)
  })

  it('状态点:线程在跑(绿)/ 看板待你(橙)/ 成员未读(墨),而且不显示计数', async () => {
    mocks.sessions = [
      { ...GROUP_ROOM },
      { id: 'work-1', kind: 'work', agentId: 'lin', collab: { roomSessionId: 'room-1' } },
      { id: 'work-2', kind: 'work', agentId: 'che', collab: { roomSessionId: 'room-1' } },
    ]
    mocks.generating = new Set(['work-1', 'work-2'])
    mocks.board = {
      tasks: [{ id: 'a', status: 'blocked', workSessionIds: [], updatedAt: 1, rev: 1, title: 'x', rejections: 0 }],
    }
    mocks.dmRooms = { lin: { id: 'dm-lin' } }
    mocks.unread = new Set(['dm-lin'])

    const wrapper = mount(RoomBackstagePanel, { props: { roomSessionId: 'room-1' } })
    const cells = wrapper.findAll('.seg-cell')
    expect(cells[0].find('.seg-dot').classes()).toContain('is-run')
    expect(cells[1].find('.seg-dot').classes()).toContain('is-new')
    expect(cells[2].find('.seg-dot').classes()).toContain('is-wait')
    // 两条线程在跑,但格子上只有一颗点 —— 有没有,不是几个
    expect(wrapper.text()).not.toContain('2')
  })

  it('外部落座:看板 / 成员 / 线程各归各位;私聊房请求看板则原地不动', async () => {
    const wrapper = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'room-1', landing: { segment: 'board', nonce: 1 } },
    })
    await nextTick()
    expect(visible(wrapper, '.mock-board')).toBe(true)

    await wrapper.setProps({ landing: { segment: 'members', agentId: 'che', nonce: 2 } })
    await nextTick()
    expect(visible(wrapper, '.mock-members')).toBe(true)
    expect(wrapper.find('.mock-members').text()).toContain('che')

    await wrapper.setProps({ landing: { segment: 'threads', threadSessionId: 'work-5', nonce: 3 } })
    await nextTick()
    expect(visible(wrapper, '.mock-threads')).toBe(true)
    expect(wrapper.find('.mock-threads').text()).toBe('work-5')

    const dm = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin', landing: { segment: 'board', nonce: 1 } },
    })
    await nextTick()
    expect(visible(dm, '.mock-threads')).toBe(true)
  })

  it('私聊房请求「成员」→ 落到「空间」格', async () => {
    const wrapper = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'dm-1', isDm: true, dmAgentId: 'lin' },
    })
    await wrapper.setProps({ landing: { segment: 'members', agentId: 'lin', nonce: 1 } })
    await nextTick()
    expect(visible(wrapper, '.mock-members')).toBe(true)
  })

  it('换房 = 回线程格的列表层(不替用户挑一次执行)', async () => {
    const wrapper = mount(RoomBackstagePanel, {
      props: { roomSessionId: 'room-1', landing: { segment: 'board', nonce: 1 } },
    })
    await nextTick()
    await wrapper.setProps({ roomSessionId: 'room-2' })
    await nextTick()
    expect(visible(wrapper, '.mock-threads')).toBe(true)
    expect(wrapper.find('.mock-threads').text()).toBe('')
  })
})

/**
 * 250px 围栏。happy-dom 不排版,所以这里钉的是**根因**:
 * 分段器只要还是 `flex: 1 1 0` 等分、格子不可关不可加、行两侧不缩,
 * 页签形态那四个症状就不可能复发。像素本身另用真排版引擎量(见报告)。
 */
describe('RoomBackstagePanel — 最窄 250px 的结构约束', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'packages/renderer/components/workbench/RoomBackstagePanel.vue'),
    'utf8',
  )

  function ruleOf(selector: string): string {
    const match = source.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))
    return match?.[1] ?? ''
  }

  it('三格严格等分(flex: 1 1 0),不可横向滚动', () => {
    expect(ruleOf('.seg-cell')).toContain('flex: 1 1 0')
    expect(ruleOf('.backstage-seg')).not.toContain('overflow')
  })

  it('状态点定宽不缩 —— 它不该跟着标题一起被压扁', () => {
    expect(ruleOf('.seg-dot')).toContain('flex: 0 0 auto')
  })

  it('模板里没有关闭/新增按钮 —— 格数由形态决定,用户加不了也关不掉', () => {
    expect(source).not.toContain('addable')
    expect(source).not.toContain('closable')
  })
})
