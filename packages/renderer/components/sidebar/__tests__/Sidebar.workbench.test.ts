// @vitest-environment happy-dom
/**
 * 左栏「图标 rail + 单类面板」(方案三,样板 docs/design/im-redesign/sidebar-4.html
 * 第三格;数据面仍是 im-workbench-layout.md §3 W1)。
 *
 * 钉的事:
 *  1. **classic 逐像素回滚闸** —— rail/面板整套不挂、「进行中」一次看板 IPC 都
 *     不发、平铺 dock 原样在;形态门全部写成 `html[data-shell-mode='workbench']`
 *     (**不许** `:global(X) 后代`,那会被静默截断成 `X`);
 *  2. rail 四类的可见性(web 降级、「进行中」空态)、当前类持久化、徽标;
 *  3. 一次只显示一类;点行 = 开这张卡所在的房 + 派线程事件;
 *  4. 面板是唯一的滚动体(会话列表交出内部滚动,不出双滚动条);
 *  5. 五个工作区面板的入口一个不丢(rail 底部「⋯」菜单);
 *  6. 整体折叠 = 只剩 rail。
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
  dmRooms: [] as Array<Record<string, unknown>>,
  sidebarSessions: [] as Array<Record<string, unknown>>,
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
    get userDmRoomSessions() { return mocks.dmRooms },
    agentPairDmRoomSessions: [],
    agentSessions: [],
    filteredSessions: [],
    get sidebarSessions() { return mocks.sidebarSessions },
    radioSessions: [],
    // 联系人行的未读 = TA 那间私聊房的未读 —— 查得到房才谈得上未读。
    findUserDmRoom: (agentId: string) => mocks.dmRooms
      .find(room => (room.room as { memberAgentIds?: string[] } | undefined)?.memberAgentIds?.[0] === agentId),
    isUnreadSession: (sessionId: string) => mocks.unread.has(sessionId),
    loadSessions: vi.fn(async () => {}),
    isNewChatDraftId: () => false,
    getSessionItem: (id: string) => [...mocks.sessions, ...mocks.sidebarSessions]
      .find(session => session.id === id),
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
  // 「消息」类的行尾时间用的是同一份格式化(不另起一套时间口径)。
  formatRelativeTime: (ts: number) => (ts ? `t${ts}` : ''),
}))

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(Sidebar, {
    props,
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

/** 切到某一类(rail 上的按钮按 title 找 —— 与真机点的是同一枚)。 */
async function selectCategory(
  wrapper: ReturnType<typeof mountSidebar>,
  label: string,
): Promise<void> {
  const tab = wrapper.findAll('.sidebar-rail-tab').find(t => t.attributes('title') === label)
  if (!tab) throw new Error(`rail 上没有「${label}」这一类`)
  await tab.trigger('click')
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
  mocks.dmRooms = []
  mocks.sidebarSessions = []
  mocks.agents = []
  mocks.load.mockClear()
  mocks.ensureSubscribed.mockClear()
  mocks.openSession.mockClear()
  store.clear()
  vi.stubGlobal('localStorage', memoryStorage)
})


/** 当前类别的落点(`sidebar-sections.ts` 的常量,这里刻意写死一份当围栏)。 */
const RAIL_KEY = 'onething:sidebar-rail-category'

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

function sidebarSource(): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/renderer/components/sidebar/Sidebar.vue'),
    'utf8',
  )
}

