/**
 * Persisted shape of `variables.json`.
 *
 * The variables subsystem holds *scalar* global state — values shared
 * across sessions that don't fit inside a session document. Today
 * that's the built-in note directories. Future scalars (e.g. preferred shell,
 * default model override) get added as optional fields here.
 *
 * Structurally additive evolution only. No `version` field — adding
 * an optional field is forwards-compatible automatically. Destructive
 * changes (renames, semantic shifts) are handled by one-shot scripts
 * under `scripts/`, never by runtime version-branching.
 */

import { z } from 'zod'

const GLOBAL_VARIABLE_SCHEMA = z.object({
  name: z.string(),
  value: z.string(),
  description: z.string().optional(),
  updatedAt: z.number().optional(),
})

export const VARIABLES_FILE_SCHEMA = z.object({
  ai_note_dir: z.string().default('~/.0nething/notes'),
  user_note_dir: z.string().default(''),
  work_note_dir: z.string().default(''),
  global_variables: z.array(GLOBAL_VARIABLE_SCHEMA).default([]),
})

export type VariablesFile = z.infer<typeof VARIABLES_FILE_SCHEMA>

export function createDefaultVariablesFile(): VariablesFile {
  return {
    ai_note_dir: '~/.0nething/notes',
    user_note_dir: '',
    work_note_dir: '',
    global_variables: [],
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
  if (result.success) {
    const migrated = migrateReservedGlobals(raw, result.data)
    return { data: migrated, recovered: false }
  }
  console.warn(
    '[variables.store] persisted file failed schema validation, falling back to defaults',
    result.error.flatten(),
  )
  return { data: createDefaultVariablesFile(), recovered: true }
}

function migrateReservedGlobals(raw: unknown, data: VariablesFile): VariablesFile {
  if (data.work_note_dir) return data
  if (!raw || typeof raw !== 'object') return data
  const globals = (raw as { global_variables?: unknown }).global_variables
  if (!Array.isArray(globals)) return data
  const legacy = globals.find(v =>
    v &&
    typeof v === 'object' &&
    (v as { name?: unknown }).name === 'work_note_dir' &&
    typeof (v as { value?: unknown }).value === 'string'
  ) as { value: string } | undefined
  return legacy ? { ...data, work_note_dir: legacy.value } : data
}
