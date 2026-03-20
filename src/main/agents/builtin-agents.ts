/**
 * Built-in Agents Configuration
 *
 * Defines system-level agents (Build mode and Ask mode) that are distinct from
 * user-created agents. These agents have different tool permissions and system prompts.
 *
 * Based on OpenCode's agent design pattern.
 */

import type { BuiltinAgent, BuiltinAgentMode } from '../../shared/ipc/agents.js'

/**
 * Ask mode system prompt addition
 * This is injected at the beginning of the system prompt when Ask mode is active
 */
const ASK_MODE_PROMPT = `
=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===

This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and answer questions.

## Your Process
1. **Understand Requirements**: Focus on the question or task provided by the user.
2. **Explore Thoroughly**:
   - Read any files provided to you
   - Find existing patterns and conventions using Glob, Grep, and Read
   - Understand the current architecture
   - Identify relevant code and documentation
   - Trace through relevant code paths
   - Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
3. **Answer Questions**: Provide clear, helpful answers based on your exploration.

REMEMBER: You can ONLY explore and answer. You CANNOT write, edit, or modify any files.
Switch to Build mode when you need to make changes.

=== END READ-ONLY MODE INSTRUCTIONS ===

`

/**
 * Built-in agents configuration
 */
export const BUILTIN_AGENTS: Record<BuiltinAgentMode, BuiltinAgent> = {
  build: {
    mode: 'build',
    name: 'Build',
    description: 'Full agent with write access',
    icon: 'Hammer',
    systemPromptAddition: '', // No addition for build mode
    toolPermissions: {
      edit: 'allow',
      write: 'allow',
      bash: 'allow',
      bashReadOnlyPatterns: [],
      bashForbiddenPatterns: [],
    },
  },
  ask: {
    mode: 'ask',
    name: 'Ask',
    description: 'Read-only exploration and answering',
    icon: 'MessageCircleQuestion',
    systemPromptAddition: ASK_MODE_PROMPT,
    toolPermissions: {
      edit: 'deny',
      write: 'deny',
      bash: 'read-only',
      bashReadOnlyPatterns: [
        // File system read operations
        'ls', 'cat', 'head', 'tail', 'less', 'more',
        'grep', 'find', 'wc', 'file', 'stat', 'tree',
        'pwd', 'echo', 'which', 'type',
        // Git read operations
        'git status', 'git log', 'git diff', 'git show',
        'git branch', 'git remote', 'git tag', 'git stash list',
        // Package manager read operations
        'npm list', 'npm ls', 'npm view', 'npm info',
        'yarn list', 'yarn info', 'yarn why',
        'pnpm list', 'pnpm why',
        // Other read operations
        'env', 'printenv', 'whoami', 'uname',
      ],
      bashForbiddenPatterns: [
        // File modification
        'rm ', 'rm -', 'mv ', 'cp ', 'mkdir ', 'touch ',
        'chmod ', 'chown ', 'chgrp ',
        // Redirect operators (could write to files)
        ' > ', ' >> ', ' | tee ',
        // Git write operations
        'git add', 'git commit', 'git push', 'git pull',
        'git reset', 'git checkout', 'git merge', 'git rebase',
        'git stash', 'git cherry-pick', 'git revert',
        // Package manager write operations
        'npm install', 'npm i ', 'npm uninstall', 'npm update',
        'npm ci', 'npm link', 'npm publish',
        'yarn add', 'yarn remove', 'yarn upgrade', 'yarn install',
        'pnpm add', 'pnpm remove', 'pnpm update', 'pnpm install',
        // Dangerous system commands
        'sudo ', 'su ', 'shutdown', 'reboot', 'halt',
        'kill ', 'killall ', 'pkill ',
        // Code execution
        'eval ', 'exec ', 'source ',
      ],
    },
  },
}

/**
 * Get the built-in agent configuration for a given mode
 */
export function getBuiltinAgent(mode: BuiltinAgentMode): BuiltinAgent {
  return BUILTIN_AGENTS[mode] || BUILTIN_AGENTS.build
}

/**
 * Check if a tool is allowed in the given mode
 *
 * @param toolName - Name of the tool (e.g., 'edit', 'bash', 'write')
 * @param args - Tool arguments (used for bash command checking)
 * @param mode - Current builtin agent mode
 * @returns Object with allowed status and optional reason
 */
export function checkToolPermission(
  toolName: string,
  args: Record<string, unknown>,
  mode: BuiltinAgentMode = 'build'
): { allowed: boolean; reason?: string } {
  const agent = getBuiltinAgent(mode)
  const perms = agent.toolPermissions

  // Check edit tool
  if (toolName === 'edit') {
    if (perms.edit === 'deny') {
      return {
        allowed: false,
        reason: 'Edit operations are not allowed in Ask mode. Switch to Build mode to make changes.',
      }
    }
  }

  // Check write tool
  if (toolName === 'write') {
    if (perms.write === 'deny') {
      return {
        allowed: false,
        reason: 'Write operations are not allowed in Ask mode. Switch to Build mode to create files.',
      }
    }
  }

  // Check bash tool
  if (toolName === 'bash') {
    const command = (args.command as string) || ''
    const commandLower = command.toLowerCase().trim()

    // Check forbidden patterns (always blocked)
    if (perms.bashForbiddenPatterns) {
      for (const pattern of perms.bashForbiddenPatterns) {
        if (commandLower.includes(pattern.toLowerCase())) {
          return {
            allowed: false,
            reason: `Command contains forbidden pattern "${pattern}". This operation is not allowed in Ask mode.`,
          }
        }
      }
    }

    // In read-only mode, only allow commands matching read-only patterns
    if (perms.bash === 'read-only') {
      const isReadOnly = perms.bashReadOnlyPatterns?.some(pattern => {
        const patternLower = pattern.toLowerCase()
        // Check if command starts with the pattern or is exactly the pattern
        return (
          commandLower.startsWith(patternLower) ||
          commandLower.startsWith(patternLower + ' ') ||
          commandLower === patternLower
        )
      })

      if (!isReadOnly) {
        return {
          allowed: false,
          reason: `Only read-only commands are allowed in Ask mode. Command "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" is not in the allowed list.`,
        }
      }
    }
  }

  return { allowed: true }
}
