/**
 * Built-in Tool: Bash
 *
 * Execute bash commands with:
 * - Lightweight command parsing for permission checks
 * - Central PermissionPolicy integration via analyze()
 * - Command classification (read-only, dangerous, forbidden)
 * - Directory sandbox restrictions
 *
 * Inspired by OpenCode's bash tool implementation.
 */

import { z } from 'zod'
import * as path from 'path'
import * as os from 'os'
import { Tool } from '../core/tool.js'
import { classifyBashCommand, classifyCommand, parseCommand, splitShellWords } from '../core/bash-classifier.js'
import {
  DEFAULT_OUTPUT_MAX_BYTES,
  DEFAULT_OUTPUT_MAX_LINES,
  OutputAccumulator,
} from '../core/output-accumulator.js'
import { getSettings } from '../../stores/settings.js'
import { getToolOutputsDir } from '../../stores/paths.js'
import { createLocalBashOperations } from '../core/bash-executor.js'

// Maximum output length
const MAX_OUTPUT_LENGTH = DEFAULT_OUTPUT_MAX_BYTES
const MAX_OUTPUT_DISPLAY = `${Math.round(DEFAULT_OUTPUT_MAX_BYTES / 1000)}KB`
// Default timeout
const DEFAULT_TIMEOUT = 2 * 60 * 1000
const BASH_UPDATE_THROTTLE_MS = 100

/**
 * Bash Tool Metadata
 */
export interface BashMetadata {
  command: string
  workingDirectory: string
  exitCode: number
  output: string
  outputFilePath?: string
  description?: string
  [key: string]: unknown
}

/**
 * Bash Tool Parameters Schema
 */
const BashParameters = z.object({
  command: z
    .string()
    .min(1)
    .describe('The bash command to execute. It runs in the session work directory.'),
  timeout: z
    .number()
    .optional()
    .describe('Command timeout in milliseconds (default: 120000)'),
})

/**
 * Expand ~ to home directory
 */
function expandPath(dir: string): string {
  if (dir.startsWith('~')) {
    return dir.replace('~', os.homedir())
  }
  return dir
}

/**
 * Check if a path is contained within a boundary directory
 * Uses OpenCode's simple boundary model
 */
function isPathContained(boundary: string, targetPath: string): boolean {
  const resolvedBoundary = path.resolve(boundary)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget === resolvedBoundary || resolvedTarget.startsWith(resolvedBoundary + path.sep)
}

/**
 * Get the sandbox boundary directory
 * Priority: ctx.workingDirectory > settings.defaultWorkingDirectory > process.cwd()
 *
 * Note: ctxWorkingDirectory is expected to be already expanded (by getSession).
 * Only settings.defaultWorkingDirectory needs expansion here.
 */
