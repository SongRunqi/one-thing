/**
 * Integration tests for ProjectsStore. These touch the real filesystem
 * via `setRootDirForTests` redirecting to a temp directory, so we
 * exercise the whole index + per-file persistence path end-to-end.
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetProjectsStoreForTests } from '../store/index.js'
import { setRootDirForTests } from '../store/persistence.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projects-store-'))
  setRootDirForTests(tmpDir)
})

afterEach(async () => {
  setRootDirForTests(null)
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('list / add / get', () => {
  it('list is empty on a fresh store', () => {
    const store = resetProjectsStoreForTests()
    expect(store.list()).toEqual([])
  })

  it('add creates a project with addedAt and lastUsedAt set', () => {
    const store = resetProjectsStoreForTests()
    const project = store.add({ path: '/foo', description: 'Foo' })
    expect(project.path).toBe('/foo')
    expect(project.description).toBe('Foo')
    expect(project.addedAt).toBeGreaterThan(0)
    expect(project.lastUsedAt).toBeGreaterThan(0)
    expect(project.id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('list returns one entry sorted by lastUsedAt desc', async () => {
    const store = resetProjectsStoreForTests()
    store.add({ path: '/a', description: 'A' })
    await new Promise(r => setTimeout(r, 5))
    store.add({ path: '/b', description: 'B' })
    const out = store.list()
    expect(out.map(e => e.path)).toEqual(['/b', '/a'])
  })

  it('get returns full record, including future-extensible fields', () => {
    const store = resetProjectsStoreForTests()
    store.add({ path: '/foo', description: 'Foo' })
    const got = store.get('/foo')
    expect(got).toMatchObject({
      path: '/foo',
      description: 'Foo',
    })
  })

  it('get returns null for unknown paths', () => {
    const store = resetProjectsStoreForTests()
    expect(store.get('/missing')).toBeNull()
  })

  it('add of an existing path refreshes lastUsedAt and keeps description by default', async () => {
    const store = resetProjectsStoreForTests()
    const first = store.add({ path: '/p', description: 'first' })
    await new Promise(r => setTimeout(r, 5))
    const second = store.add({ path: '/p' })
    expect(second.description).toBe('first')
    expect(second.lastUsedAt).toBeGreaterThan(first.lastUsedAt)
  })

  it('add of an existing path with new description overrides it', () => {
    const store = resetProjectsStoreForTests()
    store.add({ path: '/p', description: 'old' })
    const updated = store.add({ path: '/p', description: 'new' })
    expect(updated.description).toBe('new')
  })

  it('rejects empty path', () => {
    const store = resetProjectsStoreForTests()
    expect(() => store.add({ path: '   ' })).toThrow(/non-empty path/)
  })
})

describe('touch', () => {
  it('creates with fallback description', () => {
    const store = resetProjectsStoreForTests()
    const e = store.touch('/p', 'Session Name')
    expect(e.description).toBe('Session Name')
  })

  it('preserves existing description on subsequent touches', async () => {
    const store = resetProjectsStoreForTests()
    store.touch('/p', 'First')
    await new Promise(r => setTimeout(r, 5))
    const after = store.touch('/p', 'Second (should be ignored)')
    expect(after.description).toBe('First')
  })
})

describe('update', () => {
  it('renames description without changing order', () => {
    const store = resetProjectsStoreForTests()
    store.add({ path: '/a' })
    store.add({ path: '/b' })
    const ok = store.update('/a', { description: 'A!' })
    expect(ok).not.toBeNull()
    expect(store.get('/a')?.description).toBe('A!')
  })

  it('returns null when path is unknown', () => {
    const store = resetProjectsStoreForTests()
    expect(store.update('/missing', { description: 'x' })).toBeNull()
  })
})

describe('remove', () => {
  it('returns true on success, false when absent', () => {
    const store = resetProjectsStoreForTests()
    store.add({ path: '/a' })
    expect(store.remove('/a')).toBe(true)
    expect(store.remove('/a')).toBe(false)
    expect(store.list()).toEqual([])
    expect(store.get('/a')).toBeNull()
  })
})

describe('persistence round-trip', () => {
  it('a fresh store reads what the previous one wrote', () => {
    const a = resetProjectsStoreForTests()
    a.add({ path: '/foo', description: 'Foo' })
    a.add({ path: '/bar', description: 'Bar' })

    const b = resetProjectsStoreForTests()
    expect(b.list().map(e => e.path).sort()).toEqual(['/bar', '/foo'])
    expect(b.get('/foo')?.description).toBe('Foo')
  })
})

describe('subscribe', () => {
  it('fires on every mutation', () => {
    const store = resetProjectsStoreForTests()
    let count = 0
    const off = store.subscribe(() => count++)
    store.add({ path: '/a' })
    store.update('/a', { description: 'A' })
    store.remove('/a')
    expect(count).toBe(3)
    off()
    store.add({ path: '/b' })
    expect(count).toBe(3)
  })
})
