import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetProjectsStoreForTests } from '../store.js'
import { setRootDirForTests } from '../persistence.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-projects-store-'))
  setRootDirForTests(tmpDir)
})

afterEach(async () => {
  setRootDirForTests(null)
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('Onething project dirs store', () => {
  it('lists, adds, gets, updates, removes, and persists projects', async () => {
    const store = resetProjectsStoreForTests()
    expect(store.list()).toEqual([])

    const first = store.add({ path: '/foo', description: 'Foo' })
    await new Promise(resolve => setTimeout(resolve, 5))
    const second = store.add({ path: '/bar', description: 'Bar' })

    expect(first.id).toMatch(/^[0-9a-f]{16}$/)
    expect(store.list().map(entry => entry.path)).toEqual(['/bar', '/foo'])
    expect(store.get('/foo')).toMatchObject({ path: '/foo', description: 'Foo' })

    const updated = store.update('/foo', { description: 'Foo updated' })
    expect(updated?.description).toBe('Foo updated')
    expect(store.get('/foo')?.description).toBe('Foo updated')

    expect(store.remove(second.path)).toBe(true)
    expect(store.remove(second.path)).toBe(false)

    const nextStore = resetProjectsStoreForTests()
    expect(nextStore.list().map(entry => entry.path)).toEqual(['/foo'])
    expect(nextStore.get('/foo')?.description).toBe('Foo updated')
  })

  it('touch creates with fallback and preserves existing descriptions', async () => {
    const store = resetProjectsStoreForTests()
    expect(store.touch('/p', 'First').description).toBe('First')
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(store.touch('/p', 'Second').description).toBe('First')
  })

  it('rejects empty paths and notifies subscribers on mutations', () => {
    const store = resetProjectsStoreForTests()
    let count = 0
    const off = store.subscribe(() => count++)

    expect(() => store.add({ path: '   ' })).toThrow(/non-empty path/)
    store.add({ path: '/a' })
    store.update('/a', { description: 'A' })
    store.remove('/a')
    expect(count).toBe(3)

    off()
    store.add({ path: '/b' })
    expect(count).toBe(3)
  })
})
