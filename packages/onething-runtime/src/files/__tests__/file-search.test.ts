import { describe, expect, it, vi } from 'vitest'
import {
  listOnethingFileSearchEntries,
  listOnethingFileSearchEntriesForIpc,
  resolveOnethingFileSearchRoots,
} from '../file-search.js'

describe('file search runtime operations', () => {
  it('resolves work, note, and downloads roots with labels and dedupe', () => {
    expect(resolveOnethingFileSearchRoots({
      cwd: '~/repo',
      homeDir: '/Users/test',
      downloadsDir: '/Users/test/Downloads',
      noteRoots: {
        aiNoteDir: '/Users/test/notes/ai',
        userNoteDir: '/Users/test/notes/user',
        workNoteDir: '/Users/test/notes/ai',
      },
    })).toEqual([
      { path: '/Users/test/repo', source: 'workdir', label: 'Workspace' },
      { path: '/Users/test/notes/ai', source: 'note', label: 'AI notes' },
      { path: '/Users/test/notes/user', source: 'note', label: 'Personal notes' },
      { path: '/Users/test/Downloads', source: 'downloads', label: 'Downloads' },
    ])
  })

  it('lists matching roots and files while preserving absolute paths', async () => {
    const listFiles = vi.fn(async function* (root: { path: string }) {
      if (root.path.endsWith('/missing')) throw new Error('gone')
      yield 'src/index.ts'
      yield 'README.md'
    })

    await expect(listOnethingFileSearchEntries({
      cwd: '/repo',
      homeDir: '/Users/test',
      downloadsDir: '/Users/test/Downloads',
      noteRoots: {
        aiNoteDir: '/missing',
      },
      query: 'read',
      limit: 5,
      listFiles,
    })).resolves.toEqual({
      success: true,
      files: ['/repo/README.md', '/Users/test/Downloads/README.md'],
      entries: [
        { path: '/repo/README.md', type: 'file', source: 'workdir' },
        { path: '/Users/test/Downloads/README.md', type: 'file', source: 'downloads' },
      ],
    })
  })

  it('returns root directory entries for matching root labels and honors limit', async () => {
    await expect(listOnethingFileSearchEntries({
      homeDir: '/Users/test',
      downloadsDir: '/Users/test/Downloads',
      query: 'downloads',
      limit: 1,
      listFiles: async function* () {
        yield 'one.txt'
      },
    })).resolves.toEqual({
      success: true,
      files: [],
      entries: [
        { path: '/Users/test/Downloads', type: 'directory', source: 'downloads', label: 'Downloads' },
      ],
    })
  })

  it('normalizes host adapter failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(listOnethingFileSearchEntriesForIpc({
      homeDir: '/Users/test',
      getNoteRoots: () => {
        throw new Error('notes unavailable')
      },
      listFiles: async function* () {
        yield 'README.md'
      },
      logger,
    })).resolves.toEqual({
      success: false,
      files: [],
      error: 'notes unavailable',
    })

    expect(logger.error).toHaveBeenCalled()
  })
})
