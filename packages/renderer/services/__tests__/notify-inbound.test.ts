/**
 * 私聊通知的触发规则与正文摘要(docs/design/agent-dm-user.md §4.3)。
 *
 * 规则被单独钉住的理由:判错一次的代价是骚扰,而一个骚扰过人的通知再也没人信。
 */
import { describe, expect, it } from 'vitest'
import {
  NOTIFY_COOLDOWN_MS,
  shouldNotifyInbound,
  summarizeNotificationBody,
} from '../notify-inbound'

const NOW = 1_700_000_000_000

/** 一条"该弹"的基线消息:对方在私聊里说话,你不在屏幕前。 */
function base(overrides: Partial<Parameters<typeof shouldNotifyInbound>[0]> = {}) {
  return {
    role: 'assistant',
    structural: false,
    onScreen: false,
    userDmRoom: true,
    enabled: true,
    now: NOW,
    ...overrides,
  }
}

describe('触发规则', () => {
  it('基线:私聊里对方说话且你不在场 → 弹', () => {
    expect(shouldNotifyInbound(base())).toBe(true)
  })

  it('自己说的话不通知自己', () => {
    expect(shouldNotifyInbound(base({ role: 'user' }))).toBe(false)
  })

  it('系统台账行不是有人跟你说话', () => {
    expect(shouldNotifyInbound(base({ role: 'system' }))).toBe(false)
  })

  it('驱动行/思考记录/pass 不是发言', () => {
    expect(shouldNotifyInbound(base({ structural: true }))).toBe(false)
  })

  it('正看着这间房就不弹', () => {
    expect(shouldNotifyInbound(base({ onScreen: true }))).toBe(false)
  })

  it('P2 的范围只有用户私聊房(群聊被 @ 留 P3)', () => {
    expect(shouldNotifyInbound(base({ userDmRoom: false }))).toBe(false)
  })

  it('设置关掉了就不弹', () => {
    expect(shouldNotifyInbound(base({ enabled: false }))).toBe(false)
  })
})

describe('冷却窗', () => {
  it('首条即发', () => {
    expect(shouldNotifyInbound(base({ lastNotifiedAt: undefined }))).toBe(true)
  })

  it('窗内静默 —— 一段话拆成几条 say 只响一次', () => {
    expect(shouldNotifyInbound(base({ lastNotifiedAt: NOW - 1_000 }))).toBe(false)
  })

  it('窗外重新可响', () => {
    expect(shouldNotifyInbound(base({ lastNotifiedAt: NOW - NOTIFY_COOLDOWN_MS - 1 }))).toBe(true)
  })
})

describe('正文摘要', () => {
  it('剥 markdown 记号,内容留着', () => {
    expect(summarizeNotificationBody('**跑完了**,看 `src/app.ts`'))
      .toBe('跑完了,看 src/app.ts')
  })

  it('链接留文字,图片整段丢', () => {
    expect(summarizeNotificationBody('见 [设计稿](https://x.com/a) ![预览](y.png) 那版'))
      .toBe('见 设计稿 那版')
  })

  it('剥 @ 句柄 —— 句柄是给模型认人用的', () => {
    expect(summarizeNotificationBody('@一天#3f9c1e2a 这个你定一下'))
      .toBe('@一天 这个你定一下')
  })

  it('行内标签不出现在通知里', () => {
    expect(summarizeNotificationBody('改完了 <file path="src/a.ts"/>'))
      .toBe('改完了')
  })

  it('标题/引用/列表的行首记号去掉,多行压成一行', () => {
    expect(summarizeNotificationBody('## 结论\n- 一\n- 二'))
      .toBe('结论 一 二')
  })

  it('截断到上限并加省略号', () => {
    const summary = summarizeNotificationBody('字'.repeat(200))
    expect(summary).toHaveLength(81)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('空正文摘要成空串(调用点据此不弹)', () => {
    expect(summarizeNotificationBody('   ')).toBe('')
    expect(summarizeNotificationBody(undefined)).toBe('')
  })
})
