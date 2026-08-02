// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomThreadsWorkbench from '../RoomThreadsWorkbench.vue'

const mocks = vi.hoisted(() => ({
  loadBoard: vi.fn(),
  generating: new Set<string>(),
  agents: [
    { id: 'lin', name: '小林', avatar: '🧭' },
    { id: 'che', name: '阿澈', avatar: '🧪' },
  ] as Array<Record<string, unknown>>,
  board: {
    roomSessionId: 'room-1',
    tasks: [{ id: 'task-1', title: 'castlabs 换核验证', status: 'doing', workSessionIds: ['work-1'], updatedAt: 2 }],
  } as Record<string, unknown> | null,
  sessions: [] as Array<Record<string, unknown>>,
  pairDmRooms: [] as Array<Record<string, unknown>>,
}))

const BASE_SESSIONS: Array<Record<string, unknown>> = [
  {
    id: 'room-1',
    kind: 'room',
    name: '浏览器重构',
    updatedAt: 10,
    room: { memberAgentIds: ['lin', 'che'] },
  },
  { id: 'chat-1', kind: 'chat', agentId: 'lin', name: '直聊一', updatedAt: 9 },
  {
    id: 'work-1',
    kind: 'work',
    agentId: 'lin',
    name: '工作台',
    updatedAt: 8,
    collab: { roomSessionId: 'room-1', taskId: 'task-1' },
  },
  {
    id: 'agent-exec-che-room-1',
    kind: 'agent',
    agentId: 'che',
    name: '[执行] 阿澈',
    updatedAt: 7,
    collab: { roomSessionId: 'room-1' },
  },
  // 另一间房的执行会话 —— 归属读 collab.roomSessionId,不该混进来
  {
    id: 'work-9',
    kind: 'work',
    agentId: 'lin',
    updatedAt: 11,
    collab: { roomSessionId: 'room-9', taskId: 'task-9' },
  },
]

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    hasLoaded: true,
    loadAgents: vi.fn().mockResolvedValue([]),
    displayAgent: (agentId: string) => {
      const agent = mocks.agents.find(item => item.id === agentId)
      if (!agent) return { id: agentId, name: '已注销', kind: 'colleague', status: 'retired' }
      return { ...agent, kind: 'colleague', status: 'active' }
    },
  }),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    sessions: mocks.sessions,
    // 「哪些房算私下房」由 store 的 selector 回答(人数即形态)——
    // 组件只负责"这一对是不是这屋子里的人"。
    get agentPairDmRoomSessions() { return mocks.pairDmRooms },
  }),
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: (id: string) => mocks.generating.has(id) }),
}))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    ensureSubscribed: vi.fn(),
    load: mocks.loadBoard,
    boardFor: () => mocks.board,
    // 分段形态下列表层顶上挂着协调器状态条(collab-coordinator-inspector.md),
    // 它读同一个 store。这两格给足,状态条那面自己的判定在
    // `coordinator-status.test.ts` 与 `app/collab/__tests__/inspector.test.ts`。
    loadCoordinator: vi.fn(async () => {}),
    coordinatorFor: () => null,
  }),
}))

vi.mock('@/components/common/AgentAvatar.vue', () => ({
  default: { name: 'AgentAvatar', props: ['avatar', 'avatarImage', 'size'], template: '<i class="mock-avatar" />' },
}))

/* 详情层是 ThreadChatDetail(既有聊天 UI:它拖着 chat store 与整棵 MessageList/MessageItem 树,另有
   自己的单测)。这里桩掉它:本组件的契约是"进得去哪一条 / 回得来",不是详情长什么样。 */
