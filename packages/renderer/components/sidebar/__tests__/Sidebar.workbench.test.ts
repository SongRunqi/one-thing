// @vitest-environment happy-dom
/**
 * 左栏「以活为脊」的门与接线(C1,docs/design/im-workbench-layout.md §3 W1)。
 *
 * 钉的事(R4 之后):
 *  1. **classic 逐像素回滚闸** —— 「进行中」连挂都不挂、一次看板 IPC 都不发;
 *     四区重排的 `order`、统一滚动容器、分区折叠、脚栏「⋯」、群聊行头像堆,
 *     全部关在 `data-shell-mode='workbench'` 门或 JS 形态判定里;
 *  2. workbench 下卡片按 updatedAt 倒序、三档状态标各画各的、**没有活就整区
 *     不显示**(2026-07-31 真机后用户拍板,推翻旧的「塌陷成一行」);
 *  3. 点卡 = 开这张卡所在的房(走既有 openSession 链路);
 *  4. 四区在同一个滚动容器里(会话列表交出内部滚动,不出双滚动条),各区可折叠
 *     且折叠态持久化;dock 撤掉后五个工作区面板的入口一个不丢。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar.vue'

const mocks = vi.hoisted(() => ({
  capabilities: { collabRooms: true },
  shellMode: 'workbench' as string,
  boards: {} as Record<string, unknown>,
  pendingAsks: new Set<string>(),
  typing: {} as Record<string, string[]>,
  busyRooms: new Set<string>(),
  unread: new Set<string>(),
  load: vi.fn(async (_roomSessionId: string) => {}),
  ensureSubscribed: vi.fn(),
  openSession: vi.fn(),
  sessions: [] as Array<Record<string, unknown>>,
  roomSessions: [] as Array<Record<string, unknown>>,
  agents: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/platform', () => ({
  platformApi: {
    get capabilities() { return mocks.capabilities },
    get environment() { return 'test' },
    ensureCollabDmRoom: vi.fn(async () => ({ success: true, roomSessionId: 'agent-dm-fe' })),
  },
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    get sessions() { return mocks.sessions },
    get roomSessions() { return mocks.roomSessions },
    currentSessionId: '',
    // 群房既是侧栏「群聊」区的行,也是场账(useSceneLedger)的「场」——
    // 未读/在忙都从那份清单里数,所以两处必须是同一批房。
    get groupRoomSessions() { return mocks.roomSessions },
    userDmRoomSessions: [],
    agentPairDmRoomSessions: [],
    agentSessions: [],
    filteredSessions: [],
    sidebarSessions: [],
    radioSessions: [],
    findUserDmRoom: () => undefined,
    isUnreadSession: (sessionId: string) => mocks.unread.has(sessionId),
    loadSessions: vi.fn(async () => {}),
    isNewChatDraftId: () => false,
    updateSessionPin: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  }),
}))
vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: () => false }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: mocks.openSession }),
}))
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ settings: { ui: { shellMode: mocks.shellMode } } }),
}))
vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => ({
    get agents() { return mocks.agents },
    get colleagues() { return mocks.agents },
    hasLoaded: true,
    loadAgents: vi.fn(async () => []),
    displayAgent: (agentId: string) => ({ id: agentId, name: agentId ? `名-${agentId}` : '已注销', avatar: '🙂' }),
  }),
}))
vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    get boards() { return mocks.boards },
    ensureSubscribed: mocks.ensureSubscribed,
    load: mocks.load,
    hasPendingAsk: (sessionId: string) => mocks.pendingAsks.has(sessionId),
    isRoomTurnActive: (sessionId: string) => mocks.busyRooms.has(sessionId),
    typingAgents: (sessionId: string) => mocks.typing[sessionId] ?? [],
  }),
}))
vi.mock('../useSessionOrganizer', () => ({
  useSessionOrganizer: () => ({
    getProjectGroupedSessions: () => [],
    toggleCollapse: vi.fn(),
  }),
}))

function mountSidebar() {
  return mount(Sidebar, {
    global: {
      stubs: {
        SidebarHeader: true,
        SidebarActionGroup: true,
        SessionList: true,
        SessionContextMenu: true,
        RoomCreateDialog: true,
        Teleport: true,
      },
    },
  })
}

function task(patch: Record<string, unknown>) {
  return {
    rev: 1,
    title: '',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

beforeEach(() => {
  mocks.capabilities.collabRooms = true
  mocks.shellMode = 'workbench'
  mocks.boards = {}
  mocks.pendingAsks.clear()
  mocks.typing = {}
  mocks.busyRooms.clear()
  mocks.unread.clear()
  mocks.sessions = []
  mocks.roomSessions = [{ id: 'room-1', name: '一组' }, { id: 'room-2', name: '二组' }]
  mocks.agents = []
  mocks.load.mockClear()
  mocks.ensureSubscribed.mockClear()
  mocks.openSession.mockClear()
  store.clear()
  vi.stubGlobal('localStorage', memoryStorage)
})

/** 折叠态的落点(`sidebar-sections.ts` 的常量,这里刻意写死一份当围栏)。 */
const SECTIONS_KEY = 'onething:sidebar-sections-collapsed'

