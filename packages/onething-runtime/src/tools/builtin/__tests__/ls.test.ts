import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLsTool } from '../ls.js'

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

describe('runtime ls tool', () => {
  it('lists entries alphabetically with directory suffixes and dotfiles', async () => {
    const dir = await tempDir('onething-runtime-ls')
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, '.env'), 'x=1', 'utf-8')
    await fs.writeFile(path.join(dir, 'README.md'), '# hi', 'utf-8')

    const result = await createLsTool().execute({ path: '.', limit: 10 }, createContext(dir))

    expect(result.output.split('\n')).toEqual(['.env', 'README.md', 'src/'])
    expect(result.metadata).toMatchObject({ path: dir, count: 3, truncated: false })
  })

  it('uses injected default working directory when context has none', async () => {
    const dir = await tempDir('onething-runtime-ls-default')
    await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf-8')
    const tool = createLsTool({ getDefaultWorkingDirectory: () => dir })

    const result = await tool.execute({ path: '.' }, createContext('', {
      workingDirectory: undefined,
      workingDirectoryRoots: undefined,
    }))

    expect(result.output).toBe('a.txt')
    expect(result.metadata.path).toBe(dir)
  })

  it('analyzes external directories through path metadata', async () => {
    const root = await tempDir('onething-runtime-ls-root')
    const external = await tempDir('onething-runtime-ls-external')
    const tool = createLsTool()

    const analysis = await tool.analyze!({ path: external }, createContext(root))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      metadata: expect.objectContaining({ path: external }),
    })
    expect(analysis.preview).toMatchObject({ path: external })
  })
})
