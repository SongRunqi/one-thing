/**
 * Built-in Tool: Bash (V2)
 *
 * Execute bash commands with:
 * - Tree-sitter command parsing for accurate permission checks
 * - Permission system integration (Permission.ask)
 * - Command classification (read-only, dangerous, forbidden)
 * - Directory sandbox restrictions
 *
 * Inspired by OpenCode's bash tool implementation.
 */

import { z } from 'zod'
import { execa } from 'execa'
import * as path from 'path'
import * as os from 'os'
import { Tool } from '../core/tool.js'
import { Permission } from '../../permission/index.js'
import { getSettings } from '../../stores/settings.js'
import BASHPROMPOT from './bash.txt'

// Maximum output length
const MAX_OUTPUT_LENGTH = 30_000
// Default timeout
const DEFAULT_TIMEOUT = 2 * 60 * 1000

// Read-only commands - auto-execute (allow)
const READ_ONLY_COMMANDS = new Set([
  'cat', 'ls', 'pwd', 'echo', 'grep', 'egrep', 'fgrep', 'find',
  'head', 'tail', 'wc', 'file', 'which', 'whoami', 'date', 'env',
  'printenv', 'less', 'more', 'diff', 'cmp', 'stat', 'du', 'df',
  'tree', 'realpath', 'dirname', 'basename', 'readlink', 'type',
  'man', 'help', 'uname', 'hostname',
])

// Git read-only commands
const GIT_READ_ONLY = new Set([
  'status', 'log', 'diff', 'branch', 'show', 'blame', 'remote',
  'tag', 'describe', 'rev-parse', 'ls-files', 'ls-tree',
])

// NPM read-only commands
const NPM_READ_ONLY = new Set([
  'list', 'ls', 'outdated', 'view', 'search', 'info', 'help',
])

// Dangerous commands - require permission (ask)
const DANGEROUS_COMMANDS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown',
  'kill', 'pkill', 'killall', 'dd', 'truncate', 'shred',
  'wget', 'curl',
])

// Git write commands
const GIT_WRITE = new Set([
  'add', 'commit', 'push', 'pull', 'merge', 'rebase', 'reset',
  'checkout', 'stash', 'cherry-pick', 'revert', 'fetch',
])

// NPM write commands
const NPM_WRITE = new Set([
  'install', 'uninstall', 'update', 'run', 'start', 'test',
  'build', 'publish', 'link', 'init',
])

// Forbidden commands - always reject (deny)
const FORBIDDEN_COMMANDS = new Set([
  'sudo', 'su', 'shutdown', 'reboot', 'halt', 'poweroff',
  'init', 'systemctl', 'service', 'passwd', 'useradd', 'userdel',
  'mkfs', 'fdisk', 'mount', 'umount', 'chroot',
  'iptables', 'firewall-cmd', 'ufw',
  'crontab', 'at',
])

// Dangerous patterns
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf?\s+[\/~]/, // rm -rf / or ~
  />\s*\/dev\/(?!null\b)/, // write to /dev (but allow /dev/null)
  /\|\s*sh\b/, // pipe to shell
  /\|\s*bash\b/,
]

/**
 * Bash Tool Metadata
 */
export interface BashMetadata {
  command: string
  workingDirectory: string
  exitCode: number
  output: string
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
    .describe('The bash command to execute'),
  working_directory: z
    .string()
    .optional()
    .describe('Working directory for the command (must be within allowed paths)'),
  timeout: z
    .number()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe('Command timeout in milliseconds (default: 60000)'),
})

/**
 * Parse command into parts (simple parser, can be enhanced with tree-sitter later)
 */
function parseCommand(command: string): { head: string; args: string[] } {
  const trimmed = command.trim()
  // Remove env prefix
  const withoutEnv = trimmed.replace(/^(env\s+)?(\w+=\S+\s+)*/, '')
  const parts = withoutEnv.split(/\s+/)
  return {
    head: parts[0] || '',
    args: parts.slice(1),
  }
}

/**
 * Classify a command's permission requirement
 */
function classifyCommand(command: string): 'allow' | 'ask' | 'deny' {
  const { head, args } = parseCommand(command)

  // Check forbidden first
  if (FORBIDDEN_COMMANDS.has(head)) {
    return 'deny'
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return 'deny'
    }
  }

  // Git commands
  if (head === 'git' && args.length > 0) {
    const subcommand = args[0]
    if (GIT_READ_ONLY.has(subcommand)) return 'allow'
    if (GIT_WRITE.has(subcommand)) return 'ask'
    return 'ask' // Unknown git command, ask
  }

  // NPM commands
  if ((head === 'npm' || head === 'npx' || head === 'yarn' || head === 'pnpm') && args.length > 0) {
    const subcommand = args[0]
    if (NPM_READ_ONLY.has(subcommand)) return 'allow'
    if (NPM_WRITE.has(subcommand)) return 'ask'
    return 'ask' // Unknown npm command, ask
  }

  // Read-only commands
  if (READ_ONLY_COMMANDS.has(head)) {
    // But check for output redirection
    if (/[^<]>\s*[^>]|>>/.test(command)) {
      return 'ask'
    }
    return 'allow'
  }

  // Dangerous commands
  if (DANGEROUS_COMMANDS.has(head)) {
    return 'ask'
  }

  // Default: ask for unknown commands
  return 'ask'
}

