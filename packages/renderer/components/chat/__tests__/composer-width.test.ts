/**
 * 输入区宽度档位(I 期)。
 *
 * 三条纪律:
 *  1. **缺省档就是现状** —— standard 的答案是实测的内容列宽本身,不是某个
 *     被抄下来的数字。因此缺省档改造前后逐字节等价,不需要"我记得没改到"。
 *  2. **每一档都被可用宽度钳住** —— 窄窗/窄面板下没有一档能顶破面板。
 *  3. **脏值当缺省** —— 归一在 `@shared` 做完,这里的兜底不认识任何具体坏值。
 *
 * 还钉住"档位换了要重量":ChatPanel 的 `watch(composerWidthGear)` 是这条链
 * 唯一的醒来方式(内容列自己没变尺寸,ResizeObserver 不会响)。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COMPOSER_FULL_GUTTER_PX,
  COMPOSER_WIDTH_NARROW_REM,
  COMPOSER_WIDTH_WIDE_REM,
  resolveComposerWidth,
} from '../composer-width'

/** 测试里 rem 固定 16px —— 真实基准由 ChatPanel 从根字号现取。 */
const rem = (value: number) => value * 16

/** 一个宽面板:内容列 46rem(736px),面板 1400px。 */
const WIDE_PANEL = { columnWidth: 736, panelWidth: 1400 }

describe('resolveComposerWidth', () => {
  it('standard = 实测内容列宽(现状值不在这里再写一份)', () => {
    expect(resolveComposerWidth('standard', WIDE_PANEL, rem)).toBe(736)
    // 内容列换了宽度(窄窗降级 / 右栏 100% 阅读列),缺省档跟着换,零改动。
    expect(resolveComposerWidth('standard', { columnWidth: 420, panelWidth: 468 }, rem)).toBe(420)
  })

  it('narrow 比现状窄一档,且永不反而变宽', () => {
    expect(resolveComposerWidth('narrow', WIDE_PANEL, rem)).toBe(rem(COMPOSER_WIDTH_NARROW_REM))
    expect(rem(COMPOSER_WIDTH_NARROW_REM)).toBeLessThan(736)
    // 内容列已经比 34rem 还窄时,narrow 就是内容列宽 —— 不会把输入框撑宽。
    expect(resolveComposerWidth('narrow', { columnWidth: 300, panelWidth: 348 }, rem)).toBe(300)
  })

  it('wide 比现状宽一档,但被可用宽度钳住', () => {
    expect(resolveComposerWidth('wide', WIDE_PANEL, rem)).toBe(rem(COMPOSER_WIDTH_WIDE_REM))
    expect(rem(COMPOSER_WIDTH_WIDE_REM)).toBeGreaterThan(736)
    // 面板放不下 56rem 时退到"撑满"这一档的宽度,不顶破面板。
    expect(resolveComposerWidth('wide', { columnWidth: 400, panelWidth: 600 }, rem))
      .toBe(600 - COMPOSER_FULL_GUTTER_PX)
  })

  it('full = 撑满内容列(面板宽减两侧留白),且不为负', () => {
    expect(resolveComposerWidth('full', WIDE_PANEL, rem)).toBe(1400 - COMPOSER_FULL_GUTTER_PX)
    expect(resolveComposerWidth('full', { columnWidth: 0, panelWidth: 10 }, rem)).toBe(0)
  })

  it('四档单调不减:narrow ≤ standard ≤ wide ≤ full(宽面板下)', () => {
    const widths = (['narrow', 'standard', 'wide', 'full'] as const)
      .map(gear => resolveComposerWidth(gear, WIDE_PANEL, rem))
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
  })

  it('未知档位当缺省处置(脏值不会让输入区变成 0 宽或 NaN)', () => {
    for (const dirty of ['NARROW', 'huge', '', null, undefined, 42]) {
      expect(resolveComposerWidth(dirty as never, WIDE_PANEL, rem)).toBe(736)
    }
  })
})

describe('ChatPanel 接线', () => {
  const chatPanel = readFileSync(
    fileURLToPath(new URL('../ChatPanel.vue', import.meta.url)),
    'utf8',
  )

  it('档位换了会重量一次(内容列没变尺寸,RO 不会自己醒)', () => {
    expect(chatPanel).toContain('watch(composerWidthGear, () => {')
    expect(chatPanel).toContain('scheduleContentColumnMeasure()')
  })

  it('输入区宽度只有一条写入路径,且档位归一走 @shared 的那一个', () => {
    expect(chatPanel).toContain("import { normalizeComposerWidth } from '@shared/defaults/settings'")
    expect(chatPanel).toContain("'--chat-composer-width': cssPx(composerWidth),")
    // 非缺省档靠**中线**对齐居中;缺省档 composerWidth === width,三项等价于改造前。
    expect(chatPanel).toContain('const composerLeft = center - composerWidth / 2')
  })
})
