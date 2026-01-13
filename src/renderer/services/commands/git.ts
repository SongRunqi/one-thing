/**
 * /git Command - Show git status, recent commits, and quick actions
 */

import type { CommandDefinition, CommandContext, CommandResult } from '@/types/commands'
import { useRightSidebarStore } from '@/stores/right-sidebar'

/**
 * Git file status
 */
export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
  staged: boolean
}

/**
 * Git commit info
 */
export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  relativeDate: string
}

/**
 * Git status data structure for rendering
 */
export interface GitStatusData {
  type: 'git-status'
  isRepo: boolean
  error?: string
  branch?: {
    current: string
    upstream?: string
    ahead?: number
    behind?: number
  }
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  untracked: GitFileStatus[]
  recentCommits: GitCommit[]
  summary: {
    totalChanges: number
    stagedCount: number
    unstagedCount: number
    untrackedCount: number
  }
}

/**
 * Execute git command and return output
 */
async function execGit(
  command: string,
  workingDirectory: string,
  sessionId: string
): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  try {
    // Execute git command in the specified working directory
    const result = await window.electronAPI.executeTool(
      'bash',
      { command: `git ${command}`, working_directory: workingDirectory },
      `git-cmd-${Date.now()}`,
      sessionId
    )

    // Debug: log the full result
    console.log('[git command] Result:', JSON.stringify(result, null, 2))

    if (result.success && result.result) {
      // V2 tool returns { title, output, metadata }
      // output contains the combined stdout/stderr
      return {
        success: true,
        stdout: result.result.output || '',
        stderr: '',
      }
    }

    // Handle failure - try to get output from result
    const data = result.result as { output?: string; title?: string } | undefined
    return {
      success: false,
      error: result.error || data?.title || 'Git command failed',
      stdout: data?.output || '',
      stderr: '',
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute git command'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Parse status character to status type
 */
function parseStatusChar(char: string): GitFileStatus['status'] {
  switch (char) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'U':
      return 'conflicted'
    default:
      return 'modified'
  }
}

/**
 * Parse git status --porcelain output
 */
function parseGitStatus(output: string): {
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  untracked: GitFileStatus[]
} {
  const staged: GitFileStatus[] = []
  const unstaged: GitFileStatus[] = []
  const untracked: GitFileStatus[] = []

  // Filter out bash tool's "(no output)" placeholder and other non-porcelain lines
  // Note: Don't use .trim() as it removes leading spaces which are significant in porcelain format
  const lines = output
    .replace(/^\n+|\n+$/g, '')  // Only trim newlines, not spaces
    .split('\n')
    .filter((line) => {
      // Skip empty lines
      if (!line) return false
      // Skip bash tool placeholder
      if (line === '(no output)') return false
      // Skip bash metadata
      if (line.startsWith('<bash_metadata>')) return false
      // Valid porcelain line: XY followed by path
      // X and Y must be valid status chars: ' ', 'M', 'A', 'D', 'R', 'C', 'U', '?', '!'
      const validChars = ' MADRCU?!'
      // Check first two chars are valid status chars and line has content
      return line.length >= 4 && validChars.includes(line[0]) && validChars.includes(line[1])
    })

  for (const line of lines) {
    const index = line[0]
    const worktree = line[1]
    // Path starts after XY and space(s) - handle both "XY PATH" and "XY  PATH" formats
    const path = line.slice(2).trimStart()

    // Untracked files
    if (index === '?' && worktree === '?') {
      untracked.push({ path, status: 'untracked', staged: false })
      continue
    }

    // Staged changes (index has modification, not space or ?)
    if (index !== ' ' && index !== '?') {
      const status = parseStatusChar(index)
      staged.push({ path, status, staged: true })
    }

    // Unstaged changes (worktree has modification, not space or ?)
    if (worktree !== ' ' && worktree !== '?') {
      const status = parseStatusChar(worktree)
      unstaged.push({ path, status, staged: false })
    }
  }

  return { staged, unstaged, untracked }
}

/**
 * Parse git log output
 */
function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => {
      // Skip empty lines and bash tool placeholders
      if (!line || line === '(no output)') return false
      if (line.startsWith('<bash_metadata>')) return false
      return true
    })

  for (const line of lines) {
    // Format: hash|message|author|relativeDate
    const parts = line.split('|')
    // Hash should be 40 chars (full SHA)
    if (parts.length >= 4 && parts[0].length === 40 && /^[a-f0-9]+$/.test(parts[0])) {
      commits.push({
        hash: parts[0],
        shortHash: parts[0].slice(0, 7),
        message: parts[1],
        author: parts[2],
        relativeDate: parts[3],
      })
    }
  }

  return commits
}

