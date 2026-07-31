/**
 * 右栏线程的账目折叠(C3-B,docs/design/im-workbench-layout.md §3 W4)。
 *
 * 钉的是三条纪律:只收「已发生的执行」、不吞错、序号数的是动手次数而不是消息条数。
 */
import { describe, expect, it } from 'vitest'
import type { ChatMessage, Step } from '@/types'
import {
  buildThreadEntries,
  excerptInstruction,
  summarizeThread,
  THREAD_INSTRUCTION_EXCERPT,
} from '../thread-entries'

function step(patch: Partial<Step> = {}): Step {
  return {
    id: patch.id || 's1',
    type: 'tool-call',
    title: 'read',
    status: 'completed',
    timestamp: 0,
    ...patch,
  }
}

function message(patch: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage {
  return {
    id: patch.id || 'm1',
    content: '',
    timestamp: 0,
    ...patch,
  } as ChatMessage
}

describe('buildThreadEntries', () => {
  it('助手消息只有带步骤时才算一次执行,序号数的是动手次数', () => {
    const entries = buildThreadEntries([
      message({ id: 'u1', role: 'user', content: '把换核验一遍' }),
      // 纯说话的回合:右栏没有「已发生的执行」,不画空号头。
      message({ id: 'a1', role: 'assistant', content: '好的' }),
      message({ id: 'a2', role: 'assistant', steps: [step({ id: 'x' }), step({ id: 'y' })] }),
      message({ id: 'a3', role: 'assistant', steps: [step({ id: 'z' })] }),
    ])

    expect(entries.map(entry => entry.kind)).toEqual(['instruction', 'run', 'run'])
    expect(entries.filter(entry => entry.kind === 'run').map(entry => (entry as { index: number }).index))
      .toEqual([1, 2])
  })

  it('不吞错:role=error 的消息单独成一档,而不是消失成"没有步骤"', () => {
    const entries = buildThreadEntries([
      message({ id: 'e1', role: 'error', content: '', errorDetails: 'provider 400' }),
    ])
    expect(entries).toEqual([
      { kind: 'note', id: 'e1', timestamp: 0, text: 'provider 400' },
    ])
  })

  it('system 消息与空正文的指令不进线程', () => {
    const entries = buildThreadEntries([
      message({ id: 's1', role: 'system', content: '系统提示' }),
      message({ id: 'u1', role: 'user', content: '   ' }),
    ])
    expect(entries).toEqual([])
  })

  it('插话(steered)与正常指令分得开', () => {
    const entries = buildThreadEntries([
      message({ id: 'u1', role: 'user', content: '开工' }),
      message({ id: 'u2', role: 'user', content: '等等,先跑测试', steered: true }),
    ])
    expect(entries.map(entry => (entry as { steered: boolean }).steered)).toEqual([false, true])
  })

  it('运行中来自流式标记或未完成的步骤,任一为真即为真', () => {
    const streaming = buildThreadEntries([
      message({ id: 'a1', role: 'assistant', isStreaming: true, steps: [step({ status: 'completed' })] }),
    ])
    expect((streaming[0] as { running: boolean }).running).toBe(true)

    const pending = buildThreadEntries([
      message({ id: 'a1', role: 'assistant', steps: [step({ status: 'running' })] }),
    ])
    expect((pending[0] as { running: boolean }).running).toBe(true)

    const done = buildThreadEntries([
      message({ id: 'a1', role: 'assistant', steps: [step({ status: 'completed' })] }),
    ])
    expect((done[0] as { running: boolean }).running).toBe(false)
  })
})

describe('excerptInstruction', () => {
  it('折成单行并截断 —— 协调器派下来的 drive 正文可以很长', () => {
    expect(excerptInstruction('  第一行\n\n  第二行  ')).toBe('第一行 第二行')
    const long = 'a'.repeat(THREAD_INSTRUCTION_EXCERPT + 20)
    expect(excerptInstruction(long)).toHaveLength(THREAD_INSTRUCTION_EXCERPT + 1)
    expect(excerptInstruction(long).endsWith('…')).toBe(true)
  })
})

describe('summarizeThread', () => {
  it('步数是全线程的和,运行中只要有一次执行还在跑就为真', () => {
    const entries = buildThreadEntries([
      message({ id: 'u1', role: 'user', content: '开工', timestamp: 1 }),
      message({ id: 'a1', role: 'assistant', timestamp: 2, steps: [step({ id: 'x' }), step({ id: 'y' })] }),
      message({ id: 'a2', role: 'assistant', timestamp: 5, steps: [step({ id: 'z', status: 'running' })] }),
    ])
    expect(summarizeThread(entries)).toEqual({
      stepCount: 3,
      runCount: 2,
      running: true,
      lastActivityAt: 5,
    })
  })

  it('空线程给零,不编造', () => {
    expect(summarizeThread([])).toEqual({ stepCount: 0, runCount: 0, running: false, lastActivityAt: 0 })
  })
})
