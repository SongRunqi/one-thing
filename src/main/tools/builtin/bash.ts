/**
 * Built-in Tool: Bash
 *
 * Execute bash commands in a sandboxed environment with:
 * - Command classification (read-only, dangerous, forbidden)
 * - Directory restrictions (sandbox)
 * - User confirmation for dangerous operations
 */

import { execa } from 'execa'
import * as path from 'path'
import * as os from 'os'
import { app } from 'electron'
import type { ToolDefinition, ToolHandler } from '../types.js'
import { getSettings } from '../../stores/settings.js'

// Read-only commands - auto-execute
const READ_ONLY_COMMANDS = new Set([
  'cat', 'ls', 'pwd', 'echo', 'grep', 'egrep', 'fgrep', 'find',
  'head', 'tail', 'wc', 'file', 'which', 'whoami', 'date', 'env',
  'printenv', 'less', 'more', 'diff', 'cmp', 'stat', 'du', 'df',
  'tree', 'realpath', 'dirname', 'basename', 'readlink', 'type',
  'man', 'help', 'git status', 'git log', 'git diff', 'git branch',
  'git show', 'git blame', 'git rev-parse', 'git -C', 'git remote',
  'git tag', 'git stash list', 'git config --get', 'git config --list',
  'npm list', 'npm outdated', 'npm view',
  'node --version', 'npm --version', 'python --version', 'pip list',
])

// Dangerous commands - require user confirmation
const DANGEROUS_COMMANDS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown',
  'kill', 'pkill', 'killall', 'dd', 'truncate', 'shred',
  'git add', 'git commit', 'git push', 'git pull', 'git merge',
  'git rebase', 'git reset', 'git checkout', 'git stash',
  'npm install', 'npm uninstall', 'npm update', 'npm run',
  'pip install', 'pip uninstall',
  'wget', 'curl', // network commands that could download
])

// Forbidden commands - always reject
const FORBIDDEN_COMMANDS = new Set([
  'sudo', 'su', 'shutdown', 'reboot', 'halt', 'poweroff',
  'init', 'systemctl', 'service', 'passwd', 'useradd', 'userdel',
  'mkfs', 'fdisk', 'mount', 'umount', 'chroot',
  'iptables', 'firewall-cmd', 'ufw',
  'crontab', 'at',
  'eval', 'exec',
])

// Dangerous patterns in commands
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf?\s+[\/~]/, // rm -rf / or ~
  />\s*\/dev\/(?!null\b)/, // write to /dev (but allow /dev/null)
  /\|\s*sh\b/, // pipe to shell
  /\|\s*bash\b/,
  /`.*`/, // command substitution
  /\$\(.*\)/, // command substitution
  /;\s*rm\b/, // chained rm
  /&&\s*rm\b/,
  /\|\|\s*rm\b/,
]

export const definition: ToolDefinition = {
  id: 'bash',
  name: 'Bash',
  description: 'Execute bash commands in a sandboxed environment. Read-only commands (cat, ls, grep, etc.) are auto-executed. Dangerous commands (rm, mv, git push, etc.) require user confirmation.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The bash command to execute',
      required: true,
    },
    {
      name: 'workingDirectory',
      type: 'string',
      description: 'Working directory for the command (must be within allowed paths)',
      required: false,
    },
    {
      name: 'confirmed',
      type: 'boolean',
      description: 'Set to true if user has confirmed a dangerous command',
      required: false,
    },
  ],
  enabled: true,
  autoExecute: true, // Auto-execute; dangerous commands return requiresConfirmation
  category: 'builtin',
  icon: 'terminal',
}

/**
 * Get the first command from a command string
 */
function getBaseCommand(command: string): string {
  const trimmed = command.trim()
  // Handle common prefixes
  const withoutEnv = trimmed.replace(/^(env\s+)?(\w+=\S+\s+)*/, '')
  // Get first word
  const match = withoutEnv.match(/^(\S+)/)
  return match ? match[1] : ''
}

/**
 * Check if command matches a pattern in the set
 */
function matchesCommandSet(command: string, commandSet: Set<string>): boolean {
  const baseCmd = getBaseCommand(command)

  // Check exact match
  if (commandSet.has(baseCmd)) return true

  // Check multi-word patterns (e.g., "git status")
  for (const pattern of commandSet) {
    if (pattern.includes(' ') && command.trim().startsWith(pattern)) {
      return true
    }
  }

  return false
}

