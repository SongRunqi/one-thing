/**
 * Search providers — each produces results for a category
 */

import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import type { SearchResult, SearchCategory } from '../../shared/ipc/search.js'
import { getSessionsList, getSessionRaw, getSession } from '../stores/sessions.js'
import { getCurrentSessionId } from '../stores/app-state.js'
import { getSettings } from '../stores/settings.js'
import { getVariablesStore } from '../variables/store/index.js'
import { listFiles } from '../utils/ripgrep.js'

// ---------------------------------------------------------------------------
// Actions registry
// ---------------------------------------------------------------------------

export interface ActionDefinition {
  id: string
  name: string
  keywords?: string[]
  shortcut?: string
}

const ACTIONS: ActionDefinition[] = [
  { id: 'new-chat', name: 'New Chat', keywords: ['chat', 'conversation', 'create'], shortcut: '⌘N' },
  { id: 'open-settings', name: 'Open Settings', keywords: ['preferences', 'config'], shortcut: '⌘,' },
  { id: 'toggle-sidebar', name: 'Toggle Sidebar', keywords: ['panel', 'nav'], shortcut: '⌘B' },
  { id: 'toggle-inspector', name: 'Toggle Inspector', keywords: ['details', 'debug', 'steps'] },
  { id: 'close-chat', name: 'Close Chat', keywords: ['delete', 'remove'] },
  { id: 'focus-input', name: 'Focus Input', keywords: ['composer', 'prompt', 'message'] },
]

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/^>/, '').replace(/^\//, '').trim()
}

function scoreText(text: string | undefined, query: string): number {
  if (!query) return 1
  const value = (text || '').toLowerCase()
  if (!value) return 0
  if (value === query) return 100
  if (value.startsWith(query)) return 80
  const idx = value.indexOf(query)
  if (idx >= 0) return 60 - Math.min(idx, 40)
  return 0
}

function matchRanges(text: string, query: string): Array<{ start: number; end: number }> | undefined {
  if (!query) return undefined
  const idx = text.toLowerCase().indexOf(query)
  return idx >= 0 ? [{ start: idx, end: idx + query.length }] : undefined
}

function searchChats(query: string, limit: number): SearchResult[] {
  const sessions = getSessionsList()
  const q = normalizeQuery(query)

  const matched = sessions
    .filter(s => !s.isArchived)
    .map(s => ({
      session: s,
      score: Math.max(scoreText(s.name, q), scoreText(s.previewText, q) * 0.8),
    }))
    .filter(item => !q || item.score > 0)
    .sort((a, b) => (b.score - a.score) || (b.session.updatedAt - a.session.updatedAt))
    .slice(0, limit)

  return matched.map(({ session: s }) => ({
    id: `chat:${s.id}`,
    type: 'chat' as const,
    title: s.name || 'New Chat',
    subtitle: s.previewText,
    sessionId: s.id,
    timestamp: s.updatedAt,
    matchRanges: matchRanges(s.name || 'New Chat', q),
  }))
}

function searchMessages(query: string, limit: number): SearchResult[] {
  if (!query.trim()) return []

  const sessions = getSessionsList()
  const q = normalizeQuery(query)
  if (!q) return []
  const results: SearchResult[] = []

  for (const meta of sessions) {
    if (results.length >= limit) break
    if (meta.isArchived) continue

    const session = getSessionRaw(meta.id)
    if (!session?.messages) continue
    const messages = session.messages

    for (const msg of messages) {
      if (results.length >= limit) break
      const content = typeof msg.content === 'string' ? msg.content : ''
      const idx = content.toLowerCase().indexOf(q)
      if (idx === -1) continue

      const start = Math.max(0, idx - 30)
      const end = Math.min(content.length, idx + q.length + 50)
      const leading = start > 0 ? '...' : ''
      const snippet = (start > 0 ? '...' : '')
        + content.slice(start, end)
        + (end < content.length ? '...' : '')

      results.push({
        id: `msg:${meta.id}:${msg.id}`,
        type: 'message',
        title: snippet,
        subtitle: meta.name || 'New Chat',
        detail: msg.role === 'user' ? 'User message' : 'Assistant message',
        sessionId: meta.id,
        messageId: msg.id,
        timestamp: msg.timestamp ?? meta.updatedAt,
        matchRanges: [{ start: leading.length + idx - start, end: leading.length + idx - start + q.length }],
      })
    }
  }
  return results
}

