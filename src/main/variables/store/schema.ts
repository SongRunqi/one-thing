/**
 * Persisted shape of `variables.json`.
 *
 * The variables subsystem holds *scalar* global state — values shared
 * across sessions that don't fit inside a session document. Today
 * that's two note directories. Future scalars (e.g. preferred shell,
 * default model override) get added as optional fields here.
 *
 * Structurally additive evolution only. No `version` field — adding
 * an optional field is forwards-compatible automatically. Destructive
 * changes (renames, semantic shifts) are handled by one-shot scripts
 * under `scripts/`, never by runtime version-branching.
 */

import { z } from 'zod'

export const VARIABLES_FILE_SCHEMA = z.object({
  ai_note_dir: z.string(),
  user_note_dir: z.string(),
})

export type VariablesFile = z.infer<typeof VARIABLES_FILE_SCHEMA>

export function createDefaultVariablesFile(): VariablesFile {
  return {
    ai_note_dir: '~/.0nething/notes',
    user_note_dir: '',
  }
}

/**
 * Parse with safe fallback. Returns the default file when input fails
 * validation — bad data shouldn't brick startup. The recovered flag
 * lets callers log/notify if they care.
 */
export function parseVariablesFile(raw: unknown): {
  data: VariablesFile
  recovered: boolean
} {
  const result = VARIABLES_FILE_SCHEMA.safeParse(raw)
  if (result.success) return { data: result.data, recovered: false }
  console.warn(
    '[variables.store] persisted file failed schema validation, falling back to defaults',
    result.error.flatten(),
  )
  return { data: createDefaultVariablesFile(), recovered: true }
}
