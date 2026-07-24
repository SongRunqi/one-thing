// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PromptsSettingsPanel from '../PromptsSettingsPanel.vue'
import type { UserPrompt } from '@/types'

const mocks = vi.hoisted(() => ({
  promptsStore: null as any,
}))

vi.mock('@/stores/prompts', () => ({
  usePromptsStore: () => mocks.promptsStore,
}))

function prompt(overrides: Partial<UserPrompt> = {}): UserPrompt {
  return {
    id: 'prompt-1',
    title: 'Review Helper',
    body: 'Review this carefully.',
    description: 'Useful review prompt',
    tags: ['review', 'code'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function installPromptStore(prompts: UserPrompt[] = []) {
  const store = reactive({
    prompts,
    isLoading: false,
    error: null as string | null,
    get promptMap() {
      return new Map(store.prompts.map(item => [item.id, item]))
    },
    loadPrompts: vi.fn().mockResolvedValue(prompts),
    createPrompt: vi.fn(async (request: any) => {
      const saved = prompt({
        id: 'created-prompt',
        title: request.title,
        body: request.body,
        description: request.description,
        tags: request.tags,
        createdAt: 2,
        updatedAt: 2,
      })
      store.prompts.push(saved)
      return saved
    }),
    updatePrompt: vi.fn(async (request: any) => {
      const existing = store.prompts.find(item => item.id === request.id)
      if (!existing) return undefined
      Object.assign(existing, request, { updatedAt: 3 })
      return existing
    }),
    deletePrompt: vi.fn(async (id: string) => {
      const index = store.prompts.findIndex(item => item.id === id)
      if (index === -1) return false
      store.prompts.splice(index, 1)
      return true
    }),
  })
  mocks.promptsStore = store
  return store
}

describe('PromptsSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a distinct empty state when there are no prompts', async () => {
    installPromptStore([])
    const wrapper = mount(PromptsSettingsPanel)
    await settle()

    expect(wrapper.text()).toContain('No prompts yet')
  })

  it('filters prompts and shows search empty state', async () => {
    installPromptStore([prompt()])
    const wrapper = mount(PromptsSettingsPanel)
    await settle()

    await wrapper.find('.prompt-search input').setValue('missing')
    await settle()

    expect(wrapper.text()).toContain('No matching prompts')
    expect(wrapper.text()).not.toContain('No prompts yet')
  })

  it('creates a prompt with tags from the editor form', async () => {
    const store = installPromptStore([])
    const wrapper = mount(PromptsSettingsPanel)
    await settle()

    await wrapper.find('input[placeholder="Code review checklist"]').setValue('Draft Helper')
    await wrapper.find('input[placeholder="Optional short preview"]').setValue('Drafting')
    await wrapper.find('input[placeholder="writing, code, planning"]').setValue('draft, writing')
    await wrapper.find('textarea').setValue('Draft this reply.')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(store.createPrompt).toHaveBeenCalledWith({
      title: 'Draft Helper',
      body: 'Draft this reply.',
      description: 'Drafting',
      tags: ['draft', 'writing'],
    })
    expect(wrapper.text()).toContain('Prompt saved.')
  })

  it('requires confirmation before deleting a prompt', async () => {
    const store = installPromptStore([prompt()])
    const wrapper = mount(PromptsSettingsPanel)
    await settle()

    await wrapper.find('.prompt-danger-btn').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('Delete this prompt?')
    expect(store.deletePrompt).not.toHaveBeenCalled()

    await wrapper.find('.prompt-danger-btn').trigger('click')
    await settle()

    expect(store.deletePrompt).toHaveBeenCalledWith('prompt-1')
    expect(wrapper.text()).toContain('Prompt deleted.')
  })
})
