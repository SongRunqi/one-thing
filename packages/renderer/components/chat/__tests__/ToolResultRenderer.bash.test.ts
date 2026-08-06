// @vitest-environment happy-dom
/**
 * bash 结果面板的**可滚性**(2026-08-06 真机反馈:「bash 工具的结果区域无法鼠标
 * 滚动」)。
 *
 * 根因不是事件被谁吞了,而是**结构上就没有可滚区**:默认只渲染尾部 6 行,内容
 * 高度 ≈ 145px,够不到 `.bash-output` 那条 `max-height: clamp(148px, 28vh, 240px)`
 * 的下限 → `scrollHeight === clientHeight` → `overflow: auto` 一辈子不生效。
 * 一块等宽面板摆在那儿却不响应滚轮。
 *
 * happy-dom 没有真实布局,量不了像素,所以这里钉的是**那条算术不变式本身**:
 * 尾部行数 × 行高必须越过 max-height 的下限。谁把 `BASH_TAIL_LINES` 改小,
 * 这条就红。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToolResultRenderer from '../ToolResultRenderer.vue'

function source(): string {
  // happy-dom 下 `import.meta.url` 不是 file: —— 走 cwd 相对路径(与本仓其它
  // 读源文件的测试同一个写法)。
  return readFileSync(
    resolve(process.cwd(), 'packages/renderer/components/chat/ToolResultRenderer.vue'),
    'utf8',
  )
}

/** `--tool-code-line-height` 展开后是 20px(大字号档 22px),取小的那档算最坏情况。 */
const LINE_HEIGHT_PX = 20

function bashResult(lineCount: number) {
  const text = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join('\n')
  return {
    toolName: 'bash',
    renderKind: 'bash' as const,
    result: { content: [{ type: 'text', text }] },
  }
}

describe('bash 结果面板必须真的能滚', () => {
  it('默认渲染的尾部行数足以撑破 max-height 的下限', () => {
    const src = source()

    const tail = Number(src.match(/const BASH_TAIL_LINES = (\d+)/)?.[1])
    expect(Number.isFinite(tail)).toBe(true)

    // `.bash-output { max-height: var(--tool-result-max-height) }`,
    // 而它展开是 `clamp(<下限>, 28vh, <上限>)`。
    const floor = Number(
      src.match(/--tool-result-max-height:\s*var\(--tool-pane-max,\s*clamp\((\d+)px/)?.[1],
    )
    expect(Number.isFinite(floor)).toBe(true)

    expect(
      tail * LINE_HEIGHT_PX,
      `尾部 ${tail} 行 × ${LINE_HEIGHT_PX}px 撑不到 ${floor}px —— 面板不会溢出,滚轮就没有反应`,
    ).toBeGreaterThan(floor)
  })

  it('超出尾部的行收进「+N lines」,展开后才全量渲染', async () => {
    const src = source()
    const tail = Number(src.match(/const BASH_TAIL_LINES = (\d+)/)?.[1])

    const wrapper = mount(ToolResultRenderer, { props: bashResult(tail + 5) })

    expect(wrapper.findAll('.bash-line')).toHaveLength(tail)
    const expand = wrapper.find('.expand-line')
    expect(expand.exists()).toBe(true)
    expect(expand.text()).toContain('+5 lines')

    await expand.trigger('click')
    expect(wrapper.findAll('.bash-line')).toHaveLength(tail + 5)
    expect(wrapper.find('.expand-line').exists()).toBe(false)
  })

  it('短输出不画展开钮(没有被藏起来的行)', () => {
    const wrapper = mount(ToolResultRenderer, { props: bashResult(3) })
    expect(wrapper.findAll('.bash-line')).toHaveLength(3)
    expect(wrapper.find('.expand-line').exists()).toBe(false)
  })

  /** 滚动容器本身的两条:没有它们,行数再多也只是把整页撑长。 */
  it('`.bash-output` 自己是滚动容器(max-height + overflow:auto)', () => {
    const block = source().match(/\n\.bash-output\s*\{([^}]*)\}/)
    expect(block).toBeTruthy()
    expect(block![1]).toMatch(/max-height:\s*var\(--tool-result-max-height\)/)
    expect(block![1]).toMatch(/overflow:\s*auto/)
  })
})