/**
 * 内存版 localStorage。
 *
 * Node 25 自带一个 Web Storage 全局,没有 `--localstorage-file` 时它的方法直接
 * 抛(happy-dom 的 window 就是 globalThis,拦不住),于是组件里那两处 try/catch
 * 会把读写整个吞掉 —— 持久化这条线在测试里根本跑不到。这里换一个能用的。
 */
const store = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value) },
  removeItem: (key: string) => { store.delete(key) },
  clear: () => { store.clear() },
}

describe('classic 回滚闸', () => {
  it('classic 下左栏不挂「进行中」区,也不碰看板', () => {
    mocks.shellMode = 'classic'
    mocks.boards = { 'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing' })] } }
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
    expect(mocks.ensureSubscribed).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('四区重排的 order 声明全部关在 data-shell-mode 门里(classic 一个像素不变)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/renderer/components/sidebar/Sidebar.vue'),
      'utf8',
    )
    const rules = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(entry => /^order:\s/.test(entry.line))
    expect(rules.length).toBeGreaterThan(0)
    const lines = source.split('\n')
    for (const rule of rules) {
      // 往上找到这条声明所属的选择器行,必须带着 workbench 门。
      let cursor = rule.index
      while (cursor > 0 && !lines[cursor].includes('{')) cursor -= 1
      expect(lines[cursor]).toContain("data-shell-mode='workbench'")
    }
  })

  /**
   * 真机回归(2026-07-31)的**真因**,以及本仓库最容易再踩的 CSS 坑。
   *
   * 五条 order 从 C1 落地起就是死规则,但原因不是"父级不是 flex"——
   * `.sidebar-content` 是 `Space` 的根,`.app-space` 本来就 `display: flex`、
   * `.app-space--vertical` 给了 column;`Space` 也只在 `spacer`/`fill` 时才把子节点
   * 包进 `.app-space__item`(`Space.vue` 的 `shouldWrapItems`),侧栏两者都没传,
   * 四区一直是 `.sidebar-content` 的**直接子**(下面那条 DOM 断言钉住这一点)。
   *
   * 真因是 **`:global(X) .y` 会被 `@vue/compiler-sfc` 静默截断成 `X`**:
   *   `:global(html[x]) .a > .b`  →  `html[x]`            ← 后代整段消失
   *   `html[x] .a > .b`           →  `html[x] .a > .b[data-v-xxx]`
   * 于是那五条编译成了 `html[data-shell-mode='workbench'] { order: N }` ——
   * 声明扣在 `<html>` 上,四区一条都没碰到。
   *
   * 所以形态门一律写成 `html[...] .xxx`(祖先是 html,scoped 只给最后一个复合
   * 选择器补 `[data-v-xxx]`,作用域仍在),**不许**再出现 `:global(...) 后代`。
   */
  it('形态门不许写成 `:global(X) 后代` —— 会被静默截断成 X,声明扣到 <html> 上', () => {
    for (const file of [
      'packages/renderer/components/sidebar/Sidebar.vue',
      'packages/renderer/components/sidebar/SessionList.vue',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      const offenders = source
        .split('\n')
        .map(line => line.trim())
        // 只看真选择器行(注释里拿它当反例讲解是允许的)。
        .filter(line => line.startsWith(':global(') && line.endsWith('{'))
        .filter(line => !/^:global\([^)]*\)\s*\{$/.test(line))
      expect(offenders, `${file} 里有被截断的 :global 选择器`).toEqual([])
    }
  })

  it('形态门的选择器指向的是真正的 flex 父的直接子(.sidebar-sections >)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/renderer/components/sidebar/Sidebar.vue'),
      'utf8',
    )
    const lines = source.split('\n')
    const orderRules = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(entry => /^order:\s/.test(entry.line))
    expect(orderRules.length).toBeGreaterThan(0)
    for (const rule of orderRules) {
      let cursor = rule.index
      while (cursor > 0 && !lines[cursor].includes('{')) cursor -= 1
      // order 只作用于 flex 容器的**直接子**:四区的盒子父是 .sidebar-sections。
      expect(lines[cursor]).toContain('.sidebar-sections >')
    }
  })

  /**
   * `Space` 的包装行为(`Space.vue` 的 `shouldWrapItems = hasSpacer || fill`):
   * 侧栏没传 spacer/separator/fill,所以子节点**不被** `.app-space__item` 包起来。
   * 一旦有人给这个 `Space` 加上 spacer 或 fill,四区就会退到孙子层,
   * `.sidebar-sections` 的 `flex: 1` 也会因为中间那层没有 grow 而拿不到剩余高度。
   */
  it('.sidebar-sections 是 .sidebar-content 的直接子(Space 没有插 .app-space__item)', () => {
    const wrapper = mountSidebar()
    const content = wrapper.find('.sidebar-content').element
    expect(wrapper.findAll('.app-space__item')).toHaveLength(0)
    expect(wrapper.find('.sidebar-sections').element.parentElement).toBe(content)
  })
})