function searchActions(query: string, limit: number): SearchResult[] {
  const q = normalizeQuery(query)
  return ACTIONS
    .map(a => ({
      action: a,
      score: Math.max(scoreText(a.name, q), ...(a.keywords || []).map(k => scoreText(k, q) * 0.75)),
    }))
    .filter(item => !q || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ action }) => ({
      id: `action:${action.id}`,
      type: 'action' as const,
      title: action.name,
      subtitle: action.keywords?.slice(0, 3).join(' · '),
      actionId: action.id,
      shortcut: action.shortcut,
      matchRanges: matchRanges(action.name, q),
    }))
}

// ---------------------------------------------------------------------------
// File search
// ---------------------------------------------------------------------------

function expandPath(p: string): string {
  if (p.startsWith('~')) return p.replace('~', os.homedir())
  return p
}

function getSearchDirs(): string[] {
  const seen = new Set<string>()
  const dirs: string[] = []

  function add(p: string | undefined | null) {
    if (!p) return
    const expanded = expandPath(p)
    if (!seen.has(expanded)) {
      seen.add(expanded)
      dirs.push(expanded)
    }
  }

  // Session workdir
  const sid = getCurrentSessionId()
  if (sid) {
    const session = getSession(sid)
    add(session?.workingDirectory)
  }

  // Global note dirs
  const store = getVariablesStore()
  add(store.getAiNoteDir())
  add(store.getUserNoteDir())
  add(store.getWorkNoteDir())

  return dirs
}

