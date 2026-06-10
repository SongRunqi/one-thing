/**
 * Single source of truth for how each tool is presented in the UI:
 * category (icon/grouping), verbs, status labels, inspector tab.
 * Adding a new tool's UI treatment means editing THIS file only.
 */
import type { ToolRenderStatus } from './tool-status'

export type ToolUiCategory = 'read' | 'write' | 'edit' | 'search' | 'console' | 'fart' | 'tool'

export interface CategoryVerbs {
  base: string   // imperative: Edit / Run / Read
  run: string    // progressive: Editing / Running
  done: string   // past: Edited / Ran
}

const CATEGORY_ALIASES: Record<string, ToolUiCategory> = {
  read: 'read', read_file: 'read', 'read-file': 'read', readfile: 'read',
  view_file: 'read', 'view-file': 'read', viewfile: 'read',
  write: 'write', write_file: 'write', 'write-file': 'write', writefile: 'write',
  write_to_file: 'write', 'write-to-file': 'write', writetofile: 'write',
  create_file: 'write', 'create-file': 'write', createfile: 'write',
  edit: 'edit', edit_file: 'edit', 'edit-file': 'edit', editfile: 'edit',
  replace_file_content: 'edit', multi_replace_file_content: 'edit',
  web_search: 'search', 'web-search': 'search', websearch: 'search',
  web_open: 'search', 'web-open': 'search', webopen: 'search',
  web_find: 'search', 'web-find': 'search', webfind: 'search',
  bash: 'console',
  fart: 'fart',
}

const CATEGORY_VERBS: Record<ToolUiCategory, CategoryVerbs> = {
  read: { base: 'Read', run: 'Reading', done: 'Read' },
  write: { base: 'Write', run: 'Writing', done: 'Wrote' },
  edit: { base: 'Edit', run: 'Editing', done: 'Edited' },
  search: { base: 'Search', run: 'Searching', done: 'Searched' },
  console: { base: 'Run', run: 'Running', done: 'Ran' },
  fart: { base: 'Summon', run: 'Summoning', done: 'Summoned' },
  tool: { base: 'Call', run: 'Calling', done: 'Called' },
}

const STATUS_LABELS: Record<ToolRenderStatus, string> = {
  queued: 'Queued',
  pending: 'Pending',
  'streaming-input': 'Preparing',
  executing: 'Running',
  'awaiting-confirmation': 'Needs approval',
  completed: 'Done',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export type InspectorTab = 'context' | 'request' | 'browser' | 'diff' | 'console'

const CATEGORY_INSPECTOR_TABS: Record<ToolUiCategory, InspectorTab> = {
  search: 'browser',
  edit: 'diff',
  write: 'diff',
  read: 'diff',
  console: 'console',
  fart: 'console',
  tool: 'console',
}

export function getToolUiCategory(toolName: string | undefined): ToolUiCategory {
  if (!toolName) return 'tool'
  return CATEGORY_ALIASES[toolName.trim().toLowerCase()] ?? 'tool'
}

export function getCategoryVerbs(category: ToolUiCategory): CategoryVerbs {
  return CATEGORY_VERBS[category]
}

export function getStatusLabel(status: ToolRenderStatus): string {
  return STATUS_LABELS[status] ?? 'Pending'
}

export function getInspectorTab(toolName: string | undefined): InspectorTab {
  return CATEGORY_INSPECTOR_TABS[getToolUiCategory(toolName)]
}

/** Category for read/write/edit file tools, null otherwise (legacy helper shape). */
export function getFileToolCategory(toolName: string | undefined): 'read' | 'write' | 'edit' | null {
  const cat = getToolUiCategory(toolName)
  return cat === 'read' || cat === 'write' || cat === 'edit' ? cat : null
}
