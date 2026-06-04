export type BashPermissionDecision = 'allow' | 'ask' | 'deny'

export interface ClassifiedBashCommand {
  text: string
  head: string
  args: string[]
  decision: BashPermissionDecision
  pattern?: string
  reason?: string
}

export interface BashClassification {
  decision: BashPermissionDecision
  commands: ClassifiedBashCommand[]
  patterns: string[]
  reason?: string
}

// Read-only commands - auto-execute (allow)
const READ_ONLY_COMMANDS = new Set([
  'cat', 'ls', 'pwd', 'cd', 'echo', 'grep', 'egrep', 'fgrep', 'find',
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

// Dangerous patterns that should remain blocked even before policy storage is redesigned.
const DANGEROUS_PATTERNS = [
  />\s*\/dev\/(?!null\b)/, // write to /dev (but allow /dev/null)
  /\|\s*sh\b/, // pipe to shell
  /\|\s*bash\b/,
]

const COMMAND_SEPARATORS = new Set(['&&', '||', ';', '|'])

/**
 * Parse one simple command into head/args. This is intentionally lightweight;
 * the public classifier shape is designed so this can later be replaced by a
 * tree-sitter bash parser without changing callers.
 */
export function parseCommand(command: string): { head: string; args: string[] } {
  const trimmed = command.trim()
  // Remove env prefix and simple VAR=value prefixes.
  const withoutEnv = trimmed.replace(/^(env\s+)?(\w+=\S+\s+)*/, '')
  const parts = splitShellWords(withoutEnv)
  return {
    head: parts[0] || '',
    args: parts.slice(1),
  }
}

export function splitShellWords(input: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      continue
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        words.push(current)
        current = ''
      }
      continue
    }

    if (!quote && (char === ';' || char === '|')) {
      if (current) {
        words.push(current)
        current = ''
      }
      words.push(char)
      continue
    }

    if (!quote && char === '&') {
      if (current) {
        words.push(current)
        current = ''
      }
      // A later normalization pass joins adjacent ampersands into &&.
      words.push(char)
      continue
    }

    current += char
  }

  if (current) words.push(current)
  return normalizeOperators(words)
}

function normalizeOperators(words: string[]): string[] {
  const output: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const next = words[i + 1]
    if (word === '&' && next === '&') {
      output.push('&&')
      i++
      continue
    }
    if (word === '|' && next === '|') {
      output.push('||')
      i++
      continue
    }
    output.push(word)
  }
  return output
}

function splitCommandSegments(command: string): string[] {
  const words = splitShellWords(command)
  const segments: string[] = []
  let current: string[] = []

  for (const word of words) {
    if (COMMAND_SEPARATORS.has(word)) {
      if (current.length > 0) {
        segments.push(current.join(' '))
        current = []
      }
      continue
    }
    current.push(word)
  }

  if (current.length > 0) segments.push(current.join(' '))
  return segments.length > 0 ? segments : [command]
}

function targetsRootOrHome(targets: string[]): boolean {
  return targets.some(target => {
    const normalized = target.replace(/\/+$/, '') || '/'
    return normalized === '/' ||
      normalized === '~' ||
      normalized === '$HOME' ||
      normalized === '${HOME}'
  })
}

function commandRemovesRootOrHome(command: string): boolean {
  const words = splitShellWords(command)

  for (let index = 0; index < words.length; index++) {
    if (words[index] !== 'rm') continue

    const targets: string[] = []
    for (let argIndex = index + 1; argIndex < words.length; argIndex++) {
      const arg = words[argIndex]
      if (COMMAND_SEPARATORS.has(arg)) break
      if (arg.startsWith('-')) continue
      targets.push(arg)
    }

    if (targetsRootOrHome(targets)) return true
  }

  return false
}

function hasOutputRedirection(command: string): boolean {
  return /[^<]>\s*[^>]|>>/.test(command)
}

/**
 * Get command pattern for permission prompts.
 */
