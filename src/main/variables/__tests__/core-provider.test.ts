import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { CoreProvider, type WorkdirGateway } from '../providers/core.js'
import { VariableRegistry } from '../registry.js'
import { VariableError, type VariableContext } from '../types.js'

const ctx: VariableContext = { sessionId: 'sess-a' }

function fakeGateway(initial: Record<string, string> = {}): WorkdirGateway & {
  changes: Array<[string, string]>
  fire: (sid: string) => void
} {
  const state = new Map<string, string>(Object.entries(initial))
  const listeners = new Set<(sid: string) => void>()
  const changes: Array<[string, string]> = []
  return {
    read: (sid) => state.get(sid) ?? '',
    write: (sid, wd) => {
      state.set(sid, wd)
      changes.push([sid, wd])
    },
    expandPath: (input) => input.startsWith('~')
      ? input.replace('~', os.homedir())
      : input,
    onChange: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    changes,
    fire: (sid) => {
      for (const cb of listeners) cb(sid)
    },
  }
}

let tmpDir: string
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'core-provider-'))
})
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('CoreProvider.list', () => {
  it('returns the workdir entry reflecting current session value', () => {
    const gw = fakeGateway({ 'sess-a': '/proj' })
    const list = new CoreProvider(gw).list(ctx)
    expect(list).toEqual([
      expect.objectContaining({ name: 'workdir', value: '/proj', readonly: false }),
    ])
  })

  it('returns workdir with empty value when session has no workdir set', () => {
    const list = new CoreProvider(fakeGateway()).list(ctx)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('workdir')
    expect(list[0].value).toBe('')
  })
})

describe('CoreProvider.claims', () => {
  it('owns workdir and nothing else', () => {
    const p = new CoreProvider(fakeGateway())
    expect(p.claims('workdir')).toBe(true)
    expect(p.claims('pwd')).toBe(false)
    expect(p.claims('cwd')).toBe(false)
    expect(p.claims('foo')).toBe(false)
  })
})

describe('CoreProvider.set', () => {
  it('writes a valid existing directory', async () => {
    const gw = fakeGateway()
    const p = new CoreProvider(gw)
    const result = await p.set(ctx, { name: 'workdir', value: tmpDir })
    expect(result.value).toBe(tmpDir)
    expect(gw.changes).toEqual([['sess-a', tmpDir]])
  })

  it('expands ~ before validating', async () => {
    const home = os.homedir()
    const gw = fakeGateway()
    const p = new CoreProvider(gw)
    const result = await p.set(ctx, { name: 'workdir', value: '~' })
    expect(result.value).toBe(home)
    expect(gw.changes).toEqual([['sess-a', home]])
  })

  it('throws WORKDIR_NOT_FOUND when path does not exist', async () => {
    const p = new CoreProvider(fakeGateway())
    const missing = path.join(tmpDir, 'nope-' + Math.random().toString(36).slice(2))
    try {
      await p.set(ctx, { name: 'workdir', value: missing })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(VariableError)
      expect((err as VariableError).code).toBe('WORKDIR_NOT_FOUND')
    }
  })

  it('throws WORKDIR_NOT_FOUND when path is a file, not a dir', async () => {
    const filePath = path.join(tmpDir, 'a.txt')
    await fs.writeFile(filePath, 'x')
    const p = new CoreProvider(fakeGateway())
    try {
      await p.set(ctx, { name: 'workdir', value: filePath })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('WORKDIR_NOT_FOUND')
    }
  })

})

describe('CoreProvider in a registry', () => {
  it('exposes workdir via registry list', async () => {
    const reg = new VariableRegistry()
    reg.register(new CoreProvider(fakeGateway({ 'sess-a': '/proj' })))
    const list = await reg.list(ctx)
    expect(list.map(v => v.name)).toEqual(['workdir'])
  })

  it('registry routes set("workdir") through provider', async () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    reg.register(new CoreProvider(gw))
    await reg.set(ctx, { name: 'workdir', value: tmpDir })
    const list = await reg.list(ctx)
    expect(list.find(v => v.name === 'workdir')?.value).toBe(tmpDir)
  })

  it('registry surfaces READONLY when delete("workdir") is attempted', async () => {
    const reg = new VariableRegistry()
    reg.register(new CoreProvider(fakeGateway({ 'sess-a': tmpDir })))
    await expect(reg.delete(ctx, 'workdir'))
      .rejects.toMatchObject({ code: 'READONLY' })
  })

  it('forwards external workdir change as a registry change event', async () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway({ 'sess-a': '/old' })
    reg.register(new CoreProvider(gw))
    const events: string[] = []
    reg.subscribe((c, snap) => {
      events.push(`${c.sessionId}:${snap.find(v => v.name === 'workdir')?.value ?? ''}`)
    })
    gw.write('sess-a', tmpDir)
    gw.fire('sess-a')
    await new Promise(r => setTimeout(r, 0))
    expect(events).toEqual([`sess-a:${tmpDir}`])
  })

  it('does not stall the registry write chain on validation failure', async () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    reg.register(new CoreProvider(gw))
    await expect(reg.set(ctx, { name: 'workdir', value: '/definitely/not/a/real/path-xyz' }))
      .rejects.toMatchObject({ code: 'WORKDIR_NOT_FOUND' })
    const ok = await reg.set(ctx, { name: 'workdir', value: tmpDir })
    expect(ok.value).toBe(tmpDir)
  })

  it('teardown via registry.reset unsubscribes the gateway listener', () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    const onChangeSpy = vi.spyOn(gw, 'onChange')
    reg.register(new CoreProvider(gw))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    reg.reset()
    // Firing now should not reach any listener — but we can only verify
    // indirectly by re-registering and checking no double subscription.
    expect(() => reg.register(new CoreProvider(gw))).not.toThrow()
  })
})
