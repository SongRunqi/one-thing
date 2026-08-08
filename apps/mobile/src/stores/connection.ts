import { create } from 'zustand'
import { checkAuth, type ServerTarget } from '../lib/api'
import { clearTarget, loadTarget, saveTarget } from '../lib/secure'

export type ConnectionStatus = 'idle' | 'restoring' | 'connecting' | 'connected' | 'error'

interface ConnectionState {
  target: ServerTarget | null
  status: ConnectionStatus
  error: string | null
  /** Load persisted target on app start and validate it against the server. */
  restore: () => Promise<void>
  /** Validate target (GET /api/capabilities), persist on success. */
  connect: (target: ServerTarget) => Promise<boolean>
  disconnect: () => Promise<void>
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  target: null,
  status: 'idle',
  error: null,

  restore: async () => {
    set({ status: 'restoring' })
    const stored = await loadTarget()
    if (!stored) {
      set({ status: 'idle' })
      return
    }
    // Reuse connect() so a stale/dead server drops us back to the pairing page.
    set({ status: 'connecting' })
    try {
      await checkAuth(stored)
      set({ target: stored, status: 'connected', error: null })
    } catch {
      await clearTarget()
      set({ target: null, status: 'idle', error: null })
    }
  },

  connect: async (target) => {
    set({ status: 'connecting', error: null })
    try {
      await checkAuth(target)
      await saveTarget(target)
      set({ target, status: 'connected', error: null })
      return true
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  },

  disconnect: async () => {
    await clearTarget()
    set({ target: null, status: 'idle', error: null })
  },
}))