export function getCommandPattern(command: string): string {
  const { head, args } = parseCommand(command)

  if (!head) return '*'

  // For git/npm, include subcommand.
  if (['git', 'npm', 'npx', 'yarn', 'pnpm'].includes(head) && args.length > 0) {
    const sub = args.find(arg => !arg.startsWith('-'))
    return sub ? `${head} ${sub} *` : `${head} *`
  }

  return `${head} *`
}

function classifySimpleCommand(command: string): ClassifiedBashCommand {
  const { head, args } = parseCommand(command)

  if (!head) {
    return { text: command, head, args, decision: 'allow' }
  }

  if (FORBIDDEN_COMMANDS.has(head)) {
    return { text: command, head, args, decision: 'deny', reason: `Command "${head}" is forbidden` }
  }

  if (commandRemovesRootOrHome(command)) {
    return { text: command, head, args, decision: 'deny', reason: 'Command attempts to remove root or home directory' }
  }

  if (head === 'git' && args.length > 0) {
    const subcommand = args[0]
    if (GIT_READ_ONLY.has(subcommand)) return { text: command, head, args, decision: 'allow' }
    return {
      text: command,
      head,
      args,
      decision: GIT_WRITE.has(subcommand) ? 'ask' : 'ask',
      pattern: getCommandPattern(command),
      reason: GIT_WRITE.has(subcommand) ? `Git command "${subcommand}" mutates repository state` : `Unknown git command "${subcommand}"`,
    }
  }

  if ((head === 'npm' || head === 'npx' || head === 'yarn' || head === 'pnpm') && args.length > 0) {
    const subcommand = args[0]
    if (NPM_READ_ONLY.has(subcommand)) return { text: command, head, args, decision: 'allow' }
    return {
      text: command,
      head,
      args,
      decision: NPM_WRITE.has(subcommand) ? 'ask' : 'ask',
      pattern: getCommandPattern(command),
      reason: NPM_WRITE.has(subcommand) ? `Package command "${subcommand}" may mutate project state` : `Unknown package command "${subcommand}"`,
    }
  }

  if (READ_ONLY_COMMANDS.has(head)) {
    if (hasOutputRedirection(command)) {
      return {
        text: command,
        head,
        args,
        decision: 'ask',
        pattern: getCommandPattern(command),
        reason: 'Read-only command uses output redirection',
      }
    }
    return { text: command, head, args, decision: 'allow' }
  }

  if (DANGEROUS_COMMANDS.has(head)) {
    return {
      text: command,
      head,
      args,
      decision: 'ask',
      pattern: getCommandPattern(command),
      reason: `Command "${head}" may mutate files, processes, or network state`,
    }
  }

  return {
    text: command,
    head,
    args,
    decision: 'ask',
    pattern: getCommandPattern(command),
    reason: `Unknown command "${head}"`,
  }
}

/**
 * Classify a shell command by inspecting all lightweight command segments.
 *
 * Aggregation rule:
 * - any deny => deny
 * - else any ask => ask
 * - else allow
 */
export function classifyBashCommand(command: string): BashClassification {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        decision: 'deny',
        commands: splitCommandSegments(command).map(classifySimpleCommand),
        patterns: [],
        reason: 'Command contains a forbidden shell pattern',
      }
    }
  }

  const commands = splitCommandSegments(command).map(classifySimpleCommand)
  const denied = commands.find(item => item.decision === 'deny')
  if (denied) {
    return {
      decision: 'deny',
      commands,
      patterns: [],
      reason: denied.reason,
    }
  }

  const askPatterns = Array.from(new Set(
    commands
      .filter(item => item.decision === 'ask')
      .map(item => item.pattern || getCommandPattern(item.text)),
  ))

  if (askPatterns.length > 0) {
    return {
      decision: 'ask',
      commands,
      patterns: askPatterns,
      reason: commands.find(item => item.decision === 'ask')?.reason,
    }
  }

  return {
    decision: 'allow',
    commands,
    patterns: [],
  }
}

/** Backwards-compatible simple decision helper. */
export function classifyCommand(command: string): BashPermissionDecision {
  return classifyBashCommand(command).decision
}
