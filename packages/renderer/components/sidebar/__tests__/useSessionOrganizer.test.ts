import { describe, expect, it, vi } from 'vitest'
import { useSessionOrganizer } from '../useSessionOrganizer'

const sessionsStore = vi.hoisted(() => ({
  sessions: [] as any[],
  currentSessionId: '',
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => sessionsStore,
}))

describe('useSessionOrganizer', () => {

  it('groups by working directory: 置顶 → projects by recency → 未归类', () => {
    const now = Date.now()
    sessionsStore.sessions = []
    sessionsStore.currentSessionId = ''
    const organizer = useSessionOrganizer()

    const groups = organizer.getProjectGroupedSessions([
      {
        id: 'pinned-a',
        name: 'Pinned',
        createdAt: now,
        updatedAt: now,
        isPinned: true,
        workingDirectory: '/Users/me/code/start-electron',
      },
      {
        id: 'electron-1',
        name: 'Electron',
        createdAt: now,
        updatedAt: now + 100,
        workingDirectory: '/Users/me/code/start-electron',
      },
      {
        id: 'reader-1',
        name: 'Reader',
        createdAt: now,
        updatedAt: now + 900, // most recent → its project floats above electron
        workingDirectory: '/Users/me/code/transreader-swift',
      },
      {
        id: 'loose-1',
        name: 'No cwd',
        createdAt: now,
        updatedAt: now + 500,
        workingDirectory: '',
      },
    ] as any)

    expect(groups.map(g => g.key)).toEqual([
      'pinned',
      'proj:/Users/me/code/transreader-swift',
      'proj:/Users/me/code/start-electron',
      'uncategorized',
    ])
    expect(groups[1].label).toBe('transreader-swift')
    expect(groups[2].label).toBe('start-electron')
    expect(groups[3].label).toBe('未归类')
    // Pinned rows leave their project bucket for 置顶
    expect(groups[2].sessions.map(s => s.id)).toEqual(['electron-1'])
  })

  it('routes transient tool sandboxes to 未归类 instead of a junk project group', () => {
    const now = Date.now()
    sessionsStore.sessions = []
    sessionsStore.currentSessionId = ''
    const organizer = useSessionOrganizer()

    const groups = organizer.getProjectGroupedSessions([
      {
        id: 'server-temp',
        name: 'Temp',
        createdAt: now,
        updatedAt: now,
        workingDirectory: '/var/folders/2m/xyz/T/onething-server-workspaces/local-user/default',
      },
      {
        id: 'real-1',
        name: 'Real',
        createdAt: now,
        updatedAt: now + 100,
        workingDirectory: '/Users/me/code/start-electron',
      },
    ] as any)

    expect(groups.map(g => g.key)).toEqual([
      'proj:/Users/me/code/start-electron',
      'uncategorized',
    ])
    // No 'default' group; the sandbox session lands in 未归类
    expect(groups[1].sessions.map(s => s.id)).toEqual(['server-temp'])
  })

  it('tags 未归类 rows with temporal sub-headers, leaving project rows untagged', () => {
    const now = Date.now()
    const dayMs = 86_400_000
    const todayStart = new Date().setHours(0, 0, 0, 0)
    sessionsStore.sessions = []
    sessionsStore.currentSessionId = ''
    const organizer = useSessionOrganizer()

    const groups = organizer.getProjectGroupedSessions([
      {
        id: 'proj-a',
        name: 'Proj',
        createdAt: now,
        updatedAt: now,
        workingDirectory: '/Users/me/code/start-electron',
      },
      {
        id: 'misc-today',
        name: 'Today chat',
        createdAt: now,
        updatedAt: todayStart + 1000,
        workingDirectory: '',
      },
      {
        id: 'misc-yesterday',
        name: 'Yesterday chat',
        createdAt: now,
        updatedAt: todayStart - dayMs + 1000,
        workingDirectory: '',
      },
    ] as any)

    const misc = groups.find(g => g.key === 'uncategorized')!
    const byId = Object.fromEntries(misc.sessions.map(s => [s.id, s.sectionLabel]))
    expect(byId['misc-today']).toBe('今天')
    expect(byId['misc-yesterday']).toBe('昨天')

    // Project rows never carry a temporal sub-header
    const proj = groups.find(g => g.key.startsWith('proj:'))!
    expect(proj.sessions[0].sectionLabel).toBeUndefined()
  })
})
