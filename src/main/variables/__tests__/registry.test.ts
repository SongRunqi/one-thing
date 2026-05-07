import { describe, expect, it, beforeEach, vi } from 'vitest'
import { VariableRegistry } from '../registry.js'
import {
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'

const ctx: VariableContext = { sessionId: 'sess-a' }

function provider(opts: {
  id: string
  priority?: number
  vars?: ContextVariable[]
  claims?: (name: string) => boolean
  set?: VariableProvider['set']
  delete?: VariableProvider['delete']
  onExternalChange?: VariableProvider['onExternalChange']
}): VariableProvider {
  const store = new Map<string, ContextVariable>()
  for (const v of opts.vars ?? []) store.set(v.name, v)

  const p: VariableProvider = {
    id: opts.id,
    priority: opts.priority,
    list: () => [...store.values()],
    // Default to claim-all so tests that add new vars don't have to spell it out.
    // Tests that need a narrower claim pass `claims` explicitly.
    claims: opts.claims ?? (() => true),
  }
  if (opts.set !== undefined) {
    p.set = opts.set as VariableProvider['set']
  } else if (opts.set !== null) {
    p.set = (_c: VariableContext, input: SetInput) => {
      const next: ContextVariable = {
        name: input.name,
        value: input.value,
        description: input.description,
      }
      store.set(input.name, next)
      return next
    }
  }
  if (opts.delete !== undefined) {
    p.delete = opts.delete as VariableProvider['delete']
  } else if (opts.delete !== null) {
    p.delete = (_c: VariableContext, name: string) => {
      store.delete(name)
    }
  }
  if (opts.onExternalChange) p.onExternalChange = opts.onExternalChange
  return p
}

let reg: VariableRegistry
beforeEach(() => {
  reg = new VariableRegistry()
})

describe('register', () => {
  it('rejects duplicate provider IDs', () => {
    reg.register(provider({ id: 'a' }))
    expect(() => reg.register(provider({ id: 'a' }))).toThrowError(VariableError)
  })

  it('orders providers by ascending priority for write routing', async () => {
    const order: string[] = []
    reg.register(provider({
      id: 'lo', priority: 200,
      claims: () => true,
      set: (_c, input) => {
        order.push('lo')
        return { name: input.name, value: input.value }
      },
    }))
    reg.register(provider({
      id: 'hi', priority: 50,
      claims: () => true,
      set: (_c, input) => {
        order.push('hi')
        return { name: input.name, value: input.value }
      },
    }))
    await reg.set(ctx, { name: 'x', value: '1' })
    expect(order).toEqual(['hi'])
  })
})

describe('list', () => {
  it('aggregates across providers', async () => {
    reg.register(provider({
      id: 'a',
      vars: [{ name: 'a', value: '1' }],
    }))
    reg.register(provider({
      id: 'b',
      vars: [{ name: 'b', value: '2' }],
    }))
    const out = await reg.list(ctx)
    expect(out.map(v => v.name).sort()).toEqual(['a', 'b'])
  })

  it('throws PROVIDER_CONFLICT on duplicate names', async () => {
    reg.register(provider({
      id: 'a',
      vars: [{ name: 'dup', value: '1' }],
    }))
    reg.register(provider({
      id: 'b',
      vars: [{ name: 'dup', value: '2' }],
    }))
    await expect(reg.list(ctx)).rejects.toMatchObject({ code: 'PROVIDER_CONFLICT' })
  })
})

describe('set', () => {
  it('routes to the claiming provider', async () => {
    reg.register(provider({ id: 'core', claims: (n) => n === 'workdir' }))
    reg.register(provider({ id: 'store', claims: () => true }))
    const result = await reg.set(ctx, { name: 'workdir', value: '/tmp' })
    expect(result.name).toBe('workdir')
    expect((await reg.list(ctx)).find(v => v.name === 'workdir')?.value).toBe('/tmp')
  })

  it('throws NO_PROVIDER if nothing claims the name', async () => {
    reg.register(provider({ id: 'a', claims: () => false }))
    await expect(reg.set(ctx, { name: 'x', value: '1' }))
      .rejects.toMatchObject({ code: 'NO_PROVIDER' })
  })

  it('throws READONLY when the claiming provider lacks set', async () => {
    reg.register(provider({
      id: 'ro',
      claims: () => true,
      vars: [{ name: 'sys_locked', value: '/', readonly: true }],
      set: null as unknown as VariableProvider['set'],
    }))
    await expect(reg.set(ctx, { name: 'sys_locked', value: '/x' }))
      .rejects.toMatchObject({ code: 'READONLY' })
  })

  it('rejects invalid name before dispatching', async () => {
    const setSpy = vi.fn()
    reg.register(provider({ id: 'a', claims: () => true, set: setSpy as unknown as VariableProvider['set'] }))
    await expect(reg.set(ctx, { name: '1bad', value: '1' }))
      .rejects.toMatchObject({ code: 'INVALID_NAME' })
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('rejects oversize value before dispatching', async () => {
    const setSpy = vi.fn()
    reg.register(provider({ id: 'a', claims: () => true, set: setSpy as unknown as VariableProvider['set'] }))
    await expect(reg.set(ctx, { name: 'a', value: 'x'.repeat(8 * 1024) }))
      .rejects.toMatchObject({ code: 'INVALID_VALUE' })
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('serializes concurrent writes per session', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    reg.register(provider({
      id: 'a',
      claims: () => true,
      set: async (_c, input) => {
        inFlight++
        maxConcurrent = Math.max(maxConcurrent, inFlight)
        await new Promise(r => setTimeout(r, 10))
        inFlight--
        return { name: input.name, value: input.value }
      },
    }))
    await Promise.all([
      reg.set(ctx, { name: 'a', value: '1' }),
      reg.set(ctx, { name: 'b', value: '2' }),
      reg.set(ctx, { name: 'c', value: '3' }),
    ])
    expect(maxConcurrent).toBe(1)
  })

  it('does not stall future writes after a failure', async () => {
    let calls = 0
    reg.register(provider({
      id: 'a',
      claims: () => true,
      set: async (_c, input) => {
        calls++
        if (calls === 1) throw new Error('boom')
        return { name: input.name, value: input.value }
      },
    }))
    await expect(reg.set(ctx, { name: 'a', value: '1' })).rejects.toThrow('boom')
    const ok = await reg.set(ctx, { name: 'a', value: '2' })
    expect(ok.value).toBe('2')
  })
})

describe('delete', () => {
  it('routes to the claiming provider', async () => {
    reg.register(provider({
      id: 'a',
      vars: [{ name: 'x', value: '1' }],
    }))
    await reg.delete(ctx, 'x')
    expect((await reg.list(ctx)).find(v => v.name === 'x')).toBeUndefined()
  })

  it('throws NOT_FOUND when nobody claims the name', async () => {
    reg.register(provider({ id: 'a', claims: () => false }))
    await expect(reg.delete(ctx, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws READONLY when claiming provider lacks delete', async () => {
    reg.register(provider({
      id: 'ro',
      claims: () => true,
      vars: [{ name: 'workdir', value: '/' }],
      delete: null as unknown as VariableProvider['delete'],
    }))
    await expect(reg.delete(ctx, 'workdir'))
      .rejects.toMatchObject({ code: 'READONLY' })
  })
})

describe('subscribe', () => {
  it('emits snapshot after successful set', async () => {
    reg.register(provider({ id: 'a' }))
    const events: ContextVariable[][] = []
    reg.subscribe((_c, snap) => events.push(snap))
    await reg.set(ctx, { name: 'foo', value: '1' })
    expect(events).toHaveLength(1)
    expect(events[0].map(v => v.name)).toEqual(['foo'])
  })

  it('does not emit on failure', async () => {
    reg.register(provider({ id: 'a', claims: () => false }))
    const events: ContextVariable[][] = []
    reg.subscribe((_c, snap) => events.push(snap))
    await expect(reg.set(ctx, { name: 'foo', value: '1' })).rejects.toThrow()
    expect(events).toHaveLength(0)
  })

  it('unsubscribe stops further events', async () => {
    reg.register(provider({ id: 'a' }))
    const events: ContextVariable[][] = []
    const off = reg.subscribe((_c, snap) => events.push(snap))
    await reg.set(ctx, { name: 'foo', value: '1' })
    off()
    await reg.set(ctx, { name: 'bar', value: '2' })
    expect(events).toHaveLength(1)
  })

  it('continues notifying other listeners when one throws', async () => {
    reg.register(provider({ id: 'a' }))
    const good = vi.fn()
    reg.subscribe(() => { throw new Error('listener fail') })
    reg.subscribe(good)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await reg.set(ctx, { name: 'foo', value: '1' })
    expect(good).toHaveBeenCalledOnce()
    consoleSpy.mockRestore()
  })

  it('forwards external-change emit() into a listener event', async () => {
    let trigger: (() => void) | undefined
    const teardown = vi.fn()
    reg.register(provider({
      id: 'ext',
      vars: [{ name: 'x', value: '1' }],
      onExternalChange: (emit) => {
        trigger = () => emit(ctx)
        return teardown
      },
    }))
    const events: Array<{ name: string; value: string }[]> = []
    reg.subscribe((_c, snap) => {
      events.push(snap.map(v => ({ name: v.name, value: v.value })))
    })
    expect(trigger).toBeDefined()
    trigger!()
    await new Promise(r => setTimeout(r, 0))
    expect(events).toEqual([[{ name: 'x', value: '1' }]])

    reg.reset()
    expect(teardown).toHaveBeenCalled()
  })
})
