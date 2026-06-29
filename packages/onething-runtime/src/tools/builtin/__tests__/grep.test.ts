import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGrepTool,
  type GrepSearchOptions,
  type GrepSearchResult,
} from '../grep.js'

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

function createTool(results: GrepSearchResult[] = []) {
  const searchSpy = vi.fn((_options: GrepSearchOptions) => Promise.resolve(results))

  return {
    searchSpy,
    tool: createGrepTool({ search: searchSpy }),
  }
}

describe('runtime grep tool', () => {
  it('returns relative path line matches from injected search provider', async () => {
    const dir = await tempDir('onething-runtime-grep')
    const { searchSpy, tool } = createTool([
      { path: path.join(dir, 'src', 'a.ts'), lineNumber: 2, lineText: 'needle here' },
    ])

    const result = await tool.execute({
      pattern: 'needle',
      glob: '**/*.ts',
      ignoreCase: true,
      literal: true,
    }, createContext(dir))

    expect(searchSpy).toHaveBeenCalledWith({
      cwd: dir,
      pattern: 'needle',
      glob: ['**/*.ts'],
      maxCount: 200,
      ignoreCase: true,
      literal: true,
    })
    expect(result.output).toBe('src/a.ts:2: needle here')
    expect(result.metadata).toMatchObject({
      pattern: 'needle',
      path: dir,
      matches: 1,
      truncated: false,
    })
  })

  it('includes requested context lines', async () => {
    const dir = await tempDir('onething-runtime-grep-context')
    const filePath = path.join(dir, 'a.txt')
    await fs.writeFile(filePath, 'before\nneedle\nafter\n', 'utf-8')
    const { tool } = createTool([
      { path: filePath, lineNumber: 2, lineText: 'needle' },
    ])

    const result = await tool.execute({ pattern: 'needle', context: 1 }, createContext(dir))

    expect(result.output).toBe('a.txt:1: before\na.txt:2: needle\na.txt:3: after')
  })

  it('marks match limit truncation', async () => {
    const dir = await tempDir('onething-runtime-grep-limit')
    const { tool } = createTool([
      { path: path.join(dir, 'a.txt'), lineNumber: 1, lineText: 'needle a' },
      { path: path.join(dir, 'b.txt'), lineNumber: 1, lineText: 'needle b' },
      { path: path.join(dir, 'c.txt'), lineNumber: 1, lineText: 'needle c' },
    ])

    const result = await tool.execute({ pattern: 'needle', limit: 2 }, createContext(dir))

    expect(result.output).toContain('a.txt:1: needle a\nb.txt:1: needle b')
    expect(result.output).not.toContain('c.txt')
    expect(result.output).toContain('2 matches limit reached')
    expect(result.metadata).toMatchObject({
      matches: 2,
      truncated: true,
      matchLimitReached: 2,
    })
  })

  it('reports no matches', async () => {
    const dir = await tempDir('onething-runtime-grep-none')
    const { tool } = createTool([])

    const result = await tool.execute({ pattern: 'needle' }, createContext(dir))

    expect(result.output).toBe('No matches found')
    expect(result.metadata).toMatchObject({
      matches: 0,
      truncated: false,
    })
  })

  it('analyzes external directories through path metadata', async () => {
    const root = await tempDir('onething-runtime-grep-root')
    const external = await tempDir('onething-runtime-grep-external')
    const { tool } = createTool([])

    const analysis = await tool.analyze!({ pattern: 'x', path: external }, createContext(root))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      metadata: expect.objectContaining({ path: external }),
    })
    expect(analysis.preview).toMatchObject({
      path: external,
      metadata: { pattern: 'x' },
    })
  })
})
