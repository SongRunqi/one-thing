// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AssistantMessageNavRail from '../AssistantMessageNavRail.vue'
import type { AssistantMessageOutlineMarker } from '../assistant-message-outline'

function markers(count: number): AssistantMessageOutlineMarker[] {
  return Array.from({ length: count }, (_, index) => ({
    navIndex: index,
    messageId: 'assistant-1',
    anchorId: `assistant-1:${index}`,
    level: index % 3 === 0 ? 2 : 3,
    kind: 'heading',
    label: `Section ${index + 1}`,
    preview: `Section ${index + 1}`,
  }))
}

describe('AssistantMessageNavRail', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the side outline as a smooth scrollbar list instead of paginated wheel cues', () => {
    const wrapper = mount(AssistantMessageNavRail, {
      props: {
        markers: markers(12),
        currentIndex: 6,
        placement: 'side',
        panelAvailable: true,
      },
    })

    expect(wrapper.find('.assistant-nav-side-scroll').exists()).toBe(true)
    expect(wrapper.find('.assistant-nav-side-list').exists()).toBe(true)
    expect(wrapper.findAll('.assistant-nav-side-list .assistant-nav-row')).toHaveLength(12)
    expect(wrapper.find('.assistant-nav-scroll').exists()).toBe(false)
    expect(wrapper.find('.assistant-nav-page-cue').exists()).toBe(false)
    expect(wrapper.find('[data-assistant-nav-index="6"]').classes()).toContain('active')
  })
})
