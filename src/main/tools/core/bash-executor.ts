import { constants, createWriteStream, existsSync } from 'node:fs'
import { access as fsAccess } from 'node:fs/promises'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createBackgroundLogPath, getProcessGroupPids, registerBackgroundJob } from './background-jobs.js'

export interface ShellConfig {
  shell: string
  args: string[]
}

export interface BashSpawnContext {
  command: string
  cwd: string
  env: NodeJS.ProcessEnv
}

export type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext

export interface BashOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void
      signal?: AbortSignal
      timeout?: number
      env?: NodeJS.ProcessEnv
    },
  ) => Promise<{ exitCode: number | null; backgroundJobIds?: string[] }>
}

const EXIT_STDIO_GRACE_MS = 100
const trackedDetachedChildPids = new Set<number>()

function findBashOnPath(): string | null {
  const lookup = process.platform === 'win32' ? 'where' : 'which'
  const target = process.platform === 'win32' ? 'bash.exe' : 'bash'
  try {
    const result = spawnSync(lookup, [target], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status === 0 && result.stdout) {
      const first = result.stdout.trim().split(/\r?\n/)[0]
      return first || null
    }
  } catch {
    // Ignore lookup failures.
  }
  return null
}

export function getShellConfig(customShellPath?: string): ShellConfig {
  if (customShellPath) {
    if (existsSync(customShellPath)) return { shell: customShellPath, args: ['-c'] }
    throw new Error(`Custom shell path not found: ${customShellPath}`)
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Git\\bin\\bash.exe` : '',
      process.env['ProgramFiles(x86)'] ? `${process.env['ProgramFiles(x86)']}\\Git\\bin\\bash.exe` : '',
      findBashOnPath() ?? '',
    ].filter(Boolean)

    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000, windowsHide: true })
        if (result.status === 0) return { shell: candidate, args: ['-c'] }
      } catch {
        // Try next candidate.
      }
    }

    throw new Error('No bash shell found. Install Git Bash or configure a shell path.')
  }

  return { shell: process.env.SHELL || findBashOnPath() || '/bin/sh', args: ['-c'] }
}

export function getShellEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LANG: process.env.LANG || 'en_US.UTF-8',
  }
}

export function resolveSpawnContext(command: string, cwd: string, spawnHook?: BashSpawnHook): BashSpawnContext {
  const base: BashSpawnContext = { command, cwd, env: getShellEnv() }
  return spawnHook ? spawnHook(base) : base
}

export function trackDetachedChildPid(pid: number): void {
  trackedDetachedChildPids.add(pid)
}

export function untrackDetachedChildPid(pid: number): void {
  trackedDetachedChildPids.delete(pid)
}

export function killTrackedDetachedChildren(): void {
  for (const pid of trackedDetachedChildPids) killProcessTree(pid, 'SIGKILL')
  trackedDetachedChildPids.clear()
}

export function killProcessTree(pid: number | undefined, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        detached: true,
        windowsHide: true,
      }).unref()
    } catch {
      // Ignore kill failures; process may already be gone.
    }
    return
  }

  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // Process already exited.
    }
  }
}

export function waitForChildProcess(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    let exited = false
    let exitCode: number | null = null
    let postExitTimer: NodeJS.Timeout | undefined
    let stdoutEnded = child.stdout === null
    let stderrEnded = child.stderr === null

    const cleanup = () => {
      if (postExitTimer) clearTimeout(postExitTimer)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      child.removeListener('close', onClose)
      child.stdout?.removeListener('end', onStdoutEnd)
      child.stderr?.removeListener('end', onStderrEnd)
    }

    const finalize = (code: number | null) => {
      if (settled) return
      settled = true
      cleanup()
      child.stdout?.destroy()
      child.stderr?.destroy()
      resolve(code)
    }

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return
      if (stdoutEnded && stderrEnded) finalize(exitCode)
    }

    const onStdoutEnd = () => {
      stdoutEnded = true
      maybeFinalizeAfterExit()
    }
    const onStderrEnd = () => {
      stderrEnded = true
      maybeFinalizeAfterExit()
    }
    const onError = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    const onExit = (code: number | null) => {
      exited = true
      exitCode = code
      maybeFinalizeAfterExit()
      if (!settled) postExitTimer = setTimeout(() => finalize(code), EXIT_STDIO_GRACE_MS)
    }
    const onClose = (code: number | null) => finalize(code)

    child.stdout?.once('end', onStdoutEnd)
    child.stderr?.once('end', onStderrEnd)
    child.once('error', onError)
    child.once('exit', onExit)
    child.once('close', onClose)
  })
}

export function createLocalBashOperations(options: { shellPath?: string; spawnHook?: BashSpawnHook } = {}): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      try {
        await fsAccess(cwd, constants.F_OK)
      } catch {
        throw new Error(`Work directory does not exist: ${cwd}\nCannot execute bash commands.`)
      }
      if (signal?.aborted) throw new Error('aborted')

      const { shell, args } = getShellConfig(options.shellPath)
      const spawnContext = resolveSpawnContext(command, cwd, options.spawnHook)
      const child = spawn(shell, [...args, spawnContext.command], {
        cwd: spawnContext.cwd,
        detached: process.platform !== 'win32',
        env: env ?? spawnContext.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      if (child.pid) trackDetachedChildPid(child.pid)
      let timedOut = false
      let timeoutHandle: NodeJS.Timeout | undefined
      const backgroundLogPath = createBackgroundLogPath()
      const backgroundLog = createWriteStream(backgroundLogPath, { flags: 'a' })
      const appendOutput = (data: Buffer) => {
        backgroundLog.write(data)
        onData(data)
      }

      const onAbort = () => killProcessTree(child.pid, 'SIGKILL')

      try {
        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            killProcessTree(child.pid, 'SIGKILL')
          }, timeout)
        }

        child.stdout?.on('data', appendOutput)
        child.stderr?.on('data', appendOutput)

        if (signal) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }

        const exitCode = await waitForChildProcess(child)
        if (signal?.aborted) throw new Error('aborted')
        if (timedOut) throw new Error(`timeout:${timeout}`)
        const backgroundPids = child.pid && process.platform !== 'win32'
          ? getProcessGroupPids(child.pid).filter(pid => pid !== child.pid)
          : []
        const backgroundJobIds = child.pid && backgroundPids.length > 0
          ? [registerBackgroundJob({
              command: spawnContext.command,
              cwd: spawnContext.cwd,
              shellPid: child.pid,
              pgid: child.pid,
              childPids: backgroundPids,
              logPath: backgroundLogPath,
            }).id]
          : undefined
        return { exitCode, backgroundJobIds }
      } finally {
        child.stdout?.removeListener('data', appendOutput)
        child.stderr?.removeListener('data', appendOutput)
        backgroundLog.end()
        if (child.pid) untrackDetachedChildPid(child.pid)
        if (timeoutHandle) clearTimeout(timeoutHandle)
        if (signal) signal.removeEventListener('abort', onAbort)
      }
    },
  }
}
