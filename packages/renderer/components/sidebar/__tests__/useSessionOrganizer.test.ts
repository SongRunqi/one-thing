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

  describe('项目名册(registered project dirs)', () => {
    it('一个会话都没有的登记项目照样占一格,并按 lastUsedAt 排进项目序列', () => {
      const now = Date.now()
      sessionsStore.sessions = []
      sessionsStore.currentSessionId = ''
      const organizer = useSessionOrganizer()

      const groups = organizer.getProjectGroupedSessions(
        [
          {
            id: 'electron-1',
            name: 'Electron',
            createdAt: now,
            updatedAt: now,
            workingDirectory: '/Users/me/code/start-electron',
          },
        ] as any,
        [
          // 刚挑的目录:lastUsedAt 是此刻,压过那个有会话但更早的项目
          { path: '/Users/me/code/fresh-project', lastUsedAt: now + 1000 },
          { path: '/Users/me/code/stale-project', lastUsedAt: now - 1000 },
        ],
      )

      expect(groups.map(g => g.key)).toEqual([
        'proj:/Users/me/code/fresh-project',
        'proj:/Users/me/code/start-electron',
        'proj:/Users/me/code/stale-project',
      ])
      const fresh = groups[0]
      expect(fresh.label).toBe('fresh-project')
      expect(fresh.sessions).toEqual([])
      expect(fresh.projectPath).toBe('/Users/me/code/fresh-project')
      expect(fresh.isRegistered).toBe(true)
      // 推导出来的那一组不是名册条目 —— 「移出名册」对它没有意义
      expect(groups[1].isRegistered).toBe(false)
      expect(groups[1].projectPath).toBe('/Users/me/code/start-electron')
    })

    it('登记项目与同目录的会话并成一组,不因尾斜杠裂成两组', () => {
      const now = Date.now()
      sessionsStore.sessions = []
      sessionsStore.currentSessionId = ''
      const organizer = useSessionOrganizer()

      const groups = organizer.getProjectGroupedSessions(
        [
          {
            id: 'electron-1',
            name: 'Electron',
            createdAt: now,
            updatedAt: now,
            workingDirectory: '/Users/me/code/start-electron',
          },
        ] as any,
        [{ path: '/Users/me/code/start-electron/', lastUsedAt: now - 5000 }],
      )

      expect(groups.map(g => g.key)).toEqual(['proj:/Users/me/code/start-electron'])
      expect(groups[0].sessions.map(s => s.id)).toEqual(['electron-1'])
      expect(groups[0].isRegistered).toBe(true)
      // 有会话时按会话的活跃度排,不被陈旧的 lastUsedAt 拖下去
      expect(groups[0].projectPath).toBe('/Users/me/code/start-electron')
    })

    it('登记过的目录绕过启发式:用户显式挑的临时目录也成组', () => {
      const now = Date.now()
      const sandbox = '/var/folders/2m/xyz/T/scratch'
      sessionsStore.sessions = []
      sessionsStore.currentSessionId = ''
      const organizer = useSessionOrganizer()

      const withoutRoster = organizer.getProjectGroupedSessions([
        { id: 's1', name: 'S', createdAt: now, updatedAt: now, workingDirectory: sandbox },
      ] as any)
      expect(withoutRoster.map(g => g.key)).toEqual(['uncategorized'])

      const withRoster = organizer.getProjectGroupedSessions(
        [{ id: 's1', name: 'S', createdAt: now, updatedAt: now, workingDirectory: sandbox }] as any,
        [{ path: sandbox, lastUsedAt: now }],
      )
      expect(withRoster.map(g => g.key)).toEqual([`proj:${sandbox}`])
      expect(withRoster[0].sessions.map(s => s.id)).toEqual(['s1'])
    })

    it('带目录的新会话草稿落在它的项目组里并浮在最前;裸草稿仍进未归类', () => {
      const now = Date.now()
      sessionsStore.sessions = []
      sessionsStore.currentSessionId = ''
      const organizer = useSessionOrganizer()

      const groups = organizer.getProjectGroupedSessions(
        [
          {
            id: 'old-1',
            name: 'Old',
            createdAt: now,
            updatedAt: now + 500, // 比草稿新,但草稿仍应排在它前面
            workingDirectory: '/Users/me/code/start-electron',
          },
          {
            id: 'draft-in-project',
            name: 'New Chat',
            createdAt: now,
            updatedAt: now,
            draftKind: 'new-chat-draft',
            workingDirectory: '/Users/me/code/start-electron',
          },
          {
            id: 'bare-draft',
            name: 'New Chat',
            createdAt: now,
            updatedAt: now,
            draftKind: 'new-chat-draft',
          },
        ] as any,
        [{ path: '/Users/me/code/start-electron', lastUsedAt: now }],
      )

      const proj = groups.find(g => g.key === 'proj:/Users/me/code/start-electron')!
      expect(proj.sessions.map(s => s.id)).toEqual(['draft-in-project', 'old-1'])
      const misc = groups.find(g => g.key === 'uncategorized')!
      expect(misc.sessions.map(s => s.id)).toEqual(['bare-draft'])
    })
  })
})
