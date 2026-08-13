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
        userNoteDir: '/Users/test/notes/user',
        workNoteDir: '/Users/test/notes/user',
      },
    })).toEqual([
      { path: '/Users/test/repo', source: 'workdir', label: 'Workspace' },
      { path: '/Users/test/notes/user', source: 'note', label: 'Personal notes' },
      { path: '/Users/test/Downloads', source: 'downloads', label: 'Downloads' },
    ])
  })

  /**
   * 接入目录(五件套之一:@ / 文件选择器根)。
   *
   * 两条一起看才有意义:空列表那条钉住「加这个功能之前的行为一字不变」,
   * 有值那条钉住「加了就真的出现在选择器里」。少任何一条,这个接线点都可能
   * 在某次重构里悄悄退化成半个功能。
   */
  describe('connected directories', () => {
    it('空列表(以及缺席)时根列表与没有这个功能时逐字节一致', () => {
      const withoutOption = resolveOnethingFileSearchRoots({
        cwd: '/repo',
        homeDir: '/Users/test',
        downloadsDir: '/Users/test/Downloads',
        noteRoots: { userNoteDir: '/Users/test/notes/user' },
      })

      expect(resolveOnethingFileSearchRoots({
        cwd: '/repo',
        homeDir: '/Users/test',
        downloadsDir: '/Users/test/Downloads',
        noteRoots: { userNoteDir: '/Users/test/notes/user' },
        connectedDirs: [],
      })).toEqual(withoutOption)

      expect(withoutOption).toEqual([
        { path: '/repo', source: 'workdir', label: 'Workspace' },
        { path: '/Users/test/notes/user', source: 'note', label: 'Personal notes' },
        { path: '/Users/test/Downloads', source: 'downloads', label: 'Downloads' },
      ])
    })

    it('加入的目录成为一个 connected 根,标签取目录名,并支持 ~ 展开', () => {
      expect(resolveOnethingFileSearchRoots({
        cwd: '/repo',
        homeDir: '/Users/test',
        connectedDirs: ['/Users/test/vault', '~/second'],
      })).toEqual([
        { path: '/repo', source: 'workdir', label: 'Workspace' },
        { path: '/Users/test/vault', source: 'connected', label: 'vault' },
        { path: '/Users/test/second', source: 'connected', label: 'second' },
      ])
    })

    it('与既有根重合时只出现一次(先到的笔记根胜出,不会搜两遍)', () => {
      expect(resolveOnethingFileSearchRoots({
        cwd: '/repo',
        homeDir: '/Users/test',
        noteRoots: { userNoteDir: '/Users/test/notes/user' },
        connectedDirs: ['/Users/test/notes/user', '/repo'],
      })).toEqual([
        { path: '/repo', source: 'workdir', label: 'Workspace' },
        { path: '/Users/test/notes/user', source: 'note', label: 'Personal notes' },
      ])
    })

    it('IPC 立面把 getConnectedDirs 透到根解析上', async () => {
      const listFiles = vi.fn(async function* () {
        yield 'note.md'
      })

      await expect(listOnethingFileSearchEntriesForIpc({
        cwd: '/repo',
        homeDir: '/Users/test',
        query: 'note',
        limit: 10,
        getConnectedDirs: () => ['/Users/test/vault'],
        listFiles,
      })).resolves.toEqual({
        success: true,
        files: ['/repo/note.md', '/Users/test/vault/note.md'],
        entries: [
          { path: '/repo/note.md', type: 'file', source: 'workdir' },
          { path: '/Users/test/vault/note.md', type: 'file', source: 'connected' },
        ],
      })
    })
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
        userNoteDir: '/missing',
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
