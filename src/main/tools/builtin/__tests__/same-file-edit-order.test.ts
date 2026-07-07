import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { EditTool } from '../edit'
import { Permission } from '../../../permission/index.js'
import { OrderedSideEffectQueue } from '../../../engine/stream/tool-execution-order.js'

vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

const createdDirs: string[] = []

describe('same-file edit ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('preserves multiple concurrent edit tool calls against one file under TMP', async () => {
    const tmpRoot = path.join(process.cwd(), 'TMP')
    const dir = path.join(tmpRoot, `deepseek-same-file-edits-${Date.now()}`)
    const filePath = path.join(dir, 'shared.md')
    await fs.mkdir(dir, { recursive: true })
    createdDirs.push(dir)
    await fs.writeFile(filePath, [
      'A: old',
      'B: old',
      'C: old',
      '',
    ].join('\n'), 'utf-8')

    const queue = new OrderedSideEffectQueue()
    const metadataByCall = new Map<string, any[]>()

    async function runEdit(callId: string, oldText: string, newText: string) {
      const gate = queue.createGate()
      metadataByCall.set(callId, [])
      try {
        return await EditTool.execute({
          path: filePath,
          edits: [{ oldText, newText }],
        }, {
          sessionId: 'test-session',
          messageId: 'test-message',
          toolCallId: callId,
          workingDirectory: process.cwd(),
          workingDirectoryRoots: [tmpRoot],
          metadata: vi.fn(update => metadataByCall.get(callId)?.push(update)),
          beforeSideEffect: gate.beforeSideEffect,
        })
      } finally {
        gate.release()
      }
    }

    const [first, second, third] = await Promise.all([
      runEdit('call_a', 'A: old', 'A: new'),
      runEdit('call_b', 'B: old', 'B: new'),
      runEdit('call_c', 'C: old', 'C: new'),
    ])

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe([
      'A: new',
      'B: new',
      'C: new',
      '',
    ].join('\n'))
    // Each edit is based on the previous edit's output: the content hashes chain.
    expect(first.metadata.afterContentHash).toBe(second.metadata.originalContentHash)
    expect(second.metadata.afterContentHash).toBe(third.metadata.originalContentHash)
    expect(first.metadata.diff).toContain('+A: new')
    expect(second.metadata.diff).toContain('+B: new')
    expect(third.metadata.diff).toContain('+C: new')
    // Direct tool execution no longer performs tool-internal Permission.ask();
    // centralized analyze → PermissionPolicy handles permission before execute.
    expect(Permission.ask).not.toHaveBeenCalled()
  })
})
