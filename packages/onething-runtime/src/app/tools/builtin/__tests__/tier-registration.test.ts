/**
 * 三档工具注册的**清单测试**(2026-08-11 止血 4)。
 *
 * 桌面全量档此前没有 Grep —— 实现一直是完整的,只在 apps/server 的只读档接过线,
 * 于是「找出所有引用点」在桌面上退化成 `bash rg`。补注册这种事没有编译期护栏:
 * 少 import 一行不会红,只会在真机上少一个工具。所以清单钉在这里。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const registered = vi.hoisted(() => ({ ids: [] as string[] }))

vi.mock('../../registry.js', () => ({
  registerTool: (tool: { id: string }) => {
    registered.ids.push(tool.id)
  },
}))

async function idsFrom(register: () => void): Promise<string[]> {
  registered.ids = []
  register()
  return [...registered.ids]
}

describe('builtin tool tiers', () => {
  beforeEach(() => {
    registered.ids = []
  })

  it('registers Grep in the desktop full tier', async () => {
    const { registerBuiltinTools } = await import('../index.js')
    const ids = await idsFrom(registerBuiltinTools)
    expect(ids).toContain('grep')
    // find 仍在 —— 两者不是替代关系:find 找文件名,grep 找文件内容。
    expect(ids).toContain('find')
    expect(ids).toContain('read')
  })

  /**
   * Glob 有意缺席:它与 Find 是同一件事(都按 glob 找路径),2026-07 的工具裁减
   * 正是为此把它摘掉的。把它再加回来只会在提示词里多一份重复描述。
   */
  it('does not re-add Glob alongside Find', async () => {
    const { registerBuiltinTools } = await import('../index.js')
    const ids = await idsFrom(registerBuiltinTools)
    expect(ids).not.toContain('glob')
  })

  it('leaves the headless and readonly tiers untouched', async () => {
    const { registerHeadlessBuiltinTools } = await import('../headless.js')
    const { registerReadonlyBuiltinTools } = await import('../readonly.js')

    const headless = await idsFrom(registerHeadlessBuiltinTools)
    const readonly = await idsFrom(registerReadonlyBuiltinTools)

    expect(headless).not.toContain('grep')
    expect(readonly).not.toContain('grep')
    // 只读档仍是零本机副作用的那四件。
    expect(readonly.sort()).toEqual(['read', 'time', 'web_open', 'web_search'].sort())
  })
})
