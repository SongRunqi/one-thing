// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageItem from '../MessageItem.vue'

/**
 * W15c guards read the SFC's <style> source, not computed styles: the test
 * harness mounts without injecting scoped CSS, so `getComputedStyle` would
 * report the initial value for every rule below and pass no matter what
 * regressed. The source IS the contract here — the rhythm table is a set of
 * declarations, and what these lock is that they still exist and still say 0.
 */
function styleBlockOf(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  return source.slice(source.indexOf('<style'))
}

const messageItemStyle = styleBlockOf('../MessageItem.vue')

const roomTimeCapsuleStyle = styleBlockOf('../message/RoomTimeCapsule.vue')

/** The declarations of one rule, by its exact selector text. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector + ' {')
  expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1)
  return css.slice(at + selector.length, css.indexOf('}', at))
}

const mocks = vi.hoisted(() => ({
  chatStore: {
    pendingSteeringByMessageId: new Map<string, unknown>(),
    retractSteerMessage: vi.fn(),
  },
  // 署名走 store 的 displayAgent(域模型 M4):找得到就是本人身份,找不到是墓碑
  // 「已注销」—— 假件也照这套语义,否则组件测的就不是它真正走的那条路。
  agentsStore: (() => {
    let agents: Array<{ id: string; name: string; title?: string; avatar?: string; status?: string }> = [
      { id: 'a1', name: '小李', title: '工程师', avatar: '🔧' },
    ]
    return {
      get agents() { return agents },
      set agents(next: typeof agents) { agents = next },
      loadAgents: vi.fn().mockResolvedValue(undefined),
      // 三入口归一(agent-im-chat-ui.md C3):署名/头像点击就是调它。
      openAgentSpace: vi.fn(),
      displayAgent: (agentId?: string | null) =>
        agents.find(agent => agent.id === agentId)
        ?? { id: agentId ?? '', name: '已注销', status: 'retired' },
    }
  })(),
  sessionsStore: {
    sessions: [{ id: 'room-1', name: 'Team', kind: 'room' }],
  },
  platformApi: {
    openImageGallery: vi.fn(),
    openImagePreview: vi.fn(),
  },
}))

vi.mock('@/stores/chat', () => ({ useChatStore: () => mocks.chatStore }))
vi.mock('@/stores/agents', () => ({ useAgentsStore: () => mocks.agentsStore }))
vi.mock('@/stores/sessions', () => ({ useSessionsStore: () => mocks.sessionsStore }))
vi.mock('@/platform', () => ({ platformApi: mocks.platformApi }))

// 名册被墓碑那几条用例改写过,复原它 —— 否则后面的用例读到的是上一条的现场。
beforeEach(() => {
  mocks.agentsStore.agents = [{ id: 'a1', name: '小李', title: '工程师', avatar: '🔧' }]
  mocks.agentsStore.openAgentSpace.mockClear()
})

function mountItem(props: Record<string, unknown>) {
  return mount(MessageItem, {
    props: {
      message: {
        id: 'm1',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '我来接这个',
        timestamp: Date.now(),
      },
      ...props,
    } as never,
    global: {
      stubs: {
        MessageBubble: true,
        MessageThinking: true,
        MessageActions: true,
        MessageSystem: true,
        StepsPanel: true,
        ErrorNote: true,
        AttachmentThumb: true,
        FileChip: true,
      },
    },
  })
}

/**
 * 群聊 → 空间页动线(agent-im-chat-ui.md C3/Q5)。群里 agent 的署名是唯一
 * "遇见一个人"的地方,所以入口挂在那儿 —— 头像与名字是同一个入口。Q5 拍板后
 * 中间那张联系人小卡退役:点头像**直开**空间页,不再先弹一张卡。私聊房里没有
 * 署名,那条动线在那儿也没有意义。
 */
