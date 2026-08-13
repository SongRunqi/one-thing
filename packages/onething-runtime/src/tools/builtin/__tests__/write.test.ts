import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWriteTool } from '../write.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  dirs.push(dir)
  return dir
}

function createContext(workingDirectory: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session',
    messageId: 'test-message',
    toolCallId: 'test-call',
    workingDirectory,
    workingDirectoryRoots: [workingDirectory],
    metadata: vi.fn(),
    beforeSideEffect: vi.fn(async () => undefined),
    ...overrides,
  } as any
}

async function createTool(prefix: string) {
  const auditDir = await tempDir(prefix)
  return {
    auditDir,
    tool: createWriteTool({ getFileMutationsDir: () => auditDir }),
  }
}

describe('runtime write tool', () => {
  it('writes files and records mutation audit metadata', async () => {
    const dir = await tempDir('onething-runtime-write')
    const { auditDir, tool } = await createTool('onething-runtime-write-audit')
    const ctx = createContext(dir)
    const filePath = path.join(dir, 'nested', 'note.txt')

    const result = await tool.execute({ path: path.join('nested', 'note.txt'), content: 'hello\n' }, ctx)

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('hello\n')
    expect(ctx.beforeSideEffect).toHaveBeenCalled()
    expect(result.output).toBe(`Successfully wrote ${'hello\n'.length} bytes to ${path.join('nested', 'note.txt')}`)
    expect(result.metadata).toMatchObject({
      path: filePath,
      created: true,
      auditPath: expect.stringContaining(auditDir),
    })
    expect(result.attachments).toEqual([{ type: 'file', path: filePath }])
  })

  it('analyzes writes with file_write effects and preview diff', async () => {
    const dir = await tempDir('onething-runtime-write-analyze')
    const { tool } = await createTool('onething-runtime-write-analyze-audit')
    const filePath = path.join(dir, 'note.txt')
    await fs.writeFile(filePath, 'before\n', 'utf-8')

    const analysis = await tool.analyze!({ path: 'note.txt', content: 'after\n' }, createContext(dir))

    expect(analysis.effects[0]).toMatchObject({
      kind: 'file_write',
      barrier: true,
      external: false,
      metadata: expect.objectContaining({
        path: filePath,
        created: false,
      }),
    })
    expect(analysis.preview).toMatchObject({
      path: filePath,
      title: 'Overwrite note.txt',
    })
    expect(analysis.preview?.diff).toContain('-before')
    expect(analysis.preview?.diff).toContain('+after')
  })

  /**
   * 止血 3(2026-08-11)的工具侧半边:越界写必须在 effect 上把 `external` 立起来 ——
   * `auto-accept-edits` 的回落判据只读这一位(`core/permission/permission-policy.ts`)。
   */
  it('marks a write outside the working-directory roots as external', async () => {
    const dir = await tempDir('onething-runtime-write-inside')
    const outside = await tempDir('onething-runtime-write-outside')
    const { tool } = await createTool('onething-runtime-write-external-audit')

    const analysis = await tool.analyze!(
      { path: path.join(outside, 'stolen.txt'), content: 'x\n' },
      createContext(dir),
    )

    expect(analysis.effects[0]).toMatchObject({
      kind: 'file_write',
      external: true,
      metadata: expect.objectContaining({ isExternal: true }),
    })
  })

  /**
   * 接入目录的兑现证据(五件套之三:「默认 edit」)。
   *
   * 上一条钉的是「界外写要立 external」;这条钉的是「用户把这个目录加进设置后,
   * 同一次写不再是界外」。两条一起才说明这个功能既生效、又没把闸门整个拆掉。
   */
  it('接入目录内的写不再标 external —— auto-accept 因此不弹卡', async () => {
    const dir = await tempDir('onething-runtime-write-inside')
    const connected = await tempDir('onething-runtime-write-connected')
    const auditDir = await tempDir('onething-runtime-write-connected-audit')
    const tool = createWriteTool({
      getFileMutationsDir: () => auditDir,
      getConnectedDirectories: () => [connected],
    })

    const analysis = await tool.analyze!(
      { path: path.join(connected, 'note.txt'), content: 'x\n' },
      createContext(dir),
    )

    expect(analysis.effects[0]).toMatchObject({
      kind: 'file_write',
      external: false,
      metadata: expect.objectContaining({ isExternal: false }),
    })
  })

  it('空接入目录列表下,界外写仍然是界外(默认行为一字不变)', async () => {
    const dir = await tempDir('onething-runtime-write-empty-inside')
    const outside = await tempDir('onething-runtime-write-empty-outside')
    const auditDir = await tempDir('onething-runtime-write-empty-audit')
    const tool = createWriteTool({
      getFileMutationsDir: () => auditDir,
      getConnectedDirectories: () => [],
    })

    const analysis = await tool.analyze!(
      { path: path.join(outside, 'stolen.txt'), content: 'x\n' },
      createContext(dir),
    )

    expect(analysis.effects[0]).toMatchObject({ external: true })
  })

  it('只授权被加入的那棵树:接入目录的兄弟目录仍然越界', async () => {
    const dir = await tempDir('onething-runtime-write-sibling-inside')
    const connected = await tempDir('onething-runtime-write-sibling-connected')
    const sibling = await tempDir('onething-runtime-write-sibling-other')
    const auditDir = await tempDir('onething-runtime-write-sibling-audit')
    const tool = createWriteTool({
      getFileMutationsDir: () => auditDir,
      getConnectedDirectories: () => [connected],
    })

    const analysis = await tool.analyze!(
      { path: path.join(sibling, 'stolen.txt'), content: 'x\n' },
      createContext(dir),
    )

    expect(analysis.effects[0]).toMatchObject({ external: true })
  })

  it('refuses writes when target content changes after approval', async () => {
    const dir = await tempDir('onething-runtime-write-revalidate')
    const { tool } = await createTool('onething-runtime-write-revalidate-audit')
    const filePath = path.join(dir, 'note.txt')
    const ctx = createContext(dir)
    await fs.writeFile(filePath, 'before\n', 'utf-8')

    const analysis = await tool.analyze!({ path: 'note.txt', content: 'final\n' }, ctx)
    await fs.writeFile(filePath, 'external\n', 'utf-8')

    await expect(tool.execute(
      { path: 'note.txt', content: 'final\n' },
      { ...ctx, approvedAnalysis: analysis },
    )).rejects.toThrow('File changed after permission approval')
    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('external\n')
  })
})
