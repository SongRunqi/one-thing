import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_AGENT_MAX_TURNS,
  composeAgentPermissionMode,
  resetUnknownPermissionModeWarnings,
  resolveAgentProfile,
  resolveAgentToolSurface,
} from '../profile.js'
import { resolveCollabToolAllowlist } from '../../collab/tool-surface.js'
import type { OnethingAgentDefinition } from '../store.js'

function agent(overrides: Partial<OnethingAgentDefinition> = {}): OnethingAgentDefinition {
  return {
    id: 'agent-a',
    name: 'A',
    systemPrompt: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('resolveAgentToolSurface', () => {
  /* The collab rules moved here verbatim; this table is the proof. Note the
     'agent' kind: since W18 the room RESPONSE turn runs in the agent's own
     execution session, so it must take the room branch too. */
  const cases: Array<{
    name: string
    kind?: string
    ownTools: string[] | null
    expected: string[] | null
  }> = [
    { name: 'chat, no allowlist', kind: undefined, ownTools: null, expected: null },
    { name: 'chat, allowlist', kind: undefined, ownTools: ['bash'], expected: ['bash'] },
    // Union(collab-team-v2 §2.1;2026-07-30 曾收紧为 replace,同日撤销):
    // 配了白名单 → own ∪ {say, board};没配 → 不限制。
    { name: 'room unions', kind: 'room', ownTools: ['bash'], expected: ['bash', 'say', 'board', 'dm'] },
    { name: 'room without allowlist stays unrestricted', kind: 'room', ownTools: null, expected: null },
    { name: 'agent kind unions', kind: 'agent', ownTools: ['bash'], expected: ['bash', 'say', 'board', 'dm'] },
    { name: 'agent kind without allowlist stays unrestricted', kind: 'agent', ownTools: null, expected: null },
    { name: 'work unions', kind: 'work', ownTools: ['bash'], expected: ['bash', 'board', 'say'] },
    { name: 'work without allowlist stays unrestricted', kind: 'work', ownTools: null, expected: null },
    { name: 'work does not duplicate', kind: 'work', ownTools: ['board'], expected: ['board', 'say'] },
    { name: 'unknown kind passes through', kind: 'archive', ownTools: ['bash'], expected: ['bash'] },
  ]

  for (const testCase of cases) {
    it(`${testCase.name} — matches the collab rule it mirrors`, () => {
      const surface = resolveAgentToolSurface({
        ownTools: testCase.ownTools,
        sessionKind: testCase.kind,
      })
      expect(surface).toEqual(testCase.expected)
      expect(surface).toEqual(
        resolveCollabToolAllowlist({ kind: testCase.kind, ownTools: testCase.ownTools }),
      )
    })
  }

  it('applies an explicit grant outside collab sessions', () => {
    // union grants: layered onto the agent's own tools.
    expect(resolveAgentToolSurface({ ownTools: ['bash'], grants: ['collab-work'] }))
      .toEqual(['bash', 'board', 'say'])
    expect(resolveAgentToolSurface({ ownTools: ['bash'], grants: ['collab-room'] }))
      .toEqual(['bash', 'say', 'board', 'dm'])
  })

  it('ignores unknown grants', () => {
    expect(resolveAgentToolSurface({ ownTools: ['bash'], grants: ['nope'] })).toEqual(['bash'])
  })
})

describe('composeAgentPermissionMode', () => {
  const cases: Array<[string | undefined, string | undefined, string]> = [
    // agent, session/settings, expected
    [undefined, undefined, 'normal'],
    [undefined, 'dangerously-allow-all', 'dangerously-allow-all'],
    [undefined, 'auto-accept-edits', 'auto-accept-edits'],
    ['normal', 'dangerously-allow-all', 'normal'],
    ['normal', 'auto-accept-edits', 'normal'],
    ['auto-accept-edits', 'dangerously-allow-all', 'auto-accept-edits'],
    ['dangerously-allow-all', 'normal', 'normal'],
    ['auto-accept-edits', 'normal', 'normal'],
    ['dangerously-allow-all', undefined, 'normal'],
    // P1-4: an unorderable mode does not participate — the configured chain
    // stands (it used to rank as strictest and silently pin the turn).
    ['mystery-mode', 'dangerously-allow-all', 'dangerously-allow-all'],
    ['mystery-mode', undefined, 'normal'],
    // 忽略掉不认识的会话/设置值 → 落到默认 normal,再按严格者胜。
    ['auto-accept-edits', 'mystery-mode', 'normal'],
    [undefined, 'mystery-mode', 'normal'],
  ]

  for (const [agentMode, baseMode, expected] of cases) {
    it(`agent=${agentMode ?? '—'} base=${baseMode ?? '—'} → ${expected}`, () => {
      expect(composeAgentPermissionMode(agentMode, baseMode)).toBe(expected)
    })
  }

  /**
   * P1-4 的另一半:忽略一个拼错的值不能是**静默**忽略。旧行为把不认识的模式
   * 当最严处理,agents.json 里拼错一个字就能压死房间/全局设置且无迹可寻。
   */
  describe('unknown modes are loud', () => {
    beforeEach(() => {
      resetUnknownPermissionModeWarnings()
    })

    it('warns once per (origin, agent, mode) and names both', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(composeAgentPermissionMode('mystery-mode', 'normal', undefined, { agentId: 'agent-a' }))
          .toBe('normal')
        composeAgentPermissionMode('mystery-mode', 'normal', undefined, { agentId: 'agent-a' })

        expect(warn).toHaveBeenCalledTimes(1)
        const message = String(warn.mock.calls[0][0])
        expect(message).toContain('mystery-mode')
        expect(message).toContain('agent-a')
      } finally {
        warn.mockRestore()
      }
    })

    it('warns for a broken session/settings value too, and falls back', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(composeAgentPermissionMode(undefined, 'auto-acept-edits')).toBe('normal')
        expect(warn).toHaveBeenCalledTimes(1)
        expect(String(warn.mock.calls[0][0])).toContain('session/settings')
      } finally {
        warn.mockRestore()
      }
    })

    it('says nothing for the modes it knows', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        composeAgentPermissionMode('normal', 'dangerously-allow-all')
        composeAgentPermissionMode(undefined, undefined)
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })

    it('surfaces the agent id when the profile resolves a typo', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const profile = resolveAgentProfile({
          agent: agent({ id: 'ops', permissionMode: 'dangerously-alow-all' }),
          settings: { tools: { permissionMode: 'auto-accept-edits' } },
        })
        expect(profile.permissionMode).toBe('auto-accept-edits')
        expect(String(warn.mock.calls[0]?.[0])).toContain('ops')
      } finally {
        warn.mockRestore()
      }
    })
  })
})

