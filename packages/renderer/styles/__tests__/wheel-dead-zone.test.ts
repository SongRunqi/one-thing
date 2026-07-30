import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(dirname, '..', '..')

// Chrome 把带 overscroll-behavior 的盒子当成 scroll container，哪怕它 overflow:hidden
// 自己根本滚不动：滚轮落在它上面既滚不动它，也不再往外层链——整块内容成了滚轮死区。
// 真机实测（Chromium）：hidden + contain → 外层滚动量 0；hidden + auto → 正常。
// 2026-07-29 CollapsePanel 内容区就是这么写的，think 正文 / markdown 表格 / 工具结果区
// 全部滚不动。这条守卫拦住它再被复制回来。
//
// 判据：一个规则块声明了 overscroll-behavior，却没有任何一个轴是 auto/scroll ——
// 那它自己不可滚，overscroll 只剩「掐断外层滚动」这一个效果。
// （overflow-x:auto + overscroll-behavior-x:contain 这类横向可滚的写法是正当的，不算。）
const ALLOWED = new Set([
  // 这两处自己 @wheel.prevent 接管滚轮做分页，overscroll 只是冗余，不构成死区。
  'components/chat/AssistantMessageNavRail.vue',
  'components/chat/UserMessageNavRail.vue',
])

function collectStyleFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectStyleFiles(full, acc)
    else if (entry.name.endsWith('.vue') || entry.name.endsWith('.css')) acc.push(full)
  }
  return acc
}

/** 粗粒度地把源码切成 `{ ... }` 规则块——够用来判断两条声明是否同处一块。 */
function ruleBlocks(source: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (source[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        blocks.push(source.slice(start + 1, i))
        start = -1
      } else if (depth < 0) {
        depth = 0
      }
    }
  }
  return blocks
}

/** 去掉注释与嵌套块，把一个规则块拆成 `属性 -> 值[]`。 */
function parseDeclarations(block: string): Map<string, string[]> {
  const flat = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '')
  const result = new Map<string, string[]>()
  for (const chunk of flat.split(';')) {
    const colon = chunk.indexOf(':')
    if (colon < 0) continue
    const property = chunk.slice(0, colon).trim().toLowerCase()
    const value = chunk.slice(colon + 1).trim()
    if (!/^[a-z-]+$/.test(property) || value.length === 0) continue
    const existing = result.get(property)
    if (existing) existing.push(value)
    else result.set(property, [value])
  }
  return result
}

function declarations(declared: Map<string, string[]>, property: string): string[] {
  return declared.get(property) ?? []
}

function isDeadZone(block: string): string | null {
  const declared = parseDeclarations(block)
  const overscroll = [
    ...declarations(declared, 'overscroll-behavior'),
    ...declarations(declared, 'overscroll-behavior-x'),
    ...declarations(declared, 'overscroll-behavior-y'),
    ...declarations(declared, 'overscroll-behavior-inline'),
    ...declarations(declared, 'overscroll-behavior-block'),
  ].filter((value) => !/^auto$/.test(value))
  if (overscroll.length === 0) return null

  const overflow = [
    ...declarations(declared, 'overflow'),
    ...declarations(declared, 'overflow-x'),
    ...declarations(declared, 'overflow-y'),
  ]
  if (overflow.length === 0) return null
  if (overflow.some((value) => /\b(auto|scroll|overlay)\b/.test(value))) return null

  return `overscroll-behavior: ${overscroll[0]} 写在一个没有任何可滚轴的盒子上（overflow: ${overflow.join(' / ')}）`
}

describe('滚轮死区守卫', () => {
  it('没有规则把 overscroll-behavior 写在自己不可滚的盒子上', () => {
    const offenders: string[] = []

    for (const file of collectStyleFiles(rendererDir)) {
      const relative = path.relative(rendererDir, file)
      if (ALLOWED.has(relative)) continue
      const source = fs.readFileSync(file, 'utf8')
      if (!source.includes('overscroll-behavior')) continue

      for (const block of ruleBlocks(source)) {
        const hit = isDeadZone(block)
        if (hit) offenders.push(`${relative}: ${hit}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
