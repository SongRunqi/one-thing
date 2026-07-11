/**
 * Built-in Tool: Bash
 *
 * Execute bash commands with:
 * - Lightweight command parsing for permission checks
 * - Central PermissionPolicy integration via analyze()
 * - Command classification (read-only, dangerous, forbidden)
 * - Directory sandbox restrictions
 */

import { z } from 'zod'
import { toJsonObject } from '@onething/core'
import {
  isAbsolutePath,
  joinPaths,
  resolvePath,
} from '@onething/core/storage'
import { Tool } from '../tool.js'
import type { BashOperations } from '../bash-executor.js'
import {
  expandCorePath,
  getCoreSandboxBoundary,
  getCoreSandboxRoots,
  isCorePathContained,
} from '../sandbox.js'
import {
  classifyBashCommand,
  classifyCommand,
  parseCommand,
  splitShellWords,
} from '../bash-classifier.js'
import {
  DEFAULT_OUTPUT_MAX_BYTES,
  DEFAULT_OUTPUT_MAX_LINES,
  OutputAccumulator,
} from '../output-accumulator.js'
import { readBackgroundJobOutput } from '../background-jobs.js'

const MAX_OUTPUT_LENGTH = DEFAULT_OUTPUT_MAX_BYTES
const MAX_OUTPUT_DISPLAY = `${Math.round(DEFAULT_OUTPUT_MAX_BYTES / 1000)}KB`
const DEFAULT_TIMEOUT = 2 * 60 * 1000
const BASH_UPDATE_THROTTLE_MS = 100

export interface BashOperationsOptions {
  shellPath?: string
  /** Owning session for background jobs registered by this call. */
  sessionId?: string
}

export interface BashToolAdapters {
  getDefaultWorkingDirectory?(): string | undefined
  getToolOutputsDir(): string
  getShellPath?(): string | undefined
  createOperations(options: BashOperationsOptions): BashOperations
}

export interface BashMetadata {
  command: string
  workingDirectory: string
  exitCode: number
  output: string
  outputFilePath?: string
  description?: string
  backgroundJobIds?: string[]
}

export const BashParameters = z.object({
  command: z
    .string()
    .min(1)
    .describe('The bash command to execute. It runs in the session work directory.'),
  timeout: z
    .number()
    .optional()
    .describe('Command timeout in milliseconds (default: 120000)'),
  run_in_background: z
    .boolean()
    .optional()
    .describe('Run the command as a managed background job and return immediately with a job id. Use for long-running services (dev servers, watchers). Read new output later with bash_output; stop it with kill_bash. Do NOT use for commands that finish on their own.'),
})

function findSandboxRoot(sandboxRoots: string[], targetPath: string): string | undefined {
  return sandboxRoots.find(root => isCorePathContained(root, targetPath))
}

const COMMAND_SEPARATORS = new Set(['&&', '||', ';', '|', '&'])

