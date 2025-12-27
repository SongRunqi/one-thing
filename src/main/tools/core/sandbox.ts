/**
 * Sandbox Utilities
 *
 * Provides shared boundary checking for file operations.
 * Uses OpenCode's simple boundary model: session.workingDirectory as single boundary.
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
  },
  operation: string
): Promise<string> {
  // Ensure absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(getSandboxBoundary(ctx.workingDirectory), filePath)

  // Get sandbox boundary
  const boundary = getSandboxBoundary(ctx.workingDirectory)

  // Check if path is within boundary
  if (!isPathContained(boundary, absolutePath)) {
    // Request permission for external access
    await Permission.ask({
      type: 'external_directory',
      pattern: [path.dirname(absolutePath), absolutePath],
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      callId: ctx.toolCallId,
      title: `${operation}: ${path.basename(absolutePath)}`,
      metadata: {
        filePath: absolutePath,
        boundary,
        operation,
      },
    })
  }

  return absolutePath
}
