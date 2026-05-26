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

    async function runEdit(callId: string, old_string: string, new_string: string) {
      const gate = queue.createGate()
      metadataByCall.set(callId, [])
      try {
        return await EditTool.execute({
          file_path: filePath,
          old_string,
          new_string,
          replace_all: false,
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
    expect(first.metadata.originalContent).toContain('A: old\nB: old\nC: old')
    expect(second.metadata.originalContent).toContain('A: new\nB: old\nC: old')
    expect(third.metadata.originalContent).toContain('A: new\nB: new\nC: old')
    expect(Permission.ask).toHaveBeenCalledTimes(3)
  })
})
