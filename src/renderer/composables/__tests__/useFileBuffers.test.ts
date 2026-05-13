import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileBuffers } from '../useFileBuffers'

describe('useFileBuffers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        readFileContent: vi.fn().mockResolvedValue({
          success: true,
          content: 'hello',
          encoding: 'utf-8',
          size: 5,
          mtimeMs: 10,
          isBinary: false,
        }),
        saveFileContent: vi.fn().mockResolvedValue({
          success: true,
          mtimeMs: 20,
        }),
      },
    })
  })

  afterEach(() => {
    const fileBuffers = useFileBuffers()
    for (const path of Array.from(fileBuffers.buffers.keys())) {
      fileBuffers.releaseBuffer(path)
    }
    vi.unstubAllGlobals()
  })

  it('reuses buffers by file path and tracks dirty state', async () => {
    const fileBuffers = useFileBuffers()
    const path = '/tmp/example.ts'

    await fileBuffers.loadFile(path, 1024)
    const first = fileBuffers.getBuffer(path)
    const second = fileBuffers.getBuffer(path)

    expect(second).toBe(first)
    expect(first.content).toBe('hello')
    expect(fileBuffers.isDirty(path)).toBe(false)

    first.draftContent = 'hello editor'

    expect(fileBuffers.isDirty(path)).toBe(true)
  })

  it('initializes per-file search state', async () => {
    const fileBuffers = useFileBuffers()
    const path = '/tmp/search.ts'

    await fileBuffers.loadFile(path, 1024)
    const buffer = fileBuffers.getBuffer(path)

    expect(buffer.search).toEqual({
      query: '',
      caseSensitive: false,
      currentMatchIndex: -1,
      matches: [],
      searchOpen: false,
    })
  })

  it('saves draft content with the expected mtime and clears dirty state', async () => {
    const fileBuffers = useFileBuffers()
    const path = '/tmp/save.ts'

    await fileBuffers.loadFile(path, 1024)
    const buffer = fileBuffers.getBuffer(path)
    buffer.draftContent = 'saved'

    await expect(fileBuffers.saveFile(path)).resolves.toBe(true)

    expect(window.electronAPI.saveFileContent).toHaveBeenCalledWith(path, 'saved', 10)
    expect(buffer.content).toBe('saved')
    expect(buffer.lastReadMtimeMs).toBe(20)
    expect(fileBuffers.isDirty(path)).toBe(false)
  })

  it('keeps the draft when save reports an external modification conflict', async () => {
    vi.mocked(window.electronAPI.saveFileContent).mockResolvedValueOnce({
      success: false,
      conflict: true,
      error: 'File changed on disk. Review before saving again.',
    })
    const fileBuffers = useFileBuffers()
    const path = '/tmp/conflict.ts'

    await fileBuffers.loadFile(path, 1024)
    const buffer = fileBuffers.getBuffer(path)
    buffer.draftContent = 'local draft'

    await expect(fileBuffers.saveFile(path)).resolves.toBe(false)

    expect(buffer.content).toBe('hello')
    expect(buffer.draftContent).toBe('local draft')
    expect(buffer.conflict).toBe(true)
    expect(fileBuffers.isDirty(path)).toBe(true)
  })
})
