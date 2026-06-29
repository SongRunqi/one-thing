import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { FindTool } from '../find.js'
import { GlobTool } from '../glob.js'
import { LsTool } from '../ls.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function tempDir(prefix: string) {
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
  }
}

describe('LsTool Pi-style API', () => {
  it('lists entries alphabetically with directory suffixes and dotfiles', async () => {
    const dir = await tempDir('onething-ls')
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, '.env'), 'x=1', 'utf-8')
    await fs.writeFile(path.join(dir, 'README.md'), '# hi', 'utf-8')

    const result = await LsTool.execute({ path: '.', limit: 10 }, createContext(dir))

    expect(result.output.split('\n')).toEqual(['.env', 'README.md', 'src/'])
    expect(result.metadata).toMatchObject({ path: dir, count: 3, truncated: false })
  })

  it('streams path in structured ls updates', async () => {
    const dir = await tempDir('onething-ls-update')
    await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')
    const updateResult = vi.fn()

    await LsTool.execute({ path: '.' }, createContext(dir, { updateResult }))

    expect(updateResult).toHaveBeenLastCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: 'a.txt' }],
      details: expect.objectContaining({ phase: 'ready', path: dir }),
    }))
  })

  it('rejects non-directories', async () => {
    const dir = await tempDir('onething-ls-file')
    await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')

    await expect(LsTool.execute({ path: 'a.txt' }, createContext(dir))).rejects.toThrow('Not a directory')
  })
})

describe('FindTool Pi-style API', () => {
  it('finds files by glob and returns relative paths', async () => {
    const dir = await tempDir('onething-find')
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'a', 'utf-8')
    await fs.writeFile(path.join(dir, 'src', 'b.js'), 'b', 'utf-8')

    const result = await FindTool.execute({ pattern: '**/*.ts' }, createContext(dir))

    expect(result.output).toBe('src/a.ts')
    expect(result.metadata).toMatchObject({ pattern: '**/*.ts', path: dir, count: 1, truncated: false })
  })

  it('reports no matches with Pi-style text', async () => {
    const dir = await tempDir('onething-find-none')
    await fs.writeFile(path.join(dir, 'a.js'), 'a', 'utf-8')

    const result = await FindTool.execute({ pattern: '**/*.ts' }, createContext(dir))

    expect(result.output).toBe('No files found matching pattern')
    expect(result.metadata.count).toBe(0)
  })

  it('analyzes external directories through path metadata', async () => {
    const root = await tempDir('onething-find-root')
    const external = await tempDir('onething-find-external')

    const analysis = await FindTool.analyze!({ pattern: '*', path: external }, createContext(root))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      metadata: expect.objectContaining({ path: external }),
    })
    expect(analysis.preview).toMatchObject({ path: external })
  })
})

describe('GlobTool Pi-style API', () => {
  it('finds files by glob and returns absolute paths', async () => {
    const dir = await tempDir('onething-glob')
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'a', 'utf-8')
    await fs.writeFile(path.join(dir, 'src', 'b.js'), 'b', 'utf-8')

    const result = await GlobTool.execute({ pattern: '**/*.ts' }, createContext(dir))

    expect(result.output).toBe(path.join(dir, 'src', 'a.ts'))
    expect(result.metadata).toMatchObject({
      pattern: '**/*.ts',
      searchPath: dir,
      count: 1,
      truncated: false,
    })
  })
})