vi.mock('../ThreadChatDetail.vue', () => ({
  default: {
    name: 'ThreadChatDetail',
    props: ['sessionId', 'tag', 'title'],
    emits: ['openFile', 'titleResolved'],
    template: '<div class="mock-thread" :data-tag="tag">{{ sessionId }}</div>',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('RoomThreadsWorkbench — 线程两层', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessions = BASE_SESSIONS.map(item => ({ ...item }))
    mocks.pairDmRooms = []
    mocks.generating = new Set()
    mocks.board = {
      roomSessionId: 'room-1',
      tasks: [{ id: 'task-1', title: 'castlabs 换核验证', status: 'doing', workSessionIds: ['work-1'], updatedAt: 2 }],
    }
  })

  it('列表层:这间房的执行会话按 updatedAt 倒序,两类各有各的副文', () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1' } })

    const rows = wrapper.findAll('.thread-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('.thread-name').text()).toBe('小林')
    expect(rows[0].find('.thread-sub').text()).toBe('castlabs 换核验证')
    expect(rows[1].find('.thread-name').text()).toBe('阿澈')
    expect(rows[1].find('.thread-sub').text()).toBe('服务房间对话')
    expect(wrapper.find('.mock-thread').exists()).toBe(false)
  })

  it('在跑的行带状态点,停着的不带', () => {
    mocks.generating = new Set(['work-1'])
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1' } })

    const rows = wrapper.findAll('.thread-row')
    expect(rows[0].find('.thread-dot').exists()).toBe(true)
    expect(rows[1].find('.thread-dot').exists()).toBe(false)
  })

  it('空态是一句话,不是一块空白', () => {
    mocks.sessions = [{ id: 'room-2', kind: 'room', name: '空房', updatedAt: 1 }]
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-2' } })

    expect(wrapper.findAll('.thread-row')).toHaveLength(0)
    expect(wrapper.find('.threads-empty').text()).toContain('这间房还没有执行会话')
  })

  it('选中一行 → 详情层(同一个面板里换层),返回列表回得来', async () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1' } })

    await wrapper.findAll('.thread-row')[0].trigger('click')
    await settle()
    expect(wrapper.find('.mock-thread').text()).toBe('work-1')
    expect(wrapper.findAll('.thread-row')).toHaveLength(0)
    // 落点回报给宿主 tab —— 关掉再开回来停在同一层
    expect(wrapper.emitted('focus')?.at(-1)?.[0]).toEqual({ sessionId: 'work-1', roomSessionId: 'room-1' })

    await wrapper.find('.thread-back').trigger('click')
    await settle()
    expect(wrapper.find('.mock-thread').exists()).toBe(false)
    expect(wrapper.findAll('.thread-row')).toHaveLength(2)
    expect(wrapper.emitted('focus')?.at(-1)?.[0]).toEqual({ sessionId: '', roomSessionId: 'room-1' })
  })

  it('只带一条执行会话进来:直接落详情层,房间由 collab.roomSessionId 现查(不反解 id)', async () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: '', focusSessionId: 'work-1' } })
    await settle()

    expect(wrapper.find('.mock-thread').text()).toBe('work-1')
    // 房间查出来了 → 回报给 tab,并且返回列表时表是齐的
    expect(wrapper.emitted('focus')?.at(-1)?.[0]).toEqual({ sessionId: 'work-1', roomSessionId: 'room-1' })

    await wrapper.find('.thread-back').trigger('click')
    await settle()
    expect(wrapper.findAll('.thread-row')).toHaveLength(2)
  })

  it('房间查不到就不画返回键 —— 那颗键会把人带进一张空表', async () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: '', focusSessionId: 'stray' } })
    await settle()

    expect(wrapper.find('.mock-thread').text()).toBe('stray')
    expect(wrapper.find('.thread-back').exists()).toBe(false)
  })
})

/**
 * 窄宽度围栏(右栏最窄约 250px)。
 *
 * happy-dom 不排版,量不出像素;能钉住的是**根因** —— 上一次同类事故的根因是
 * "允许无下限收缩":两侧格子会跟着一起缩,文字栏没有 `min-width: 0` + 省略号,
 * 于是名字被挤没。这三条只要还在,行就只会截断,不会消失。
 */
