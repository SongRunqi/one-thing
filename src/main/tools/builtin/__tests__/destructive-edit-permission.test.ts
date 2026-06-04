import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { EditTool } from '../edit.js'

const createdDirs: string[] = []

function createContext(tmpRoot: string) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory: process.cwd(),
    workingDirectoryRoots: [tmpRoot],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
  }
}

async function createTmpFile(prefix: string, content: string) {
  const tmpRoot = path.join(process.cwd(), 'TMP')
  const dir = path.join(tmpRoot, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const filePath = path.join(dir, 'target.lua')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  createdDirs.push(dir)
  return { tmpRoot, filePath }
}

describe('destructive edit policy analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('allows explicit large replacements through execute after policy approval', async () => {
    const original = [
      '    ["6406584"] = "26406584",',
      '',
      '    -- EMEA 0615',
      '    ["7064499707"] = dnisMap["37064499707"] or "37064499707",',
      '    ["4316530033"] = dnisMap["34316530033"] or "34316530033",',
      '    ["6107318"]   = dnisMap["36107318"] or "36107318",',
      '    ["6408753"]   = dnisMap["36408753"] or "36408753",',
      '    ["6508272"]   = dnisMap["46508272"] or "46508272",',
      '    ["6008614"]   = dnisMap["46008614"] or "46008614",',
      '',
      '    -- EMEA 0615',
      '',
    ].join('\n')
    const { tmpRoot, filePath } = await createTmpFile('destructive-edit', original)

    const analysis = await EditTool.analyze!({
      path: filePath,
      edits: [{
        oldText: original.trimEnd(),
        newText: [
          '    ["6406584"] = "26406584",',
          '',
          '    -- EMEA 0615',
        ].join('\n'),
      }],
    }, createContext(tmpRoot))

    expect(analysis.effects[0]).toMatchObject({ kind: 'file_destructive_edit' })

    await EditTool.execute({
      path: filePath,
      edits: [{
        oldText: original.trimEnd(),
        newText: [
          '    ["6406584"] = "26406584",',
          '',
          '    -- EMEA 0615',
        ].join('\n'),
      }],
    }, { ...createContext(tmpRoot), approvedAnalysis: analysis })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toContain('    ["6406584"] = "26406584",')
  })

  it('classifies large non-truncating deletions as destructive edit effects', async () => {
    const original = [
      'start',
      'remove 1',
      'remove 2',
      'remove 3',
      'remove 4',
      'remove 5',
      'remove 6',
      'end',
      '',
    ].join('\n')
    const { tmpRoot, filePath } = await createTmpFile('large-delete-edit', original)

    const analysis = await EditTool.analyze!({
      path: filePath,
      edits: [{ oldText: original.trimEnd(), newText: 'start changed\nend changed' }],
    }, createContext(tmpRoot))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'file_destructive_edit',
      resources: [path.join(path.dirname(filePath), '*')],
      metadata: expect.objectContaining({
        path: filePath,
        risk: 'large_deletion',
      }),
    })
  })

  it('classifies small replacements as normal file edit effects', async () => {
    const { tmpRoot, filePath } = await createTmpFile('small-edit', 'A: old\nB: old\n')

    const analysis = await EditTool.analyze!({
      path: filePath,
      edits: [{ oldText: 'A: old', newText: 'A: new' }],
    }, createContext(tmpRoot))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'file_edit',
      resources: [path.join(path.dirname(filePath), '*')],
    })
  })
})