/**
 * Parse git branch info
 */
function parseBranchInfo(output: string): GitStatusData['branch'] {
  const lines = output.trim().split('\n')

  for (const line of lines) {
    if (line.startsWith('*')) {
      const match = line.match(/\*\s+(\S+)(?:\s+\S+\s+\[([^\]]+)\])?/)
      if (match) {
        const current = match[1]
        const tracking = match[2]

        let ahead = 0
        let behind = 0
        let upstream: string | undefined

        if (tracking) {
          const upstreamMatch = tracking.match(/^([^:]+)/)
          upstream = upstreamMatch ? upstreamMatch[1] : undefined

          const aheadMatch = tracking.match(/ahead (\d+)/)
          const behindMatch = tracking.match(/behind (\d+)/)

          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
          if (behindMatch) behind = parseInt(behindMatch[1], 10)
        }

        return { current, upstream, ahead, behind }
      }
    }
  }

  return { current: 'unknown' }
}

/**
 * Collect all git information
 * Exported for use by refresh functionality
 */
export async function collectGitInfo(
  sessionId: string,
  workingDirectory: string
): Promise<GitStatusData> {
  // Check if in a git repo
  const repoCheck = await execGit('rev-parse --is-inside-work-tree', workingDirectory, sessionId)

  if (!repoCheck.success || repoCheck.stdout?.trim() !== 'true') {
    // Build detailed error message
    let errorMsg = 'Not a git repository'
    if (repoCheck.error) {
      errorMsg = repoCheck.error
    }
    if (repoCheck.stderr) {
      errorMsg += `: ${repoCheck.stderr}`
    }

    console.log('[git] repo check failed:', { repoCheck, workingDirectory })

    return {
      type: 'git-status',
      isRepo: false,
      error: errorMsg,
      staged: [],
      unstaged: [],
      untracked: [],
      recentCommits: [],
      summary: {
        totalChanges: 0,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
      },
    }
  }

  // Get status
  const statusResult = await execGit('status --porcelain', workingDirectory, sessionId)
  const { staged, unstaged, untracked } = statusResult.success
    ? parseGitStatus(statusResult.stdout || '')
    : { staged: [], unstaged: [], untracked: [] }

  // Get branch info
  const branchResult = await execGit('branch -vv', workingDirectory, sessionId)
  const branch = branchResult.success
    ? parseBranchInfo(branchResult.stdout || '')
    : { current: 'unknown' }

  // Get recent commits
  const logFormat = '%H|%s|%an|%ar'
  const logResult = await execGit(
    `log --pretty=format:"${logFormat}" -n 5`,
    workingDirectory,
    sessionId
  )
  const recentCommits = logResult.success ? parseGitLog(logResult.stdout || '') : []

  return {
    type: 'git-status',
    isRepo: true,
    branch,
    staged,
    unstaged,
    untracked,
    recentCommits,
    summary: {
      // totalChanges = staged + unstaged (not including untracked, as they are shown separately)
      totalChanges: staged.length + unstaged.length,
      stagedCount: staged.length,
      unstagedCount: unstaged.length,
      untrackedCount: untracked.length,
    },
  }
}

/**
 * /git command - Show git status and operations
 */
export const gitCommand: CommandDefinition = {
  id: 'git',
  name: 'Git Status',
  description: 'Show git status, recent commits, and quick actions',
  usage: '/git',

  async execute(_context: CommandContext): Promise<CommandResult> {
    const rightSidebarStore = useRightSidebarStore()

    // Open right sidebar and switch to git tab
    rightSidebarStore.open()
    rightSidebarStore.setActiveTab('git')

    return { success: true }
  },
}