describe('classic 回滚闸', () => {
  it('classic 下 rail 与面板整套不挂,也不碰看板', () => {
    mocks.shellMode = 'classic'
    mocks.boards = { 'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing' })] } }
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-rail').exists()).toBe(false)
    expect(wrapper.find('.sidebar-pane-head').exists()).toBe(false)
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
    // 「进行中」的取数提到了 Sidebar 这一层,门做成了 `enabled` 参数 ——
    // classic 下一次订阅、一次补齐都不许发。
    expect(mocks.ensureSubscribed).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('classic 下四区照旧一起平铺(类别切换只是 workbench 的形态)', () => {
    mocks.shellMode = 'classic'
    mocks.agents = [{ id: 'fe', name: '小李', avatar: '🔧' }]
    const wrapper = mountSidebar()
    // 联系人区与群聊区同时在场 —— 单类面板一次只显示一类,classic 不受它管。
    expect(wrapper.find('.sidebar-contacts').exists()).toBe(true)
    expect(wrapper.find('.sidebar-rooms:not(.sidebar-contacts)').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SessionList' }).exists()).toBe(true)
    // 顶部那行「＋ 新会话」是 classic 专属(workbench 下它在 rail 底部)。
    expect(wrapper.find('.sidebar-newchat').exists()).toBe(true)
  })

  it('rail / 面板的形态规则全部关在 data-shell-mode 门里', () => {
    const source = sidebarSource()
    const lines = source.split('\n')
    // 这几条是"把共用类名换成样板行"的规则:它们踩在 classic 也有的类名上,
    // 漏了门就是 classic 被改了像素。
    const gated = [
      '.sidebar-pane .sidebar-room-item {',
      '.sidebar-pane .sidebar-rooms {',
      '.sidebar-pane .sidebar-room-name {',
      '.sidebar-sections {',
      '.sidebar-split {',
      '.sidebar-pane {',
    ]
    for (const needle of gated) {
      const hits = lines.filter(line => line.trimEnd().endsWith(needle))
      expect(hits.length, `${needle} 这条选择器不见了`).toBeGreaterThan(0)
      // 每一条要么是 classic 基线(`display: contents` 那三行,不带门),
      // 要么带着 workbench 门。带门的那份必须存在。
      expect(
        hits.some(line => line.includes("html[data-shell-mode='workbench']")),
        `${needle} 缺 workbench 门`,
      ).toBe(true)
    }
  })

  it('classic 基线:三层壳都是 display:contents(不生成盒子,排版逐像素不变)', () => {
    const block = sidebarSource().match(
      /\n\.sidebar-split,\n\.sidebar-pane,\n\.sidebar-sections\s*\{([^}]*)\}/,
    )
    expect(block, '三层壳的 classic 基线规则不见了').toBeTruthy()
    expect(block![1]).toMatch(/display:\s*contents/)
  })

  /**
   * 真机回归(2026-07-31)的**真因**,以及本仓库最容易再踩的 CSS 坑。
   *
   * `:global(X) .y` 会被 `@vue/compiler-sfc` 静默截断成 `X`:
   *   `:global(html[x]) .a > .b`  →  `html[x]`            ← 后代整段消失
   *   `html[x] .a > .b`           →  `html[x] .a > .b[data-v-xxx]`
   * 于是那种写法编译出来是 `html[data-shell-mode='workbench'] { … }` ——
   * 声明扣在 `<html>` 上,目标元素一条都没碰到。
   *
   * 所以形态门一律写成 `html[...] .xxx`(祖先是 html,scoped 只给最后一个复合
   * 选择器补 `[data-v-xxx]`,作用域仍在),**不许**再出现 `:global(...) 后代`。
   */
  it('形态门不许写成 `:global(X) 后代` —— 会被静默截断成 X,声明扣到 <html> 上', () => {
    for (const file of [
      'packages/renderer/components/sidebar/Sidebar.vue',
      'packages/renderer/components/sidebar/SessionList.vue',
      'packages/renderer/components/sidebar/ActiveWorkSection.vue',
      'packages/renderer/components/sidebar/ActiveWorkCard.vue',
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

  /**
   * `Space` 的包装行为(`Space.vue` 的 `shouldWrapItems = hasSpacer || fill`):
   * 侧栏没传 spacer/separator/fill,所以子节点**不被** `.app-space__item` 包起来。
   * 一旦有人给这个 `Space` 加上 spacer 或 fill,rail/面板就会退到孙子层,
   * `.sidebar-split` 的 `flex: 1` 也会因为中间那层没有 grow 而拿不到剩余高度。
   */
  it('.sidebar-split 是 .sidebar-content 的直接子(Space 没有插 .app-space__item)', () => {
    const wrapper = mountSidebar()
    const content = wrapper.find('.sidebar-content').element
    expect(wrapper.findAll('.app-space__item')).toHaveLength(0)
    expect(wrapper.find('.sidebar-split').element.parentElement).toBe(content)
    // 滚动体在面板里(样板:头行 → rail | 面板 → 面板头 + 滚动区)。
    expect(wrapper.find('.sidebar-sections').element.parentElement)
      .toBe(wrapper.find('.sidebar-pane').element)
  })

  /**
   * 交通灯:`SidebarHeader` 是 44px 全宽 drag 行,左 70px 是交通灯保留位。
   * rail 必须从它**下面**开始 —— 否则前两枚图标被交通灯压住,而且整行
   * `-webkit-app-region: drag`,根本点不动。
   */
  it('rail 从 SidebarHeader 下面开始(交通灯那一行原样保留)', () => {
    const wrapper = mountSidebar()
    const children = [...wrapper.find('.sidebar-content').element.children]
    const header = wrapper.findComponent({ name: 'SidebarHeader' }).element
    expect(children.indexOf(header)).toBe(0)
    expect(children.indexOf(wrapper.find('.sidebar-split').element)).toBeGreaterThan(0)
    // rail 是 `.sidebar-split` 的子,不是 header 的兄弟之前。
    expect(wrapper.find('.sidebar-rail').element.parentElement)
      .toBe(wrapper.find('.sidebar-split').element)
  })
})

describe('rail 上有哪几类', () => {
  /**
   * 2026-08-01:四格从**按类型分列**改成**按意图分列**(用户原话:
   * 「sidebar 的 tab 要显示最近的聊天;不要把入口放在联系人、群聊上」)。
   */
  it('四类齐全,顺序即 rail 自上而下:消息 / 进行中 / 通讯录 / 会话', () => {
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    const tabs = wrapper.findAll('.sidebar-rail-tab')
    // 四类 + 三颗底部(⋯ / ＋ / 设置)
    expect(tabs.map(tab => tab.attributes('title')))
      .toEqual(['消息', '进行中', '通讯录', '会话', '工作区面板', '新会话', 'Settings'])
  })

  /**
   * 真机比对后改口径:四类恒在,rail 不随数据增删图标(否则活一起一停 rail 就
   * 上下跳,而且没活时点不进去看「已交付」)。空态由面板内部一行说话。
   */
  it('没有在跑的活:rail 仍是四类,面板里出现「没有在跑的活」', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar-rail-tab').map(tab => tab.attributes('title')))
      .toEqual(['消息', '进行中', '通讯录', '会话', '工作区面板', '新会话', 'Settings'])

    await selectCategory(wrapper, '进行中')
    expect(wrapper.find('.active-work-empty').text()).toBe('没有在跑的活')
  })

  /**
   * web 端 `platformApi.capabilities.collabRooms` 为 false:消息/进行中/通讯录
   * 三类无源可吃(私聊与群都是房)—— 优雅降级成"只留会话 + 底部三颗"。
   */
  it('web 降级:只留会话 + 底部三颗,一枚死图标都不留', () => {
    mocks.capabilities.collabRooms = false
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar-rail-tab').map(tab => tab.attributes('title')))
      .toEqual(['会话', '工作区面板', '新会话', 'Settings'])
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('会话')
    // 看板那条线在 web 端一次都不许起。
    expect(mocks.ensureSubscribed).not.toHaveBeenCalled()
  })
})

describe('一次只显示一类', () => {
  beforeEach(() => {
    mocks.agents = [{ id: 'fe', name: '小李', avatar: '🔧' }]
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
  })

  it('默认停在「消息」:一进来看见的是最近说过话的人,不是花名册', () => {
    // 直聊会话**不该**进消息流 —— 它是工作会话不是对话,家在「会话」那一类。
    mocks.sidebarSessions = [{ id: 's-1', name: '重构', updatedAt: 9 }]
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('消息')
    // 两间群,直聊那条一行都不画。
    expect(wrapper.find('.sidebar-pane-count').text()).toBe('2')
    expect(wrapper.findAll('.sidebar-recent-item')).toHaveLength(2)
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
    expect(wrapper.find('.sidebar-contacts').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'SessionList' }).exists()).toBe(false)
  })

  it('切到进行中:只剩活卡片,消息一行不画', async () => {
    const wrapper = mountSidebar()
    await selectCategory(wrapper, '进行中')
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('进行中')
    expect(wrapper.find('.sidebar-pane-count').text()).toBe('1')
    expect(wrapper.findAll('.work-card')).toHaveLength(1)
    expect(wrapper.findAll('.sidebar-recent-item')).toHaveLength(0)
  })

  /** 通讯录 = 同事 + 群两段同框(旧的「群聊」一类并了进来),建群 ＋ 跟着它走。 */
  it('切到通讯录:同事与群两段同时在场,各带一行段头', async () => {
    const wrapper = mountSidebar()
    await selectCategory(wrapper, '通讯录')
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('通讯录')
    // 一位同事 + 两间群
    expect(wrapper.find('.sidebar-pane-count').text()).toBe('3')
    expect(wrapper.find('.sidebar-contacts').exists()).toBe(true)
    expect(wrapper.findAll('.sidebar-rooms:not(.sidebar-contacts) .sidebar-room-item')).toHaveLength(2)
    expect(wrapper.findAll('.sidebar-pane-group').map(group => group.text()))
      .toEqual(['同事', '群聊'])
    // 建群 ＋ 跟着这一类走(classic 下它在分区头里,那边一个字节没动)。
    expect(wrapper.find('.sidebar-pane-head .sidebar-rooms-add').exists()).toBe(true)
    expect(wrapper.findAll('.sidebar-recent-item')).toHaveLength(0)
  })

  it('切到会话:只剩项目分组那张表', async () => {
    const wrapper = mountSidebar()
    await selectCategory(wrapper, '会话')
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('会话')
    expect(wrapper.findComponent({ name: 'SessionList' }).exists()).toBe(true)
    expect(wrapper.find('.sidebar-contacts').exists()).toBe(false)
    expect(wrapper.find('.sidebar-pane-head .sidebar-rooms-add').exists()).toBe(false)
  })

  it('当前类别落在 localStorage,重挂之后还停在那一类', async () => {
    const wrapper = mountSidebar()
    await selectCategory(wrapper, '通讯录')
    expect(localStorage.getItem(RAIL_KEY)).toBe('contacts')

    const again = mountSidebar()
    expect(again.find('.sidebar-pane-title').text()).toBe('通讯录')
  })

  /** 旧存档指着已并入通讯录的「群聊」—— 搬过去,而不是退回第一类。 */
  it('旧存档 rooms 落到通讯录', () => {
    localStorage.setItem(RAIL_KEY, 'rooms')
    expect(mountSidebar().find('.sidebar-pane-title').text()).toBe('通讯录')
  })

  /**
   * 四类恒在之后,「存档指着一个不可用的类」只剩一种真实成因:**web 降级**
   * (roomsEnabled=false,只剩会话)。桌面端不会再因为活干完了而少一类。
   */
  it('存档指着 web 端不可用的类 → 退到第一个可用的,不留空面板', () => {
    localStorage.setItem(RAIL_KEY, 'active')
    mocks.capabilities.collabRooms = false
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('会话')
  })

  it('桌面端:活干完了也不换类 —— 停在「进行中」看已交付', () => {
    localStorage.setItem(RAIL_KEY, 'active')
    mocks.boards = {}
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-pane-title').text()).toBe('进行中')
  })
})

