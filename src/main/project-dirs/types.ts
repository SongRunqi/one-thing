/**
 * Project entity types.
 *
 * Designed for additive evolution: new attributes (reflections, tags,
 * activity logs) get added as optional fields. zod's `.optional()` lets
 * old persisted data parse cleanly without per-field migrations.
 *
 * If a future change is *destructive* (renaming a field, changing
 * semantics), write a one-shot script under `scripts/` instead of
 * polluting runtime code with version-branching logic.
 */

import { z } from 'zod'

/** Stable opaque identifier (sha256(path)[0..16]). Internal — AI never sees it. */
export type ProjectId = string

/**
 * Lightweight per-project entry stored in the index file. Keeps "list"
 * operations O(1) without reading every project's full data file.
 */
export const PROJECT_INDEX_ENTRY_SCHEMA = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  lastUsedAt: z.number(),
})
export type ProjectIndexEntry = z.infer<typeof PROJECT_INDEX_ENTRY_SCHEMA>

export const PROJECT_INDEX_SCHEMA = z.object({
  projects: z.array(PROJECT_INDEX_ENTRY_SCHEMA),
})
export type ProjectIndex = z.infer<typeof PROJECT_INDEX_SCHEMA>

/**
 * Full project record stored in `data/<id>.json`. New optional fields
 * (reflections, tags, activityLog, ...) are added here without
 * touching the index schema.
 */
export const PROJECT_SCHEMA = z.object({
  id: z.string().min(1),
  /** User-input path string. May contain `~`; expansion at use time. */
  path: z.string().min(1),
  description: z.string(),
  addedAt: z.number(),
  lastUsedAt: z.number(),
  // Future: reflections?: Reflection[]
  // Future: tags?: string[]
  // Future: activityLog?: Activity[]
})
export type Project = z.infer<typeof PROJECT_SCHEMA>
