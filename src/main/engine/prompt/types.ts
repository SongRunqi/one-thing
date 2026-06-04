/**
 * Prompt Types
 *
 * Type definitions for TypeScript-based prompt construction.
 */

export type OSType = 'macos' | 'windows' | 'linux'

/**
 * One slice of a rendered prompt, attributed to a stable prompt source id.
 */
export interface PromptSegment {
  source: string
  content: string
  absolutePath?: string
  role?: 'base' | 'developer' | 'user'
  marker?: {
    name: string
    start: string
    end: string
  }
  hash?: string
  reason?: 'initial' | 'changed' | 'removed'
  emittedThisTurn?: boolean
}

export interface TemplateSkill {
  name: string
  description: string
  source: string
  directoryPath?: string
  path?: string
  files?: Array<{ name: string }>
  instructions?: string
}

/** Project directory data fed into prompt context builders. */
export interface PromptActiveProject {
  hasActive: boolean
  path?: string
  displayPath?: string
  description?: string
}
export interface PromptKnownProjects {
  hasAny: boolean
  entries: Array<{ path: string; displayPath: string; description: string }>
}
