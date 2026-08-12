/**
 * 内置 memory 插件的**插座**验收。
 *
 * 只验插座该验的:清单转手了没有、entry 是个能被装配层调用的函数。
 * 插件行为(写/查/注入/播种/拆除)全部验在实现旁边
 * (`src/plugins/__tests__/memory-wiki{,.integration}.test.ts`)——
 * 装配层的测试不许 import 产品层,那是 boundary 检查明写着的一条。
 */

import { describe, expect, it } from 'vitest'
import memoryPlugin, { memoryManifest } from '../memory-wiki.js'

describe('memory-wiki 插座', () => {
  it('转手产品层的清单:id 两个词、权限只有外根', () => {
    expect(memoryManifest.name).toBe('memory-wiki')
    expect(memoryManifest.contributes.permissions).toEqual(['storage:external-root'])
    expect(memoryManifest.contributes.settings.schema.properties.wikiRoot.format)
      .toBe('directory-pick')
  })

  it('entry 是函数(装配层照 log-monitor / note-skills 同一个形状调用它)', () => {
    expect(typeof memoryPlugin).toBe('function')
    expect(memoryPlugin.length).toBe(1)
  })
})
