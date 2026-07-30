// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentSelector from '../AgentSelector.vue'

const mocks = vi.hoisted(() => ({
  agentsStore: null as any,
  chatStore: null as any,
  sessionsStore: null as any,
}))

vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => mocks.agentsStore,
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => mocks.chatStore,
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

describe('AgentSelector draft chats', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    const draft = reactive({
      id: 'draft:one',
      draftKind: 'new-chat-draft',
      agentId: 'default',
    })

    mocks.agentsStore = reactive({
      agents: [
        {
          id: 'default',
          name: 'Default Agent',
          systemPrompt: '',
          isDefault: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'agent-research',
          name: 'Research',
          systemPrompt: 'Research carefully.',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      // Mirrors the real store's social-surface roster (A0): active
      // colleagues only. The fixture agents carry no kind/status, so all of
      // them qualify by the colleague/active defaults.
      get colleagues() {
        return mocks.agentsStore.agents.filter((agent: any) =>
          (agent.kind ?? 'colleague') === 'colleague' &&
          (agent.status ?? 'active') === 'active')
      },
      getAgent: vi.fn((agentId: string) =>
        mocks.agentsStore.agents.find((agent: any) => agent.id === agentId) ||
        mocks.agentsStore.agents[0],
      ),
      loadAgents: vi.fn().mockResolvedValue([]),
      createAgent: vi.fn(),
      updateAgent: vi.fn(),
      deleteAgent: vi.fn(),
    })
    mocks.chatStore = reactive({
      isSessionGenerating: vi.fn(() => false),
    })
    mocks.sessionsStore = reactive({
      currentSessionId: draft.id,
      sessions: [],
      getSessionItem: vi.fn((sessionId: string) => sessionId === draft.id ? draft : undefined),
      updateSessionAgent: vi.fn(async (sessionId: string, agentId: string) => {
        if (sessionId === draft.id) draft.agentId = agentId
        return { success: true }
      }),
    })
  })

  it('switches the agent for an unsent new chat draft', async () => {
    const wrapper = mount(AgentSelector, {
      attachTo: document.body,
      props: { sessionId: 'draft:one' },
    })

    expect(wrapper.find('.agent-chip').text()).toContain('Default Agent')

    await wrapper.find('.agent-chip').trigger('click')
    await nextTick()
    const researchButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.agent-row'))
      .find(button => button.textContent?.includes('Research'))
    expect(researchButton).toBeTruthy()

    researchButton!.click()
    await nextTick()

    expect(mocks.sessionsStore.updateSessionAgent).toHaveBeenCalledWith('draft:one', 'agent-research')
    expect(wrapper.find('.agent-chip').text()).toContain('Research')
  })

  // A0 (agent-domain-model.md M2): the selector is a social surface — a
  // service agent (radio-dj) never offers itself as a switch target, while
  // colleagues (including the default agent) stay listed.
  it('does not list service agents', async () => {
    mocks.agentsStore.agents.push({
      id: 'radio-dj',
      name: 'DJ',
      systemPrompt: '',
      kind: 'service',
      createdAt: 3,
      updatedAt: 3,
    })

    const wrapper = mount(AgentSelector, {
      attachTo: document.body,
      props: { sessionId: 'draft:one' },
    })
    await wrapper.find('.agent-chip').trigger('click')
    await nextTick()

    const rowNames = Array.from(document.body.querySelectorAll('.agent-row'))
      .map(row => row.textContent || '')
    expect(rowNames.some(text => text.includes('DJ'))).toBe(false)
    expect(rowNames.some(text => text.includes('Default Agent'))).toBe(true)
    expect(rowNames.some(text => text.includes('Research'))).toBe(true)
  })

  it('keeps chat selection free of agent management actions', async () => {
    const wrapper = mount(AgentSelector, {
      attachTo: document.body,
      props: { sessionId: 'draft:one' },
    })

    await wrapper.find('.agent-chip').trigger('click')
    await nextTick()

    expect(document.body.querySelector('.agent-action')).toBeNull()
    expect(document.body.querySelector('.agent-form')).toBeNull()
  })
})
