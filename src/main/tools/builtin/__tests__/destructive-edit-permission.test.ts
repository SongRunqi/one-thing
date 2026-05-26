import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { EditTool } from '../edit.js'
import { Permission } from '../../../permission/index.js'

vi.mock('../../../permission/index.js', () => ({
  Permission: {
    ask: vi.fn().mockResolvedValue(undefined),
  },
}))

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

describe('destructive edit permission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('rejects prefix replacements that delete many lines', async () => {
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

    await expect(EditTool.execute({
      file_path: filePath,
      old_string: original.trimEnd(),
      new_string: [
        '    ["6406584"] = "26406584",',
        '',
        '    -- EMEA 0615',
      ].join('\n'),
      replace_all: false,
    }, createContext(tmpRoot))).rejects.toThrow('Refusing potentially destructive edit')

    expect(Permission.ask).not.toHaveBeenCalled()
    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe(original)
  })

  it('forces explicit permission for large non-truncating deletions', async () => {
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

    await EditTool.execute({
      file_path: filePath,
      old_string: original.trimEnd(),
      new_string: 'start changed\nend changed',
      replace_all: false,
    }, createContext(tmpRoot))

    expect(Permission.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'file_destructive_edit',
        pattern: expect.stringContaining(`explicit-file-edit:${filePath}:`),
        title: `Confirm large deletion: ${path.basename(filePath)}`,
        metadata: expect.objectContaining({
          filePath,
          risk: 'large_deletion',
          requiresExplicitPermission: true,
        }),
      }),
    )
    expect(vi.mocked(Permission.ask).mock.calls[0][0].pattern).not.toBe(path.join(path.dirname(filePath), '*'))
  })

  it('uses normal file edit permission for small replacements', async () => {
    const { tmpRoot, filePath } = await createTmpFile('small-edit', 'A: old\nB: old\n')

    await EditTool.execute({
      file_path: filePath,
      old_string: 'A: old',
      new_string: 'A: new',
      replace_all: false,
    }, createContext(tmpRoot))

    expect(Permission.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'file_edit',
        pattern: path.join(path.dirname(filePath), '*'),
        metadata: expect.objectContaining({
          requiresExplicitPermission: false,
        }),
      }),
    )
  })
})
