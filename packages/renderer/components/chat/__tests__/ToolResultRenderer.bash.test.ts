// @vitest-environment happy-dom
/**
 * bash 结果面板的两条底线:**全量渲染** + **真的能滚**。
 *
 * 全量:2026-08-12 之前默认只画尾部 20 行,前面的收进「▸ +N lines」。用户看一段
 * 完整输出必须先点一次,那颗按钮本身还长得像一行输出 —— 现在一律全画。
 *
 * 可滚:2026-08-06 真机反馈「bash 工具的结果区域无法鼠标滚动」。根因不是事件被谁
 * 吞了,而是结构上就没有可滚区(那时默认只画 6 行,内容高度够不到 max-height 的
 * 下限 → `scrollHeight === clientHeight` → `overflow: auto` 一辈子不生效)。全量
 * 渲染之后长输出必然溢出,这里钉住的是滚动容器本身还在。
 *
 * happy-dom 没有真实布局,量不了像素,所以样式那两条读的是源码文本。
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

function bashResult(lineCount: number, isPartial = false) {
  const text = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join('\n')
  return {
    toolName: 'bash',
    renderKind: 'bash' as const,
    isPartial,
    result: { content: [{ type: 'text' as const, text }] },
  }
}

describe('bash 结果面板', () => {
  it('长输出全量渲染,不截尾也不画展开钮', () => {
    const wrapper = mount(ToolResultRenderer, { props: bashResult(200) })

    expect(wrapper.findAll('.bash-line')).toHaveLength(200)
    expect(wrapper.find('.expand-line').exists()).toBe(false)
    expect(wrapper.text()).toContain('line 1')
    expect(wrapper.text()).toContain('line 200')
  })

  it('短输出照旧一行不多一行不少', () => {
    const wrapper = mount(ToolResultRenderer, { props: bashResult(3) })
    expect(wrapper.findAll('.bash-line')).toHaveLength(3)
    expect(wrapper.find('.expand-line').exists()).toBe(false)
  })

  /** 截断机制连同它的常量一起退休了 —— 谁想加回来,先撞这条。 */
  it('源码里不再有尾部截断', () => {
    expect(source()).not.toMatch(/BASH_TAIL_LINES/)
  })

  /** 滚动容器本身的两条:没有它们,行数再多也只是把整页撑长。 */
  it('`.bash-output` 自己是滚动容器(max-height + overflow:auto)', () => {
    const block = source().match(/\n\.bash-output\s*\{([^}]*)\}/)
    expect(block).toBeTruthy()
    expect(block![1]).toMatch(/max-height:\s*var\(--tool-result-max-height\)/)
    expect(block![1]).toMatch(/overflow:\s*auto/)
  })

  /**
   * 性能护栏只在 settled 生效:流式期间 `content-visibility: auto` 会让屏外行用
   * 估算高度,scrollHeight 失真 → tail-follow 跟不住底。
   */
  it('content-visibility 只挂在 settled 态,且流式期间不加 settled 类', () => {
    expect(source()).toMatch(/\.bash-output\.settled\s+\.bash-line\s*\{[^}]*content-visibility:\s*auto/)

    const live = mount(ToolResultRenderer, { props: bashResult(50, true) })
    expect(live.find('.bash-output').classes()).not.toContain('settled')

    const settled = mount(ToolResultRenderer, { props: bashResult(50) })
    expect(settled.find('.bash-output').classes()).toContain('settled')
  })
})
