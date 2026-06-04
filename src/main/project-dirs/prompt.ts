/**
 * Prompt-rendering helpers for project-dirs.
 *
 * Two output shapes for prompt context builders:
 *   - active project: renders one project when current workdir matches a known project
 *   - known projects: renders the recently-used list
 *
 * Builders return plain formatter-friendly objects rather than strings
 * so future fields (reflections, tags) can slot in without rewriting lookup logic here.
 */

import * as os from 'os'
import { getProjectsStore } from './store/index.js'
import type { Project, ProjectIndexEntry } from './types.js'

export interface ActiveProjectVars {
  hasActive: boolean
  path?: string
  displayPath?: string
  description?: string
  // Future: reflections?, tagsLine?, recentActivity?
}

export interface KnownProjectsVars {
  hasAny: boolean
  entries: Array<{ path: string; displayPath: string; description: string }>
}

export interface ProjectDirsPromptVars {
  active: ActiveProjectVars
  known: KnownProjectsVars
}

const DEFAULT_KNOWN_LIMIT = 12

/**
 * Build the variables for both partials in one pass. Inputs are kept
 * narrow so callers (the system prompt builder) don't need to know
 * about the store.
 */
export function buildProjectDirsPromptVars(
  workingDirectory: string | undefined,
  options: { knownLimit?: number; collapseHome?: boolean } = {},
): ProjectDirsPromptVars {
  const knownLimit = options.knownLimit ?? DEFAULT_KNOWN_LIMIT
  const collapseHome = options.collapseHome ?? true
  const home = collapseHome ? os.homedir() : ''

  const store = getProjectsStore()
  const indexEntries = store.list()

  const active = resolveActive(workingDirectory, indexEntries, home)
  const known = resolveKnown(indexEntries, home, knownLimit, active.path)

  return { active, known }
}

function resolveActive(
  workingDirectory: string | undefined,
  index: ProjectIndexEntry[],
  home: string,
): ActiveProjectVars {
  if (!workingDirectory) return { hasActive: false }

  const matchEntry =
    findEntryByExactPath(index, workingDirectory)
    ?? findEntryByExpandedPath(index, workingDirectory, home)

  if (!matchEntry) return { hasActive: false }

  const project: Project | null = getProjectsStore().get(matchEntry.path)
  if (!project) return { hasActive: false }

  return {
    hasActive: true,
    path: project.path,
    displayPath: collapse(project.path, home),
    description: project.description,
  }
}

function resolveKnown(
  index: ProjectIndexEntry[],
  home: string,
  limit: number,
  excludePath: string | undefined,
): KnownProjectsVars {
  const entries: KnownProjectsVars['entries'] = []
  for (const entry of index) {
    if (excludePath && entry.path === excludePath) continue
    const project = getProjectsStore().get(entry.path)
    entries.push({
      path: entry.path,
      displayPath: collapse(entry.path, home),
      description: project?.description ?? '',
    })
    if (entries.length >= limit) break
  }
  return { hasAny: entries.length > 0, entries }
}

function findEntryByExactPath(index: ProjectIndexEntry[], path: string): ProjectIndexEntry | undefined {
  return index.find((e) => e.path === path)
}

function findEntryByExpandedPath(
  index: ProjectIndexEntry[],
  path: string,
  home: string,
): ProjectIndexEntry | undefined {
  // Workdir resolves with `~` already expanded. Index entries may
  // store the literal `~`. Compare both forms.
  if (!home) return undefined
  return index.find((e) => {
    if (!e.path.startsWith('~')) return false
    return home + e.path.slice(1) === path
  })
}

function collapse(p: string, home: string): string {
  if (!home) return p
  if (p.startsWith('~')) return p
  return p.startsWith(home) ? '~' + p.slice(home.length) : p
}