/**
 * 「消息」面板(2026-08-01)。用户原话:「sidebar 的 tab 要显示最近的聊天;
 * 不要把入口放在联系人、群聊上,这样和正常的 IM 不太一致」。
 */
describe('「消息」面板 —— 一条时间序的对话流', () => {
  beforeEach(() => {
    mocks.agents = [{ id: 'fe', name: '小李', avatar: '🔧' }]
    mocks.dmRooms = [
      { id: 'dm-fe', name: '和小李的旧房名', updatedAt: 30, room: { memberAgentIds: ['fe'] } },
    ]
    mocks.roomSessions = [
      { id: 'room-1', name: '一组', updatedAt: 50 },
      { id: 'room-2', name: '二组', updatedAt: 5 },
    ]
    mocks.sidebarSessions = [{ id: 's-1', name: '重构', updatedAt: 40 }]
  })

  it('群聊与私聊混排,按时间倒序 —— 不按对象类型分列', () => {
    const rows = mountSidebar().findAll('.sidebar-recent-item')
    expect(rows.map(row => row.find('.sidebar-room-name').text()))
      // 名册那份 mock 把名字造成 `名-<id>` —— 私聊行显示的正是它,不是房名。
      .toEqual(['一组', '名-fe', '二组'])
  })

  /**
   * 2026-08-01 用户第二次划线:「要么是群聊,要么是和某个 Agent 的聊天,
   * 它不是所有的」。直聊会话(updatedAt=40,本该排在第二)一行都不许出现。
   */
  it('直聊会话不进消息流 —— 它的家是「会话」那一类', () => {
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar-recent-item')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('重构')
  })

  /** 同事改了名,和 TA 的那间房不会跟着改 —— 显示名必须取名册。 */
  it('私聊行的名字取名册,不是房名', () => {
    const row = mountSidebar().findAll('.sidebar-recent-item')[1]
    expect(row.find('.sidebar-room-name').text()).toBe('名-fe')
    expect(row.attributes('title')).toBe('名-fe · 私聊')
  })

  it('群行给方章 + 群名首字,人行给圆章头像 —— 左缘永远对齐', () => {
    const rows = mountSidebar().findAll('.sidebar-recent-item')
    expect(rows[0].find('.sidebar-recent-room-mark').text()).toBe('一')
    expect(rows[1].find('.sidebar-recent-room-mark').exists()).toBe(false)
    expect(rows[1].findComponent({ name: 'AgentAvatar' }).exists()).toBe(true)
  })

  it('行尾是时间;有未读再加一枚墨点(判定仍只有 isUnreadSession 那一处)', () => {
    mocks.unread.add('dm-fe')
    const rows = mountSidebar().findAll('.sidebar-recent-item')
    expect(rows[0].find('.sidebar-recent-time').text()).toBe('t50')
    expect(rows[0].find('.sidebar-unread-dot').exists()).toBe(false)
    expect(rows[1].find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('点任一行 = 打开那段对话(两种行同一条 openSession 链路)', async () => {
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-recent-item')[1].trigger('click')
    expect(mocks.openSession).toHaveBeenCalledWith('dm-fe')
  })

  it('一间房都没有时给一句话,不是一块空白(直聊再多也不算数)', () => {
    mocks.dmRooms = []
    mocks.roomSessions = []
    expect(mountSidebar().find('.sidebar-recent-empty').exists()).toBe(true)
  })

  /** classic 是逐像素回滚闸:四区照旧平铺,不许再插一条把同一批会话画第二遍。 */
  it('classic 下这一区整个不画', () => {
    mocks.shellMode = 'classic'
    expect(mountSidebar().find('.sidebar-recent-item').exists()).toBe(false)
  })
})

describe('rail 徽标(该类有未读或在跑)', () => {
  function badgeTitles(wrapper: ReturnType<typeof mountSidebar>): string[] {
    return wrapper.findAll('.sidebar-rail-tab')
      .filter(tab => tab.find('.sidebar-rail-badge').exists())
      .map(tab => tab.attributes('title') ?? '')
  }

  it('全读完、没活在跑时一枚都不亮', () => {
    expect(badgeTitles(mountSidebar())).toEqual([])
  })

  it('有活在跑 → 进行中亮;只剩已交付 → 不亮(交付了不催人)', () => {
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    expect(badgeTitles(mountSidebar())).toEqual(['进行中'])

    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'review', title: '交了' })] },
    }
    expect(badgeTitles(mountSidebar())).toEqual([])
  })

  /**
   * **一条未读只催一次**:同一间房既在「消息」里也在「通讯录」里,两枚各亮各的
   * 等于同一条未读被数两遍。未读一律落在回话的那一类。
   */
  it('群聊未读 → 只有「消息」亮;判定仍然只有 isUnreadSession 那一处', () => {
    mocks.unread.add('room-2')
    expect(badgeTitles(mountSidebar())).toEqual(['消息'])
  })

  /** 消息装房、会话装直聊,两堆不重叠 —— 各归各的不会重复报数。 */
  it('直聊未读 → 「会话」亮(它不在消息流里,也就不该由消息流报)', () => {
    mocks.sidebarSessions = [{ id: 's-1', name: '直聊' }]
    mocks.unread.add('s-1')
    expect(badgeTitles(mountSidebar())).toEqual(['会话'])
  })

  /** 通讯录恒不亮:它的行要么已在消息流里,要么根本没聊过。 */
  it('私聊未读 → 只有「消息」亮,通讯录不跟着报第二遍', () => {
    mocks.agents = [{ id: 'fe', name: '小李', avatar: '🔧' }]
    mocks.dmRooms = [{ id: 'dm-fe', room: { memberAgentIds: ['fe'] } }]
    mocks.unread.add('dm-fe')
    expect(badgeTitles(mountSidebar())).toEqual(['消息'])
  })
})

