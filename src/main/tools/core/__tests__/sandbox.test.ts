import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// Mock Permission module
vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock settings store
vi.mock('../../../stores/settings.js', () => ({
  getSettings: vi.fn(() => ({})),
}))

import {
  expandPath,
  isPathContained,
  getSandboxBoundary,
  getSandboxRoots,
  findSandboxRootForPath,
  resolveToolPath,
  checkFileAccess,
} from '../sandbox'
import { Permission } from '../../../permission/index.js'
import { getSettings } from '../../../stores/settings.js'

describe('sandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── expandPath ──────────────────────────────────────────────────

  describe('expandPath()', () => {
    it('should expand ~ to home directory', () => {
      const result = expandPath('~/Documents')
      expect(result).toBe(os.homedir() + '/Documents')
    })

    it('should not modify paths without ~', () => {
      const result = expandPath('/usr/local/bin')
      expect(result).toBe('/usr/local/bin')
    })

    it('should handle ~ alone', () => {
      const result = expandPath('~')
      expect(result).toBe(os.homedir())
    })

    it('should not expand ~ in the middle of a path', () => {
      const result = expandPath('/home/user/~stuff')
      expect(result).toBe('/home/user/~stuff')
    })

    it('should handle empty string', () => {
      const result = expandPath('')
      expect(result).toBe('')
    })
  })

  // ─── resolveToolPath ─────────────────────────────────────────────

  describe('resolveToolPath()', () => {
    it('should expand ~ before resolving paths', () => {
      const result = resolveToolPath('~/file.txt', '/workspace')
      expect(result).toBe(os.homedir() + '/file.txt')
    })

    it('should resolve relative paths against boundary', () => {
      const result = resolveToolPath('src/file.ts', '/workspace')
      expect(result).toBe(path.resolve('/workspace', 'src/file.ts'))
    })

    it('should leave absolute paths absolute', () => {
      const result = resolveToolPath('/workspace/src/file.ts', '/other')
      expect(result).toBe('/workspace/src/file.ts')
    })

    it('should not expand full-width tilde', () => {
      const result = resolveToolPath('～/file.txt', '/workspace')
      expect(result).toBe(path.resolve('/workspace', '～/file.txt'))
    })
  })

  // ─── isPathContained ─────────────────────────────────────────────

  describe('isPathContained()', () => {
    it('should return true for exact match', () => {
      expect(isPathContained('/workspace', '/workspace')).toBe(true)
    })

    it('should return true for child path', () => {
      expect(isPathContained('/workspace', '/workspace/src/file.ts')).toBe(true)
    })

    it('should return true for direct child', () => {
      expect(isPathContained('/workspace', '/workspace/file.ts')).toBe(true)
    })

    it('should return false for parent path', () => {
      expect(isPathContained('/workspace/src', '/workspace')).toBe(false)
    })

    it('should return false for sibling path', () => {
      expect(isPathContained('/workspace', '/other/file.ts')).toBe(false)
    })

    it('should prevent prefix attack (e.g., /workspace-evil)', () => {
      expect(isPathContained('/workspace', '/workspace-evil/file.ts')).toBe(false)
    })

    it('should handle relative paths by resolving them', () => {
      const cwd = process.cwd()
      expect(isPathContained(cwd, path.join(cwd, 'src', 'file.ts'))).toBe(true)
    })
  })

  // ─── getSandboxBoundary ──────────────────────────────────────────

  describe('getSandboxBoundary()', () => {
    it('should return workingDirectory when provided', () => {
      const result = getSandboxBoundary('/my/workspace')
      expect(result).toBe('/my/workspace')
    })

    it('should return settings.defaultWorkingDirectory when no workingDirectory', () => {
      vi.mocked(getSettings).mockReturnValue({
        tools: {
          bash: {
            defaultWorkingDirectory: '/default/workspace',
          },
        },
      } as any)

      const result = getSandboxBoundary()
      expect(result).toBe('/default/workspace')
    })

    it('should expand ~ in settings.defaultWorkingDirectory', () => {
      vi.mocked(getSettings).mockReturnValue({
        tools: {
          bash: {
            defaultWorkingDirectory: '~/workspace',
          },
        },
      } as any)

      const result = getSandboxBoundary()
      expect(result).toBe(os.homedir() + '/workspace')
    })

    it('should fallback to process.cwd() when nothing configured', () => {
      vi.mocked(getSettings).mockReturnValue({} as any)

      const result = getSandboxBoundary()
      expect(result).toBe(process.cwd())
    })
  })

  describe('getSandboxRoots()', () => {
    it('returns active boundary followed by additional roots', () => {
      expect(getSandboxRoots('/workspace', ['/skills/iva', '/shared'])).toEqual([
        '/workspace',
        '/skills/iva',
        '/shared',
      ])
    })

    it('deduplicates roots', () => {
      expect(getSandboxRoots('/workspace', ['/workspace', '/shared', '/shared'])).toEqual([
        '/workspace',
        '/shared',
      ])
    })

    it('finds the containing root for a target path', () => {
      expect(findSandboxRootForPath('/skills/iva/SKILL.md', '/workspace', ['/skills/iva'])).toBe('/skills/iva')
    })
  })

  // ─── checkFileAccess ─────────────────────────────────────────────

  describe('checkFileAccess()', () => {
    const defaultCtx = {
      sessionId: 'test-session',
      messageId: 'test-message',
      toolCallId: 'test-call',
      workingDirectory: '/workspace',
    }

    it('should resolve absolute path inside boundary without permission', async () => {
      const result = await checkFileAccess('/workspace/src/file.ts', defaultCtx, 'read')
      expect(result).toBe('/workspace/src/file.ts')
      expect(Permission.ask).not.toHaveBeenCalled()
    })

    it('should allow absolute paths inside additional roots without permission', async () => {
      const result = await checkFileAccess(
        '/skills/iva/references/code-templates.md',
        { ...defaultCtx, workingDirectoryRoots: ['/skills/iva'] },
        'read',
      )
      expect(result).toBe('/skills/iva/references/code-templates.md')
      expect(Permission.ask).not.toHaveBeenCalled()
    })

    it('should resolve relative path against boundary', async () => {
      const result = await checkFileAccess('src/file.ts', defaultCtx, 'read')
      expect(result).toBe(path.resolve('/workspace', 'src/file.ts'))
      expect(Permission.ask).not.toHaveBeenCalled()
    })

    it('should expand ~ before checking access', async () => {
      const result = await checkFileAccess('~/file.txt', defaultCtx, 'read')
      expect(result).toBe(os.homedir() + '/file.txt')
      expect(Permission.ask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'external_directory',
          metadata: expect.objectContaining({
            filePath: os.homedir() + '/file.txt',
          }),
        })
      )
    })

    it('should request permission for path outside boundary', async () => {
      const result = await checkFileAccess('/other/file.ts', defaultCtx, 'write')
      expect(result).toBe('/other/file.ts')
      expect(Permission.ask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'external_directory',
          pattern: '/other/*',
          sessionId: 'test-session',
          messageId: 'test-message',
          callId: 'test-call',
          title: 'write: file.ts',
          workingDirectory: '/workspace',
          metadata: expect.objectContaining({
            filePath: '/other/file.ts',
            boundary: '/workspace',
            operation: 'write',
            targetType: 'file',
          }),
        })
      )
    })

    it('should request directory-scoped permission for external directory paths', async () => {
      const result = await checkFileAccess('/other/project', defaultCtx, 'search', 'directory')
      expect(result).toBe('/other/project')
      expect(Permission.ask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'external_directory',
          pattern: ['/other/project', '/other/project/*'],
          title: 'search: project',
          workingDirectory: '/workspace',
          metadata: expect.objectContaining({
            filePath: '/other/project',
            targetType: 'directory',
          }),
        })
      )
    })

    it('should not request permission for exact boundary path', async () => {
      const result = await checkFileAccess('/workspace', defaultCtx, 'read')
      expect(result).toBe('/workspace')
      expect(Permission.ask).not.toHaveBeenCalled()
    })

    it('should propagate permission rejection', async () => {
      vi.mocked(Permission.ask).mockRejectedValueOnce(new Error('Permission denied'))

      await expect(
        checkFileAccess('/other/file.ts', defaultCtx, 'write')
      ).rejects.toThrow('Permission denied')
    })
  })
})
