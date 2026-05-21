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
import * as path from 'path'
import { Permission } from '../../permission/index.js'
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
  /** Returns additional sandbox roots for `sessionId`, excluding the current working directory. */
  readRoots(sessionId: string): string[]
  /** Persists a new working directory. Path is already validated + canonicalized. */
  write(sessionId: string, workdir: string): void | Promise<void>
  /** Persists additional sandbox roots. Paths are already validated + canonicalized. */
  writeRoots(sessionId: string, roots: string[]): void | Promise<void>
  /** Expand `~` / `$HOME` and resolve to an absolute path. */
  expandPath(input: string): string
  /** Subscribe to external changes (e.g. UI updates). Returns teardown. */
  onChange?(callback: (sessionId: string) => void): () => void
}

const NAME_WORKDIR = 'workdir'
const DESC_WORKDIR = 'Ordered workdir list. values[0] is the active cwd; later values are additional sandbox roots.'

function normalizePath(input: string): string {
  return path.resolve(input)
}

function uniqueRoots(roots: string[], active: string): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  const activePath = active ? normalizePath(active) : ''

  for (const root of roots) {
    const normalized = normalizePath(root)
    if (!normalized || normalized === activePath || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

function workdirVariable(active: string, roots: string[]): ContextVariable {
  const normalizedActive = active ? normalizePath(active) : ''
  const normalizedRoots = uniqueRoots(roots, normalizedActive)
  const values = normalizedActive
    ? [normalizedActive, ...normalizedRoots]
    : normalizedRoots

  return {
    name: NAME_WORKDIR,
    value: normalizedActive,
    values,
    scope: 'session',
    description: DESC_WORKDIR,
    readonly: false,
  }
}

export class CoreProvider implements VariableProvider {
  readonly id = 'core'
  readonly priority = 10

  constructor(private readonly gateway: WorkdirGateway) {}

  list(ctx: VariableContext): ContextVariable[] {
    const wd = this.gateway.read(ctx.sessionId)
    const roots = this.gateway.readRoots(ctx.sessionId)
    return [workdirVariable(wd, roots)]
  }

  claims(name: string): boolean {
    return name === NAME_WORKDIR
  }

  async set(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    if (input.name !== NAME_WORKDIR) {
      // Unreachable given claims(), but defensive for forward-compat.
      throw new VariableError('NOT_FOUND', `CoreProvider does not own "${input.name}"`)
    }

    const resolved = await this.resolveExistingDirectory(input.value)
    const roots = uniqueRoots(this.gateway.readRoots(ctx.sessionId), resolved)

    await this.gateway.write(ctx.sessionId, resolved)
    await this.gateway.writeRoots(ctx.sessionId, roots)
    return workdirVariable(resolved, roots)
  }

  async append(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    if (input.name !== NAME_WORKDIR) {
      throw new VariableError('NOT_FOUND', `CoreProvider does not own "${input.name}"`)
    }

    const resolved = await this.resolveExistingDirectory(input.value)
    const active = this.gateway.read(ctx.sessionId)
    const roots = uniqueRoots([...this.gateway.readRoots(ctx.sessionId), resolved], active)

    if (ctx.messageId) {
      await Permission.ask({
        type: 'external_directory',
        pattern: [resolved, path.join(resolved, '*')],
        sessionId: ctx.sessionId,
        messageId: ctx.messageId,
        callId: ctx.toolCallId,
        title: `Add workdir root: ${resolved}`,
        workingDirectory: resolved,
        metadata: {
          operation: 'append_workdir_root',
          directory: resolved,
          activeWorkingDirectory: active || undefined,
        },
      })
    }

    await this.gateway.writeRoots(ctx.sessionId, roots)
    return workdirVariable(active, roots)
  }

  async remove(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    if (input.name !== NAME_WORKDIR) {
      throw new VariableError('NOT_FOUND', `CoreProvider does not own "${input.name}"`)
    }

    const resolved = normalizePath(this.gateway.expandPath(input.value))
    const active = this.gateway.read(ctx.sessionId)
    if (active && normalizePath(active) === resolved) {
      throw new VariableError('INVALID_VALUE', 'Cannot remove the active workdir; set a different workdir first.')
    }

    const roots = uniqueRoots(
      this.gateway.readRoots(ctx.sessionId).filter(root => normalizePath(root) !== resolved),
      active,
    )
    await this.gateway.writeRoots(ctx.sessionId, roots)
    return workdirVariable(active, roots)
  }

  // No `delete` capability — registry will surface READONLY when triggered.

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange((sessionId) => emit({ sessionId }))
  }

  private async resolveExistingDirectory(input: string): Promise<string> {
    const resolved = normalizePath(this.gateway.expandPath(input))
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
    return resolved
  }
}
