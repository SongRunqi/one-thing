import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { WriteTool } from '../write.js'

const createdDirs: string[] = []

function createContext(tmpRoot: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory: tmpRoot,
    workingDirectoryRoots: [tmpRoot],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
    ...overrides,
  }
}

async function createTmpDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  createdDirs.push(dir)
  return dir
}

describe('WriteTool path API', () => {
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('writes files using the path parameter', async () => {
    const dir = await createTmpDir('write-path-api')
    const filePath = path.join(dir, 'note.txt')

    const result = await WriteTool.execute({ path: filePath, content: 'hello\n' }, createContext(dir))

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('hello\n')
    expect(result.output).toBe(`Successfully wrote ${'hello\n'.length} bytes to ${filePath}`)
    expect(result.metadata.path).toBe(filePath)
    expect(result.metadata.auditPath).toBeTruthy()
    expect(result.attachments?.[0]).toEqual({ type: 'file', path: filePath })
  })

  it('creates parent directories and streams Pi-style result updates', async () => {
    const dir = await createTmpDir('write-parent-api')
    const updateResult = vi.fn()
    const relativePath = path.join('nested', 'deep', 'note.txt')
    const filePath = path.join(dir, relativePath)

    const result = await WriteTool.execute(
      { path: relativePath, content: 'hello nested\n' },
      createContext(dir, { updateResult }),
    )

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('hello nested\n')
    expect(result.output).toBe(`Successfully wrote ${'hello nested\n'.length} bytes to ${relativePath}`)
    expect(updateResult).toHaveBeenLastCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: result.output }, { type: 'file', path: filePath }],
      details: expect.objectContaining({ phase: 'ready', path: filePath }),
    }))
  })

  it('honors abort signals before filesystem side effects', async () => {
    const dir = await createTmpDir('write-abort-api')
    const filePath = path.join(dir, 'aborted', 'note.txt')
    const controller = new AbortController()
    controller.abort()

    await expect(WriteTool.execute(
      { path: filePath, content: 'nope\n' },
      createContext(dir, { abortSignal: controller.signal }),
    )).rejects.toThrow('Operation aborted')
    await expect(fs.stat(filePath)).rejects.toThrow()
  })

  it('rejects missing path', () => {
    const parsed = WriteTool.parameters.safeParse({ content: 'hello\n' })
    expect(parsed.success).toBe(false)
  })
})
