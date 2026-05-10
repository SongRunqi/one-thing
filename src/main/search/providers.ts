/**
 * Search providers — each produces results for a category
 */

import * as path from 'path'
import * as os from 'os'
import type { SearchResult, SearchCategory } from '../../shared/ipc/search.js'
import { getSessionsList, getSessionRaw, getSession } from '../stores/sessions.js'
import { getCurrentSessionId } from '../stores/app-state.js'
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
    case 'all': {
      const [chats, messages, files, actions] = await Promise.all([
        Promise.resolve(searchChats(query, 6)),
        Promise.resolve(searchMessages(query, 5)),
        searchFiles(query, 10),
        Promise.resolve(searchActions(query, query.trim().startsWith('/') || query.trim().startsWith('>') ? 8 : 4)),
      ])
      const ordered = query.trim().startsWith('/') || query.trim().startsWith('>')
        ? [...actions, ...chats, ...files, ...messages]
        : [...chats, ...files, ...messages, ...actions]
      return ordered.slice(0, limit)
    }
  }
}
