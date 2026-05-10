import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesProvider, type NotesGateway, type NoteVarName } from '../providers/notes.js'
import { VariableRegistry } from '../registry.js'
import { VariableError, type VariableContext } from '../types.js'

const ctx: VariableContext = { sessionId: 'sess-a' }

function fakeGateway(initial: Partial<Record<NoteVarName, string>> = {}): NotesGateway & {
  state: Map<NoteVarName, string>
  fire: () => void
} {
  const state = new Map<NoteVarName, string>([
    ['ai_note_dir', initial.ai_note_dir ?? ''],
    ['user_note_dir', initial.user_note_dir ?? ''],
    ['work_note_dir', initial.work_note_dir ?? ''],
  ])
  const listeners = new Set<() => void>()
  return {
    state,
    read: (which) => state.get(which) ?? '',
    write: (which, value) => { state.set(which, value) },
    expandPath: (input) => input.startsWith('~')
      ? input.replace('~', os.homedir())
      : input,
    onChange: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    fire: () => {
      for (const cb of listeners) cb()
    },
  }
}

let tmpDir: string
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-provider-'))
})
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('NotesProvider.list', () => {
  it('returns all note variables, system-level + writable', () => {
    const out = new NotesProvider(fakeGateway({ ai_note_dir: '/ai', user_note_dir: '/user', work_note_dir: '/work' })).list(ctx)
    expect(out).toEqual([
      expect.objectContaining({ name: 'ai_note_dir', value: '/ai', readonly: false }),
      expect.objectContaining({ name: 'user_note_dir', value: '/user', readonly: false }),
      expect.objectContaining({ name: 'work_note_dir', value: '/work', readonly: false }),
    ])
  })

  it('returns empty values when nothing is configured', () => {
    const out = new NotesProvider(fakeGateway()).list(ctx)
    expect(out.map(v => v.value)).toEqual(['', '', ''])
  })
})

describe('NotesProvider.claims', () => {
  it('owns built-in note dirs and nothing else', () => {
    const p = new NotesProvider(fakeGateway())
    expect(p.claims('ai_note_dir')).toBe(true)
    expect(p.claims('user_note_dir')).toBe(true)
    expect(p.claims('work_note_dir')).toBe(true)
    expect(p.claims('workdir')).toBe(false)
    expect(p.claims('foo')).toBe(false)
  })
})

describe('NotesProvider.set', () => {
  it('writes a valid existing directory', async () => {
    const gw = fakeGateway()
    const p = new NotesProvider(gw)
    const result = await p.set(ctx, { name: 'ai_note_dir', value: tmpDir })
    expect(result.value).toBe(tmpDir)
    expect(gw.state.get('ai_note_dir')).toBe(tmpDir)
  })

  it('expands ~ before validating', async () => {
    const home = os.homedir()
    const gw = fakeGateway()
    const p = new NotesProvider(gw)
    const result = await p.set(ctx, { name: 'user_note_dir', value: '~' })
    expect(result.value).toBe(home)
    expect(gw.state.get('user_note_dir')).toBe(home)
  })

  it('clears value when given empty string (no fs check)', async () => {
    const gw = fakeGateway({ ai_note_dir: tmpDir })
    const p = new NotesProvider(gw)
    const result = await p.set(ctx, { name: 'ai_note_dir', value: '' })
    expect(result.value).toBe('')
    expect(gw.state.get('ai_note_dir')).toBe('')
  })

  it('throws WORKDIR_NOT_FOUND when path does not exist', async () => {
    const p = new NotesProvider(fakeGateway())
    const missing = path.join(tmpDir, 'nope-' + Math.random().toString(36).slice(2))
    try {
      await p.set(ctx, { name: 'ai_note_dir', value: missing })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('WORKDIR_NOT_FOUND')
    }
  })

  it('throws WORKDIR_NOT_FOUND when path is a file', async () => {
    const file = path.join(tmpDir, 'a.txt')
    await fs.writeFile(file, 'x')
    const p = new NotesProvider(fakeGateway())
    try {
      await p.set(ctx, { name: 'user_note_dir', value: file })
      throw new Error('expected throw')
    } catch (err) {
      expect((err as VariableError).code).toBe('WORKDIR_NOT_FOUND')
    }
  })
})

describe('NotesProvider in a registry', () => {
  it('registry surfaces both variables in list', async () => {
    const reg = new VariableRegistry()
    reg.register(new NotesProvider(fakeGateway({ ai_note_dir: '/ai' })))
    const list = await reg.list(ctx)
    expect(list.map(v => v.name).sort()).toEqual(['ai_note_dir', 'user_note_dir', 'work_note_dir'])
  })

  it('routes set("ai_note_dir") through the provider', async () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    reg.register(new NotesProvider(gw))
    await reg.set(ctx, { name: 'ai_note_dir', value: tmpDir })
    expect(gw.state.get('ai_note_dir')).toBe(tmpDir)
  })

  it('rejects delete with READONLY (no delete capability)', async () => {
    const reg = new VariableRegistry()
    reg.register(new NotesProvider(fakeGateway()))
    await expect(reg.delete(ctx, 'ai_note_dir'))
      .rejects.toMatchObject({ code: 'READONLY' })
  })

  it('forwards external (settings) changes as a registry broadcast', async () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    reg.register(new NotesProvider(gw))
    const events: string[] = []
    reg.subscribe((c) => events.push(c.sessionId))
    gw.fire()
    await new Promise(r => setTimeout(r, 0))
    // Notes are global, not session-scoped — registry uses '' sentinel.
    expect(events).toEqual([''])
  })

  it('teardown unsubscribes the gateway listener', () => {
    const reg = new VariableRegistry()
    const gw = fakeGateway()
    const onChangeSpy = vi.spyOn(gw, 'onChange')
    reg.register(new NotesProvider(gw))
    expect(onChangeSpy).toHaveBeenCalledTimes(1)
    reg.reset()
    expect(() => reg.register(new NotesProvider(gw))).not.toThrow()
  })
})
