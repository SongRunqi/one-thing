/**
 * 打字信号的单一实现(docs/design/im-workbench-layout.md §1 取件表)。
 *
 * 这套接线(订阅 + 过期脉搏 + 名册懒加载)以前长在 CollabTypingLine.vue 里;
 * C1 起活卡片的"正在执行"也要吃同一条,所以它被抽成 composable。这里钉的是
 * **不许留两份**:组件消费 composable,而不是自己再养一个 setInterval。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readRendererFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('useCollabTypingAgents', () => {
  const composable = readRendererFile('composables/useCollabTyping.ts')
  const line = readRendererFile('components/chat/CollabTypingLine.vue')

  it('脉搏只在有人打字时存在,安静的房间一个定时器都不跑', () => {
    expect(composable).toContain('if (ids.length === 0) {')
    expect(composable).toContain('stopPulse()')
    expect(composable).toContain('onBeforeUnmount(stopPulse)')
  })

  it('订阅与名册懒加载都在 composable 里', () => {
    expect(composable).toContain('collabBoardStore.ensureSubscribed()')
    expect(composable).toContain('if (!agentsStore.hasLoaded) void agentsStore.loadAgents()')
  })

  it('CollabTypingLine 消费它,而不是留第二份接线', () => {
    expect(line).toContain("import { useCollabTypingAgents } from '@/composables/useCollabTyping'")
    expect(line).toContain('useCollabTypingAgents(computed(() => props.sessionId))')
    expect(line).not.toContain('setInterval')
    expect(line).not.toContain('ensureSubscribed()')
  })
})
