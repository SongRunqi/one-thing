/**
 * H3 皮肤包 `bubbleRadius` 的**作用面**闩。
 *
 * 皮肤旋钮是"宿主开的口",于是"口开在哪几个元素上"必须写死在测试里而不是留在
 * 记忆里 —— 否则下一次有人给气泡换个选择器,旋钮就会静默地少作用一处,而真机上
 * 只有"某种模式下没跟着变"这一个症状(参见 diff UI 那次的 var() 占位色事故:
 * 两条渲染路只有一条吃到,肉眼极难发现)。
 *
 * 现状盘点(2026-08-10):`.bubble` 有三种呈现,只有**两种**是气泡 ——
 *  1. `.bubble.user`(MessageBubble.vue)—— 用户气泡,有边框/底色/内边距;
 *  2. `.message.is-room-agent :deep(.bubble.assistant)`(MessageItem.vue)——
 *     群聊里的 agent 框,注释里就写着"read straight off `.bubble.user`";
 *  3. 普通 `.bubble.assistant` —— **不是气泡**:padding 0、无边框、背景透明,
 *     圆角在它身上不圆任何东西。旋钮**故意**不作用于它。
 *
 * 另外钉住"现状值只有一份":档位表里 standard = null,现状值只写在这两处的
 * `var(…, 兜底)` 里。兜底写成别的值,或者档位表里出现 `--radius-xs`,都是回归。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(dirname, '..', '..', '..')

function readRendererFile(relativePath: string): string {
  return fs.readFileSync(path.join(rendererDir, relativePath), 'utf8')
}

/** 旋钮变量名与兜底表达式 —— 与 themes/skin.ts 的 SKIN_VAR_MAP 保持一致。 */
const SKIN_VAR = '--skin-bubble-radius'
const BASELINE = 'var(--radius-xs, 4px)'

describe('skin knob bubbleRadius — 作用面', () => {
  it('用户气泡走皮肤变量,兜底是现状值', () => {
    const messageBubble = readRendererFile('components/chat/message/MessageBubble.vue')
    expect(messageBubble).toContain(`border-radius: var(${SKIN_VAR}, ${BASELINE});`)
  })

  it('群聊 agent 框走同一个皮肤变量(它和用户气泡是同一个配方)', () => {
    const messageItem = readRendererFile('components/chat/MessageItem.vue')
    expect(messageItem).toContain(`border-radius: var(${SKIN_VAR}, ${BASELINE});`)
  })

  it('普通 assistant 消息不是气泡 —— 旋钮不作用于它', () => {
    const messageBubble = readRendererFile('components/chat/message/MessageBubble.vue')
    // `.bubble.assistant` 仍然是 `border-radius: 0`(它没有可圆的表面)。
    // 若哪天它长出了边框/底色,这条断言会失败 —— 那时才该把它纳入作用面。
    const assistantBlock = messageBubble.slice(
      messageBubble.indexOf('.bubble.assistant {'),
      messageBubble.indexOf('.bubble.user {'),
    )
    expect(assistantBlock).toContain('border-radius: 0;')
    expect(assistantBlock).not.toContain(SKIN_VAR)
    expect(assistantBlock).toContain('background: transparent;')
  })

  it('作用面就是这两处 —— 皮肤变量在 renderer 里的出现次数是固定的', () => {
    const messageBubble = readRendererFile('components/chat/message/MessageBubble.vue')
    const messageItem = readRendererFile('components/chat/MessageItem.vue')
    const count = (source: string) => source.split(SKIN_VAR).length - 1
    // 各一处。新增作用元素是**有意的扩面**,要连这个数字一起改。
    expect(count(messageBubble)).toBe(1)
    expect(count(messageItem)).toBe(1)
  })
})
