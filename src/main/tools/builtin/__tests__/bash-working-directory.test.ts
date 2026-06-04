import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { zodToJsonSchema } from '../../core/tool.js'
import { BashTool } from '../bash.js'

function createContext(workingDirectory = '/repo') {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory,
    workingDirectoryRoots: [workingDirectory, '/workspace/other'],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
  }
}

describe('BashTool work directory execution', () => {
  it('exposes only command and timeout to the model', () => {
    const schema = zodToJsonSchema(BashTool.parameters)

    expect(schema.properties).toHaveProperty('command')
    expect(schema.properties).toHaveProperty('timeout')
    expect(schema.properties).not.toHaveProperty('working_directory')
    expect(schema.required).toContain('command')
    expect(schema.required).not.toContain('timeout')
  })

  it('uses the session work directory as cwd', async () => {
    const analysis = await BashTool.analyze!({ command: 'pwd' }, createContext('/repo'))

    expect(analysis.preview?.metadata?.workingDirectory).toBe('/repo')
    expect(analysis.effects).toEqual([])
  })

  it('treats cd as directory selection instead of an unknown command', async () => {
    const analysis = await BashTool.analyze!({ command: 'cd /repo && pwd' }, createContext('/repo'))

    expect(analysis.preview?.metadata?.classification).toBe('allow')
    expect(analysis.effects).toEqual([])
  })

  it('emits an external-directory effect for cd outside allowed roots', async () => {
    const analysis = await BashTool.analyze!({ command: 'cd /outside/project && find . -type f' }, createContext('/repo'))

    expect(analysis.preview?.metadata?.classification).toBe('allow')
    expect(analysis.effects[0]).toMatchObject({
      kind: 'external_directory',
      resources: ['/outside/project', '/outside/project/*'],
      external: true,
      metadata: expect.objectContaining({
        directories: ['/outside/project'],
        boundary: '/repo',
        reason: 'Command changes directory outside the current work directory list',
      }),
    })
  })

  it('streams Pi-style partial text results while running', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'bash-partial-'))
    const updateResult = vi.fn()
    try {
      const result = await BashTool.execute({ command: 'printf "hello\\n"' }, {
        ...createContext(tmp),
        updateResult,
      })

      expect(result.output).toBe('hello\n')
      expect(updateResult).toHaveBeenCalledWith(expect.objectContaining({
        content: [expect.objectContaining({ type: 'text', text: 'hello\n' })],
      }))
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
