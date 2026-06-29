import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBashTool } from '../bash.js'
import type { BashOperations } from '../../bash-executor.js'

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
    workingDirectoryRoots: [workingDirectory, '/workspace/other'],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
    ...overrides,
  } as any
}

describe('runtime bash tool', () => {
  it('analyzes session work directory and external cd effects', async () => {
    const tool = createBashTool({
      getToolOutputsDir: () => os.tmpdir(),
      createOperations: () => ({ exec: vi.fn() }) as unknown as BashOperations,
    })

    const allowed = await tool.analyze!({ command: 'cd /repo && pwd' }, createContext('/repo'))
    const external = await tool.analyze!(
      { command: 'cd /outside/project && find . -type f' },
      createContext('/repo'),
    )

    expect(allowed.preview?.metadata?.workingDirectory).toBe('/repo')
    expect(allowed.effects).toEqual([])
    expect(external.effects[0]).toMatchObject({
      kind: 'external_directory',
      resources: ['/outside/project', '/outside/project/*'],
      external: true,
    })
  })

  it('executes with injected operations and streams output updates', async () => {
    const dir = await tempDir('onething-runtime-bash')
    const outputDir = await tempDir('onething-runtime-bash-output')
    const exec = vi.fn(async (_command, _cwd, options) => {
      options.onData(Buffer.from('hello\n'))
      return { exitCode: 0 }
    })
    const createOperations = vi.fn(() => ({ exec }) as BashOperations)
    const updateResult = vi.fn()
    const tool = createBashTool({
      getToolOutputsDir: () => outputDir,
      getShellPath: () => '/bin/test-shell',
      createOperations,
    })

    const result = await tool.execute(
      { command: 'printf "hello\\n"' },
      createContext(dir, { updateResult }),
    )

    expect(createOperations).toHaveBeenCalledWith({ shellPath: '/bin/test-shell' })
    expect(exec).toHaveBeenCalledWith('printf "hello\\n"', dir, expect.objectContaining({
      onData: expect.any(Function),
      timeout: 120000,
    }))
    expect(result.output).toBe('hello\n')
    expect(updateResult).toHaveBeenCalledWith(expect.objectContaining({
      content: [expect.objectContaining({ type: 'text', text: 'hello\n' })],
    }))
  })

  it('denies forbidden commands before invoking operations', async () => {
    const createOperations = vi.fn(() => ({ exec: vi.fn() }) as unknown as BashOperations)
    const tool = createBashTool({
      getToolOutputsDir: () => os.tmpdir(),
      createOperations,
    })

    await expect(tool.execute({ command: 'rm -rf /' }, createContext('/repo')))
      .rejects.toThrow('remove root or home directory')
    expect(createOperations).not.toHaveBeenCalled()
  })
})