describe('resolveAgentProfile', () => {
  it('is a pure passthrough when the agent declares no boundaries', () => {
    expect(resolveAgentProfile({ agent: agent({ tools: ['bash'] }) })).toEqual({
      agentId: 'agent-a',
      name: 'A',
      systemPrompt: '',
      tools: ['bash'],
      permissionMode: 'normal',
      maxTurns: DEFAULT_AGENT_MAX_TURNS,
      model: undefined,
    })
  })

  it('lets the agent raise the turn budget over settings', () => {
    expect(resolveAgentProfile({
      agent: agent({ maxTurns: 300 }),
      settings: { chat: { maxTurns: 40 } },
    }).maxTurns).toBe(300)

    expect(resolveAgentProfile({
      agent: agent(),
      settings: { chat: { maxTurns: 40 } },
    }).maxTurns).toBe(40)
  })

  it('takes the stricter permission mode, session included', () => {
    expect(resolveAgentProfile({
      agent: agent({ permissionMode: 'normal' }),
      session: { permissionMode: 'dangerously-allow-all' },
    }).permissionMode).toBe('normal')

    // An unmarked agent stays out of the composition entirely — the collab
    // worker's inherited auto-approve keeps working.
    expect(resolveAgentProfile({
      agent: agent(),
      session: { permissionMode: 'dangerously-allow-all' },
    }).permissionMode).toBe('dangerously-allow-all')

    expect(resolveAgentProfile({
      agent: agent(),
      settings: { tools: { permissionMode: 'auto-accept-edits' } },
    }).permissionMode).toBe('auto-accept-edits')
  })

  it('yields the model binding only when the user has not pinned one', () => {
    const bound = agent({ model: { providerId: 'claude', modelId: 'sonnet' } })

    expect(resolveAgentProfile({ agent: bound }).model)
      .toEqual({ providerId: 'claude', modelId: 'sonnet' })
    expect(resolveAgentProfile({ agent: bound, session: { modelPinned: true } }).model)
      .toBeUndefined()
    expect(resolveAgentProfile({ agent: agent(), session: {} }).model).toBeUndefined()
  })

  it('unions say + board + dm onto the agent tools by session kind', () => {
    expect(resolveAgentProfile({
      agent: agent({ tools: ['bash'] }),
      session: { kind: 'room' },
    }).tools).toEqual(['bash', 'say', 'board', 'dm'])
    expect(resolveAgentProfile({
      agent: agent(),
      session: { kind: 'room' },
    }).tools).toBeNull()
  })
})