describe('workbench 下的「进行中」区', () => {
  it('web 端(没有 rooms 能力)不挂这一区 —— 不留一行永远为空的说明', () => {
    mocks.capabilities.collabRooms = false
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
  })

  /**
   * 2026-07-31 真机走查后用户拍板,推翻了 §7 开放问题里「塌陷成一行」的旧倾向:
   * 一行永远在那儿的「没有在跑的活」既不提供信息,又占着左栏最贵的那段视线。
   * 没有活 = **整区不显示**。
   */
  it('没有在跑的活时整区不显示(推翻旧的「塌陷成一行」)', () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
    expect(wrapper.find('.active-work-empty').exists()).toBe(false)
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
  })

  it('有活了整区才出现,分区头带计数', () => {
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(true)
    expect(wrapper.find('.active-work-count').text()).toBe('1')
  })

  it('跨房聚合按 updatedAt 倒序,三档状态标各画各的', () => {
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [
          task({ id: 'a', status: 'doing', title: '换核验证', assigneeAgentId: 'fe', updatedAt: 30 }),
          task({ id: 'b', status: 'todo', title: '不该出现', updatedAt: 99 }),
        ],
      },
      'room-2': {
        version: 1,
        tasks: [
          task({ id: 'c', status: 'blocked', title: '元素拾取', blockReason: '等你放行 bash', updatedAt: 20 }),
          task({ id: 'd', status: 'review', title: 'profile 隔离', updatedAt: 10 }),
        ],
      },
    }
    const wrapper = mountSidebar()
    const cards = wrapper.findAll('.work-card')
    expect(cards.map(card => card.find('.work-card-title').text()))
      .toEqual(['换核验证', '元素拾取', 'profile 隔离'])
    expect(cards.map(card => card.find('.work-card-state').text()))
      .toEqual(['执行中', '待审批', '已交付'])
    // blocked 的原因当补语挂出去,不另起一档状态。
    expect(cards[1].find('.work-card-note').text()).toBe('等你放行 bash')
    expect(cards[0].classes()).toContain('tone-running')
    expect(cards[1].classes()).toContain('tone-awaiting')
    expect(cards[2].classes()).toContain('tone-delivered')
  })

  it('doing 卡卡在权限上时改报待审批(读的是既有 pendingAsks,不是新账)', () => {
    mocks.pendingAsks.add('w-1')
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', title: '换核', workSessionIds: ['w-1'] })],
      },
    }
    const wrapper = mountSidebar()
    expect(wrapper.find('.work-card-state').text()).toBe('待审批')
  })

  it('「正在执行」听 typing,「在忙」与未读听同一份场账(不新起第四套口径)', () => {
    mocks.typing = { 'room-1': ['fe'] }
    mocks.busyRooms.add('room-2')
    mocks.unread.add('room-2')
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', assigneeAgentId: 'fe', updatedAt: 30 })],
      },
      'room-2': {
        version: 1,
        tasks: [task({ id: 'b', status: 'doing', assigneeAgentId: 'be', updatedAt: 20 })],
      },
    }
    const wrapper = mountSidebar()
    const cards = wrapper.findAll('.work-card')
    // room-1:没人在跑一轮,但负责人正在打字 → 亮。
    expect(cards[0].find('.work-card-live').exists()).toBe(true)
    expect(cards[0].find('.sidebar-unread-dot').exists()).toBe(false)
    // room-2:场账说这间房在忙,且这张卡正是负责人此刻那张 → 亮;未读点同源。
    expect(cards[1].find('.work-card-live').exists()).toBe(true)
    expect(cards[1].find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('房已经不在会话列表里的旧快照不画卡', () => {
    mocks.roomSessions = [{ id: 'room-2' }]
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '死链' })] },
    }
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
  })

  it('点卡 = 打开这张卡所在的房(既有 openSession 链路)', async () => {
    mocks.boards = {
      'room-2': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    await wrapper.find('.work-card').trigger('click')
    expect(mocks.openSession).toHaveBeenCalledWith('room-2')
  })

  // ── C3:点卡除了开房,还要把右栏切到这张卡的线程 ──────────────────────────
  it('点卡同时派 onething:open-thread(靶子 = 尾条工作台会话)', async () => {
    mocks.boards = {
      'room-2': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', title: '换核', workSessionIds: ['w-old', 'w-1'] })],
      },
    }
    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener('onething:open-thread', listener)
    try {
      const wrapper = mountSidebar()
      await wrapper.find('.work-card').trigger('click')
      expect(mocks.openSession).toHaveBeenCalledWith('room-2')
      expect(events).toHaveLength(1)
      expect(events[0].detail).toEqual({ workSessionId: 'w-1', title: '换核', taskId: 'a' })
    } finally {
      window.removeEventListener('onething:open-thread', listener)
    }
  })

  it('还没开过工作台的卡只开房,不派空事件', async () => {
    mocks.boards = {
      'room-2': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '刚领的活' })] },
    }
    const events: Event[] = []
    const listener = (event: Event) => events.push(event)
    window.addEventListener('onething:open-thread', listener)
    try {
      const wrapper = mountSidebar()
      await wrapper.find('.work-card').trigger('click')
      expect(mocks.openSession).toHaveBeenCalledWith('room-2')
      expect(events).toHaveLength(0)
    } finally {
      window.removeEventListener('onething:open-thread', listener)
    }
  })
})