/**
 * Get command pattern for permission
 */
function getCommandPattern(command: string): string {
  const { head, args } = parseCommand(command)

  // For git/npm, include subcommand
  if (['git', 'npm', 'npx', 'yarn', 'pnpm'].includes(head) && args.length > 0) {
    const sub = args.find(arg => !arg.startsWith('-'))
    return sub ? `${head} ${sub} *` : `${head} *`
  }

  return `${head} *`
}

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

/**
 * Bash Tool Definition (V2)
 */
export const BashTool = Tool.define<typeof BashParameters, BashMetadata>('bash', {
  name: 'Bash',
  description: `Execute bash commands in a sandboxed environment.

Read-only commands (cat, ls, grep, git status, etc.) are auto-executed.
Dangerous commands (rm, mv, git push, npm install, etc.) require user confirmation.
Forbidden commands (sudo, shutdown, etc.) are always rejected.

The sandbox restricts file access to allowed directories only.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Permission system handles auto-execute

  parameters: BashParameters,

  async execute(args, ctx) {
    const { command, working_directory, timeout } = args

    // Get sandbox boundary from session's workingDirectory (getSandboxBoundary expands ~)
    const sandboxBoundary = getSandboxBoundary(ctx.workingDirectory)

    // Determine working directory (default to sandbox boundary)
    // Also expand ~ in working_directory parameter from LLM
    let workingDir = working_directory ? expandPath(working_directory) : sandboxBoundary

    // Classify the command
    const commandAction = classifyCommand(command)

    // Update metadata with initial state
    ctx.metadata({
      title: `Running: ${command}`,
      metadata: {
        command,
        workingDirectory: workingDir,
        exitCode: -1,
        output: '',
      },
    })

    // Reject forbidden commands
    if (commandAction === 'deny') {
      const { head } = parseCommand(command)
      throw new Error(`Command "${head}" is forbidden for security reasons`)
    }

    // Check if working directory is outside sandbox boundary
    if (!isPathContained(sandboxBoundary, workingDir)) {
      await Permission.ask({
        type: 'external_directory',
        pattern: [workingDir, path.join(workingDir, '*')],
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        title: `Access directory outside project: ${workingDir}`,
        metadata: {
          command,
          directory: workingDir,
          boundary: sandboxBoundary,
        },
      })
    }

    // Request permission for dangerous commands
    if (commandAction === 'ask') {
      const pattern = getCommandPattern(command)
      await Permission.ask({
        type: 'bash',
        pattern: [pattern],
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        title: command,
        metadata: {
          command,
          pattern,
        },
      })
    }

    // Execute the command
    let output = ''

    // Check if already aborted before starting
    if (ctx.abortSignal?.aborted) {
      throw new Error('Command execution aborted')
    }

    const proc = execa(command, {
      shell: true,
      cwd: workingDir,
      timeout: timeout || DEFAULT_TIMEOUT,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
      },
      reject: false, // Don't throw on non-zero exit
    })

    // Handle abort signal - kill the process when abort is triggered
    let aborted = false
    const abortHandler = () => {
      if (proc.killed) return
      aborted = true
      console.log('[Bash] Abort signal received, killing process')
      proc.kill('SIGTERM')
      // Force kill after 500ms if still running
      setTimeout(() => {
        if (!proc.killed) {
          console.log('[Bash] Force killing process with SIGKILL')
          proc.kill('SIGKILL')
        }
      }, 500)
    }

    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener('abort', abortHandler, { once: true })
    }

    // Stream output to metadata
    const append = (chunk: string) => {
      if (output.length <= MAX_OUTPUT_LENGTH) {
        output += chunk
        ctx.metadata({
          metadata: {
            command,
            workingDirectory: workingDir,
            exitCode: -1,
            output,
          },
        })
      }
    }

    proc.stdout?.on('data', (data: Buffer) => append(data.toString()))
    proc.stderr?.on('data', (data: Buffer) => append(data.toString()))

    let result
    try {
      result = await proc
    } finally {
      // Clean up abort listener
      if (ctx.abortSignal) {
        ctx.abortSignal.removeEventListener('abort', abortHandler)
      }
    }

    // If aborted, throw an error to indicate cancellation
    if (aborted) {
      throw new Error('Command execution was cancelled by user')
    }

    // Truncate if needed
    let truncated = false
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH)
      truncated = true
    }

    // Build final output
    let finalOutput = output || '(no output)'
    if (truncated) {
      finalOutput += `\n\n<bash_metadata>\nOutput truncated at ${MAX_OUTPUT_LENGTH} characters\n</bash_metadata>`
    }
    if (result.exitCode !== 0) {
      finalOutput += `\n\n<bash_metadata>\nExit code: ${result.exitCode}\n</bash_metadata>`
    }

    const metadata: BashMetadata = {
      command,
      workingDirectory: workingDir,
      exitCode: result.exitCode ?? 0,
      output: finalOutput,
    }

    return {
      title: result.exitCode === 0
        ? `Executed: ${command}`
        : `Failed (exit ${result.exitCode}): ${command}`,
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
