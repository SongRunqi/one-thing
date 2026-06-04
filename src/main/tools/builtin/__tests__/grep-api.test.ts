import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { GrepTool } from '../grep.js'

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

describe('GrepTool Pi-style API', () => {
  it('searches contents and returns relative path line matches', async () => {
    const dir = await tempDir('onething-grep')
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'alpha\nneedle here\n', 'utf-8')
    await fs.writeFile(path.join(dir, 'src', 'b.js'), 'needle js\n', 'utf-8')

    const result = await GrepTool.execute({ pattern: 'needle', glob: '**/*.ts' }, createContext(dir))

    expect(result.output).toBe('src/a.ts:2: needle here')
    expect(result.metadata).toMatchObject({ pattern: 'needle', path: dir, matches: 1, truncated: false })
  })

  it('supports literal and ignoreCase options', async () => {
    const dir = await tempDir('onething-grep-literal')
    await fs.writeFile(path.join(dir, 'a.txt'), 'Hello a.b\nhello axb\n', 'utf-8')

    const result = await GrepTool.execute({ pattern: 'A.B', literal: true, ignoreCase: true }, createContext(dir))

    expect(result.output).toBe('a.txt:1: Hello a.b')
  })

  it('includes requested context lines', async () => {
    const dir = await tempDir('onething-grep-context')
    await fs.writeFile(path.join(dir, 'a.txt'), 'before\nneedle\nafter\n', 'utf-8')

    const result = await GrepTool.execute({ pattern: 'needle', context: 1 }, createContext(dir))

    expect(result.output).toBe('a.txt:1: before\na.txt:2: needle\na.txt:3: after')
  })

  it('analyzes external directories through path metadata', async () => {
    const root = await tempDir('onething-grep-root')
    const external = await tempDir('onething-grep-external')

    const analysis = await GrepTool.analyze!({ pattern: 'x', path: external }, createContext(root))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      metadata: expect.objectContaining({ path: external }),
    })
    expect(analysis.preview).toMatchObject({ path: external })
  })
})