// ── R4:统一滚动 / 分区折叠 / dock 收进「⋯」/ 群聊行头像堆 ────────────────

function sidebarSource(): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/renderer/components/sidebar/Sidebar.vue'),
    'utf8',
  )
}

describe('统一滚动容器', () => {
  it('四区都在同一个 .sidebar-sections 里(不是各滚各的)', () => {
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    const sections = wrapper.find('.sidebar-sections')
    expect(sections.exists()).toBe(true)
    expect(sections.find('.sidebar-active-work').exists()).toBe(true)
    expect(sections.find('.sidebar-rooms').exists()).toBe(true)
    // 脚栏留在滚动容器**外面**,钉住底边。
    expect(sections.find('.sidebar-foot').exists()).toBe(false)
    expect(wrapper.find('.sidebar-foot').exists()).toBe(true)
  })

  it('classic 下这一层是 display:contents(不生成盒子,排版逐像素不变)', () => {
    const block = sidebarSource().match(/\n\.sidebar-sections\s*\{([^}]*)\}/)
    expect(block, '.sidebar-sections 的 classic 基线规则不见了').toBeTruthy()
    expect(block![1]).toMatch(/display:\s*contents/)
  })

  it('workbench 门里 .sidebar-sections 才成为唯一的滚动体', () => {
    const block = sidebarSource().match(
      /html\[data-shell-mode='workbench'\]\s\.sidebar-sections\s*\{([^}]*)\}/,
    )
    expect(block).toBeTruthy()
    expect(block![1]).toMatch(/overflow-y:\s*auto/)
    expect(block![1]).toMatch(/flex:\s*1/)
  })

  /**
   * 双滚动条防线:统一容器里再留一层 `overflow: auto` 就是两根滚动条。
   * `.sessions-list` 让出滚动的同时**必须**解开 `contain: strict`
   * (strict 含 size containment,让出滚动后这一段会塌成 0 高)。
   */
  it('会话列表在 workbench 下交出内部滚动,并同时解开 contain: strict', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/renderer/components/sidebar/SessionList.vue'),
      'utf8',
    )
    const list = source.match(
      /html\[data-shell-mode='workbench'\]\s\.sessions-list\s*\{([^}]*)\}/,
    )
    expect(list, 'SessionList 没有让出滚动 —— 左栏会出现两根滚动条').toBeTruthy()
    expect(list![1]).toMatch(/overflow:\s*visible/)
    expect(list![1]).toMatch(/contain:\s*none/)
    const wrap = source.match(
      /html\[data-shell-mode='workbench'\]\s\.session-list-wrapper\s*\{([^}]*)\}/,
    )
    expect(wrap).toBeTruthy()
    expect(wrap![1]).toMatch(/flex:\s*0 0 auto/)
  })
})

