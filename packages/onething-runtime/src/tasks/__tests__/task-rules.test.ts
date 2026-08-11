/**
 * 派工的**产品层口径**验收:工具面屏蔽、参数校验、拒绝措辞、回投排版
 * (`docs/audit/self-hosting-gap-audit-2026-08-11.md` P0-3 / P0-5)。
 */
import { describe, expect, it, vi } from 'vitest'
import { Tool } from '../../tools/tool.js'
import { createTaskTool, type TaskDispatchOutcome } from '../../tools/builtin/task.js'
import {
  TASK_MAX_CONCURRENT_PER_SESSION,
  TASK_TOOL_ID,
  isTaskSession,
  renderTaskReport,
  sessionHiddenToolIds,
  taskSessionName,
} from '../index.js'

describe('task session marker', () => {
  it('recognises a dispatched work session by its metadata stamp', () => {
    expect(isTaskSession({ task: { parentSessionId: 'caller' } })).toBe(true)
    expect(isTaskSession({})).toBe(false)
    expect(isTaskSession(undefined)).toBe(false)
    expect(isTaskSession(null)).toBe(false)
  })

  it('hides the task tool inside a task session and nowhere else', () => {
    expect(sessionHiddenToolIds({ task: { parentSessionId: 'caller' } })).toEqual([TASK_TOOL_ID])
    expect(sessionHiddenToolIds({})).toEqual([])
    expect(sessionHiddenToolIds(undefined)).toEqual([])
  })

  it('names the background session after the label, falling back to the brief', () => {
    expect(taskSessionName('数 test', 'whatever')).toBe('[派工] 数 test')
    expect(taskSessionName(undefined, '数一下 test 文件\n第二行')).toBe('[派工] 数一下 test 文件')
  })
})

describe('task report', () => {
  it('never truncates the closing text', () => {
    const body = 'y'.repeat(5000)
    const report = renderTaskReport({ taskSessionId: 'sid', outcome: 'complete', body })
    expect(report).toContain(body)
    expect(report).toContain('sid')
    expect(report).toContain('已完成')
  })

  it('says so plainly when the task session left nothing behind', () => {
    const report = renderTaskReport({ taskSessionId: 'sid', outcome: 'timeout' })
    expect(report).toContain('超时结束')
    expect(report).toContain('没有留下正文')
  })
})

describe('task tool', () => {
  function tool(outcome: TaskDispatchOutcome) {
    const dispatch = vi.fn(async () => outcome)
    return { dispatch, info: createTaskTool({ dispatch }) }
  }

  const ok: TaskDispatchOutcome = {
    ok: true,
    taskSessionId: 'task-1',
    workingDirectory: '/repo',
    running: 1,
  }

  it('requires a prompt', () => {
    const { info } = tool(ok)
    expect(Tool.safeValidateArgs(info, {}).success).toBe(false)
    expect(Tool.safeValidateArgs(info, { prompt: 'go' }).success).toBe(true)
    expect(Tool.safeValidateArgs(info, {
      prompt: 'go',
      workingDirectory: '/x',
      model: 'm',
      description: 'd',
    }).success).toBe(true)
  })

  it('refuses a blank prompt without touching the dispatcher', async () => {
    const { dispatch, info } = tool(ok)
    const result = await info.execute({ prompt: '   ' }, Tool.createTestContext())
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.output).toContain('prompt is empty')
  })

  it('passes the caller session id through and reports the new session id back', async () => {
    const { dispatch, info } = tool(ok)
    const result = await info.execute(
      { prompt: '  go  ', description: '  label  ' },
      Tool.createTestContext({ sessionId: 'caller' }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      callerSessionId: 'caller',
      prompt: 'go',
      description: 'label',
    })
    expect(result.output).toContain('task-1')
    expect(result.output).toContain(`1/${TASK_MAX_CONCURRENT_PER_SESSION}`)
    expect(result.metadata.taskSessionId).toBe('task-1')
  })

  it('surfaces a structured rejection as words the model can act on', async () => {
    const { info } = tool({ ok: false, reason: 'concurrency', detail: '4 running: a, b, c, d' })
    const result = await info.execute({ prompt: 'go' }, Tool.createTestContext())
    expect(result.output).toContain(String(TASK_MAX_CONCURRENT_PER_SESSION))
    expect(result.output).toContain('4 running: a, b, c, d')
    expect(result.metadata.rejected).toBe(true)

    const nested = tool({ ok: false, reason: 'nested' })
    const nestedResult = await nested.info.execute({ prompt: 'go' }, Tool.createTestContext())
    expect(nestedResult.output).toContain('nested dispatch')
  })

  it('tells the model the truth about how it behaves', () => {
    const { info } = tool(ok)
    // 后台异步 + 会回投 + 可能停在审批卡 + 并发上限 + 不许套娃 —— 五条都要在描述里。
    expect(info.description).toContain('BACKGROUND')
    expect(info.description).toContain('returns immediately')
    expect(info.description).toContain('permission card')
    expect(info.description).toContain(String(TASK_MAX_CONCURRENT_PER_SESSION))
    expect(info.description).toContain('may NOT dispatch tasks of its own')
  })
})