/**
 * Check if command has output redirection (writes to file)
 */
function hasOutputRedirection(command: string): boolean {
  // Match > or >> not inside quotes
  // Simple check - look for > that's not part of heredoc delimiter
  const patterns = [
    /[^<]>\s*[^>]/, // Single > (not << or >>)
    />>/,           // Append >>
  ]
  return patterns.some(p => p.test(command))
}

/**
 * Classify command type
 */
function classifyCommand(command: string): 'read-only' | 'dangerous' | 'forbidden' {
  // Check forbidden first
  if (matchesCommandSet(command, FORBIDDEN_COMMANDS)) {
    return 'forbidden'
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return 'forbidden'
    }
  }

  // Commands with output redirection are dangerous (they write to files)
  if (hasOutputRedirection(command)) {
    return 'dangerous'
  }

  // Check if read-only
  if (matchesCommandSet(command, READ_ONLY_COMMANDS)) {
    return 'read-only'
  }

  // Check if explicitly dangerous
  if (matchesCommandSet(command, DANGEROUS_COMMANDS)) {
    return 'dangerous'
  }

  // Default to dangerous for unknown commands
  return 'dangerous'
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
 * Get the app's data directory for storing app data
 */
function getAppDataPath(): string {
  return path.join(app.getPath('userData'), 'data')
}

/**
 * Get allowed directories for sandbox from settings
 */
function getAllowedDirectories(): string[] {
  const settings = getSettings()
  const bashSettings = settings.tools?.bash
  const homeDir = os.homedir()

  // Start with base directories
  let dirs: string[] = []

  // If user configured allowed directories, use them
  if (bashSettings?.allowedDirectories?.length) {
    dirs = bashSettings.allowedDirectories.map(expandPath)
  } else {
    // Otherwise use default directories
    dirs = [
      process.cwd(),                    // Current project directory
      path.join(homeDir, '.claude'),    // Claude config/skills
      '/tmp',                           // Temp directory
      '/var/tmp',
      path.join(homeDir, 'Downloads'),  // Downloads
      getAppDataPath(),                 // App data directory (for skills to manage data)
    ]
  }

  // Always include the default working directory if configured
  if (bashSettings?.defaultWorkingDirectory) {
    const defaultDir = expandPath(bashSettings.defaultWorkingDirectory)
    if (!dirs.includes(defaultDir)) {
      dirs.push(defaultDir)
    }
  }

  return dirs
}

/**
 * Get default working directory from settings
 */
function getDefaultWorkingDirectory(): string {
  const settings = getSettings()
  const bashSettings = settings.tools?.bash

  if (bashSettings?.defaultWorkingDirectory) {
    return expandPath(bashSettings.defaultWorkingDirectory)
  }

  return process.cwd()
}

/**
 * Check if sandbox is enabled
 */
function isSandboxEnabled(): boolean {
  const settings = getSettings()
  const bashSettings = settings.tools?.bash
  return bashSettings?.enableSandbox !== false
}

/**
 * Check if command is in the whitelist (skip confirmation)
 */
function isInWhitelist(command: string): boolean {
  const settings = getSettings()
  const bashSettings = settings.tools?.bash
  const whitelist = bashSettings?.dangerousCommandWhitelist || []

  return whitelist.some(whitelistedCmd =>
    command.trim().startsWith(whitelistedCmd.trim())
  )
}

/**
 * Check if dangerous command confirmation is enabled
 */
function isConfirmationEnabled(): boolean {
  const settings = getSettings()
  const bashSettings = settings.tools?.bash
  return bashSettings?.confirmDangerousCommands !== false
}

/**
 * Check if a path is within allowed directories
 */
function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath)
  const allowed = getAllowedDirectories()

  return allowed.some(dir => {
    const resolvedDir = path.resolve(dir)
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep)
  })
}

/**
 * Extract paths from command for validation
 */