describe('RoomThreadsWorkbench — 窄宽度不许挤没关键信息', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'packages/renderer/components/workbench/RoomThreadsWorkbench.vue'),
    'utf8',
  )

  function ruleOf(selector: string): string {
    const match = source.match(new RegExp(`\\n${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
    return match?.[1] ?? ''
  }

  it('头像与右端定宽不缩(flex: 0 0 auto)', () => {
    expect(ruleOf('.thread-mark')).toContain('flex: 0 0 auto')
    expect(ruleOf('.thread-meta')).toContain('flex: 0 0 auto')
    expect(ruleOf('.thread-meta')).toContain('white-space: nowrap')
  })

  it('文字栏可缩但有下限(min-width: 0),两行都截断而不是消失', () => {
    expect(ruleOf('.thread-text')).toContain('min-width: 0')
    for (const selector of ['.thread-name', '.thread-sub']) {
      expect(ruleOf(selector)).toContain('text-overflow: ellipsis')
      expect(ruleOf(selector)).toContain('white-space: nowrap')
      expect(ruleOf(selector)).toContain('overflow: hidden')
    }
  })
})


/**
 * 「私下」—— 这间房两位成员之间的私聊房(2026-08-01 用户要求:「线程里面我最好
 * 能够看到他们的私聊的 session」)。D4 的透明制本来就承诺可旁观可插话,只是一直
 * 没有从**这间房**进去的入口。
 */
describe('RoomThreadsWorkbench — 房里的「私下」', () => {
  beforeEach(() => {
    mocks.pairDmRooms = [
      { id: 'dm-lin-che', name: '小林 ⇄ 阿澈', updatedAt: 6, room: { memberAgentIds: ['lin', 'che'] } },
      // 一位成员和屋外某人的私聊 —— 不是这间房的事。
      { id: 'dm-lin-out', name: '小林 ⇄ 外人', updatedAt: 20, room: { memberAgentIds: ['lin', 'out'] } },
    ]
  })

  it('分段形态:私下自成一段,恒在执行之后', () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1', grouped: true } })
    const heads = wrapper.findAll('.thread-group-head').map(head => head.text())
    expect(heads[heads.length - 1]).toBe('私下')

    const rows = wrapper.findAll('.thread-row')
    expect(rows).toHaveLength(3)
    const dmRow = rows[rows.length - 1]
    expect(dmRow.find('.thread-name').text()).toBe('小林 ⇄ 阿澈')
    expect(dmRow.find('.thread-sub').text()).toBe('私下对话')
  })

  it('屋外那一对不出现(归属靠名册,不是"沾了一个成员就算")', () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1', grouped: true } })
    expect(wrapper.text()).not.toContain('外人')
  })

  it('私下行画两张脸 —— 那是两个人的对话', () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1', grouped: true } })
    const dmRow = wrapper.findAll('.thread-row')[2]
    expect(dmRow.findAll('.thread-face')).toHaveLength(2)
    // 执行行照旧一张 32px 头像(逐像素不变)。
    expect(wrapper.findAll('.thread-row')[0].findAll('.thread-face')).toHaveLength(0)
  })

  it('点进去就地读那段对话,小字标改说「私下」', async () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1', grouped: true } })
    await wrapper.findAll('.thread-row')[2].trigger('click')
    const detail = wrapper.find('.mock-thread')
    expect(detail.text()).toBe('dm-lin-che')
    expect(detail.attributes('data-tag')).toBe('私下')
  })

  it('执行行点进去仍然是 THREAD(既有行为一个字节不变)', async () => {
    const wrapper = mount(RoomThreadsWorkbench, { props: { roomSessionId: 'room-1', grouped: true } })
    await wrapper.findAll('.thread-row')[0].trigger('click')
    expect(wrapper.find('.mock-thread').attributes('data-tag')).toBe('THREAD')
  })
})
