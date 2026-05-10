import { describe, expect, it } from 'vitest'
import {
  SessionStoreProvider,
  type SessionStoreGateway,
} from '../providers/session-store.js'
import { CoreProvider } from '../providers/core.js'
import { VariableRegistry } from '../registry.js'
import {
  VariableError,
  type ContextVariable,
  type VariableContext,
} from '../types.js'

const ctx: VariableContext = { sessionId: 'sess-a' }

function gateway(initial: Record<string, ContextVariable[]> = {}): SessionStoreGateway & {
  state: Map<string, ContextVariable[]>
  fire: (sid: string) => void
} {
  const state = new Map(Object.entries(initial))
  const listeners = new Set<(sid: string) => void>()
  return {
    state,
    read: (sid) => state.get(sid) ?? [],
    write: (sid, vars) => { state.set(sid, vars) },
    onChange: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    fire: (sid) => {
      for (const cb of listeners) cb(sid)
    },
  }
}

describe('SessionStoreProvider.list', () => {
  it('returns persisted custom variables, filtering reserved names defensively', () => {
    const gw = gateway({
      'sess-a': [
        { name: 'x', value: '1' },
        // Legacy data carrying a reserved name — must be filtered.
        { name: 'cwd', value: '/' },
      ],
    })
    const out = new SessionStoreProvider(gw).list(ctx)
    expect(out).toEqual([
      expect.objectContaining({ name: 'x', value: '1' }),
    ])
  })

  it('returns [] when nothing is persisted', () => {
    const out = new SessionStoreProvider(gateway()).list(ctx)
    expect(out).toEqual([])
  })
})

describe('SessionStoreProvider.claims', () => {
  it('claims any non-reserved name', () => {
    const p = new SessionStoreProvider(gateway())
    expect(p.claims('foo')).toBe(true)
    expect(p.claims('my_var')).toBe(true)
    // pwd is not reserved — session-store may take it.
    expect(p.claims('pwd')).toBe(true)
    // project_dirs is no longer in the variables subsystem at all
    // — but the name is also not reserved, so session-store would
    // claim it. (Reserved names are workdir / cwd / home / *_note_dir.)
    expect(p.claims('project_dirs')).toBe(true)
    expect(p.claims('workdir')).toBe(false)
    expect(p.claims('cwd')).toBe(false)
    expect(p.claims('ai_note_dir')).toBe(false)
    expect(p.claims('work_note_dir')).toBe(false)
  })
})

describe('SessionStoreProvider.set', () => {
  it('appends a new variable', async () => {
    const gw = gateway()
    const p = new SessionStoreProvider(gw)
    const result = await p.set(ctx, { name: 'foo', value: '1', description: 'desc' })
    expect(result.name).toBe('foo')
    expect(result.updatedAt).toBeGreaterThan(0)
    expect(gw.state.get('sess-a')).toEqual([
      expect.objectContaining({ name: 'foo', value: '1', description: 'desc' }),
    ])
  })

  it('updates existing variable in place (no count growth)', async () => {
    const gw = gateway({
      'sess-a': [{ name: 'foo', value: 'old' }],
    })
    const p = new SessionStoreProvider(gw)
    await p.set(ctx, { name: 'foo', value: 'new' })
    const stored = gw.state.get('sess-a')!
    expect(stored).toHaveLength(1)
    expect(stored[0].value).toBe('new')
  })

  it('rejects reserved names defensively', async () => {
    const p = new SessionStoreProvider(gateway())
    try {
      await p.set(ctx, { name: 'workdir', value: '/x' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(VariableError)
      expect((err as VariableError).code).toBe('RESERVED')
    }
  })

  it('throws LIMIT_EXCEEDED when adding past the cap', async () => {
    const initial: ContextVariable[] = Array.from({ length: 3 }, (_, i) => ({
      name: `v${i}`,
      value: String(i),
    }))
    const gw = gateway({ 'sess-a': initial })
    const p = new SessionStoreProvider(gw, { maxPerSession: 3 })
    try {
      await p.set(ctx, { name: 'overflow', value: 'x' })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('LIMIT_EXCEEDED')
    }
  })

  it('updating an existing variable at the cap is allowed', async () => {
    const initial: ContextVariable[] = Array.from({ length: 3 }, (_, i) => ({
      name: `v${i}`,
      value: String(i),
    }))
    const gw = gateway({ 'sess-a': initial })
    const p = new SessionStoreProvider(gw, { maxPerSession: 3 })
    await p.set(ctx, { name: 'v0', value: 'updated' })
    expect(gw.state.get('sess-a')!.find(v => v.name === 'v0')?.value).toBe('updated')
  })
})

describe('SessionStoreProvider.delete', () => {
  it('removes the named variable', async () => {
    const gw = gateway({
      'sess-a': [{ name: 'foo', value: '1' }],
    })
    const p = new SessionStoreProvider(gw)
    await p.delete(ctx, 'foo')
    expect(gw.state.get('sess-a')).toEqual([])
  })

  it('throws NOT_FOUND when the variable is missing', async () => {
    const p = new SessionStoreProvider(gateway())
    try {
      await p.delete(ctx, 'foo')
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('NOT_FOUND')
    }
  })

  it('rejects deleting reserved names', async () => {
    const p = new SessionStoreProvider(gateway())
    try {
      await p.delete(ctx, 'workdir')
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('RESERVED')
    }
  })
})

describe('SessionStoreProvider end-to-end with registry + core', () => {
  it('routes workdir to core, foo to session-store', async () => {
    const reg = new VariableRegistry()
    const coreState = new Map<string, string>()
    reg.register(new CoreProvider({
      read: (sid) => coreState.get(sid) ?? '',
      write: (sid, wd) => { coreState.set(sid, wd) },
      expandPath: (s) => s,
    }))
    const sessGw = gateway()
    reg.register(new SessionStoreProvider(sessGw))

    // workdir falls to core (claims it first by priority)
    expect(reg.list(ctx)).resolves
    await reg.set(ctx, { name: 'foo', value: 'bar' })
    expect(sessGw.state.get('sess-a')).toEqual([
      expect.objectContaining({ name: 'foo', value: 'bar' }),
    ])
  })

  it('list combines providers without duplicate names', async () => {
    const reg = new VariableRegistry()
    reg.register(new CoreProvider({
      read: () => '/work',
      write: () => undefined,
      expandPath: (s) => s,
    }))
    reg.register(new SessionStoreProvider(gateway({
      'sess-a': [{ name: 'foo', value: '1' }],
    })))
    const list = await reg.list(ctx)
    expect(list.map(v => v.name).sort()).toEqual(['foo', 'workdir'])
  })

  it('forwards external session-store change as a session-scoped event', async () => {
    const reg = new VariableRegistry()
    const gw = gateway()
    reg.register(new SessionStoreProvider(gw))
    const events: string[] = []
    reg.subscribe((c) => events.push(c.sessionId))
    gw.state.set('sess-a', [{ name: 'foo', value: '1' }])
    gw.fire('sess-a')
    await new Promise(r => setTimeout(r, 0))
    expect(events).toEqual(['sess-a'])
  })
})
