// @vitest-environment happy-dom
/**
 * 右栏线程详情**搬整个 `ChatPanel`** 之后的安全围栏。
 *
 * 两条纪律钉在这里:
 *
 *  1. **键盘归中栏,右栏靠点击。** `MessageList` 内部 `usePermissionShortcuts`
 *     注册的是 window 级 capture keydown。中栏与右栏同时挂着 `MessageList` 时,
 *     若两条会话各自都有待批请求,**一次 Enter 会同时命中两个处理器** —— 批错
 *     对象。所以详情层显式传 `:permission-shortcuts="false"`;而 `ChatPanel` /
 *     `MessageList` 的缺省仍是 `true`(直聊与旧壳一个字节不变)。
 *
 *  2. **审批按钮必须在右栏可点。** 待批请求按**工作会话 id** 存
 *     (`collabBoard.hasPendingAsk(workSessionId)`),左栏活卡片 / 看板行 / 背台
 *     三处都只画一个「待审批」状态标,没有一处能批。右栏搬来 `ChatPanel` 就是
 *     为了补这个洞 —— 所以这里反过来钉住:详情层挂的是 `ChatPanel`(账页栏位
 *     随它一起来),**不是**只挂 `MessageList` 再自建一只回复框。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

const threadDetail = () => read('packages/renderer/components/workbench/ThreadChatDetail.vue')
const chatPanel = () => read('packages/renderer/components/chat/ChatPanel.vue')
const messageList = () => read('packages/renderer/components/chat/MessageList.vue')

describe('线程详情不接管审批快捷键', () => {
  it('ThreadChatDetail 显式传 :permission-shortcuts="false"', () => {
    expect(threadDetail()).toContain(':permission-shortcuts="false"')
  })

  it('ChatPanel 把 permissionShortcuts 原样透给 MessageList,缺省 true', () => {
    const src = chatPanel()
    expect(src).toContain('permissionShortcuts?: boolean')
    expect(src).toContain('permissionShortcuts: true,')
    expect(src).toContain(':permission-shortcuts="props.permissionShortcuts"')
  })

  it('MessageList 的缺省是 true —— 直聊与旧壳一个字节不变', () => {
    const src = messageList()
    expect(src).toContain('permissionShortcuts: true,')
    expect(src).toContain('props.permissionShortcuts && !!currentPendingPermission.value')
  })

  it('中栏(ChatWindow)一个字都没传 —— 直聊照旧吃缺省 true', () => {
    const src = read('packages/renderer/components/chat/ChatWindow.vue')
    expect(src).not.toContain('permission-shortcuts')
    expect(src).not.toContain('permissionShortcuts')
  })
})

describe('线程详情就是整个聊天面', () => {
  it('挂的是 ChatPanel(账页栏位/composer 随它一起来),不是裸 MessageList', () => {
    const src = threadDetail()
    expect(src).toContain("import ChatPanel from '@/components/chat/ChatPanel.vue'")
    expect(src).toContain('<ChatPanel')
    expect(src).not.toContain("from '@/components/chat/MessageList.vue'")
  })

  it('自建的轻量回复框已删 —— 右栏不再有第二个 composer', () => {
    const src = threadDetail()
    expect(src).not.toContain('thread-reply')
    expect(src).not.toContain('reply-input')
  })

  it('不传 footerTarget / outlineRailTarget:composer 就地落位,大纲轨不进右栏', () => {
    const src = threadDetail()
    expect(src).not.toContain('footer-target')
    expect(src).not.toContain('outline-rail-target')
    // `ChatPanel` 这两枚缺省都是 null,而 MessageList 的大纲轨是
    // `v-if="useSideOutlineRail && …"`(= Boolean(outlineRailTarget)),不传就不渲染。
    expect(chatPanel()).toContain('footerTarget: null,')
    expect(chatPanel()).toContain('outlineRailTarget: null,')
    expect(messageList()).toContain("const useSideOutlineRail = computed(() => Boolean(props.outlineRailTarget))")
  })
})

describe('窄栏适配只压尺寸,且够不着直聊', () => {
  it('阅读列量尺只改 ChatPanel 的两枚输入变量,不直接写 --chat-content-width', () => {
    const src = threadDetail()
    expect(src).toContain('.thread-chat-detail :deep(.chat-panel)')
    expect(src).toContain('--content-measure: 100%')
    expect(src).toContain('--chat-measure-cap: 100%')
    expect(src).not.toContain('--chat-content-width:')
  })

  it('每一条 :deep 规则都带 .thread-chat-detail 前缀(直聊那棵树够不着)', () => {
    const style = threadDetail().split('<style scoped>')[1] ?? ''
    // 只认真正的选择器行(以 `{` 或 `,` 收尾),注释里提到 `:deep()` 的不算。
    const deepRules = style.match(/^.*:deep\(.*\)[^\n]*[{,]\s*$/gm) ?? []
    expect(deepRules.length).toBeGreaterThan(0)
    for (const rule of deepRules) {
      expect(rule.trim().startsWith('.thread-chat-detail')).toBe(true)
    }
  })

  it('窄栏一律给横滚,永远不 overflow: hidden 裁内容', () => {
    const style = threadDetail().split('<style scoped>')[1] ?? ''
    const deepBlocks = style.match(/:deep\([^)]*\)[^{]*\{[^}]*\}/g) ?? []
    for (const block of deepBlocks) {
      expect(block).not.toMatch(/overflow[^:]*:\s*hidden/)
    }
  })
})
