// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSearchResultAction } from '../result-actions'
import { useSearchWindow } from '../useSearchWindow'
import type { SearchResult } from '@shared/ipc/search'
import { effectScope, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    settings: {
      general: {
        dailyNotes: {
          enabled: true,
        },
      },
    },
  }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  ;(window as unknown as {
    electronAPI: Record<string, unknown>
  }).electronAPI = {
    searchQuery: vi.fn().mockResolvedValue({ success: true, results: [] }),
  }
})

describe('Search Everywhere result interactions', () => {
  it('opens the prompt creation dialog locally for create-prompt results', () => {
    const result: SearchResult = {
      id: 'prompt-create:Daily%20Plan',
      type: 'prompt',
      title: 'Create prompt "Daily Plan"',
      actionId: 'create-prompt:Daily%20Plan',
    }

    expect(resolveSearchResultAction(result)).toEqual({
      type: 'create-prompt',
      title: 'Daily Plan',
    })
  })

  it('maps file, daily note, message, and chat results to executable actions', () => {
    expect(resolveSearchResultAction({
      id: 'file:/tmp/a.md',
      type: 'file',
      title: 'a.md',
      filePath: '/tmp/a.md',
    })).toEqual({ type: 'execute', actionId: 'open-file:/tmp/a.md' })

    expect(resolveSearchResultAction({
      id: 'daily:/tmp/today.md',
      type: 'daily',
      title: 'Today',
      filePath: '/tmp/today.md',
    })).toEqual({ type: 'execute', actionId: 'open-file:/tmp/today.md' })

    expect(resolveSearchResultAction({
      id: 'msg:s1:m1',
      type: 'message',
      title: 'Message',
      sessionId: 's1',
      messageId: 'm1',
    })).toEqual({ type: 'execute', actionId: 'jump-message:s1:m1' })

    expect(resolveSearchResultAction({
      id: 'chat:s1',
      type: 'chat',
      title: 'Chat',
      sessionId: 's1',
    })).toEqual({ type: 'execute', actionId: 'switch-session:s1' })
  })
})

describe('Search Everywhere copy', () => {
  it('uses compact placeholders and empty states so chrome does not compete with results', async () => {
    const scope = effectScope()
    const api = scope.run(() => {
      const resultsRef = ref<HTMLElement | null>(null)
      return useSearchWindow(resultsRef)
    })
    expect(api).toBeDefined()
    if (!api) return

    expect(api.inputPlaceholder.value).toBe('Search...')
    expect(api.emptyText.value).toBe('Type to search')

    api.activeTab.value = 'files'
    await nextTick()
    expect(api.inputPlaceholder.value).toBe('Search files...')
    expect(api.emptyText.value).toBe('Type to search')

    api.query.value = 'missing'
    await nextTick()
    expect(api.emptyText.value).toBe('No results')
    scope.stop()
  })
})
