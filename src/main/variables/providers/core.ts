/**
 * CoreProvider — exposes the session's working directory under the
 * single name `workdir`. Setting it validates the target path exists
 * and is a directory, then mutates session state via the injected
 * `WorkdirGateway` so the rest of the app sees the change immediately.
 * Cannot be deleted (sandbox always has a boundary; clearing it would
 * silently revert to cwd).
 *
 * The provider is constructed with a small gateway interface rather
 * than importing the session store directly. That keeps the variable
 * subsystem dependency-free in tests and lets the runtime swap
 * implementations without touching provider code. Auto-linking the
 * directory into `project_dirs` is the gateway implementation's job —
 * that way both AI-driven (this provider's `set`) and UI-driven
 * (direct IPC) workdir mutations share one funnel.
 */

import * as fs from 'fs/promises'
import {
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'

export interface WorkdirGateway {
  /** Returns the current working directory for `sessionId`, or `''` if unset. */
  read(sessionId: string): string
  /** Persists a new working directory. Path is already validated + canonicalized. */
  write(sessionId: string, workdir: string): void | Promise<void>
  /** Expand `~` / `$HOME` and resolve to an absolute path. */
  expandPath(input: string): string
  /** Subscribe to external changes (e.g. UI updates). Returns teardown. */
  onChange?(callback: (sessionId: string) => void): () => void
}

const NAME_WORKDIR = 'workdir'
const DESC_WORKDIR = 'Current working directory and sandbox boundary for file tools.'

export class CoreProvider implements VariableProvider {
  readonly id = 'core'
  readonly priority = 10

  constructor(private readonly gateway: WorkdirGateway) {}

  list(ctx: VariableContext): ContextVariable[] {
    const wd = this.gateway.read(ctx.sessionId)
    return [
      { name: NAME_WORKDIR, value: wd, description: DESC_WORKDIR, readonly: false },
    ]
  }

  claims(name: string): boolean {
    return name === NAME_WORKDIR
  }

  async set(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    if (input.name !== NAME_WORKDIR) {
      // Unreachable given claims(), but defensive for forward-compat.
      throw new VariableError('NOT_FOUND', `CoreProvider does not own "${input.name}"`)
    }

    const resolved = this.gateway.expandPath(input.value)
    let stat: import('fs').Stats
    try {
      stat = await fs.stat(resolved)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code === 'ENOENT') {
        throw new VariableError('WORKDIR_NOT_FOUND', `Directory does not exist: ${resolved}`)
      }
      throw new VariableError(
        'WORKDIR_NOT_FOUND',
        `Cannot access directory: ${resolved} (${(err as Error)?.message ?? 'unknown error'})`,
      )
    }
    if (!stat.isDirectory()) {
      throw new VariableError('WORKDIR_NOT_FOUND', `Not a directory: ${resolved}`)
    }

    await this.gateway.write(ctx.sessionId, resolved)
    return { name: NAME_WORKDIR, value: resolved, description: DESC_WORKDIR, readonly: false }
  }

  // No `delete` capability — registry will surface READONLY when triggered.

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange((sessionId) => emit({ sessionId }))
  }
}
