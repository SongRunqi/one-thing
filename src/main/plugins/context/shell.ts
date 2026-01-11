/**
 * Shell Helper
 *
 * Provides a safe way for plugins to execute shell commands.
 * Wraps Node.js child_process with timeout and error handling.
 */

import { spawn } from 'child_process'
import type { ShellHelper, ShellResult, ShellOptions } from '../types.js'

const DEFAULT_TIMEOUT = 30000 // 30 seconds

/**
 * Create a shell helper instance
 * @param defaultCwd - Default working directory for commands
 */
export function createShellHelper(defaultCwd?: string): ShellHelper {
  return {
    async run(command: string, options?: ShellOptions): Promise<ShellResult> {
      const cwd = options?.cwd || defaultCwd || process.cwd()
      const timeout = options?.timeout || DEFAULT_TIMEOUT
      const env = { ...process.env, ...options?.env }

      return new Promise((resolve) => {
        const isWindows = process.platform === 'win32'
        const shell = isWindows ? 'cmd.exe' : '/bin/bash'
        const shellArgs = isWindows ? ['/c', command] : ['-c', command]

        let stdout = ''
        let stderr = ''
        let killed = false

        const child = spawn(shell, shellArgs, {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        // Set up timeout
        const timeoutId = setTimeout(() => {
          killed = true
          child.kill('SIGTERM')
          // Force kill after 5 seconds if still running
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL')
            }
          }, 5000)
        }, timeout)

        child.stdout?.on('data', (data) => {
          stdout += data.toString()
        })

        child.stderr?.on('data', (data) => {
          stderr += data.toString()
        })

        child.on('close', (code) => {
          clearTimeout(timeoutId)

          if (killed) {
            resolve({
              stdout,
              stderr: stderr + '\nCommand timed out',
              exitCode: 124, // Standard timeout exit code
            })
          } else {
            resolve({
              stdout,
              stderr,
              exitCode: code ?? 0,
            })
          }
        })

        child.on('error', (error) => {
          clearTimeout(timeoutId)
          resolve({
            stdout,
            stderr: error.message,
            exitCode: 1,
          })
        })
      })
    },
  }
}