function getSandboxBoundary(ctxWorkingDirectory?: string): string {
  if (ctxWorkingDirectory) {
    return ctxWorkingDirectory
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

function getSandboxRoots(ctxWorkingDirectory?: string, ctxWorkingDirectoryRoots?: string[]): string[] {
  return uniquePaths([
    getSandboxBoundary(ctxWorkingDirectory),
    ...(ctxWorkingDirectoryRoots ?? []),
  ])
}

function findSandboxRoot(sandboxRoots: string[], targetPath: string): string | undefined {
  return sandboxRoots.find(root => isPathContained(root, targetPath))
}

const COMMAND_SEPARATORS = new Set(['&&', '||', ';', '|', '&'])

function resolveCommandDirectory(input: string, baseDir: string): string {
  const expanded = expandPath(input)
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(baseDir, expanded)
}

function extractCdDirectories(command: string, initialWorkingDir: string): string[] {
  const words = splitShellWords(command)
  const dirs: string[] = []
  let cursor = initialWorkingDir

  for (let i = 0; i < words.length; i++) {
    if (words[i] !== 'cd') continue
    const target = words[i + 1]
    if (!target || target.startsWith('-') || COMMAND_SEPARATORS.has(target)) continue
    const resolved = resolveCommandDirectory(target, cursor)
    dirs.push(resolved)
    cursor = resolved
  }

  return Array.from(new Set(dirs))
}

function formatTruncatedOutput(snapshot: ReturnType<OutputAccumulator['snapshot']>, emptyText = '(no output)'): string {
  let text = snapshot.content || emptyText
  const truncation = snapshot.truncation
  if (truncation.truncated) {
    const by = truncation.truncatedBy === 'lines'
      ? `showing last ${truncation.outputLines} of ${truncation.totalLines} lines`
      : `showing last ${truncation.outputBytes} of ${truncation.totalBytes} bytes`
    text += `\n\n<bash_metadata>\nOutput truncated (${by}).\n${snapshot.fullOutputPath ? `Full output saved to: ${snapshot.fullOutputPath}\n` : ''}</bash_metadata>`
  }
  return text
}

/**
 * Bash Tool Definition
 */
export const BashTool = Tool.define<typeof BashParameters, BashMetadata>('bash', {
  name: 'Bash',
  description: `Execute a bash command in the session work directory. Returns stdout and stderr. Output is truncated to the last ${DEFAULT_OUTPUT_MAX_LINES} lines or ${MAX_OUTPUT_DISPLAY} (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in milliseconds.

To change the work directory for bash and file tools, use variable { action: "set", name: "workdir", value: <directory> } before calling bash.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Central PermissionPolicy handles auto-execute/ask decisions
  permissionGuard: 'internal-check',
  executionMode: 'sequential',
  renderKind: 'bash',

  parameters: BashParameters,

  async analyze(args, ctx) {
    const { command } = args
    const sandboxBoundary = getSandboxBoundary(ctx.workingDirectory)
    const sandboxRoots = getSandboxRoots(ctx.workingDirectory, ctx.workingDirectoryRoots)
    const workingDir = sandboxBoundary
    const matchedRoot = findSandboxRoot(sandboxRoots, workingDir)
    const permissionRoot = matchedRoot ?? sandboxBoundary
    const commandClassification = classifyBashCommand(command)
    const cdDirectories = extractCdDirectories(command, workingDir)
    const externalCdDirectories = cdDirectories.filter(dir => !findSandboxRoot(sandboxRoots, dir))
    const effects = []

    if (!matchedRoot) {
      effects.push({
        kind: 'external_directory' as const,
        resources: [workingDir, path.join(workingDir, '*')],
        barrier: true,
        external: true,
        metadata: {
          command,
          directory: workingDir,
          boundary: sandboxBoundary,
        },
      })
    }

    if (externalCdDirectories.length > 0) {
      effects.push({
        kind: 'external_directory' as const,
        resources: externalCdDirectories.flatMap(dir => [dir, path.join(dir, '*')]),
        barrier: true,
        external: true,
        metadata: {
          command,
          directories: externalCdDirectories,
          boundary: sandboxBoundary,
          reason: 'Command changes directory outside the current work directory list',
        },
      })
    }

    if (commandClassification.decision === 'deny') {
      effects.push({
        kind: 'bash' as const,
        resources: commandClassification.patterns.length > 0 ? commandClassification.patterns : ['*'],
        barrier: true,
        metadata: {
          command,
          patterns: commandClassification.patterns,
          reason: commandClassification.reason,
          commands: commandClassification.commands,
          hardDeny: true,
        },
      })
    } else if (commandClassification.decision === 'ask') {
      const patterns = commandClassification.patterns.length > 0
        ? commandClassification.patterns
        : ['*']
      effects.push({
        kind: 'bash' as const,
        resources: patterns,
        barrier: true,
        metadata: {
          command,
          patterns,
          reason: commandClassification.reason,
          commands: commandClassification.commands,
          workingDirectory: permissionRoot,
        },
      })
    }

    return {
      effects,
      preview: {
        title: command,
        metadata: {
          command,
          workingDirectory: workingDir,
          classification: commandClassification.decision,
          reason: commandClassification.reason,
        },
      },
    }
  },

  async execute(args, ctx) {
    const { command, timeout } = args

    // Get sandbox boundary from session's workingDirectory (getSandboxBoundary expands ~)
    const sandboxBoundary = getSandboxBoundary(ctx.workingDirectory)

    // Bash always runs in the backend-provided session work directory.
    const workingDir = sandboxBoundary
    // Classify the command. This uses a lightweight multi-command parser now;
    // the API is ready to swap in tree-sitter-bash later.
    const commandClassification = classifyBashCommand(command)
    const commandAction = commandClassification.decision

    // Update metadata with initial state
    ctx.metadata({
      title: command,
      metadata: {
        command,
        workingDirectory: workingDir,
        exitCode: -1,
        output: '',
      },
    })

    // Reject forbidden commands
    if (commandAction === 'deny') {
      const deniedCommand = commandClassification.commands.find(item => item.decision === 'deny')
      const head = deniedCommand?.head || parseCommand(command).head
      throw new Error(commandClassification.reason || `Command "${head}" is forbidden for security reasons`)
    }

    // Central PermissionPolicy owns external-directory and dangerous-command asks.

    // Check if already aborted before starting
    if (ctx.abortSignal?.aborted) {
      throw new Error('Command execution aborted')
    }

    await ctx.beforeSideEffect?.()

    const output = new OutputAccumulator({
      maxBytes: MAX_OUTPUT_LENGTH,
      tempDir: getToolOutputsDir(),
      tempFilePrefix: 'bash',
    })

    let updateTimer: NodeJS.Timeout | undefined
    let updateDirty = false
    let lastUpdateAt = 0

    const emitOutputUpdate = () => {
      if (!updateDirty) return
      updateDirty = false
      lastUpdateAt = Date.now()
      const snapshot = output.snapshot({ persistIfTruncated: true })
      ctx.updateResult?.({
        content: [{ type: 'text', text: formatTruncatedOutput(snapshot, '') }],
        details: {
          truncation: snapshot.truncation.truncated ? snapshot.truncation : undefined,
          ...(snapshot.fullOutputPath && { fullOutputPath: snapshot.fullOutputPath, outputFilePath: snapshot.fullOutputPath }),
        },
      })
    }

    const clearUpdateTimer = () => {
      if (updateTimer) {
        clearTimeout(updateTimer)
        updateTimer = undefined
      }
    }

    const scheduleOutputUpdate = () => {
      updateDirty = true
      const delay = BASH_UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt)
      if (delay <= 0) {
        clearUpdateTimer()
        emitOutputUpdate()
        return
      }
      updateTimer ??= setTimeout(() => {
        updateTimer = undefined
        emitOutputUpdate()
      }, delay)
    }

    const append = (data: Buffer) => {
      output.append(data)
      scheduleOutputUpdate()
    }

    ctx.updateResult?.({ content: [], details: undefined })

    const ops = createLocalBashOperations({
      shellPath: (getSettings().tools?.bash as any)?.shellPath,
    })

    let aborted = false
    let timedOut = false
    let result: { exitCode: number | null; backgroundJobIds?: string[] }
    try {
      result = await ops.exec(command, workingDir, {
        onData: append,
        signal: ctx.abortSignal,
        timeout: timeout || DEFAULT_TIMEOUT,
      })
    } catch (error: any) {
      if (error instanceof Error && error.message === 'aborted') {
        aborted = true
        result = { exitCode: null }
      } else if (error instanceof Error && error.message.startsWith('timeout:')) {
        timedOut = true
        result = { exitCode: null }
      } else {
        throw error
      }
    } finally {
      clearUpdateTimer()
      emitOutputUpdate()
    }

    output.finish()
    const finalSnapshot = output.snapshot({ persistIfTruncated: true })
    await output.closeTempFile()

    let finalOutput = formatTruncatedOutput(finalSnapshot)
    const outputFilePath = finalSnapshot.fullOutputPath

    if (timedOut) {
      finalOutput += `\n\n<bash_metadata>\nCommand timed out after ${timeout || DEFAULT_TIMEOUT} ms\n</bash_metadata>`
    }

    if (aborted) {
      throw new Error(`${finalOutput}\n\nCommand execution was cancelled by user`)
    }

    if (result.exitCode !== null && result.exitCode !== 0) {
      finalOutput += `\n\n<bash_metadata>\nExit code: ${result.exitCode}\n</bash_metadata>`
    }

    const exitCode = result.exitCode ?? (timedOut || aborted ? -1 : 0)
    const metadata: BashMetadata = {
      command,
      workingDirectory: workingDir,
      exitCode,
      output: finalOutput,
      ...(outputFilePath && { outputFilePath }),
      ...(result.backgroundJobIds?.length && { backgroundJobIds: result.backgroundJobIds }),
    }

    if (result.backgroundJobIds?.length) {
      finalOutput += `\n\n<bash_metadata>\nBackground job(s): ${result.backgroundJobIds.join(', ')}\n</bash_metadata>`
      metadata.output = finalOutput
    }

    return {
      title: exitCode === 0
        ? command
        : `Failed (exit ${exitCode}): ${command}`,
      output: finalOutput,
      metadata,
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid bash parameters:\n${issues.join('\n')}`
  },
})

// Export command classification for external use
export { classifyCommand, parseCommand }
