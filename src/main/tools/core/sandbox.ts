/**
 * Sandbox Utilities
 *
 * Provides shared boundary checking for file operations.
 * Uses the session's active workingDirectory for relative paths, plus
 * optional additional workingDirectoryRoots as sandbox roots.
 */

import * as path from 'path'
import * as os from 'os'
import { Permission } from '../../permission/index.js'
import { getSettings } from '../../stores/settings.js'

/**
 * Expand ~ to home directory
 */
export function expandPath(dir: string): string {
  if (dir.startsWith('~')) {
    return dir.replace('~', os.homedir())
  }
  return dir
}

/**
 * Resolve a tool path consistently against the sandbox boundary.
 */
export function resolveToolPath(filePath: string, workingDirectory?: string): string {
  const expandedPath = expandPath(filePath)
  return path.isAbsolute(expandedPath)
    ? expandedPath
    : path.resolve(getSandboxBoundary(workingDirectory), expandedPath)
}

/**
 * Check if a path is contained within a boundary directory
 */
export function isPathContained(boundary: string, targetPath: string): boolean {
  const resolvedBoundary = path.resolve(boundary)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget === resolvedBoundary || resolvedTarget.startsWith(resolvedBoundary + path.sep)
}

/**
 * Get the sandbox boundary directory
 * Priority: workingDirectory > settings.defaultWorkingDirectory > process.cwd()
 *
 * Note: workingDirectory is expected to be already expanded (by getSession/getWorkspace).
 * Only settings.defaultWorkingDirectory needs expansion here.
 */
export function getSandboxBoundary(workingDirectory?: string): string {
  if (workingDirectory) {
    return workingDirectory
  }

  const settings = getSettings()
  const bashSettings = settings.tools?.bash

  if (bashSettings?.defaultWorkingDirectory) {
    return expandPath(bashSettings.defaultWorkingDirectory)
  }

  return process.cwd()
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of paths) {
    if (!item) continue
    const resolved = path.resolve(expandPath(item))
    if (seen.has(resolved)) continue
    seen.add(resolved)
    output.push(resolved)
  }
  return output
}

export function getSandboxRoots(workingDirectory?: string, workingDirectoryRoots?: string[]): string[] {
  return uniquePaths([
    getSandboxBoundary(workingDirectory),
    ...(workingDirectoryRoots ?? []),
  ])
}

export function findSandboxRootForPath(
  targetPath: string,
  workingDirectory?: string,
  workingDirectoryRoots?: string[],
): string | undefined {
  const expandedTarget = expandPath(targetPath)
  const absoluteTarget = path.isAbsolute(expandedTarget)
    ? expandedTarget
    : path.resolve(getSandboxBoundary(workingDirectory), expandedTarget)
  return getSandboxRoots(workingDirectory, workingDirectoryRoots)
    .find(root => isPathContained(root, absoluteTarget))
}

/**
 * Check file path access and request permission if outside boundary
 *
 * @param filePath - The file path to check
 * @param ctx - Tool context with sessionId, messageId, toolCallId, workingDirectory
 * @param operation - Description of the operation for permission dialog
 * @returns Resolved absolute path
 */
export async function checkFileAccess(
  filePath: string,
  ctx: {
    sessionId: string
    messageId: string
    toolCallId?: string
    workingDirectory?: string
    workingDirectoryRoots?: string[]
  },
  operation: string,
  targetType: 'file' | 'directory' = 'file',
): Promise<string> {
  // Ensure absolute path
  const absolutePath = resolveToolPath(filePath, ctx.workingDirectory)

  // Get sandbox roots
  const boundary = getSandboxBoundary(ctx.workingDirectory)
  const matchingRoot = findSandboxRootForPath(
    absolutePath,
    ctx.workingDirectory,
    ctx.workingDirectoryRoots,
  )

  // Check if path is within any allowed root
  if (!matchingRoot) {
    const pattern = targetType === 'directory'
      ? [absolutePath, path.join(absolutePath, '*')]
      : path.join(path.dirname(absolutePath), '*')

    // Request permission for external access
    await Permission.ask({
      type: 'external_directory',
      pattern,
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      callId: ctx.toolCallId,
      title: `${operation}: ${path.basename(absolutePath)}`,
      workingDirectory: boundary,
      metadata: {
        filePath: absolutePath,
        boundary,
        operation,
        targetType,
      },
    })
  }

  return absolutePath
}