async function searchFiles(query: string, limit: number): Promise<SearchResult[]> {
  const dirs = getSearchDirs()
  if (dirs.length === 0) return []

  const q = normalizeQuery(query)
  if (!q) return []
  const results: SearchResult[] = []

  for (const cwd of dirs) {
    if (results.length >= limit) break
    try {
      for await (const relPath of listFiles({ cwd, hidden: false, noIgnore: true })) {
        if (results.length >= limit) break
        // Match against full relative path (covers both filename and directory)
        if (!relPath.toLowerCase().includes(q)) continue

        const absPath = path.join(cwd, relPath)
        const dirLabel = path.basename(cwd)
        results.push({
          id: `file:${absPath}`,
          type: 'file',
          title: path.basename(relPath),
          subtitle: `${dirLabel}/${relPath}`,
          detail: cwd,
          filePath: absPath,
          matchRanges: matchRanges(path.basename(relPath), q),
        })
      }
    } catch {
      // directory may not exist
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Daily note search
// ---------------------------------------------------------------------------

interface DailyNoteProfile {
  vaultRoot: string
  searchDir: string
  format: string
  template?: string
  label: string
  source: 'obsidian' | 'folder'
}

interface DailySearchResult extends SearchResult {
  fileMtime?: number
  fileCtime?: number
  isCreateShortcut?: boolean
}

const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD'
const DAILY_SEARCH_CANDIDATE_LIMIT = 1000
const COMMON_DAILY_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYY/MM/YYYY-MM-DD',
  'YYYY/MM-MMMM/YYYY-MM-DD',
  'YYYYMMDD',
  'YYYY.MM.DD',
  'YYYY_MM_DD',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
]
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT_NAMES = MONTH_NAMES.map(name => name.slice(0, 3))
const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
const WEEKDAY_SHORT_NAMES = WEEKDAY_NAMES.map(name => name.slice(0, 3))
const DATE_FORMAT_TOKENS = ['YYYY', 'MMMM', 'MMM', 'dddd', 'ddd', 'YY', 'MM', 'M', 'DD', 'D']

function localDateFromParts(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return date
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDailyDate(format: string, date: Date): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: MONTH_NAMES[date.getMonth()],
    MMM: MONTH_SHORT_NAMES[date.getMonth()],
    dddd: WEEKDAY_NAMES[date.getDay()],
    ddd: WEEKDAY_SHORT_NAMES[date.getDay()],
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    M: String(date.getMonth() + 1),
    DD: String(date.getDate()).padStart(2, '0'),
    D: String(date.getDate()),
  }
  let output = ''
  for (let i = 0; i < format.length;) {
    const token = DATE_FORMAT_TOKENS.find(t => format.startsWith(t, i))
    if (token) {
      output += values[token]
      i += token.length
    } else {
      output += format[i]
      i += 1
    }
  }
  return output
}

function stripMarkdownExtension(filePath: string): string {
  return filePath.replace(/\.md$/i, '')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDateByFormat(relWithoutExt: string, format: string): Date | null {
  const groups: string[] = []
  let pattern = ''

  for (let i = 0; i < format.length;) {
    const token = DATE_FORMAT_TOKENS.find(t => format.startsWith(t, i))
    if (token) {
      if (token === 'ddd' || token === 'dddd') {
        pattern += token === 'dddd' ? `(?:${WEEKDAY_NAMES.join('|')})` : `(?:${WEEKDAY_SHORT_NAMES.join('|')})`
      } else {
        groups.push(token)
        pattern += token === 'YYYY' ? '(\\d{4})'
          : token === 'YY' ? '(\\d{2})'
            : token === 'MMMM' ? `(${MONTH_NAMES.join('|')})`
              : token === 'MMM' ? `(${MONTH_SHORT_NAMES.join('|')})`
                : '(\\d{1,2})'
      }
      i += token.length
      continue
    }
    pattern += format[i] === '/' ? '[\\\\/]' : escapeRegExp(format[i])
    i += 1
  }

  const match = relWithoutExt.match(new RegExp(`^${pattern}$`, 'i'))
  if (!match) return null

  let year = 0
  let month = 0
  let day = 0
  groups.forEach((token, index) => {
    const value = Number(match[index + 1])
    if (token === 'YYYY') year = value
    else if (token === 'YY') year = value >= 70 ? 1900 + value : 2000 + value
    else if (token === 'MM' || token === 'M') month = value
    else if (token === 'MMMM') month = MONTH_NAMES.findIndex(name => name.toLowerCase() === match[index + 1].toLowerCase()) + 1
    else if (token === 'MMM') month = MONTH_SHORT_NAMES.findIndex(name => name.toLowerCase() === match[index + 1].toLowerCase()) + 1
    else if (token === 'DD' || token === 'D') day = value
  })

  if (!year || !month || !day) return null
  return localDateFromParts(year, month, day)
}

function parseDateFromPath(relPath: string, preferredFormat?: string): Date | null {
  const relWithoutExt = stripMarkdownExtension(relPath).split(path.sep).join('/')
  if (preferredFormat) {
    const parsed = parseDateByFormat(relWithoutExt, preferredFormat)
    if (parsed) return parsed
  }

  for (const format of COMMON_DAILY_FORMATS) {
    const parsed = parseDateByFormat(relWithoutExt, format)
    if (parsed) return parsed
  }

  const compact = relWithoutExt.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:$|[^\d])/)
  if (compact) return localDateFromParts(Number(compact[1]), Number(compact[2]), Number(compact[3]))

  const ymd = relWithoutExt.match(/(?:^|[^\d])(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:$|[^\d])/)
  if (ymd) return localDateFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))

  return null
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function findObsidianVaultRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir)
  while (true) {
    if (await pathExists(path.join(current, '.obsidian'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

async function readObsidianDailyProfile(dir: string): Promise<DailyNoteProfile | null> {
  const vaultRoot = await findObsidianVaultRoot(dir)
  if (!vaultRoot) return null

  try {
    const raw = await fs.readFile(path.join(vaultRoot, '.obsidian', 'daily-notes.json'), 'utf-8')
    const config = JSON.parse(raw) as { folder?: string; format?: string; template?: string }
    const folder = config.folder?.trim()
    const searchDir = folder ? path.resolve(vaultRoot, folder) : vaultRoot
    return {
      vaultRoot,
      searchDir,
      format: config.format?.trim() || DEFAULT_DAILY_FORMAT,
      template: config.template?.trim(),
      label: folder ? `Obsidian Daily Notes/${folder}` : 'Obsidian Daily Notes',
      source: 'obsidian',
    }
  } catch {
    return {
      vaultRoot,
      searchDir: vaultRoot,
      format: DEFAULT_DAILY_FORMAT,
      label: 'Obsidian Daily Notes',
      source: 'obsidian',
    }
  }
}

async function getDailyNoteProfiles(): Promise<DailyNoteProfile[]> {
  const dailySettings = getSettings().general.dailyNotes
  if (dailySettings?.enabled === false) return []

  const profiles: DailyNoteProfile[] = []
  const seen = new Set<string>()

  async function add(profile: DailyNoteProfile | null) {
    if (!profile) return
    const key = `${profile.searchDir}:${profile.format}`
    if (seen.has(key)) return
    seen.add(key)
    profiles.push(profile)
  }

  const configuredDir = dailySettings?.directoryMode === 'custom'
    ? dailySettings.customDirectory
    : getVariablesStore().getUserNoteDir()
  const dailyRoot = configuredDir ? expandPath(configuredDir) : ''
  const dirs = dailyRoot ? [dailyRoot] : []

  if (dailySettings?.useObsidianConfig !== false) {
    for (const dir of dirs) {
      await add(await readObsidianDailyProfile(dir))
    }
  }

  if (profiles.some(profile => profile.source === 'obsidian')) {
    for (const dir of dirs) {
      const resolved = path.resolve(dir)
      if (profiles.some(p => p.searchDir === resolved)) continue
      await add({
        vaultRoot: resolved,
        searchDir: resolved,
        format: dailySettings?.format?.trim() || DEFAULT_DAILY_FORMAT,
        label: `${path.basename(resolved) || resolved} daily notes`,
        source: 'folder',
      })
    }
    return profiles
  }

  for (const dir of dirs) {
    const resolved = path.resolve(dir)
    if (profiles.some(p => resolved.startsWith(p.searchDir))) continue
    await add({
      vaultRoot: resolved,
      searchDir: resolved,
      format: dailySettings?.format?.trim() || DEFAULT_DAILY_FORMAT,
      label: `${path.basename(resolved) || resolved} daily notes`,
      source: 'folder',
    })
  }

  return profiles
}

function todayMatchesQuery(query: string, todayIso: string): boolean {
  const q = normalizeQuery(query)
  if (!q) return true
  return todayIso.includes(q) || ['today', 'daily', 'diary', 'journal', 'note', '日记', '今天'].some(word => word.includes(q) || q.includes(word))
}

function resolveNoteFile(root: string, notePath: string): string {
  const withExtension = path.extname(notePath) ? notePath : `${notePath}.md`
  return path.resolve(root, withExtension)
}

async function readDailyTemplate(profile: DailyNoteProfile): Promise<string | null> {
  if (!profile.template) return null
  const templatePath = resolveNoteFile(profile.vaultRoot, profile.template)
  try {
    return await fs.readFile(templatePath, 'utf-8')
  } catch {
    return null
  }
}

export async function createDailyNote(filePath: string): Promise<string> {
  const profiles = await getDailyNoteProfiles()
  const profile = profiles.find(p => filePath.startsWith(p.searchDir))
  const template = profile ? await readDailyTemplate(profile) : null
  const today = toIsoDate(new Date())
  const content = template ?? `# ${today}\n\n`

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return filePath
}

async function searchDailyNotes(query: string, limit: number): Promise<SearchResult[]> {
  const profiles = await getDailyNoteProfiles()
  const q = normalizeQuery(query)
  const results: DailySearchResult[] = []
  const seen = new Set<string>()
  const today = new Date()
  const todayIso = toIsoDate(today)
  let hasTodayShortcut = false

  for (const profile of profiles) {
    const todayRel = `${formatDailyDate(profile.format, today)}.md`
    const todayPath = path.resolve(profile.searchDir, todayRel)
    const todayExists = await pathExists(todayPath)
    if (!hasTodayShortcut && todayMatchesQuery(query, todayIso)) {
      const todayTitle = todayExists ? `Today: ${todayIso}` : `Create today's daily note: ${todayIso}`
      const todayResult: DailySearchResult = {
        id: `${todayExists ? 'daily' : 'daily-create'}:${todayPath}`,
        type: 'daily',
        title: todayTitle,
        subtitle: path.relative(profile.vaultRoot, todayPath) || path.basename(todayPath),
        detail: todayExists ? 'Open today' : `Create in ${profile.label}`,
        filePath: todayPath,
        timestamp: todayExists ? today.getTime() : 0,
        isCreateShortcut: !todayExists,
      }
      if (!todayExists) todayResult.actionId = `create-daily-note:${encodeURIComponent(todayPath)}`
      results.push(todayResult)
      seen.add(todayPath)
      hasTodayShortcut = true
    }

    try {
      let matchedCandidates = 0
      for await (const relPath of listFiles({ cwd: profile.searchDir, glob: ['**/*.md'], hidden: false, noIgnore: true })) {
        if (matchedCandidates >= DAILY_SEARCH_CANDIDATE_LIMIT) break
        const absPath = path.resolve(profile.searchDir, relPath)
        if (seen.has(absPath)) continue

        const date = parseDateFromPath(relPath, profile.format)
        if (!date) continue
        matchedCandidates += 1

        const iso = toIsoDate(date)
        const title = `${iso} · ${path.basename(relPath, '.md')}`
        const searchable = `${iso} ${relPath}`.toLowerCase()
        if (q && !searchable.includes(q)) continue
        const stats = await fs.stat(absPath).catch(() => null)

        seen.add(absPath)
        results.push({
          id: `daily:${absPath}`,
          type: 'daily',
          title,
          subtitle: path.relative(profile.vaultRoot, absPath) || relPath,
          detail: profile.source === 'obsidian' ? 'Obsidian daily note' : 'Daily note',
          filePath: absPath,
          timestamp: date.getTime(),
          fileMtime: stats?.mtimeMs,
          fileCtime: stats?.ctimeMs,
          matchRanges: matchRanges(title, q),
        })
      }
    } catch {
      // directory may not exist yet; the create-today result above still works
    }
  }

  return results
    .sort((a, b) => {
      if (q && a.isCreateShortcut !== b.isCreateShortcut) return a.isCreateShortcut ? 1 : -1
      return (b.timestamp ?? 0) - (a.timestamp ?? 0)
        || (b.fileMtime ?? 0) - (a.fileMtime ?? 0)
        || (b.fileCtime ?? 0) - (a.fileCtime ?? 0)
        || a.title.localeCompare(b.title)
    })
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Unified search
// ---------------------------------------------------------------------------

export async function executeSearch(
  query: string,
  category: SearchCategory,
  limit = 20,
): Promise<SearchResult[]> {
  switch (category) {
    case 'chats':
      return searchChats(query, limit)
    case 'messages':
      return searchMessages(query, limit)
    case 'actions':
      return searchActions(query, limit)
    case 'files':
      return searchFiles(query, limit)
    case 'daily':
      return searchDailyNotes(query, limit)
    case 'all': {
      const includeDaily = Boolean(normalizeQuery(query))
      const [chats, messages, files, daily, actions] = await Promise.all([
        Promise.resolve(searchChats(query, 6)),
        Promise.resolve(searchMessages(query, 5)),
        searchFiles(query, 10),
        includeDaily ? searchDailyNotes(query, 6) : Promise.resolve([]),
        Promise.resolve(searchActions(query, query.trim().startsWith('/') || query.trim().startsWith('>') ? 8 : 4)),
      ])
      const ordered = query.trim().startsWith('/') || query.trim().startsWith('>')
        ? [...actions, ...chats, ...daily, ...files, ...messages]
        : [...chats, ...daily, ...files, ...messages, ...actions]
      return ordered.slice(0, limit)
    }
  }
}
