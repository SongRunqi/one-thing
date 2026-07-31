/**
 * 「点头像去哪」的契约(docs/design/agent-space-workbench.md P1)。
 *
 * 以前 `openAgentSpace` 会寄存意图 + 请 App 展开**全屏 Agents 管理页** ——
 * 点一下头像就把正在看的会话面顶掉。现在它派的是右栏那条事件;管理页只留给
 * 名册面的动作(`openAgentManager`)。这一组盯住两条不许再混。
 */
// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_OPEN_SPACE_EVENT,
  AGENT_OPEN_WORKSPACE_EVENT,
  useAgentsStore,
  type AgentOpenSpaceDetail,
} from '../agents'

vi.mock('@/platform', () => ({ platformApi: {} }))

beforeEach(() => {
  setActivePinia(createPinia())
})

function listen(name: string) {
  const seen: Array<AgentOpenSpaceDetail | null> = []
  const handler = (event: Event) => {
    seen.push(((event as CustomEvent).detail ?? null) as AgentOpenSpaceDetail | null)
  }
  window.addEventListener(name, handler)
  return {
    seen,
    stop: () => window.removeEventListener(name, handler),
  }
}

describe('openAgentSpace — 落点在右栏', () => {
  it('派右栏那条事件,带上人和要停的那一面', () => {
    const space = listen(AGENT_OPEN_SPACE_EVENT)
    const workspace = listen(AGENT_OPEN_WORKSPACE_EVENT)

    useAgentsStore().openAgentSpace('lin', 'files')

    expect(space.seen).toEqual([{ agentId: 'lin', tab: 'files' }])
    // 反向断言:管理页那条一次都不该响 —— 点头像不许顶掉会话面。
    expect(workspace.seen).toHaveLength(0)

    space.stop()
    workspace.stop()
  })

  it('空 id 什么都不做', () => {
    const space = listen(AGENT_OPEN_SPACE_EVENT)
    useAgentsStore().openAgentSpace('')
    expect(space.seen).toHaveLength(0)
    space.stop()
  })

  it('openAgentManager 才走管理页,并寄存好要停的那一面', () => {
    const space = listen(AGENT_OPEN_SPACE_EVENT)
    const workspace = listen(AGENT_OPEN_WORKSPACE_EVENT)
    const store = useAgentsStore()

    store.openAgentManager('lin', 'config')

    expect(workspace.seen).toHaveLength(1)
    expect(space.seen).toHaveLength(0)
    expect(store.pendingDetailAgentId).toBe('lin')
    expect(store.pendingDetailTab).toBe('config')

    space.stop()
    workspace.stop()
  })
})
