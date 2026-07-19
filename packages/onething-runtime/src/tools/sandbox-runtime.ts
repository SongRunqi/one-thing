import * as os from 'os'
import * as path from 'path'
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
  uniqueCorePaths,
  type CoreFileAccessContext,
  type CoreFileAccessTargetType,
} from './sandbox.js'

export type {
  CoreFileAccessContext,
  CoreFileAccessTargetType,
} from './sandbox.js'

export interface OnethingToolSandboxRuntimeAdapters {
  getDefaultWorkingDirectory?: () => string | undefined
  getHostPath?: (name: string) => string | undefined
  getNoteDirectories?: () => Array<string | undefined>
  /**
   * Directories of app-generated artifacts the model is already entitled to —
   * e.g. the bash tool's overflow logs ("Output truncated… full output saved
   * to"). Reading those back is re-reading a tool result the permission system
   * already adjudicated; prompting for it is pure friction.
   */
  getAppArtifactDirectories?: () => Array<string | undefined>
  homeDir?: string
}

let configuredAdapters: OnethingToolSandboxRuntimeAdapters = {}

export function configureOnethingToolSandboxRuntime(adapters: OnethingToolSandboxRuntimeAdapters): void {
  configuredAdapters = { ...configuredAdapters, ...adapters }
}

export function resetOnethingToolSandboxRuntimeForTests(): void {
  configuredAdapters = {}
}

function adaptersWith(overrides: OnethingToolSandboxRuntimeAdapters = {}): OnethingToolSandboxRuntimeAdapters {
  return { ...configuredAdapters, ...overrides }
}

export function getOnethingConfiguredDefaultWorkingDirectory(
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string | undefined {
  return adaptersWith(adaptersOverride).getDefaultWorkingDirectory?.()
}

export function expandOnethingToolSandboxPath(dir: string): string {
  return expandCorePath(dir)
}

export function resolveOnethingToolPath(
  filePath: string,
  workingDirectory?: string,
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string {
  return resolveCoreToolPath(filePath, {
    workingDirectory,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
  })
}

export function isOnethingToolPathContained(boundary: string, targetPath: string): boolean {
  return isCorePathContained(boundary, targetPath)
}

export function getOnethingToolSandboxBoundary(
  workingDirectory?: string,
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string {
  return getCoreSandboxBoundary({
    workingDirectory,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
  })
}

export function getOnethingToolSandboxRoots(
  workingDirectory?: string,
  workingDirectoryRoots?: string[],
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string[] {
  return getCoreSandboxRoots({
    workingDirectory,
    workingDirectoryRoots,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
  })
}

export function getOnethingDownloadsDirectory(
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string {
  const adapters = adaptersWith(adaptersOverride)
  try {
    const downloads = adapters.getHostPath?.('downloads')
    if (typeof downloads === 'string' && downloads.trim()) return downloads
  } catch {
    // Fall back to the conventional per-user Downloads directory below.
  }
  return path.join(adapters.homeDir ?? os.homedir(), 'Downloads')
}

export function getOnethingDefaultReadRoots(
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string[] {
  const adapters = adaptersWith(adaptersOverride)
  const noteDirectories = (adapters.getNoteDirectories?.() ?? [])
    .filter((dir): dir is string => typeof dir === 'string')
  const artifactDirectories = (adapters.getAppArtifactDirectories?.() ?? [])
    .filter((dir): dir is string => typeof dir === 'string')
  return uniqueCorePaths([
    ...noteDirectories,
    ...artifactDirectories,
    getOnethingDownloadsDirectory(adapters),
  ])
}

export function getOnethingReadSandboxRoots(
  workingDirectory?: string,
  workingDirectoryRoots?: string[],
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string[] {
  return getCoreReadSandboxRoots({
    workingDirectory,
    workingDirectoryRoots,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
    defaultReadRoots: getOnethingDefaultReadRoots(adaptersOverride),
  })
}

export function findOnethingSandboxRootForPath(
  targetPath: string,
  workingDirectory?: string,
  workingDirectoryRoots?: string[],
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string | undefined {
  return findCoreSandboxRootForPath(targetPath, {
    workingDirectory,
    workingDirectoryRoots,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
  })
}

export function findOnethingReadSandboxRootForPath(
  targetPath: string,
  workingDirectory?: string,
  workingDirectoryRoots?: string[],
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): string | undefined {
  return findCoreReadSandboxRootForPath(targetPath, {
    workingDirectory,
    workingDirectoryRoots,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
    defaultReadRoots: getOnethingDefaultReadRoots(adaptersOverride),
  })
}

export async function checkOnethingFileAccess(
  filePath: string,
  ctx: CoreFileAccessContext,
  operation: string,
  targetType: CoreFileAccessTargetType = 'file',
  adaptersOverride: OnethingToolSandboxRuntimeAdapters = {},
): Promise<string> {
  return checkCoreFileAccess(filePath, ctx, operation, {
    targetType,
    defaultWorkingDirectory: getOnethingConfiguredDefaultWorkingDirectory(adaptersOverride),
  })
}
