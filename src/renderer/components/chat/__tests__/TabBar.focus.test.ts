// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TabBar from '../TabBar.vue'
import type { Tab } from '@/types/tabs'

vi.mock('../AgentSelector.vue', () => ({
  default: {
    name: 'AgentSelector',
    template: '<div class="mock-agent-selector" />',
  },
}))

const tabs: Tab[] = [{ id: 'chat', type: 'chat', sessionId: 'session-1' }]

function mountTabBar(panelFocused: boolean) {
  return mount(TabBar, {
    props: {
      tabs,
      activeTabId: 'chat',
      sessionId: 'session-1',
      sessionName: 'Chat',
      isBranchSession: false,
      showSidebarToggle: false,
      showSplitButton: true,
      canClose: true,
      panelFocused,
    },
  })
}

describe('TabBar split-panel focus', () => {
  it('shows the full action group on the focused panel', () => {
    const wrapper = mountTabBar(true)

    expect(wrapper.find('.mock-agent-selector').exists()).toBe(true)
    expect(wrapper.find('[title="Split view"]').exists()).toBe(true)
    expect(wrapper.find('[title="Equalize panels"]').exists()).toBe(true)
    expect(wrapper.find('.side-panel-toggle').exists()).toBe(true)
    expect(wrapper.find('.inspector-toggle').exists()).toBe(true)
    expect(wrapper.find('.close-btn').exists()).toBe(true)
  })

  it('collapses an unfocused panel header to just the close button', () => {
    const wrapper = mountTabBar(false)

    expect(wrapper.find('.mock-agent-selector').exists()).toBe(false)
    expect(wrapper.find('[title="Split view"]').exists()).toBe(false)
    expect(wrapper.find('[title="Equalize panels"]').exists()).toBe(false)
    expect(wrapper.find('.side-panel-toggle').exists()).toBe(false)
    expect(wrapper.find('.inspector-toggle').exists()).toBe(false)
    expect(wrapper.find('.close-btn').exists()).toBe(true)
    // Tabs themselves stay visible.
    expect(wrapper.find('.tab-item').exists()).toBe(true)
  })

  it('collapses a focused panel too when the header gets too narrow', async () => {
    let resizeCallback: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null
    const RealResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
        resizeCallback = callback
      }

      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver

    try {
      const wrapper = mountTabBar(true)
      expect(wrapper.find('[title="Split view"]').exists()).toBe(true)

      resizeCallback!([{ contentRect: { width: 300 } }])
      await nextTick()

      expect(wrapper.find('[title="Split view"]').exists()).toBe(false)
      expect(wrapper.find('.mock-agent-selector').exists()).toBe(false)
      expect(wrapper.find('.close-btn').exists()).toBe(true)

      resizeCallback!([{ contentRect: { width: 700 } }])
      await nextTick()
      expect(wrapper.find('[title="Split view"]').exists()).toBe(true)
    } finally {
      globalThis.ResizeObserver = RealResizeObserver
    }
  })
})
