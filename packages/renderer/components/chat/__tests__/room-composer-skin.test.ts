import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 输入框皮相(R2 的 B 段)。
 *
 * 样板要的是「圆角 12px + 浅底 + 一行图标 + 右侧 34px 深色圆钮」,而 `InputBox`
 * 自己是蓝图框(方角、发丝描边、顶边浮标签、mono 的 SEND)。**两件事都得成立**:
 * 房面按样板走,直聊逐像素不变。
 *
 * 这一组盯的是让两件事同时成立的那条结构性理由:皮相整段写在 `RoomSurface` 的
 * scoped CSS 里,编译出来带着 `.room-composer[data-v-…]` 前缀,而直聊那棵树上
 * 根本没有这个祖先 —— 直聊不变不是"我记得没改到",是选择器够不着。
 *
 * 用源码而不是 DOM 断言,是因为 happy-dom 不跑 scoped CSS:能证明"改不到直聊"
 * 的证据在选择器里,不在渲染结果里。
 */
const ROOM_SURFACE = readFileSync(
  fileURLToPath(new URL('../room/RoomSurface.vue', import.meta.url)),
  'utf8',
)
const INPUT_BOX = readFileSync(
  fileURLToPath(new URL('../InputBox.vue', import.meta.url)),
  'utf8',
)

function styleBlock(source: string): string {
  const start = source.indexOf('<style')
  return start === -1 ? '' : source.slice(start)
}

/** 选择器行 = 以 `{` 结尾的那一行(去掉块内的声明行与注释)。 */
function selectorLines(css: string): string[] {
  return css
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.endsWith('{') && !line.startsWith('/*') && !line.startsWith('@'))
}

