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
  shortcut?: string
}

const ACTIONS: ActionDefinition[] = [
  { id: 'new-chat', name: 'New Chat', shortcut: '⌘N' },
  { id: 'open-settings', name: 'Open Settings', shortcut: '⌘,' },
  { id: 'toggle-sidebar', name: 'Toggle Sidebar', shortcut: '⌘B' },
  { id: 'toggle-inspector', name: 'Toggle Inspector' },
  { id: 'close-chat', name: 'Close Chat' },
  { id: 'focus-input', name: 'Focus Input' },
]

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

function searchChats(query: string, limit: number): SearchResult[] {
  const sessions = getSessionsList()
  const q = query.toLowerCase()

  const matched = sessions
    .filter(s => !s.isArchived)
    .filter(s => {
      if (!q) return true
      return (s.name || '').toLowerCase().includes(q)
        || (s.previewText || '').toLowerCase().includes(q)
    })
    .slice(0, limit)

  return matched.map(s => ({
    id: `chat:${s.id}`,
    type: 'chat' as const,
    title: s.name || 'New Chat',
    subtitle: s.previewText,
    sessionId: s.id,
    timestamp: s.updatedAt,
  }))
}

function searchMessages(query: string, limit: number): SearchResult[] {
  if (!query.trim()) return []

  const sessions = getSessionsList()
  const q = query.toLowerCase()
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
      const end = Math.min(content.length, idx + query.length + 50)
      const snippet = (start > 0 ? '...' : '')
        + content.slice(start, end)
        + (end < content.length ? '...' : '')

      results.push({
        id: `msg:${meta.id}:${msg.id}`,
        type: 'message',
        title: snippet,
        subtitle: meta.name || 'New Chat',
        sessionId: meta.id,
        messageId: msg.id,
        timestamp: msg.timestamp ?? meta.updatedAt,
      })
    }
  }
  return results
}

function searchActions(query: string, limit: number): SearchResult[] {
  const q = query.toLowerCase()
  return ACTIONS
    .filter(a => !q || a.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map(a => ({
      id: `action:${a.id}`,
      type: 'action' as const,
      title: a.name,
      actionId: a.id,
      shortcut: a.shortcut,
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

  const q = query.toLowerCase().trim()
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
          filePath: absPath,
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
        Promise.resolve(searchActions(query, 4)),
      ])
      return [...chats, ...files, ...messages, ...actions].slice(0, limit)
    }
  }
}