describe('MessageItem 空间页入口', () => {
  it('群里点署名直开空间页 —— 中间不再隔一张联系人小卡', async () => {
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('agent-contact-card-stub').exists()).toBe(false)

    const name = wrapper.find('.collab-sender-name')
    expect(name.element.tagName).toBe('BUTTON')
    await name.trigger('click')
    expect(mocks.agentsStore.openAgentSpace).toHaveBeenCalledWith('a1')
  })

  it('头像也是同一个入口', async () => {
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    await wrapper.find('.room-avatar-btn').trigger('click')
    expect(mocks.agentsStore.openAgentSpace).toHaveBeenCalledWith('a1')
  })

  it('私聊房不给这条动线:一对一没有署名,再放一个"去认识 TA"的入口是原地打转', async () => {
    const wrapper = mountItem({
      roomMode: true,
      dmMode: true,
      groupHead: true,
      groupTail: true,
      groupCollapsible: true,
    })
    expect(wrapper.find('.room-avatar-btn').exists()).toBe(false)
    expect(wrapper.find('.collab-sender-name').exists()).toBe(false)
  })

  it('普通会话的署名照旧是一段纯文字,不是按钮', () => {
    const wrapper = mountItem({})
    const name = wrapper.find('.collab-sender-name')
    expect(name.exists()).toBe(true)
    expect(name.element.tagName).toBe('SPAN')
  })
})

describe('MessageItem room presentation', () => {
  it('gives the group head an avatar chip and a signature', () => {
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('.message').classes()).toContain('is-room-agent')
    expect(wrapper.find('.room-avatar').text()).toBe('🔧')
    expect(wrapper.find('.collab-sender-name').text()).toBe('小李')
    expect(wrapper.find('.collab-sender-title').text()).toBe('工程师')
    // The chip owns the emoji in a room — the inline one would double it.
    expect(wrapper.find('.collab-sender-avatar').exists()).toBe(false)
    expect(wrapper.find('.message-item-wrapper').classes()).not.toContain('is-room-stacked')
  })

  /**
   * A2 的墓碑署名(agent-domain-model.md §3.2 / M4)。历史消息永远读得出说话的是
   * 谁 —— 这正是"退休不是删除"要保住的东西:退休的人名字照旧,只是灰显 +
   * 「已注销」;连人都查不到了才退到墓碑那个名字,而不是印一串 uuid。
   */
  it('marks a retired speaker with 已注销 while keeping its name and title', () => {
    mocks.agentsStore.agents = [
      { id: 'a1', name: '小李', title: '工程师', avatar: '🔧', status: 'retired' },
    ]
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })

    expect(wrapper.find('.collab-sender-name').text()).toBe('小李')
    expect(wrapper.find('.collab-sender-title').text()).toBe('工程师')
    expect(wrapper.find('.collab-sender-retired').text()).toBe('已注销')
    expect(wrapper.find('.collab-sender').classes()).toContain('is-retired')
  })

  it('falls back to the tombstone name for a speaker that no longer exists', () => {
    mocks.agentsStore.agents = []
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })

    expect(wrapper.find('.collab-sender-name').text()).toBe('已注销')
    expect(wrapper.text()).not.toContain('a1')
    expect(wrapper.find('.collab-sender').classes()).toContain('is-retired')
  })

  it('leaves an active speaker unmarked (the guards above are not vacuous)', () => {
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('.collab-sender-retired').exists()).toBe(false)
    expect(wrapper.find('.collab-sender').classes()).not.toContain('is-retired')
  })

  it('keeps the gutter but drops avatar and signature on a continued message', () => {
    const wrapper = mountItem({ roomMode: true, groupHead: false, groupTail: false })
    expect(wrapper.find('.room-avatar-col').exists()).toBe(true)
    expect(wrapper.find('.room-avatar').exists()).toBe(false)
    expect(wrapper.find('.collab-sender').exists()).toBe(false)
    expect(wrapper.find('.message-item-wrapper').classes()).toContain('is-room-stacked')
  })

  it('leaves work sessions and ordinary chats on the inline signature', () => {
    const wrapper = mountItem({ roomMode: false })
    expect(wrapper.find('.room-avatar-col').exists()).toBe(false)
    expect(wrapper.find('.message').classes()).not.toContain('is-room-agent')
    expect(wrapper.find('.collab-sender-avatar').text()).toBe('🔧')
    expect(wrapper.find('.collab-sender-name').text()).toBe('小李')
  })

  // ── Utterance fold toggle (P1-2, todo #6) ──
  it('hangs the fold toggle off the signature, and only when the list offers it', () => {
    const plain = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(plain.find('.room-group-toggle').exists()).toBe(false)

    const foldable = mountItem({
      roomMode: true,
      groupHead: true,
      groupTail: false,
      groupCollapsible: true,
      groupMessageCount: 3,
    })
    const toggle = foldable.find('.collab-sender .room-group-toggle')
    expect(toggle.exists()).toBe(true)
    // Expanded: a bare caret. The rows themselves are the summary.
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.find('.room-group-caret').classes()).toContain('open')
    expect(foldable.find('.room-group-count').exists()).toBe(false)
  })

  it('folded, the head advertises the count and the caret closes', async () => {
    const wrapper = mountItem({
      roomMode: true,
      groupHead: true,
      groupTail: true,
      groupCollapsible: true,
      groupCollapsed: true,
      groupMessageCount: 3,
    })
    const toggle = wrapper.find('.room-group-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.room-group-count').text()).toBe('3 条消息')
    expect(wrapper.find('.room-group-caret').classes()).not.toContain('open')

    await toggle.trigger('click')
    // The item asks; the list owns the fold ledger.
    expect(wrapper.emitted('toggleGroup')?.[0]).toEqual(['m1'])
  })

  it('marks every room row so the list can zero its own turn padding (W15)', () => {
    const room = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(room.find('.message-item-wrapper').classes()).toContain('is-room-row')

    const ordinary = mountItem({ roomMode: false })
    expect(ordinary.find('.message-item-wrapper').classes()).not.toContain('is-room-row')
  })

  it('never puts a room user message in the agent gutter', () => {
    const wrapper = mountItem({
      roomMode: true,
      groupHead: true,
      groupTail: true,
      message: {
        id: 'm2',
        sessionId: 'room-1',
        role: 'user',
        content: '大家看看',
        timestamp: Date.now(),
      },
    })
    expect(wrapper.find('.room-avatar-col').exists()).toBe(false)
    expect(wrapper.find('.collab-sender').exists()).toBe(false)
    expect(wrapper.find('.message').classes()).toContain('user')
  })
})

