import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { EditTool } from '../edit.js'

const createdDirs: string[] = []

function createContext(tmpRoot: string) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory: tmpRoot,
    workingDirectoryRoots: [tmpRoot],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
  }
}

async function createTmpFile(prefix: string, content: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  createdDirs.push(dir)
  const filePath = path.join(dir, 'note.txt')
  await fs.writeFile(filePath, content, 'utf-8')
  return { dir, filePath }
}

describe('EditTool path API', () => {
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('edits files using the path parameter', async () => {
    const { dir, filePath } = await createTmpFile('edit-path-api', 'before\n')

    await EditTool.execute({
      path: filePath,
      edits: [{ oldText: 'before', newText: 'after' }],
    }, createContext(dir))

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('after\n')
  })

  it('rejects missing path', () => {
    const parsed = EditTool.parameters.safeParse({
      edits: [{ oldText: 'before', newText: 'after' }],
    })
    expect(parsed.success).toBe(false)
  })
})
