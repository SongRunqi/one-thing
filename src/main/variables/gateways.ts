/**
 * Gateways adapt the variable subsystem to the rest of the app.
 *
 *   workdir       → session.workingDirectory in stores/sessions
 *   session vars  → session.variables in stores/sessions
 *   note dirs     → VariablesStore (variables.json)
 *
 * Project directories are owned by their own subsystem
 * (`src/main/project-dirs/`); the workdir gateway calls into it as
 * an explicit cross-module dependency so workdir mutations
 * automatically refresh the project's lastUsedAt.
 */

import type { ContextVariable } from '../../shared/ipc.js'
import * as store from '../store.js'
import { getProjectsStore } from '../project-dirs/index.js'
import { expandPath } from '../tools/core/sandbox.js'
import { getVariablesStore } from './store/index.js'
import type { GlobalStoreGateway } from './providers/global-store.js'
import type { SessionStoreGateway } from './providers/session-store.js'
import type { WorkdirGateway } from './providers/core.js'
import type { NoteVarName, NotesGateway } from './providers/notes.js'

// ── Workdir gateway ─────────────────────────────────

const workdirListeners = new Set<(sessionId: string) => void>()

export const workdirGateway: WorkdirGateway = {
  read(sessionId) {
    return store.getSession(sessionId)?.workingDirectory ?? ''
  },
  write(sessionId, workdir) {
    store.updateSessionWorkingDirectory(sessionId, workdir)
    // Auto-link into the global project directories list. Both AI
    // (CoreProvider.set) and UI (UPDATE_SESSION_WORKING_DIRECTORY IPC)
    // workdir mutations land here, so this single funnel keeps
    // project_dirs in sync regardless of who initiated the change.
    if (workdir) {
      try {
        const sessionName = store.getSession(sessionId)?.name ?? ''
        getProjectsStore().touch(workdir, sessionName)
      } catch (err) {
        console.error('[variables.gateway] project-dirs touch failed:', err)
      }
    }
    notifyWorkdirChanged(sessionId)
  },
  expandPath,
  onChange(callback) {
    workdirListeners.add(callback)
    return () => workdirListeners.delete(callback)
  },
}

/** Called from places that mutate workingDirectory outside CoreProvider.set. */
export function notifyWorkdirChanged(sessionId: string): void {
  for (const cb of workdirListeners) {
    try { cb(sessionId) } catch (err) {
      console.error('[variables.gateway] workdir listener error:', err)
    }
  }
}

// ── Session-store gateway (per-session) ─────────────

const sessionStoreListeners = new Set<(sessionId: string) => void>()

export const sessionStoreGateway: SessionStoreGateway = {
  read(sessionId) {
    const session = store.getSession(sessionId)
    return (session?.variables ?? []) as ContextVariable[]
  },
  write(sessionId, variables) {
    store.updateSessionVariables(sessionId, variables)
    notifySessionVariablesChanged(sessionId)
  },
  onChange(callback) {
    sessionStoreListeners.add(callback)
    return () => sessionStoreListeners.delete(callback)
  },
}

// ── Global custom variables ─────────────────────────

export const globalStoreGateway: GlobalStoreGateway = {
  read() {
    return getVariablesStore().getGlobalVariables()
  },
  write(variables) {
    getVariablesStore().setGlobalVariables(variables)
  },
  onChange(callback) {
    return getVariablesStore().subscribe(callback)
  },
}

export function notifySessionVariablesChanged(sessionId: string): void {
  for (const cb of sessionStoreListeners) {
    try { cb(sessionId) } catch (err) {
      console.error('[variables.gateway] session-store listener error:', err)
    }
  }
}

// ── Notes gateway (read from store) ─────────────────

export const notesGateway: NotesGateway = {
  read(which) {
    const raw = readNoteFromStore(which)
    return raw ? expandPath(raw) : ''
  },
  write(which, path) {
    if (which === 'ai_note_dir') {
      getVariablesStore().setAiNoteDir(path)
    } else if (which === 'user_note_dir') {
      getVariablesStore().setUserNoteDir(path)
    } else {
      getVariablesStore().setWorkNoteDir(path)
    }
    // Store fires its own change event via subscribe(); no redundant
    // notifyNotesDirChanged here.
  },
  expandPath,
  onChange(callback) {
    return getVariablesStore().subscribe(callback)
  },
}

function readNoteFromStore(which: NoteVarName): string {
  const s = getVariablesStore()
  if (which === 'ai_note_dir') return s.getAiNoteDir()
  if (which === 'user_note_dir') return s.getUserNoteDir()
  return s.getWorkNoteDir()
}

/**
 * Retained as a typed shim for any external caller that still
 * imports it; the store now broadcasts internally and this is a
 * no-op forward.
 */
export function notifyNotesDirChanged(): void {
  // intentionally empty
}
