import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_SETTINGS, DEFAULT_GENERAL_SETTINGS } from '@shared/defaults/settings'
import {
  SAY_METRICS,
  hasExplicitTypographyChoice,
  shouldUseSayTypography,
} from '../say-typography'

function readChatFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8')
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    isSaySurface: true,
    ...overrides,
  }
}

/**
 * 「用户排版设置退让闸」——C2 账页流唯一留下来的逻辑,C2′ 原样搬到聊天面语汇下。
 *
 * 判据是「**与出厂默认值不同**」而不是「有值」:`messageListDensity` 与
 * `chatFontSize` 在 shared/defaults 里本来就有值,按"有值即退让"写会让这一档
 * 永远不生效。
 */
describe('聊天面排版档:退让闸', () => {
  it('出厂默认值不算「用户选过」', () => {
    expect(DEFAULT_GENERAL_SETTINGS.messageListDensity).toBe('comfortable')
    expect(DEFAULT_CHAT_SETTINGS.chatFontSize).toBe(15)
    expect(hasExplicitTypographyChoice({
      messageListDensity: DEFAULT_GENERAL_SETTINGS.messageListDensity,
      chatFontSize: DEFAULT_CHAT_SETTINGS.chatFontSize,
    })).toBe(false)
    expect(shouldUseSayTypography(input({
      messageListDensity: DEFAULT_GENERAL_SETTINGS.messageListDensity,
      chatFontSize: DEFAULT_CHAT_SETTINGS.chatFontSize,
    }))).toBe(true)
  })

  it.each([
    ['字号', { chatFontSize: 18 }],
    ['行高', { messageLineHeight: 1.9 }],
    ['密度', { messageListDensity: 'spacious' }],
  ])('用户显式选过%s → 整档退让', (_label, overrides) => {
    expect(hasExplicitTypographyChoice(overrides)).toBe(true)
    expect(shouldUseSayTypography(input(overrides))).toBe(false)
  })

  it('messageLineHeight 没有出厂默认值,有值即显式', () => {
    expect(DEFAULT_GENERAL_SETTINGS.messageLineHeight).toBeUndefined()
    expect(hasExplicitTypographyChoice({ messageLineHeight: 1.6 })).toBe(true)
  })

  // 外壳形态那道门(classic 不进这一档)随 shellMode 于 2026-08-05 一起退役
  // (product-two-forms-chatgpt-shell.md D2),判据只剩「是不是 say 面」。
  it('直聊不进这一档', () => {
    expect(shouldUseSayTypography(input({ isSaySurface: false }))).toBe(false)
  })
})

/**
 * 数值真源是 SAY_METRICS —— 组件只准消费它写出来的变量,不许各自写死一份。
 * 这里用源文本比对钉住两边不漂移(scoped CSS 在 vue-test-utils 下看不见,
 * 渲染断言够不着这一层)。
 */
describe('聊天面排版档:数值单一真源', () => {
  it('方案 A 的字面量都在 SAY_METRICS 里', () => {
    expect(SAY_METRICS.fontSize).toBe(13)
    expect(SAY_METRICS.lineHeight).toBe(1.72)
    expect(SAY_METRICS.avatarSizePx).toBe(30)
    expect(SAY_METRICS.gutterGapPx).toBe(11)
    expect(SAY_METRICS.signatureSizePx).toBe(12.5)
  })

  it('SayChatFlow 只写变量,不写死数值', () => {
    const source = readChatFile('say/SayChatFlow.vue')
    for (const name of [
      '--say-avatar-size',
      '--say-gutter-gap',
      '--say-row-padding-block',
      '--say-row-padding-inline',
      '--say-signature-size',
    ]) {
      expect(source).toContain(name)
    }
    // 变量值一律由 SAY_METRICS 拼出来
    expect(source).toContain('${SAY_METRICS.avatarSizePx}px')
    expect(source).toContain('${SAY_METRICS.gutterGapPx}px')
  })

  it('SayMessageRow 的头像尺寸走 SAY_METRICS,CSS 侧只消费变量', () => {
    const source = readChatFile('say/SayMessageRow.vue')
    expect(source).toContain('const AVATAR_SIZE = SAY_METRICS.avatarSizePx')
    expect(source).toContain('var(--say-avatar-size, 30px)')
    expect(source).toContain('var(--say-gutter-gap, 11px)')
  })

  it('RoomSurface 的排版档接的是 SAY_METRICS,而不是自己的一份常量', () => {
    const source = readChatFile('room/RoomSurface.vue')
    // 只钉「数值来自 SAY_METRICS 这一张表」,不钉 import 的具名清单 ——
    // R3 收口时 RoomSurface 还要引 shouldUseSayTypography(退让闸),
    // 逐字比对整行会把这类正当增补误判成回归。
    expect(source).toMatch(/import \{[^}]*\bSAY_METRICS\b[^}]*\} from '\.\.\/say\/say-typography'/)
    expect(source).toContain('SAY_METRICS.fontSize')
    expect(source).toContain('SAY_METRICS.lineHeight')
    expect(source).toContain('SAY_METRICS.turnGapPx')
  })

  it('MessageList 上再无聊天面排版档(R3 拆门时一并搬走)', () => {
    const source = readChatFile('MessageList.vue')
    expect(source).not.toContain("from './say/say-typography'")
    expect(source).not.toContain('SAY_METRICS.')
    expect(source).not.toContain('shouldUseSayTypography')
    // 账页流那套 92px 署名列已随 C2 整体撤回,不许再有残留。
    // (只禁**排版**那套账页,不禁 `permission-ledger` —— 权限账页栏位是另一件
    //  东西,R1 起由 MessageList 与房面共用同一个组件。)
    expect(source).not.toContain('ledger-density')
    expect(source).not.toContain('ledger-typography')
    expect(source).not.toContain('92px')
  })
})
