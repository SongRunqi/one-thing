import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFindTool, type FindFilesOptions } from '../find.js'

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
  const filesSpy = vi.fn(async function* (_options: FindFilesOptions) {
    for (const file of files) {
      yield file
    }
  })
  return {
    filesSpy,
    tool: createFindTool({ files: filesSpy }),
  }
}

describe('runtime find tool', () => {
  it('returns sorted relative file paths from injected finder', async () => {
    const dir = await tempDir('onething-runtime-find')
    const { filesSpy, tool } = createTool([
      path.join(dir, 'src', 'b.ts'),
      path.join(dir, 'src', 'a.ts'),
    ])

    const result = await tool.execute({ pattern: '**/*.ts' }, createContext(dir))

    expect(filesSpy).toHaveBeenCalledWith({ cwd: dir, glob: ['**/*.ts'] })
    expect(result.output).toBe(['src/a.ts', 'src/b.ts'].join('\n'))
    expect(result.metadata).toMatchObject({
      pattern: '**/*.ts',
      path: dir,
      count: 2,
      truncated: false,
    })
  })

  it('reports no matches with Pi-style text', async () => {
    const dir = await tempDir('onething-runtime-find-none')
    const { tool } = createTool([])

    const result = await tool.execute({ pattern: '**/*.ts' }, createContext(dir))

    expect(result.output).toBe('No files found matching pattern')
    expect(result.metadata.count).toBe(0)
  })

  it('marks result limit truncation', async () => {
    const dir = await tempDir('onething-runtime-find-limit')
    const { tool } = createTool(['b.ts', 'a.ts', 'c.ts'])

    const result = await tool.execute({ pattern: '**/*.ts', limit: 2 }, createContext(dir))

    expect(result.output).toContain('a.ts\nb.ts')
    expect(result.output).toContain('2 results limit reached')
    expect(result.metadata).toMatchObject({
      count: 2,
      truncated: true,
      resultLimitReached: 2,
    })
  })

  it('analyzes external directories through path metadata', async () => {
    const root = await tempDir('onething-runtime-find-root')
    const external = await tempDir('onething-runtime-find-external')
    const { tool } = createTool([])

    const analysis = await tool.analyze!({ pattern: '*', path: external }, createContext(root))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      metadata: expect.objectContaining({ path: external }),
    })
    expect(analysis.preview).toMatchObject({
      path: external,
      metadata: { pattern: '*' },
    })
  })
})
