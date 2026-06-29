import { describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import {
  checkCoreFileAccess,
  expandCorePath,
  findCoreReadSandboxRootForPath,
  findCoreSandboxRootForPath,
  getCoreReadSandboxRoots,
  getCoreSandboxBoundary,
  getCoreSandboxRoots,
  isCorePathContained,
  resolveCoreToolPath,
} from '../sandbox.js'

describe('runtime core sandbox helpers', () => {
  it('expands tilde without host adapters', () => {
    expect(expandCorePath('~/Documents')).toBe(path.join(os.homedir(), 'Documents'))
    expect(expandCorePath('/workspace/~literal')).toBe('/workspace/~literal')
  })

  it('resolves boundaries from explicit workdir, configured default, then cwd', () => {
    expect(getCoreSandboxBoundary({ workingDirectory: '/active' })).toBe('/active')
    expect(getCoreSandboxBoundary({ defaultWorkingDirectory: '~/workspace' }))
      .toBe(path.join(os.homedir(), 'workspace'))
    expect(getCoreSandboxBoundary({ cwd: '/fallback' })).toBe('/fallback')
  })

  it('resolves tool paths against the core sandbox boundary', () => {
    expect(resolveCoreToolPath('src/index.ts', { workingDirectory: '/workspace' }))
      .toBe(path.join('/workspace', 'src/index.ts'))
    expect(resolveCoreToolPath('/tmp/file.txt', { workingDirectory: '/workspace' }))
      .toBe('/tmp/file.txt')
  })

  it('deduplicates sandbox roots and guards against prefix attacks', () => {
    expect(getCoreSandboxRoots({
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/workspace', '/shared', '/shared'],
    })).toEqual(['/workspace', '/shared'])

    expect(isCorePathContained('/workspace', '/workspace/src/file.ts')).toBe(true)
    expect(isCorePathContained('/workspace', '/workspace-evil/file.ts')).toBe(false)
  })

  it('finds write and read roots using host-supplied read roots', () => {
    expect(findCoreSandboxRootForPath('/shared/SKILL.md', {
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/shared'],
    })).toBe('/shared')

    expect(getCoreReadSandboxRoots({
      workingDirectory: '/workspace',
      workingDirectoryRoots: ['/shared'],
      defaultReadRoots: ['/notes/personal', '/downloads'],
    })).toEqual(['/workspace', '/shared', '/notes/personal', '/downloads'])

    expect(findCoreReadSandboxRootForPath('/notes/personal/today.md', {
      workingDirectory: '/workspace',
      defaultReadRoots: ['/notes/personal'],
    })).toBe('/notes/personal')
  })

  it('resolves file access without importing Electron or app stores', async () => {
    await expect(checkCoreFileAccess(
      'src/file.ts',
      { sessionId: 's1', messageId: 'm1', workingDirectory: '/workspace' },
      'read file',
    )).resolves.toBe(path.join('/workspace', 'src/file.ts'))
  })
})
