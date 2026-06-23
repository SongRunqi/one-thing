import { spawn } from 'child_process'
import path from 'path'

const ENV_START_MARKER = '__ONETHING_LOGIN_SHELL_ENV_START__'
const DEFAULT_TIMEOUT_MS = 3500
const MAX_ENV_OUTPUT_BYTES = 1024 * 1024

export interface HydrateLoginShellEnvOptions {
  env?: NodeJS.ProcessEnv
  logger?: Pick<Console, 'log' | 'warn'>
  platform?: NodeJS.Platform
  shell?: string
  timeoutMs?: number
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getDefaultShell(platform: NodeJS.Platform): string | undefined {
  if (platform === 'darwin') return '/bin/zsh'
  return undefined
}

function getShellArgs(shell: string, command: string): string[] {
  const shellName = path.basename(shell).replace(/^-/, '')
  if (shellName === 'sh' || shellName === 'dash') return ['-i', '-c', command]
  return ['-l', '-i', '-c', command]
}

export function parseLoginShellEnvOutput(output: Buffer | string): Record<string, string> {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : output
  const parts = text.split('\0')
  const markerIndex = parts.indexOf(ENV_START_MARKER)
  if (markerIndex < 0) return {}

  const result: Record<string, string> = {}
  for (const part of parts.slice(markerIndex + 1)) {
    const equalsIndex = part.indexOf('=')
    if (equalsIndex <= 0) continue

    const name = part.slice(0, equalsIndex)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue
    result[name] = part.slice(equalsIndex + 1)
  }
  return result
}

export function mergeMissingEnv(
  target: NodeJS.ProcessEnv,
  source: Record<string, string>,
): string[] {
  const merged: string[] = []

  for (const [name, value] of Object.entries(source)) {
    if (!value) continue
    if (target[name]) continue
    target[name] = value
    merged.push(name)
  }

  return merged
}

async function readLoginShellEnv(
  shell: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<Record<string, string>> {
  const command = `printf '\\0%s\\0' ${quoteShellArg(ENV_START_MARKER)}; /usr/bin/env -0`

  return new Promise((resolve, reject) => {
    const child = spawn(shell, getShellArgs(shell, command), {
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const stdoutChunks: Buffer[] = []
    let stdoutLength = 0
    let failure: Error | undefined
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    timer.unref?.()

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      stdoutLength += buffer.length
      if (stdoutLength > MAX_ENV_OUTPUT_BYTES) {
        failure = new Error('login shell environment output exceeded limit')
        child.kill('SIGTERM')
        return
      }
      stdoutChunks.push(buffer)
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (failure) {
        reject(failure)
        return
      }
      if (timedOut) {
        reject(new Error('login shell environment timed out'))
        return
      }
      if (code !== 0) {
        reject(new Error(`login shell exited with code ${code}`))
        return
      }

      resolve(parseLoginShellEnvOutput(Buffer.concat(stdoutChunks, stdoutLength)))
    })
  })
}

export async function hydrateProcessEnvFromLoginShell(
  options: HydrateLoginShellEnvOptions = {},
): Promise<string[]> {
  const platform = options.platform ?? process.platform
  if (platform === 'win32') return []

  const targetEnv = options.env ?? process.env
  const shell = options.shell || targetEnv.SHELL || getDefaultShell(platform)
  if (!shell) return []

  try {
    const shellEnv = await readLoginShellEnv(
      shell,
      targetEnv,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    const merged = mergeMissingEnv(targetEnv, shellEnv)
    if (merged.length > 0) {
      options.logger?.log(`[Env] Loaded ${merged.length} missing variables from login shell`)
    }
    return merged
  } catch (error: any) {
    options.logger?.warn(`[Env] Failed to load login shell environment: ${error?.message || error}`)
    return []
  }
}