/**
 * 托管私聊房(agent-im-dm.md §4.3):房间排版原样继承,只收掉署名 —— 一对一里
 * "这句是谁说的"没有悬念,头部那枚大头像已经回答过了。头像章留着:它是 IM 的
 * 说话轴,不是署名。
 */
describe('MessageItem 私聊房:收署名,留说话轴', () => {
  it('agent 消息不再署名,但头像章和房间排版照旧', () => {
    const wrapper = mountItem({ roomMode: true, dmMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('.collab-sender').exists()).toBe(false)
    expect(wrapper.find('.collab-sender-name').exists()).toBe(false)
    expect(wrapper.find('.collab-sender-title').exists()).toBe(false)
    expect(wrapper.find('.room-avatar').text()).toBe('🔧')
    expect(wrapper.find('.message').classes()).toContain('is-room-agent')
    expect(wrapper.find('.message-item-wrapper').classes()).toContain('is-room-row')
  })

  it('墓碑徽标也随署名一起收走 —— 私聊里没有第二个人可混淆', () => {
    mocks.agentsStore.agents = [
      { id: 'a1', name: '小李', title: '工程师', avatar: '🔧', status: 'retired' },
    ]
    const wrapper = mountItem({ roomMode: true, dmMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('.collab-sender-retired').exists()).toBe(false)
  })

  it('长发言块仍折得起来:署名没了,折叠把手要自己留一行家', async () => {
    const wrapper = mountItem({
      roomMode: true,
      dmMode: true,
      groupHead: true,
      groupTail: false,
      groupCollapsible: true,
      groupMessageCount: 3,
    })
    const sender = wrapper.find('.collab-sender')
    expect(sender.exists()).toBe(true)
    expect(sender.classes()).toContain('is-dm')
    // 家在,住户不在:把手留着,名字/职位一个都不画。
    expect(wrapper.find('.collab-sender-name').exists()).toBe(false)
    const toggle = wrapper.find('.collab-sender .room-group-toggle')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    expect(wrapper.emitted('toggleGroup')?.[0]).toEqual(['m1'])
  })

  it('用户消息照常(它本来就不署名),系统行照常渲染', () => {
    const user = mountItem({
      roomMode: true,
      dmMode: true,
      message: { id: 'm2', sessionId: 'agent-dm-a1', role: 'user', content: '帮我看下', timestamp: Date.now() },
    })
    expect(user.find('.message').classes()).toContain('user')

    // 死房兜底靠系统行看得见 —— dm 分支不许把它一起收掉。
    const notice = mountItem({
      roomMode: true,
      dmMode: true,
      message: { id: 's1', sessionId: 'agent-dm-a1', role: 'system', content: '🔧 小李 已退休', timestamp: Date.now() },
    })
    expect(notice.find('.room-notice-line').text()).toBe('🔧 小李 已退休')
  })

  it('群聊不受影响:dmMode 不传就是老样子(上面的守卫不是空转)', () => {
    const wrapper = mountItem({ roomMode: true, groupHead: true, groupTail: true })
    expect(wrapper.find('.collab-sender-name').text()).toBe('小李')
    expect(wrapper.find('.collab-sender').classes()).not.toContain('is-dm')
  })
})

/**
 * 双成员 dm 房(agent-im-dm.md §4.3):两位成员的对话照旧署名(两个人**要**署名),
 * 只有用户的插话多一枚「旁观插话」弱标识 —— 这间房里用户是旁观者,而"谁在说话"
 * 必须一眼可辨。纯样式,不动任何数据。
 */
describe('MessageItem 双成员 dm 房:旁观插话', () => {
  const userMessage = {
    id: 'm-user',
    sessionId: 'agent-dm-room-a1--a2',
    role: 'user',
    content: '你们聊,我看看',
    timestamp: Date.now(),
  }

  it('用户消息挂标识,气泡本身照旧', () => {
    const wrapper = mountItem({ roomMode: true, pairDmMode: true, message: userMessage })
    expect(wrapper.find('.bystander-tag').text()).toBe('旁观插话')
    expect(wrapper.find('.message').classes()).toContain('user')
  })

  it('成员发言不挂标识,而且署名照常(双人房要署名)', () => {
    const wrapper = mountItem({ roomMode: true, pairDmMode: true, groupHead: true })
    expect(wrapper.find('.bystander-tag').exists()).toBe(false)
    expect(wrapper.find('.collab-sender-name').text()).toBe('小李')
  })

  it('驱动消息不算用户说话 —— 它是机械激活,不该被标成旁观插话', () => {
    const wrapper = mountItem({
      roomMode: true,
      pairDmMode: true,
      message: {
        ...userMessage,
        id: 'm-drive',
        content: '(小李 · 被 @ 激活)',
        origin: { source: 'collab' },
      },
    })
    expect(wrapper.find('.bystander-tag').exists()).toBe(false)
  })

  it('群房与单成员私聊零变化:不传 pairDmMode 就没有这枚标识', () => {
    expect(mountItem({ roomMode: true, message: userMessage }).find('.bystander-tag').exists())
      .toBe(false)
    expect(mountItem({ roomMode: true, dmMode: true, message: userMessage })
      .find('.bystander-tag').exists()).toBe(false)
  })
})

describe('MessageItem room rhythm — nothing inside a row owns a gap (W15c)', () => {
  it('leaves the chip row to the wrapper gap: flex margins ADD, they do not collapse', () => {
    const body = ruleBody(messageItemStyle, '.reaction-row')
    expect(body).toContain('margin-top: 0;')
    expect(body).toContain('margin-bottom: 0;')
    // The 4px it used to add on top of the wrapper's 4px gap is gone for good.
    expect(body).not.toContain('margin-top: 4px')
  })

  it('runs both sides of the room on the one 4px utterance rhythm', () => {
    // Keyed on the wrapper, so the user column stops running on the 2px base.
    const body = ruleBody(
      messageItemStyle,
      '.message-item-wrapper.is-room-row .message-content-wrapper',
    )
    expect(body).toContain('gap: 4px;')
  })

  it('zeroes every part that could fake a band — attachments, context, signature', () => {
    const body = ruleBody(
      messageItemStyle,
      '.message-item-wrapper.is-room-row .message-attachments,\n' +
        '.message-item-wrapper.is-room-row .message-context-update,\n' +
        '.message-item-wrapper.is-room-row .collab-sender',
    )
    expect(body).toContain('margin-top: 0;')
    expect(body).toContain('margin-bottom: 0;')
  })

  it('keeps the time capsule band single-sourced in the list gap table', () => {
    const body = ruleBody(roomTimeCapsuleStyle, '.room-time-capsule')
    expect(body).toContain('margin: 0;')
    // Comments may still name the old pair; no DECLARATION may reinstate it.
    const declarations = body.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).not.toMatch(/margin[^:]*:\s*[^;]*\d+px/)
  })

  it('still renders the chip row itself, so the guards above are not vacuous', () => {
    const wrapper = mountItem({
      roomMode: true,
      groupHead: true,
      groupTail: true,
      message: {
        id: 'm3',
        sessionId: 'room-1',
        role: 'assistant',
        agentId: 'a1',
        content: '收到',
        timestamp: Date.now(),
        reactions: [{ emoji: '👍', by: [{ type: 'user' }] }],
      },
    })
    const row = wrapper.find('.reaction-row')
    expect(row.exists()).toBe(true)
    // No inline style may smuggle a margin past the stylesheet guards.
    expect(row.attributes('style')).toBeUndefined()
  })
})

describe('MessageItem room reading column — the gutter hangs outside it (W15c)', () => {
  it('names the gutter once so the outdent, footer and pass line cannot drift', () => {
    const body = ruleBody(messageItemStyle, '.message-item-wrapper.is-room-row')
    expect(body).toContain('--room-gutter: calc(28px + var(--message-gap, 10px));')
  })

  it('outdents the agent row by exactly the gutter, widening it by the same', () => {
    const body = ruleBody(
      messageItemStyle,
      '.message-item-wrapper.is-room-row .message.is-room-agent',
    )
    expect(body).toContain('margin-left: calc(-1 * var(--room-gutter));')
    expect(body).toContain('width: calc(100% + var(--room-gutter));')
  })

  it('anchors the hover footer on the bubble line, which is now the column edge', () => {
    const body = ruleBody(messageItemStyle, '.message-item-wrapper.is-room-row .message-footer')
    expect(body).toContain('left: 0;')
    // The pre-W15c anchor would now sit a whole gutter right of its frame.
    expect(body).not.toContain('left: calc(28px')
  })

  it('puts the pass line on the same speech axis, not a gutter indent', () => {
    expect(ruleBody(messageItemStyle, '.collab-pass-line.is-room')).toContain('padding-left: 0;')
  })

  it('gives the gutter back inside the column when the page margin cannot hold it', () => {
    // ChatPanel drops the reading column to 100%-48px at 768; a hanging avatar
    // would land under the scroller's overflow-x: hidden and be clipped.
    const narrow = messageItemStyle.slice(messageItemStyle.indexOf('@media (max-width: 768px)'))
    expect(narrow).toContain('margin-left: 0;')
    expect(narrow).toContain('width: 100%;')
    expect(narrow).toContain('left: var(--room-gutter);')
  })
})

describe('MessageItem room system notices (W15 §3.6)', () => {
  const notice = {
    id: 's1',
    sessionId: 'room-1',
    role: 'system',
    content: '🔧 小李 加入了群聊',
    timestamp: Date.now(),
  }

  it('renders a room system message as a centred trace line, not the system card', () => {
    const wrapper = mountItem({ roomMode: true, message: notice })
    const line = wrapper.find('.room-notice-line')
    expect(line.exists()).toBe(true)
    expect(line.text()).toBe('🔧 小李 加入了群聊')
    // The full text stays reachable when the two-line clamp bites.
    expect(wrapper.findComponent({ name: 'Tooltip' }).props('text')).toBe('🔧 小李 加入了群聊')
    expect(wrapper.findComponent({ name: 'MessageSystem' }).exists()).toBe(false)
  })

  it('leaves ordinary sessions on the generic system card', () => {
    const wrapper = mountItem({ roomMode: false, message: notice })
    expect(wrapper.find('.room-notice-line').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'MessageSystem' }).exists()).toBe(true)
  })

  it('keeps the compact panel: a context-compact payload is not a room notice', () => {
    const wrapper = mountItem({
      roomMode: true,
      message: {
        ...notice,
        content: JSON.stringify({ type: 'context-compact', status: 'completed', summary: 's' }),
      },
    })
    expect(wrapper.find('.room-notice-line').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'MessageSystem' }).exists()).toBe(true)
  })
})
