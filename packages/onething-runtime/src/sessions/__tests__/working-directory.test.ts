import { describe, expect, it, vi } from 'vitest'
import { updateOnethingSessionWorkingDirectory } from '../working-directory.js'

describe('updateOnethingSessionWorkingDirectory', () => {
  it('clears the working directory without validating the filesystem', async () => {
    const isDirectory = vi.fn()
    const writeWorkingDirectory = vi.fn()

    await expect(updateOnethingSessionWorkingDirectory({
      sessionId: 'session-1',
      workingDirectory: null,
      isDirectory,
      writeWorkingDirectory,
    })).resolves.toEqual({ success: true })

    expect(isDirectory).not.toHaveBeenCalled()
    expect(writeWorkingDirectory).toHaveBeenCalledWith('session-1', '')
  })

  it('rejects existing paths that are not directories', async () => {
    const writeWorkingDirectory = vi.fn()

    await expect(updateOnethingSessionWorkingDirectory({
      sessionId: 'session-1',
      workingDirectory: '/tmp/file.txt',
      isDirectory: vi.fn(() => false),
      writeWorkingDirectory,
    })).resolves.toEqual({
      success: false,
      error: 'Not a directory: /tmp/file.txt',
    })

    expect(writeWorkingDirectory).not.toHaveBeenCalled()
  })

  it('reports missing directory paths when validation throws', async () => {
    const writeWorkingDirectory = vi.fn()

    await expect(updateOnethingSessionWorkingDirectory({
      sessionId: 'session-1',
      workingDirectory: '/tmp/missing',
      isDirectory: vi.fn(() => {
        throw new Error('ENOENT')
      }),
      writeWorkingDirectory,
    })).resolves.toEqual({
      success: false,
      error: 'Directory does not exist: /tmp/missing',
    })

    expect(writeWorkingDirectory).not.toHaveBeenCalled()
  })

  it('writes valid directory paths through the host adapter', async () => {
    const writeWorkingDirectory = vi.fn()

    await expect(updateOnethingSessionWorkingDirectory({
      sessionId: 'session-1',
      workingDirectory: '/repo',
      isDirectory: vi.fn(() => true),
      writeWorkingDirectory,
    })).resolves.toEqual({ success: true })

    expect(writeWorkingDirectory).toHaveBeenCalledWith('session-1', '/repo')
  })
})
