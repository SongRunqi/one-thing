/**
 * Single source of truth for how each tool is presented in the UI:
 * category (grouping/inspector), display label, icon, status labels.
 * Adding a new tool's UI treatment means editing THIS file only.
 */
import type { Component } from 'vue'
import {
  Bot,
  Calculator,
  Clock,
  ExternalLink,
  FilePen,
  FilePlus2,
  FileText,
  FolderCog,
  FolderOpen,
  FolderSearch,
  Globe,
  ListTodo,
  Plug,
  ScanSearch,
  Sparkles,
  Terminal,
  TextSearch,
  Variable,
  Wind,
  Wrench,
} from 'lucide-vue-next'
import type { ToolRenderStatus } from './tool-status'

export type ToolUiCategory = 'read' | 'write' | 'edit' | 'search' | 'console' | 'fart' | 'tool'

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

/**
 * Display label shown as the row title (`Label(args)`).
 * Tool identity is carried by this name + icon; no verb conjugation.
 */
const TOOL_LABELS: Record<string, string> = {
  bash: 'Bash',
  read: 'Read', read_file: 'Read', 'read-file': 'Read', readfile: 'Read',
  view_file: 'Read', 'view-file': 'Read', viewfile: 'Read',
  write: 'Write', write_file: 'Write', 'write-file': 'Write', writefile: 'Write',
  write_to_file: 'Write', 'write-to-file': 'Write', writetofile: 'Write',
  create_file: 'Write', 'create-file': 'Write', createfile: 'Write',
  edit: 'Edit', edit_file: 'Edit', 'edit-file': 'Edit', editfile: 'Edit',
  replace_file_content: 'Edit', multi_replace_file_content: 'Edit',
  grep: 'Grep',
  glob: 'Glob',
  find: 'Find',
  ls: 'Ls',
  web_search: 'WebSearch', websearch: 'WebSearch', 'web-search': 'WebSearch',
  web_open: 'WebOpen', webopen: 'WebOpen', 'web-open': 'WebOpen',
  web_find: 'WebFind', webfind: 'WebFind', 'web-find': 'WebFind',
  calculator: 'Calculator',
  get_current_time: 'Time',
  time: 'Time',
  variable: 'Variable',
  todo: 'Todo',
  todo_plan: 'Todo',
  project_dirs: 'Projects',
  mcp_search: 'MCP',
  tool_function: 'MCP',
  task: 'Task',
  agent: 'Task',
  skill: 'Skill',
  fart: 'Fart',
}

const TOOL_ICONS: Record<string, Component> = {
  bash: Terminal,
  read: FileText,
  write: FilePlus2,
  edit: FilePen,
  grep: TextSearch,
  glob: FolderSearch,
  find: FolderSearch,
  ls: FolderOpen,
  web_search: Globe, websearch: Globe, 'web-search': Globe,
  web_open: ExternalLink, webopen: ExternalLink, 'web-open': ExternalLink,
  web_find: ScanSearch, webfind: ScanSearch, 'web-find': ScanSearch,
  calculator: Calculator,
  get_current_time: Clock,
  time: Clock,
  variable: Variable,
  todo: ListTodo,
  todo_plan: ListTodo,
  project_dirs: FolderCog,
  mcp_search: Plug,
  tool_function: Plug,
  task: Bot,
  agent: Bot,
  skill: Sparkles,
  fart: Wind,
}

const CATEGORY_ICONS: Record<ToolUiCategory, Component> = {
  read: FileText,
  write: FilePlus2,
  edit: FilePen,
  search: Globe,
  console: Terminal,
  fart: Wind,
  tool: Wrench,
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

function normalizeToolName(toolName: string | undefined): string {
  return String(toolName || '').trim().toLowerCase()
}

export function getToolUiCategory(toolName: string | undefined): ToolUiCategory {
  if (!toolName) return 'tool'
  return CATEGORY_ALIASES[normalizeToolName(toolName)] ?? 'tool'
}

/**
 * Row title label. MCP tools show their real name (`server.tool`);
 * unknown tools show their raw name — never a generic "Called".
 */
export function getToolDisplayLabel(toolName: string | undefined): string {
  const raw = String(toolName || '').trim()
  if (!raw) return 'Tool'
  const normalized = raw.toLowerCase()
  const known = TOOL_LABELS[normalized]
  if (known) return known
  if (normalized.startsWith('mcp:')) return raw.slice(4) || 'MCP'
  if (normalized.startsWith('mcp_')) return raw.slice(4) || 'MCP'
  return raw
}

export function getToolIcon(toolName: string | undefined): Component {
  const normalized = normalizeToolName(toolName)
  const direct = TOOL_ICONS[normalized]
  if (direct) return direct
  if (normalized.startsWith('mcp:') || normalized.startsWith('mcp_')) return Plug
  return CATEGORY_ICONS[getToolUiCategory(normalized)]
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
