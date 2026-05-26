import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { EditTool } from '../edit.js'
import { WriteTool } from '../write.js'
import { Permission } from '../../../permission/index.js'

vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

const createdDirs: string[] = []

function createContext() {
  const tmpRoot = path.join(process.cwd(), 'TMP')
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory: process.cwd(),
    workingDirectoryRoots: [tmpRoot],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
  }
}

async function createTmpFile(prefix: string, content: string) {
  const dir = path.join(process.cwd(), 'TMP', `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const filePath = path.join(dir, 'target.md')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  createdDirs.push(dir)
  return filePath
}

describe('file tool revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('re-applies edit to latest content and re-confirms when approved diff changes', async () => {
    const filePath = await createTmpFile('edit-revalidate', 'A: old\nB: old\n')
    vi.mocked(Permission.ask)
      .mockImplementationOnce(async () => {
        await fs.writeFile(filePath, 'A: old\nB: external\n', 'utf-8')
      })
      .mockResolvedValueOnce(undefined)

    const result = await EditTool.execute({
      file_path: filePath,
      old_string: 'A: old',
      new_string: 'A: new',
      replace_all: false,
    }, createContext())

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('A: new\nB: external\n')
    expect(Permission.ask).toHaveBeenCalledTimes(2)
    expect(result.metadata.originalContent).toBe('A: old\nB: external\n')
    expect(result.metadata.originalContentHash).toEqual(expect.any(String))
    expect(vi.mocked(Permission.ask).mock.calls[1][0].metadata).toEqual(
      expect.objectContaining({
        revalidated: true,
        originalContentHash: result.metadata.originalContentHash,
      }),
    )
  })

  it('fails clearly when an approved edit no longer applies to latest content', async () => {
    const filePath = await createTmpFile('edit-revalidate-fail', 'A: old\nB: old\n')
    vi.mocked(Permission.ask).mockImplementationOnce(async () => {
      await fs.writeFile(filePath, 'A: gone\nB: external\n', 'utf-8')
    })

    await expect(EditTool.execute({
      file_path: filePath,
      old_string: 'A: old',
      new_string: 'A: new',
      replace_all: false,
    }, createContext())).rejects.toThrow('could not be re-applied to latest content')

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('A: gone\nB: external\n')
    expect(Permission.ask).toHaveBeenCalledTimes(1)
  })

  it('re-confirms write when target content changes after approval', async () => {
    const filePath = await createTmpFile('write-revalidate', 'before\n')
    vi.mocked(Permission.ask)
      .mockImplementationOnce(async () => {
        await fs.writeFile(filePath, 'external\n', 'utf-8')
      })
      .mockResolvedValueOnce(undefined)

    const result = await WriteTool.execute({
      file_path: filePath,
      content: 'final\n',
    }, createContext())

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('final\n')
    expect(Permission.ask).toHaveBeenCalledTimes(2)
    expect(result.metadata.originalContent).toBe('external\n')
    expect(result.metadata.originalContentHash).toEqual(expect.any(String))
    expect(vi.mocked(Permission.ask).mock.calls[1][0].metadata).toEqual(
      expect.objectContaining({
        revalidated: true,
        operation: 'overwrite',
        originalContentHash: result.metadata.originalContentHash,
      }),
    )
  })
})