function resolveCommandDirectory(input: string, baseDir: string): string {
  const expanded = expandCorePath(input)
  return isAbsolutePath(expanded) ? resolvePath(expanded) : resolvePath(baseDir, expanded)
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

function formatTruncatedOutput(
  snapshot: ReturnType<OutputAccumulator['snapshot']>,
  emptyText = '(no output)',
): string {
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

export function createBashTool(adapters: BashToolAdapters): Tool.Info<typeof BashParameters, BashMetadata> {
  return Tool.define<typeof BashParameters, BashMetadata>('bash', {
    name: 'Bash',
    description: `Execute a bash command in the session work directory. Returns stdout and stderr. Output is truncated to the last ${DEFAULT_OUTPUT_MAX_LINES} lines or ${MAX_OUTPUT_DISPLAY} (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in milliseconds.

For long-running services (dev servers, watchers), set run_in_background: true — the command is launched as a managed background job and this call returns immediately with a job id plus initial output. Read new output later with the bash_output tool; stop the job with kill_bash.

To change the work directory for bash and file tools, use variable { action: "set", name: "workdir", value: <directory> } before calling bash.`,
    category: 'builtin',
    enabled: true,
    autoExecute: false,
    permissionGuard: 'internal-check',
    executionMode: 'sequential',
    renderKind: 'bash',

    parameters: BashParameters,

    async analyze(args, ctx) {
      const { command } = args
      const defaultWorkingDirectory = adapters.getDefaultWorkingDirectory?.()
      const sandboxBoundary = getCoreSandboxBoundary({
        workingDirectory: ctx.workingDirectory,
        defaultWorkingDirectory,
      })
      const sandboxRoots = getCoreSandboxRoots({
        workingDirectory: ctx.workingDirectory,
        workingDirectoryRoots: ctx.workingDirectoryRoots,
        defaultWorkingDirectory,
      })
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
          resources: [workingDir, joinPaths(workingDir, '*')],
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
          resources: externalCdDirectories.flatMap(dir => [dir, joinPaths(dir, '*')]),
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
      const sandboxBoundary = getCoreSandboxBoundary({
        workingDirectory: ctx.workingDirectory,
        defaultWorkingDirectory: adapters.getDefaultWorkingDirectory?.(),
      })
      const workingDir = sandboxBoundary
      const commandClassification = classifyBashCommand(command)
      const commandAction = commandClassification.decision

      ctx.metadata({
        title: command,
        metadata: {
          command,
          workingDirectory: workingDir,
          exitCode: -1,
          output: '',
        },
      })

      if (commandAction === 'deny') {
        const deniedCommand = commandClassification.commands.find(item => item.decision === 'deny')
        const head = deniedCommand?.head || parseCommand(command).head
        throw new Error(commandClassification.reason || `Command "${head}" is forbidden for security reasons`)
      }

      if (ctx.abortSignal?.aborted) {
        throw new Error('Command execution aborted')
      }

      await ctx.beforeSideEffect?.()

      const output = new OutputAccumulator({
        maxBytes: MAX_OUTPUT_LENGTH,
        tempDir: adapters.getToolOutputsDir(),
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
          details: toJsonObject({
            truncation: snapshot.truncation.truncated ? snapshot.truncation : undefined,
            ...(snapshot.fullOutputPath && {
              fullOutputPath: snapshot.fullOutputPath,
              outputFilePath: snapshot.fullOutputPath,
            }),
          }),
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

      const ops = adapters.createOperations({
        shellPath: adapters.getShellPath?.(),
        sessionId: ctx.sessionId,
      })

      if (args.run_in_background) {
        if (!ops.execBackground) {
          throw new Error('Background execution is not supported in this environment')
        }
        const launch = await ops.execBackground(command, workingDir)

        // Give the process a moment to produce startup output or fail fast.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1500)
          ctx.abortSignal?.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve()
          }, { once: true })
        })

        const read = readBackgroundJobOutput(launch.jobId, { fromStart: true })
        const job = read?.job
        const ports = job?.ports?.length ? ` Listening on port(s): ${job.ports.join(', ')}.` : ''
        const startupOutput = read?.output.trim()

        let backgroundOutput = `Started background job ${launch.jobId} (${job?.status ?? 'unknown'}).${ports}`
        if (startupOutput) {
          backgroundOutput += `\n\n${startupOutput}`
        }
        backgroundOutput += `\n\n<bash_metadata>\nBackground job: ${launch.jobId}. Use bash_output to read new output, kill_bash to stop it.\nLog file: ${launch.logPath}\n</bash_metadata>`

        return {
          title: `${command} (background ${launch.jobId})`,
          output: backgroundOutput,
          metadata: {
            command,
            workingDirectory: workingDir,
            exitCode: 0,
            output: backgroundOutput,
            backgroundJobIds: [launch.jobId],
          },
        }
      }

      let aborted = false
      let timedOut = false
      let result: { exitCode: number | null; backgroundJobIds?: string[] }
      try {
        result = await ops.exec(command, workingDir, {
          onData: append,
          signal: ctx.abortSignal,
          timeout: timeout || DEFAULT_TIMEOUT,
        })
      } catch (error) {
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
}

export { classifyCommand, parseCommand }