describe('房面 composer 皮相', () => {
  const roomCss = styleBlock(ROOM_SURFACE)

  it('皮相在 RoomSurface 一侧:样板那几件都在', () => {
    expect(roomCss).toContain('border-radius: 12px')
    expect(roomCss).toContain('border-radius: 50%')
    expect(roomCss).toContain('.send-label')
    expect(roomCss).toContain('.composer-frame-label')
  })

  it('每一条穿透规则都挂在 .room-composer 下 —— 直聊那棵树上没有这个祖先', () => {
    const deepRules = selectorLines(roomCss).filter(line => line.includes(':deep('))
    expect(deepRules.length).toBeGreaterThan(8)
    for (const rule of deepRules) {
      for (const selector of rule.replace(/\s*\{$/, '').split(',')) {
        expect(selector.trim()).toMatch(/^(\.room-surface )?\.room-composer[ >]/)
      }
    }
  })

  it('InputBox 本体没有被动过:蓝图框那套原样留着,也没有任何房面选择器', () => {
    const inputCss = styleBlock(INPUT_BOX)
    // 蓝图框的三件构件仍在(方角 / 发丝描边 / 顶边浮标签 / mono 的 SEND)。
    expect(inputCss).toContain('border-radius: var(--radius-xs, 4px);')
    expect(inputCss).toContain('.composer-frame-label {')
    expect(inputCss).toMatch(/\.send-label \{[^}]*font-family: var\(--font-mono/)
    // 房面的东西一个字都没漏进来。
    expect(INPUT_BOX).not.toContain('room-composer')
    expect(INPUT_BOX).not.toContain('room-surface')
  })

  it('房独有的 messenger 门仍然只在 messenger 形态生效(旧壳不受影响)', () => {
    // 2026-08-09 工具条去分隔线后,InputBox 里不再有 messenger 专属的
    // toolbar 选择器 —— 守卫翻转:确保它不会再回来(房面的 messenger
    // 差异全部住在房面自己的皮相文件里)。
    expect(INPUT_BOX).not.toContain(".composer-toolbar[data-profile='messenger']")
    // data-profile 挂点本身仍在(房面皮相靠它选择),只是 InputBox 不消费。
    expect(INPUT_BOX).toContain(':data-profile="composerProfile"')
  })

  /**
   * R3 的占位符入口:样板要「发送到 #浏览器重构」/「给小林发消息」,占位符是
   * `InputBox` 的 computed,CSS 够不着 —— 于是开一个只读 prop。**直聊零变化的
   * 证据是结构性的:全库只有房面传它**,旧壳那处 `InputBox` 一个字都没加。
   */
  it('placeholder 只有房面传:旧壳的 InputBox 挂点上没有这个绑定', () => {
    expect(ROOM_SURFACE).toContain(':placeholder="composerPlaceholder"')

    const chatPanel = readFileSync(
      fileURLToPath(new URL('../ChatPanel.vue', import.meta.url)),
      'utf8',
    )
    expect(chatPanel).toContain('<InputBox')
    expect(chatPanel).not.toContain(':placeholder')
    expect(chatPanel).not.toContain('placeholder=')
  })

  /**
   * 停止态开关。v2 时代房面整档关着(那颗停止钮停不掉任何东西 —— 回合跑在成员的
   * 执行会话上),**E5 起翻成 true**:停止链已全程可达(`abortStream` →
   * `abortCollabRoomTurnForStop` → `stopCollabV3RoomFloor`,含 E4 的外部
   * `interrupt`)。行为断言在 `InputBox.messenger.test.ts`;这里钉的是**只有房面
   * 传它**这条结构性证据 —— 旧壳的挂点一个字都没加。
   */
  it('allowStopAction 只有房面传,且 E5 后是 true', () => {
    expect(ROOM_SURFACE).toContain(':allow-stop-action="true"')
    // 回归闸:翻回 false 就是把 E5 这一级停止从界面上摘掉。
    expect(ROOM_SURFACE).not.toContain(':allow-stop-action="false"')

    const chatPanel = readFileSync(
      fileURLToPath(new URL('../ChatPanel.vue', import.meta.url)),
      'utf8',
    )
    expect(chatPanel).not.toContain('allow-stop-action')
    expect(chatPanel).not.toContain('allowStopAction')
    // 缺省 = 从前:InputBox 里这个开关的默认值必须是 true。
    expect(INPUT_BOX).toContain('allowStopAction: true,')
  })
})

/**
 * 打字行皮相(真机走查):样板是「三根小竖条波纹在最左 + 灰字『阿澈 正在输入…』」,
 * 而 `CollabTypingLine` 画的是「头像 + 名字 + 正在输入 + 三颗 2px 圆点」。
 *
 * **组件旧壳(ChatPanel)也在用**,所以新样式和 composer 皮相同一手法:写在
 * `RoomSurface` 的 scoped `:deep` 里,选择器带 `.room-composer` 前缀,直聊那棵树
 * 上没有这个祖先 —— 够不着。
 */
describe('房面打字行皮相', () => {
  const roomCss = styleBlock(ROOM_SURFACE)
  const TYPING_LINE = readFileSync(
    fileURLToPath(new URL('../CollabTypingLine.vue', import.meta.url)),
    'utf8',
  )

  it('样板那几件都在房面一侧:竖条(2px×9px)、波纹在最左、省略号、无头像', () => {
    const typingRules = roomCss.slice(roomCss.indexOf('.room-surface .room-composer :deep(.collab-typing)'))
    expect(typingRules).toContain('order: -1')          // 波纹在最左
    expect(typingRules).toContain('height: 9px')        // 竖条,不是 2px 圆点
    expect(typingRules).toContain('border-radius: 1px')
    expect(typingRules).toContain('content: "…"')
    expect(typingRules).toContain('.typing-avatar')
    expect(typingRules).toContain('room-typing-wave')
  })

  it('每一条打字行规则都挂在 .room-composer 下 —— 直聊够不着', () => {
    const typingRules = selectorLines(roomCss).filter(line => line.includes('.collab-typing'))
    expect(typingRules.length).toBeGreaterThan(4)
    for (const rule of typingRules) {
      for (const selector of rule.replace(/\s*\{$/, '').split(',')) {
        expect(selector.trim()).toMatch(/^(\.room-surface )?\.room-composer[ >]/)
      }
    }
  })

  it('CollabTypingLine 本体没被动过:旧形态原样留着,也没有任何房面选择器', () => {
    // 组件自己的圆点(2px / 50%)与呼吸动画照旧 —— 旧壳看到的还是从前那一行。
    expect(TYPING_LINE).toContain('border-radius: 50%;')
    expect(TYPING_LINE).toContain('collab-typing-breath')
    expect(TYPING_LINE).not.toContain('room-composer')
    expect(TYPING_LINE).not.toContain('room-surface')
  })

  it('reduced-motion 档没被高特异性规则吃掉:房面自带一份', () => {
    expect(roomCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.collab-typing \.typing-dot[\s\S]*animation: none/)
  })
})

/**
 * 尾部呼吸(真机走查:最后一条几乎贴着输入框)。量尺沿用旧壳 `MessageList` 的
 * `--chat-scroll-tail-reserve` 同一条式子,所以它随字号/行高设置缩放。
 */
describe('房面消息流尾部留白', () => {
  const roomCss = styleBlock(ROOM_SURFACE)

  it('留白是 padding-bottom,而且与旧壳同一条式子', () => {
    expect(roomCss).toContain('padding: 16px 0 var(--room-flow-tail-reserve, 24px);')
    expect(roomCss).toContain('--chat-composer-safe-gap')
    expect(roomCss).toContain('calc(var(--content-spacing-px, 8px) * 3)')
    expect(roomCss).toContain('calc(var(--message-line-height-px, 20px) * 1.25)')

    const messageList = readFileSync(
      fileURLToPath(new URL('../MessageList.vue', import.meta.url)),
      'utf8',
    )
    // 旧壳那份逐字同式 —— 两边不是各写各的常数。
    expect(styleBlock(messageList)).toContain(
      'max(calc(var(--content-spacing-px, 8px) * 3), calc(var(--message-line-height-px, 20px) * 1.25))',
    )
  })

  /**
   * 跟随到底为什么不受影响:留白画在**哨兵之下**且是常量 —— `useFollowScroll`
   * 判到底用 `scrollHeight - clientHeight - scrollTop`,padding 让被减数与
   * scrollTop 上限同量增长,真尾仍然是距离 0;scroll anchoring 锚的是哨兵,
   * 它下方的常量增长不触发补偿。
   */
  it('哨兵仍是流里的最后一个节点(留白在它之下,不夹在中间)', () => {
    const content = ROOM_SURFACE.slice(
      ROOM_SURFACE.indexOf('<SayChatFlow'),
      ROOM_SURFACE.indexOf('</Scrollbar>'),
    )
    expect(content).toContain('ref="bottomSentinelRef"')
    expect(content.indexOf('<SayChatFlow')).toBeLessThan(content.indexOf('bottomSentinelRef'))
  })
})