function extractPaths(command: string, workingDir: string): string[] {
  const paths: string[] = []

  // Simple path extraction - match quoted strings and unquoted paths
  // For unquoted paths, handle backslash-escaped spaces (e.g., Application\ Support)
  const patterns = [
    /"([^"]+)"/g,                    // Double-quoted
    /'([^']+)'/g,                    // Single-quoted
    /\s(\/(?:[^\s]|\\ )+)/g,         // Absolute paths (handle backslash-escaped spaces)
    /\s(\.\.?\/(?:[^\s]|\\ )+)/g,    // Relative paths (handle backslash-escaped spaces)
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(command)) !== null) {
      let p = match[1]
      if (p && !p.startsWith('-')) {
        // Remove backslash escapes for spaces
        p = p.replace(/\\ /g, ' ')
        // Resolve relative to working directory
        const resolved = path.isAbsolute(p) ? p : path.resolve(workingDir, p)
        paths.push(resolved)
      }
    }
  }

  return paths
}

/**
 * Validate command sandbox restrictions
 */
function validateSandbox(command: string, workingDir: string): { valid: boolean; error?: string } {
  // Check working directory
  if (!isPathAllowed(workingDir)) {
    return {
      valid: false,
      error: `Working directory "${workingDir}" is outside the sandbox. Allowed: ${getAllowedDirectories().join(', ')}`,
    }
  }

  // Check paths in command
  const paths = extractPaths(command, workingDir)
  for (const p of paths) {
    if (!isPathAllowed(p)) {
      return {
        valid: false,
        error: `Path "${p}" is outside the sandbox. Allowed directories: ${getAllowedDirectories().join(', ')}`,
      }
    }
  }

  return { valid: true }
}

export const handler: ToolHandler = async (args, context) => {
  try {
    const { command, workingDirectory, confirmed } = args

    if (!command || typeof command !== 'string') {
      return {
        success: false,
        error: 'Command is required and must be a string',
      }
    }

    // Use configured default working directory if not specified or invalid
    // This handles cases where AI passes "/" or other disallowed directories
    let workingDir = workingDirectory || getDefaultWorkingDirectory()
    if (isSandboxEnabled() && workingDirectory && !isPathAllowed(workingDirectory)) {
      // Fall back to default working directory instead of failing
      workingDir = getDefaultWorkingDirectory()
    }

    // Classify the command
    const commandType = classifyCommand(command)

    // Reject forbidden commands
    if (commandType === 'forbidden') {
      return {
        success: false,
        error: `Command "${getBaseCommand(command)}" is forbidden for security reasons`,
      }
    }

    // Validate sandbox (if enabled)
    if (isSandboxEnabled()) {
      const sandboxResult = validateSandbox(command, workingDir)
      if (!sandboxResult.valid) {
        return {
          success: false,
          error: sandboxResult.error,
        }
      }
    }

    // Check if dangerous command needs confirmation
    // Skip if: confirmation disabled, command in whitelist, or already confirmed
    if (commandType === 'dangerous' && !confirmed) {
      if (isConfirmationEnabled() && !isInWhitelist(command)) {
        return {
          success: false,
          requiresConfirmation: true,
          error: `This command requires user confirmation: ${command}`,
          command,
          commandType,
        }
      }
    }

    // Execute the command
    const result = await execa(command, {
      shell: true,
      cwd: workingDir,
      timeout: 60000, // 60 second timeout
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: {
        ...process.env,
        // Add safety measures
        LANG: 'en_US.UTF-8',
      },
    })

    // Track file deletions for /files command
    if (result.exitCode === 0 && context?.onMetadata) {
      // Detect rm command and extract file paths
      const rmMatch = command.match(/\brm\s+(?:-[rRfiv]*\s+)*(.+)/)
      if (rmMatch) {
        // Parse file paths (handle multiple files and quoted paths)
        const pathsStr = rmMatch[1].trim()
        // Split by unquoted spaces, respecting quotes
        const filePaths = pathsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []

        for (const rawPath of filePaths) {
          // Skip flags
          if (rawPath.startsWith('-')) continue

          // Clean up path (remove quotes)
          const filePath = rawPath.replace(/^["']|["']$/g, '')

          // Resolve relative paths
          const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(workingDir, filePath)

          context.onMetadata({
            metadata: {
              diff: `File deleted`,
              filePath: resolvedPath,
              additions: 0,
              deletions: 1,
            },
          })
        }
      }
    }

    return {
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        command,
        workingDirectory: workingDir,
      },
    }
  } catch (error: any) {
    // Handle execa errors
    if (error.exitCode !== undefined) {
      return {
        success: false,
        error: `Command failed with exit code ${error.exitCode}`,
        data: {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.exitCode,
        },
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to execute command',
    }
  }
}
