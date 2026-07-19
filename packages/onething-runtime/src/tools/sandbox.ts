import * as os from 'os'
import * as path from 'path'

export type CoreFileAccessTargetType = 'file' | 'directory'

export interface CoreSandboxBoundaryOptions {
  workingDirectory?: string
  defaultWorkingDirectory?: string
  cwd?: string
}

export interface CoreSandboxRootsOptions extends CoreSandboxBoundaryOptions {
  workingDirectoryRoots?: string[]
}

export interface CoreReadSandboxRootsOptions extends CoreSandboxRootsOptions {
  defaultReadRoots?: string[]
}

export interface CoreFileAccessContext {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
}

export interface CoreFileAccessOptions extends CoreSandboxBoundaryOptions {
  targetType?: CoreFileAccessTargetType
}

export function expandCorePath(dir: string): string {
  // Only a bare '~' or a '~/' prefix is a home reference. '~foo' is a literal
  // (or another user's home, which is not ours to guess) and must stay as-is.
  if (dir === '~') {
    return os.homedir()
  }
  if (dir.startsWith('~/')) {
    return path.join(os.homedir(), dir.slice(2))
  }
  return dir
}

export function getCoreSandboxBoundary(options: CoreSandboxBoundaryOptions = {}): string {
  if (options.workingDirectory) {
    return options.workingDirectory
  }

  if (options.defaultWorkingDirectory) {
    return expandCorePath(options.defaultWorkingDirectory)
  }

  return options.cwd ?? process.cwd()
}

export function resolveCoreToolPath(
  filePath: string,
  options: CoreSandboxBoundaryOptions = {},
): string {
  const expandedPath = expandCorePath(filePath)
  // Both branches normalize, so '/a/./b', '/a/b/' and '/a/b' resolve to one
  // canonical string — callers key caches (read tracking, mutation queues) off
  // this path and must not see the same file under two names.
  return path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(getCoreSandboxBoundary(options), expandedPath)
}

export function isCorePathContained(boundary: string, targetPath: string): boolean {
  const resolvedBoundary = path.resolve(boundary)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget === resolvedBoundary || resolvedTarget.startsWith(resolvedBoundary + path.sep)
}

export function uniqueCorePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of paths) {
    if (!item) continue
    const resolved = path.resolve(expandCorePath(item))
    if (seen.has(resolved)) continue
    seen.add(resolved)
    output.push(resolved)
  }
  return output
}

export function getCoreSandboxRoots(options: CoreSandboxRootsOptions = {}): string[] {
  return uniqueCorePaths([
    getCoreSandboxBoundary(options),
    ...(options.workingDirectoryRoots ?? []),
  ])
}

export function getCoreReadSandboxRoots(options: CoreReadSandboxRootsOptions = {}): string[] {
  return uniqueCorePaths([
    ...getCoreSandboxRoots(options),
    ...(options.defaultReadRoots ?? []),
  ])
}

export function findCoreSandboxRootForPath(
  targetPath: string,
  options: CoreSandboxRootsOptions = {},
): string | undefined {
  const absoluteTarget = resolveCoreToolPath(targetPath, options)
  return getCoreSandboxRoots(options)
    .find(root => isCorePathContained(root, absoluteTarget))
}

export function findCoreReadSandboxRootForPath(
  targetPath: string,
  options: CoreReadSandboxRootsOptions = {},
): string | undefined {
  const absoluteTarget = resolveCoreToolPath(targetPath, options)
  return getCoreReadSandboxRoots(options)
    .find(root => isCorePathContained(root, absoluteTarget))
}

export async function checkCoreFileAccess(
  filePath: string,
  ctx: CoreFileAccessContext,
  operation: string,
  options: CoreFileAccessOptions = {},
): Promise<string> {
  void operation
  void options.targetType

  return resolveCoreToolPath(filePath, {
    workingDirectory: ctx.workingDirectory,
    defaultWorkingDirectory: options.defaultWorkingDirectory,
    cwd: options.cwd,
  })
}
