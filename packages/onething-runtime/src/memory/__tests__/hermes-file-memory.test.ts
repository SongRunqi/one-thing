import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HERMES_MEMORY_DELIMITER,
  addHermesMemoryEntry,
  buildHermesMemoryPromptFragment,
  getHermesMemoryStatus,
  readHermesMemoryFile,
  removeHermesMemoryText,
  replaceHermesMemoryText,
  type HermesMemoryWorkspaceLike,
} from '../hermes-file-memory.js'

const tempDirs: string[] = []

function makeWorkspace(): HermesMemoryWorkspaceLike {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-hermes-file-memory-'))
  tempDirs.push(root)
  return {
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime Hermes file memory', () => {
  it('appends entries to MEMORY.md using the Hermes delimiter', async () => {
    const workspace = makeWorkspace()

    await addHermesMemoryEntry({ workspace, target: 'memory', content: 'The user prefers concise answers.' })
    await addHermesMemoryEntry({ workspace, target: 'memory', content: 'Project Alpha uses Bun.' })

    const result = await readHermesMemoryFile(workspace, 'memory')
    expect(result.content).toContain(HERMES_MEMORY_DELIMITER)
    expect(result.entries).toEqual([
      'The user prefers concise answers.',
      'Project Alpha uses Bun.',
    ])
  })

  it('replaces and removes exact text matches without embeddings', async () => {
    const workspace = makeWorkspace()
    await addHermesMemoryEntry({ workspace, target: 'user', content: 'Call the user Tian.' })
    await addHermesMemoryEntry({ workspace, target: 'user', content: 'The user writes mostly in Chinese.' })

    const replaced = await replaceHermesMemoryText({
      workspace,
      target: 'user',
      oldText: 'Tian',
      newText: 'Yitian',
    })
    expect(replaced.changed).toBe(true)
    expect(replaced.matches).toBe(1)

    const removed = await removeHermesMemoryText({
      workspace,
      target: 'user',
      text: 'The user writes mostly in Chinese.',
    })
    expect(removed.changed).toBe(true)

    const result = await readHermesMemoryFile(workspace, 'user')
    expect(result.entries).toEqual(['Call the user Yitian.'])
  })

  it('builds a bounded prompt snapshot from USER.md and MEMORY.md', async () => {
    const workspace = makeWorkspace()
    await addHermesMemoryEntry({ workspace, target: 'user', content: 'The user likes concrete implementation details.' })
    await addHermesMemoryEntry({ workspace, target: 'memory', content: 'Hermes memory is file-backed and exact-match updated.' })

    const fragment = await buildHermesMemoryPromptFragment(workspace, 2000)
    const status = await getHermesMemoryStatus(workspace)

    expect(fragment).toContain('Hermes File Memory')
    expect(fragment).toContain('<hermes_user_memory>')
    expect(fragment).toContain('concrete implementation details')
    expect(fragment).toContain('file-backed and exact-match updated')
    expect(status.files).toHaveLength(2)
    expect(status.files.every(file => file.exists)).toBe(true)
  })
})