describe('分区折叠', () => {
  it('四区都能收起来,收起后区内的行不再渲染', async () => {
    mocks.agents = [{ id: 'fe', name: '小李', avatar: '🔧' }]
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.work-card')).toHaveLength(1)
    expect(wrapper.findAll('.sidebar-room-item').length).toBeGreaterThan(0)

    const toggles = wrapper.findAll('.sidebar-section-toggle')
    // 进行中 / 同事 / 群聊 / 直聊
    expect(toggles).toHaveLength(4)
    for (const toggle of toggles) await toggle.trigger('click')

    expect(wrapper.findAll('.work-card')).toHaveLength(0)
    expect(wrapper.findAll('.sidebar-room-item')).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'SessionList' }).exists()).toBe(false)
    // 分区头本身照旧在,不然就没法再展开了。
    expect(wrapper.findAll('.sidebar-section-toggle')).toHaveLength(4)
  })

  it('折叠态落在 localStorage,重挂之后还在', async () => {
    const wrapper = mountSidebar()
    const rooms = wrapper.findAll('.sidebar-section-toggle')
      .find(toggle => toggle.text().includes('群聊'))!
    await rooms.trigger('click')
    expect(JSON.parse(localStorage.getItem(SECTIONS_KEY)!))
      .toEqual(['rooms'])

    const again = mountSidebar()
    expect(again.findAll('.sidebar-room-item')).toHaveLength(0)
  })

  it('classic 不读折叠态 —— 在 workbench 收过的区,切回去不会凭空消失', () => {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(['rooms']))
    mocks.shellMode = 'classic'
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar-room-item').length).toBeGreaterThan(0)
    expect(wrapper.find('.sidebar-section-toggle').exists()).toBe(false)
  })
})

