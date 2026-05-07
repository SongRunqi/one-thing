/**
 * NotesProvider — surfaces two writable system variables backed by app
 * settings:
 *
 *   ai_note_dir   : where the assistant keeps its own scratch notes.
 *   user_note_dir : where the user keeps their notes (referenceable by
 *                   the AI for read-only inspection unless the user
 *                   explicitly asks for changes).
 *   work_note_dir : where work/project notes are kept.
 *
 * Both are persisted in `variables.json` (via the injected
 * `NotesGateway`, which delegates to VariablesStore). AI may read or
 * change them via the variable tool — `set` validates directory
 * existence the same way workdir does.
 */

import * as fs from 'fs/promises'
import {
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'

export interface NotesGateway {
  /** Read the current absolute path for `which`, or '' if unset. */
  read(which: NoteVarName): string
  /** Persist a new absolute path. Already validated by the provider. */
  write(which: NoteVarName, path: string): void | Promise<void>
  /** Expand `~` / `$HOME` to absolute. */
  expandPath(input: string): string
  /** Subscribe to external (settings UI) changes. */
  onChange?(callback: () => void): () => void
}

export type NoteVarName = 'ai_note_dir' | 'user_note_dir' | 'work_note_dir'

const NAMES: NoteVarName[] = ['ai_note_dir', 'user_note_dir', 'work_note_dir']

const DESC: Record<NoteVarName, string> = {
  ai_note_dir: "Directory where the assistant stores its own scratch notes. Writable by the AI via the variable tool.",
  user_note_dir: "Directory where the user keeps their personal notes. The AI may read it; only modify with explicit user permission.",
  work_note_dir: "Directory where work or project notes are kept. The AI may read it; only modify with explicit user permission.",
}

export class NotesProvider implements VariableProvider {
  readonly id = 'notes'
  /**
   * Between core (10) and project-dirs (20). The names don't overlap
   * with any other built-in, so priority is mostly cosmetic — picked
   * to make the routing order easy to reason about in logs.
   */
  readonly priority = 30

  constructor(private readonly gateway: NotesGateway) {}

  list(_ctx: VariableContext): ContextVariable[] {
    return NAMES.map((name) => ({
      name,
      value: this.gateway.read(name),
      scope: 'global',
      description: DESC[name],
      readonly: false,
    }))
  }

  claims(name: string): boolean {
    return (NAMES as readonly string[]).includes(name)
  }

  async set(_ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    const which = input.name as NoteVarName
    if (!this.claims(which)) {
      // Unreachable given claims(), kept defensive.
      throw new VariableError('NOT_FOUND', `NotesProvider does not own "${input.name}"`)
    }

    // Empty value clears the setting — useful for resetting back to
    // "(unset)" without exposing a delete action.
    if (input.value === '') {
      await this.gateway.write(which, '')
      return {
        name: which,
        value: '',
        scope: 'global',
        description: DESC[which],
        readonly: false,
      }
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

    await this.gateway.write(which, resolved)
    return {
      name: which,
      value: resolved,
      scope: 'global',
      description: DESC[which],
      readonly: false,
    }
  }

  // No `delete` capability — these always exist as system entries.
  // To "remove" a value, set it to '' (empty string).

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    // Settings are global, not session-scoped — broadcast to every
    // session listener (registry will fan out as a sessionId-empty
    // event; consumers re-list when they care).
    return this.gateway.onChange(() => emit())
  }
}