describe('「进行中」面板', () => {
  // 默认类别 2026-08-01 起是「消息」—— 这一段验的是活面板,进来先停在那一类
  // (走的是与真机同一条持久化路径,不是给组件塞内部状态)。
  beforeEach(() => {
    localStorage.setItem(RAIL_KEY, 'active')
  })

  it('按 执行中 / 待你 / 已交付 分组(样板 .grp),空组不画组头', () => {
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
    expect(wrapper.findAll('.active-work-group').map(group => group.text()))
      .toEqual(['执行中', '待你', '已交付'])
    expect(wrapper.findAll('.work-card-title').map(title => title.text()))
      .toEqual(['换核验证', '元素拾取', 'profile 隔离'])
  })

  it('状态点是唯一的颜色:在跑 run / 待你 wait / 已交付素点', () => {
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [
          task({ id: 'a', status: 'doing', title: '在跑', updatedAt: 30 }),
          task({ id: 'c', status: 'blocked', title: '待你', blockReason: '等你放行 bash', updatedAt: 20 }),
          task({ id: 'd', status: 'review', title: '交了', updatedAt: 10 }),
        ],
      },
    }
    const wrapper = mountSidebar()
    const dots = wrapper.findAll('.work-card-dot')
    expect(dots[0].classes()).toContain('run')
    expect(dots[1].classes()).toContain('wait')
    expect(dots[2].classes()).not.toContain('run')
    expect(dots[2].classes()).not.toContain('wait')
    // blocked 的原因当行副文挂出去,不另起一档状态。
    expect(wrapper.findAll('.work-card-meta')[1].text()).toBe('等你放行 bash')
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
    expect(wrapper.find('.active-work-group').text()).toBe('待你')
    expect(wrapper.find('.work-card-dot').classes()).toContain('wait')
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
    const rows = wrapper.findAll('.work-card')
    // room-1:没人在跑一轮,但负责人正在打字 → 点在跳。
    expect(rows[0].classes()).toContain('is-live')
    expect(rows[0].find('.sidebar-unread-dot').exists()).toBe(false)
    // room-2:场账说这间房在忙,且这张卡正是负责人此刻那张 → 跳;未读点同源。
    expect(rows[1].classes()).toContain('is-live')
    expect(rows[1].find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('房已经不在会话列表里的旧快照不画行', () => {
    mocks.roomSessions = [{ id: 'room-2' }]
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '死链' })] },
    }
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
  })

  it('点行 = 打开这行所在的房(既有 openSession 链路)', async () => {
    mocks.boards = {
      'room-2': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    await wrapper.find('.work-card').trigger('click')
    expect(mocks.openSession).toHaveBeenCalledWith('room-2')
  })

  // ── C3:点行除了开房,还要把右栏切到这张卡的线程 ────────────────────────
  it('点行同时派 onething:open-thread(靶子 = 尾条工作台会话)', async () => {
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

  it('还没开过工作台的行只开房,不派空事件', async () => {
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

describe('面板是唯一的滚动体', () => {
  it('当前类装在 .sidebar-pane > .sidebar-sections 里,rail 与它并排', () => {
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    localStorage.setItem(RAIL_KEY, 'active')
    const wrapper = mountSidebar()
    const sections = wrapper.find('.sidebar-sections')
    expect(sections.exists()).toBe(true)
    expect(sections.find('.sidebar-active-work').exists()).toBe(true)
    // rail 不在滚动体里 —— 它跟着面板一起被 `.sidebar-split` 排成一横排。
    expect(sections.find('.sidebar-rail').exists()).toBe(false)
    expect(wrapper.find('.sidebar-rail').exists()).toBe(true)
  })

  it('workbench 门里 .sidebar-sections 才成为滚动体', () => {
    const block = sidebarSource().match(
      /html\[data-shell-mode='workbench'\]\s\.sidebar-sections\s*\{([^}]*)\}/,
    )
    expect(block).toBeTruthy()
    expect(block![1]).toMatch(/overflow-y:\s*auto/)
    expect(block![1]).toMatch(/flex:\s*1/)
  })

  /**
   * 双滚动条防线:面板里再留一层 `overflow: auto` 就是两根滚动条。
   * `.sessions-list` 让出滚动的同时**必须**解开 `contain: strict`
   * (strict 含 size containment,让出滚动后这一段会塌成 0 高)。
   * 这两条从 R4 起就写在 SessionList 自己身上,方案三下面板仍是唯一滚动体,
   * 所以它们原样有效 —— 这里只是把"还在不在"钉住。
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

/**
 * 折叠 = 整条侧栏卸下来(2026-07-31)。
 *
 * 方案三曾在 workbench 下把折叠画成一条 46px 的 rail。撤掉的理由是几何:
 * macOS 三颗交通灯横跨到窗口左起 ~70px,比 rail 宽,黄绿两颗压在聊天区上
 * 横跨竖分隔线;顶栏又按"顶到窗口左缘"死留 84px,没扣掉左边那 46px。
 * 这一组测试钉住"rail 不会偷偷回来"。
 */
describe('整体折叠 = 整条侧栏卸下来', () => {
  it('collapsed 时整块淡出(rail 不再单独留着)', () => {
    const wrapper = mountSidebar({ collapsed: true })
    expect(wrapper.find('.sidebar-content').classes()).toContain('content-hidden')
    // 面板本身不再按折叠态摘除 —— 折叠由 App 整条卸载表达。
    expect(wrapper.find('.sidebar-pane').exists()).toBe(true)
  })

  it('浮层态(hover 出来的那张卡)照旧是完整的一份', () => {
    const wrapper = mountSidebar({ collapsed: true, floating: true })
    expect(wrapper.find('.sidebar-rail').exists()).toBe(true)
    expect(wrapper.find('.sidebar-pane').exists()).toBe(true)
    expect(wrapper.find('.sidebar-content').classes()).not.toContain('content-hidden')
  })

  it('classic 的折叠语义一个字节不变(整块淡出)', () => {
    mocks.shellMode = 'classic'
    const wrapper = mountSidebar({ collapsed: true })
    expect(wrapper.find('.sidebar-content').classes()).toContain('content-hidden')
  })

  it('App 两种壳共用同一支:折叠即不挂侧栏,没有 rail 分支', () => {
    const app = readFileSync(resolve(process.cwd(), 'packages/renderer/App.vue'), 'utf8')
    expect(app).toContain('v-if="sidebarDockedVisible"')
    expect(app).not.toContain('SIDEBAR_RAIL_WIDTH')
    expect(app).not.toContain('sidebarRailOnly')
  })
})

describe('工作区面板入口一个都不丢', () => {
  it('workbench:平铺 dock 与脚栏都没了,「⋯」搬进 rail 底部', async () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-dock').exists()).toBe(false)
    expect(wrapper.find('.sidebar-foot').exists()).toBe(false)
    const more = wrapper.findAll('.sidebar-rail-tab')
      .find(tab => tab.attributes('title') === '工作区面板')!
    await more.trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    expect((menu.props('items') as Array<{ id: string }>).map(item => item.id))
      .toEqual(['memory', 'media', 'agents', 'tasks', 'music'])
  })

  it('菜单每一项都真的把对应面板打开(没有一个面板变得进不去)', async () => {
    const wrapper = mountSidebar()
    const more = wrapper.findAll('.sidebar-rail-tab')
      .find(tab => tab.attributes('title') === '工作区面板')!
    await more.trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    for (const id of ['memory', 'media', 'agents', 'tasks', 'music']) {
      menu.vm.$emit('select', id)
    }
    expect(wrapper.emitted('open-workspace-panel')?.flat())
      .toEqual(['memory', 'media', 'agents', 'tasks', 'music'])
  })

  it('新会话与设置照旧各占一枚(不进菜单)', async () => {
    const wrapper = mountSidebar()
    const tabs = wrapper.findAll('.sidebar-rail-tab')
    await tabs.find(tab => tab.attributes('title') === '新会话')!.trigger('click')
    await tabs.find(tab => tab.attributes('title') === 'Settings')!.trigger('click')
    expect(wrapper.emitted('create-new-chat')).toHaveLength(1)
    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })

  it('classic:胶囊 dock 原样在(逐像素回滚闸)', () => {
    mocks.shellMode = 'classic'
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-dock').exists()).toBe(true)
    expect(wrapper.findAll('.sidebar-dock-icon')).toHaveLength(6)
    expect(wrapper.find('.sidebar-rail').exists()).toBe(false)
  })
})

describe('群聊行成员头像堆', () => {
  it('复用房头成员条那一处 selector,截前三枚、余量画 +N', async () => {
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
    await selectCategory(wrapper, '通讯录')
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