describe('底部 dock 撤掉后入口一个不丢', () => {
  it('workbench:平铺 dock 没了,换成脚栏 + 「⋯」菜单', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-dock').exists()).toBe(false)
    expect(wrapper.find('.sidebar-foot').exists()).toBe(true)
    await wrapper.findAll('.sidebar-foot-icon')[0].trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    expect((menu.props('items') as Array<{ id: string }>).map(item => item.id))
      .toEqual(['memory', 'media', 'agents', 'tasks', 'music'])
  })

  it('菜单每一项都真的把对应面板打开(没有一个面板变得进不去)', async () => {
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-foot-icon')[0].trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    for (const id of ['memory', 'media', 'agents', 'tasks', 'music']) {
      menu.vm.$emit('select', id)
    }
    expect(wrapper.emitted('open-workspace-panel')?.flat())
      .toEqual(['memory', 'media', 'agents', 'tasks', 'music'])
    // 设置照旧单列一枚裸图标(它是最常按的那个,不进菜单)。
    await wrapper.findAll('.sidebar-foot-icon')[1].trigger('click')
    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })

  it('classic:胶囊 dock 原样在,脚栏不挂(逐像素回滚闸)', () => {
    mocks.shellMode = 'classic'
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-dock').exists()).toBe(true)
    expect(wrapper.findAll('.sidebar-dock-icon')).toHaveLength(6)
    expect(wrapper.find('.sidebar-foot').exists()).toBe(false)
  })
})

describe('群聊行成员头像堆', () => {
  it('复用房头成员条那一处 selector,截前三枚、余量画 +N', () => {
    mocks.agents = [
      { id: 'a1', name: '林', avatar: '🅰' },
      { id: 'a2', name: '澈', avatar: '🅱' },
      { id: 'a3', name: '砚', avatar: '🅲' },
      { id: 'a4', name: '助', avatar: '🅳' },
    ]
    mocks.roomSessions = [
      { id: 'room-1', name: '一组', room: { memberAgentIds: ['a1', 'a2', 'a3', 'a4'] } },
      { id: 'room-2', name: '二组', room: { memberAgentIds: ['a1'] } },
    ]
    const wrapper = mountSidebar()
    // 只看群聊区的行 —— 同事区用的是同一套行样式(`.sidebar-room-item`)。
    const rows = wrapper.findAll('.sidebar-rooms:not(.sidebar-contacts) .sidebar-room-item')
    expect(rows[0].findAll('.sidebar-room-face')).toHaveLength(3)
    expect(rows[0].find('.sidebar-room-face-more').text()).toBe('+1')
    expect(rows[1].findAll('.sidebar-room-face')).toHaveLength(1)
    expect(rows[1].find('.sidebar-room-face-more').exists()).toBe(false)
  })

  it('classic 一枚都不画', () => {
    mocks.shellMode = 'classic'
    mocks.agents = [{ id: 'a1', name: '林', avatar: '🅰' }]
    mocks.roomSessions = [{ id: 'room-1', name: '一组', room: { memberAgentIds: ['a1'] } }]
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-room-face').exists()).toBe(false)
  })
})

describe('跨房补齐是定向的', () => {
  it('只补开过工作台的房,没干过活的房一次都不拉', async () => {
    mocks.sessions = [
      { id: 'room-1', kind: 'room', updatedAt: 5 },
      { id: 'room-2', kind: 'room', updatedAt: 5 },
      { id: 'w-1', kind: 'work', updatedAt: 9, collab: { roomSessionId: 'room-2' } },
    ]
    mountSidebar()
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.load.mock.calls.map(call => call[0])).toEqual(['room-2'])
  })

  it('没有任何会话时不发一次补齐', async () => {
    mountSidebar()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
