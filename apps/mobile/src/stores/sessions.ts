import { create } from 'zustand'
import type { SessionMeta } from '@shared/ipc/chat.js'
import { createSession, listSessions, type ServerTarget } from '../lib/api'

interface SessionsState {
  sessions: SessionMeta[]
  loading: boolean
  error: string | null
  refresh: (target: ServerTarget) => Promise<void>
  create: (target: ServerTarget, name: string) => Promise<SessionMeta | null>
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  loading: false,
  error: null,

  refresh: async (target) => {
    set({ loading: true, error: null })
    try {
      const result = await listSessions(target)
      set({ sessions: result.sessions ?? [], loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  create: async (target, name) => {
    const result = await createSession(target, name)
    if (!result.session) return null
    const session = result.session
    set((state) => ({ sessions: [session, ...state.sessions] }))
    return session
  },
}))
