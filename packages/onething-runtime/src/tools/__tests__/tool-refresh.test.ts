import { describe, expect, it, vi } from 'vitest'
import { refreshOnethingAsyncTools, refreshOnethingAsyncToolsForIpc } from '../tool-refresh.js'

describe('refreshOnethingAsyncTools', () => {
  it('sets the async tool init context before reinitializing async tools', async () => {
    const calls: string[] = []
    const setInitContext = vi.fn((context) => {
      calls.push(`context:${context.workingDirectory}`)
    })
    const initializeAsyncTools = vi.fn(() => {
      calls.push('initialize')
    })

    await expect(refreshOnethingAsyncTools({
      workingDirectory: '/repo',
      setInitContext,
      initializeAsyncTools,
    })).resolves.toEqual({ success: true })

    expect(setInitContext).toHaveBeenCalledWith({ workingDirectory: '/repo' })
    expect(initializeAsyncTools).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['context:/repo', 'initialize'])
  })

  it('normalizes async tool refresh failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(refreshOnethingAsyncToolsForIpc({
      workingDirectory: '/repo',
      setInitContext: () => {
        throw new Error('refresh failed')
      },
      initializeAsyncTools: vi.fn(),
      logger,
    })).resolves.toEqual({
      success: false,
      error: 'refresh failed',
    })

    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
