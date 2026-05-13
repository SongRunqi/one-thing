import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'os'
import path from 'path'
import { WriteTool } from '../write'
import { EditTool } from '../edit'
import { Permission } from '../../../permission/index.js'

vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('builtin file tool path expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createContext() {
    return {
      sessionId: 'test-session',
      messageId: 'test-message',
      toolCallId: 'test-call',
      workingDirectory: '/workspace',
      metadata: vi.fn(),
      beforeSideEffect: vi.fn(async () => {
        throw new Error('stop before write')
      }),
    }
  }

  it('write expands ~ before metadata and permission', async () => {
    const ctx = createContext()
    const fileName = `.onething-write-path-expansion-${Date.now()}.txt`
    const expectedPath = path.join(os.homedir(), fileName)

    await expect(
      WriteTool.execute({ file_path: `~/${fileName}`, content: 'hello' }, ctx)
    ).rejects.toThrow('stop before write')

    expect(ctx.metadata).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          filePath: expectedPath,
        }),
      })
    )
    expect(Permission.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          filePath: expectedPath,
        }),
      })
    )
  })

  it('edit expands ~ before metadata and permission', async () => {
    const ctx = createContext()
    const fileName = `.onething-edit-path-expansion-${Date.now()}.txt`
    const expectedPath = path.join(os.homedir(), fileName)

    await expect(
      EditTool.execute({
        file_path: `~/${fileName}`,
        old_string: '',
        new_string: 'hello',
        replace_all: false,
      }, ctx)
    ).rejects.toThrow('stop before write')

    expect(ctx.metadata).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          filePath: expectedPath,
        }),
      })
    )
    expect(Permission.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          filePath: expectedPath,
        }),
      })
    )
  })
})
