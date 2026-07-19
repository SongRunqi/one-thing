import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CAPTURE_MAX_PENDING,
  SOUL_MEMORY_PLUGIN_ID,
  asBullet,
  dateString,
  estimateTokens,
  isDurableCandidate,
  normalizeForDedupe,
  normalizeMemoryRelativePath,
  readLimited,
  sanitizeAgentPathSegment,
  sanitizeMemoryKey,
  sha,
  writeIfMissing,
} from '../workspace.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime memory workspace helpers', () => {
  it('exposes stable soul-memory constants', () => {
    expect(SOUL_MEMORY_PLUGIN_ID).toBe('soul-memory')
    expect(CAPTURE_MAX_PENDING).toBe(20)
  })

  it('normalizes paths, keys, bullets, and date strings', () => {
    expect(dateString(new Date('2026-06-10T12:00:00Z'))).toBe('2026-06-10')
    expect(normalizeMemoryRelativePath('memory/../MEMORY.md')).toBe('memory/../MEMORY.md')
    expect(sanitizeAgentPathSegment('../Agent X')).toBe('___Agent_X')
    expect(sanitizeMemoryKey('User Likes: Tea')).toBe('user.likes.tea')
    expect(asBullet('  hello  ')).toBe('- hello')
  })

  it('keeps capture and dedupe helpers runtime-owned', () => {
    expect(isDurableCandidate({ kind: 'preference' })).toBe(true)
    expect(isDurableCandidate({ kind: 'ignore' })).toBe(false)
    expect(normalizeForDedupe('Hello, WORLD!')).toBe('hello, world!')
    expect(estimateTokens('one two three')).toBeGreaterThan(0)
    expect(sha('abc')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('wraps generic storage helpers without main-process dependencies', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-workspace-'))
    tempDirs.push(root)
    const file = path.join(root, 'note.md')

    await writeIfMissing(file, 'abcdef')
    await writeIfMissing(file, 'ignored')

    expect(readLimited(file, 20)).toBe('abcdef')
  })
})
