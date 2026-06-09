/**
 * Prompt Types
 *
 * Type definitions for TypeScript-based prompt construction.
 */

export type OSType = 'macos' | 'windows' | 'linux'

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
