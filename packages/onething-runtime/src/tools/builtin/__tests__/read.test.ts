import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadTool } from '../read.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  dirs.push(dir)
  return dir
}

function createContext(workingDirectory: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory,
    workingDirectoryRoots: [workingDirectory],
    metadata: vi.fn(),
    ...overrides,
  } as any
}

describe('runtime read tool', () => {
  it('reads raw text without line numbers', async () => {
    const dir = await tempDir('onething-runtime-read')
    await fs.writeFile(path.join(dir, 'note.txt'), 'hello\nworld\n', 'utf-8')

    const result = await createReadTool().execute({ path: 'note.txt' }, createContext(dir))

    expect(result.output).toBe('hello\nworld\n')
    expect(result.metadata).toMatchObject({
      path: path.join(dir, 'note.txt'),
      lineCount: 3,
      truncated: false,
      isBinary: false,
    })
  })

  it('honors user limit and reports continuation offset', async () => {
    const dir = await tempDir('onething-runtime-read-limit')
    await fs.writeFile(path.join(dir, 'limited.txt'), 'a\nb\nc\nd\n', 'utf-8')

    const result = await createReadTool().execute({
      path: 'limited.txt',
      offset: 2,
      limit: 2,
    }, createContext(dir))

    expect(result.output).toBe('b\nc\n\n[2 more lines in file. Use offset=4 to continue.]')
    expect(result.metadata.truncated).toBe(true)
  })

  it('returns image attachments for supported images', async () => {
    const dir = await tempDir('onething-runtime-read-image')
    const filePath = path.join(dir, 'pixel.png')
    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    await fs.writeFile(filePath, Buffer.from(imageBase64, 'base64'))
    const updateResult = vi.fn()

    const result = await createReadTool().execute(
      { path: 'pixel.png' },
      createContext(dir, { updateResult }),
    )

    expect(result.metadata).toMatchObject({
      path: filePath,
      isBinary: true,
      mimeType: 'image/png',
    })
    expect(result.attachments).toEqual([{
      type: 'image',
      path: filePath,
      content: imageBase64,
      mimeType: 'image/png',
    }])
    expect(updateResult).toHaveBeenLastCalledWith(expect.objectContaining({
      content: [
        { type: 'text', text: result.output },
        { type: 'image', path: filePath, data: imageBase64, mimeType: 'image/png' },
      ],
    }))
  })

  it('uses injected default read roots during analysis', async () => {
    const workspace = await tempDir('onething-runtime-read-workspace')
    const noteRoot = await tempDir('onething-runtime-read-notes')
    const tool = createReadTool({ getDefaultReadRoots: () => [noteRoot] })

    const analysis = await tool.analyze!({
      path: path.join(noteRoot, 'today.md'),
    }, createContext(workspace))

    expect(analysis.effects.some(effect => effect.kind === 'external_directory')).toBe(false)
    expect(analysis.preview).toMatchObject({
      path: path.join(noteRoot, 'today.md'),
    })
  })
})
