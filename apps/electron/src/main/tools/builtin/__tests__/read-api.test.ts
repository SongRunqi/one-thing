import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ReadTool } from '../read'
import { Permission } from '../../../permission/index.js'
import { resetVariablesStoreForTests } from '../../../variables/store/index.js'
import { createDefaultVariablesFile } from '@onething/runtime/variables/schema'
import type { ToolContext } from '../../core/tool.js'

vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

function createContext(workingDirectory: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory,
    workingDirectoryRoots: [workingDirectory],
    metadata: vi.fn(),
    ...overrides,
  }
}

describe('ReadTool path API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetVariablesStoreForTests().hydrateForTests({
      ...createDefaultVariablesFile(),
      ai_note_dir: '',
      user_note_dir: '',
      work_note_dir: '',
    })
  })

  it('reads files using the path parameter', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-path-'))
    await fs.writeFile(path.join(dir, 'note.txt'), 'hello\n', 'utf-8')

    const result = await ReadTool.execute({ path: 'note.txt' }, createContext(dir))

    expect(result.output).toContain('hello')
    expect(result.metadata.path).toBe(path.join(dir, 'note.txt'))
    expect(Permission.ask).not.toHaveBeenCalled()
  })

  it('rejects missing path', () => {
    const parsed = ReadTool.parameters.safeParse({})
    expect(parsed.success).toBe(false)
  })

  it('returns raw text without line numbers so oldText can be copied for edit', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-raw-'))
    await fs.writeFile(path.join(dir, 'code.ts'), 'const value = 1\nconst next = 2\n', 'utf-8')

    const result = await ReadTool.execute({ path: 'code.ts' }, createContext(dir))

    expect(result.output).toContain('const value = 1\nconst next = 2')
    expect(result.output).not.toContain('1\tconst value')
  })

  it('truncates long files by line count and provides the next offset', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-lines-'))
    const lines = Array.from({ length: 2005 }, (_, index) => `line ${index + 1}`)
    await fs.writeFile(path.join(dir, 'long.txt'), lines.join('\n'), 'utf-8')

    const result = await ReadTool.execute({ path: 'long.txt' }, createContext(dir))

    expect(result.output).toContain('line 1')
    expect(result.output).toContain('line 2000')
    expect(result.output).not.toContain('line 2001')
    expect(result.output).toContain('[Showing lines 1-2000 of 2005. Use offset=2001 to continue.]')
    expect(result.metadata.truncated).toBe(true)
    expect(result.metadata.truncation?.truncatedBy).toBe('lines')
  })

  it('honors user limit and reports how to continue', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-limit-'))
    await fs.writeFile(path.join(dir, 'limited.txt'), 'a\nb\nc\nd\n', 'utf-8')

    const result = await ReadTool.execute({ path: 'limited.txt', offset: 2, limit: 2 }, createContext(dir))

    expect(result.output).toBe('b\nc\n\n[2 more lines in file. Use offset=4 to continue.]')
  })

  it('truncates by byte count and provides the next offset', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-bytes-'))
    const line = 'x'.repeat(100)
    const lines = Array.from({ length: 700 }, (_, index) => `${line}-${index}`)
    await fs.writeFile(path.join(dir, 'bytes.txt'), lines.join('\n'), 'utf-8')

    const result = await ReadTool.execute({ path: 'bytes.txt' }, createContext(dir))

    expect(result.output).toContain('50KB limit')
    expect(result.output).toMatch(/Use offset=\d+ to continue/)
    expect(result.metadata.truncated).toBe(true)
    expect(result.metadata.truncation?.truncatedBy).toBe('bytes')
  })

  it('reports an actionable fallback when the first requested line exceeds the byte limit', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-long-line-'))
    await fs.writeFile(path.join(dir, 'huge-line.txt'), `${'x'.repeat(60 * 1024)}\nsecond\n`, 'utf-8')

    const result = await ReadTool.execute({ path: 'huge-line.txt' }, createContext(dir))

    expect(result.output).toContain('Line 1 is 60KB, exceeds 50KB limit')
    expect(result.output).toContain("Use bash: sed -n '1p' huge-line.txt | head -c 51200")
    expect(result.metadata.truncation?.firstLineExceedsLimit).toBe(true)
  })

  it('streams path in structured read updates', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-update-'))
    const filePath = path.join(dir, 'note.txt')
    await fs.writeFile(filePath, 'hello\n', 'utf-8')
    const updateResult = vi.fn()

    const result = await ReadTool.execute({ path: 'note.txt' }, createContext(dir, { updateResult }))

    expect(result.metadata.path).toBe(filePath)
    expect(updateResult).toHaveBeenLastCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: result.output }],
      details: expect.objectContaining({ phase: 'ready', path: filePath }),
    }))
  })

  it('returns image files as base64 image content for vision models', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-image-'))
    const filePath = path.join(dir, 'pixel.png')
    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    await fs.writeFile(filePath, Buffer.from(imageBase64, 'base64'))
    const updateResult = vi.fn()

    const result = await ReadTool.execute({ path: 'pixel.png' }, createContext(dir, { updateResult }))

    expect(result.output).toContain('MIME type: image/png')
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
      details: expect.objectContaining({ phase: 'ready', path: filePath, mimeType: 'image/png' }),
    }))
  })

  it('does not request external-directory permission for note or downloads reads', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-workspace-'))
    const noteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-notes-'))
    const downloadsRoot = path.join(os.homedir(), 'Downloads')

    resetVariablesStoreForTests().hydrateForTests({
      ...createDefaultVariablesFile(),
      ai_note_dir: '',
      user_note_dir: noteRoot,
      work_note_dir: '',
    })

    const analyze = ReadTool.analyze
    if (!analyze) throw new Error('ReadTool analyze hook is required')

    const noteAnalysis = await analyze({ path: path.join(noteRoot, 'today.md') }, createContext(workspace))
    const downloadsAnalysis = await analyze({ path: path.join(downloadsRoot, 'receipt.pdf') }, createContext(workspace))

    expect(noteAnalysis.effects.some(effect => effect.kind === 'external_directory')).toBe(false)
    expect(downloadsAnalysis.effects.some(effect => effect.kind === 'external_directory')).toBe(false)
  })

  it('honors abort signals before reading', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-abort-'))
    await fs.writeFile(path.join(dir, 'note.txt'), 'hello\n', 'utf-8')
    const controller = new AbortController()
    controller.abort()

    await expect(ReadTool.execute(
      { path: 'note.txt' },
      createContext(dir, { abortSignal: controller.signal }),
    )).rejects.toThrow('Operation aborted')
  })

  it('rejects offsets beyond the end of the file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-read-offset-'))
    await fs.writeFile(path.join(dir, 'short.txt'), 'one\ntwo\n', 'utf-8')

    await expect(ReadTool.execute({ path: 'short.txt', offset: 10 }, createContext(dir)))
      .rejects.toThrow('Offset 10 is beyond end of file')
  })
})
