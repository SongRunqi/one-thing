import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGlobTool, type GlobFilesOptions } from '../glob.js'

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

function createTool(files: string[]) {
  const filesSpy = vi.fn(async function* (_options: GlobFilesOptions) {
    for (const file of files) {
      yield file
    }
  })

  return {
    filesSpy,
    tool: createGlobTool({ files: filesSpy }),
  }
}

describe('runtime glob tool', () => {
  it('returns absolute file paths sorted by modification time', async () => {
    const dir = await tempDir('onething-runtime-glob')
    await fs.writeFile(path.join(dir, 'old.ts'), 'old', 'utf-8')
    await fs.writeFile(path.join(dir, 'new.ts'), 'new', 'utf-8')
    await fs.utimes(
      path.join(dir, 'old.ts'),
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2020-01-01T00:00:00.000Z'),
    )
    await fs.utimes(
      path.join(dir, 'new.ts'),
      new Date('2020-01-02T00:00:00.000Z'),
      new Date('2020-01-02T00:00:00.000Z'),
    )

    const { filesSpy, tool } = createTool(['old.ts', 'new.ts'])

    const result = await tool.execute({ pattern: '*.ts' }, createContext(dir))

    expect(filesSpy).toHaveBeenCalledWith({ cwd: dir, glob: ['*.ts'] })
    expect(result.output).toBe([
      path.join(dir, 'new.ts'),
      path.join(dir, 'old.ts'),
    ].join('\n'))
    expect(result.metadata).toMatchObject({
      pattern: '*.ts',
      searchPath: dir,
      count: 2,
      truncated: false,
    })
  })

  it('reports no matches', async () => {
    const dir = await tempDir('onething-runtime-glob-none')
    const { tool } = createTool([])

    const result = await tool.execute({ pattern: '*.ts' }, createContext(dir))

    expect(result.output).toBe('No files found')
    expect(result.metadata).toMatchObject({
      count: 0,
      truncated: false,
    })
  })

  it('marks default result limit truncation', async () => {
    const dir = await tempDir('onething-runtime-glob-limit')
    const files = Array.from(
      { length: 101 },
      (_, index) => `file-${String(index).padStart(3, '0')}.ts`,
    )
    const { tool } = createTool(files)

    const result = await tool.execute({ pattern: '*.ts' }, createContext(dir))

    expect(result.output).toContain(path.join(dir, 'file-000.ts'))
    expect(result.output).toContain('(Results truncated at 100 files. Use a more specific pattern or path.)')
    expect(result.metadata).toMatchObject({
      pattern: '*.ts',
      searchPath: dir,
      count: 100,
      truncated: true,
    })
  })
})
