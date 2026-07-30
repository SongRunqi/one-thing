// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TabBar from '../TabBar.vue'
import type { ChatTab } from '@/types/tabs'

vi.mock('../AgentSelector.vue', () => ({
  default: {
    name: 'AgentSelector',
    template: '<div class="mock-agent-selector" />',
  },
}))

function chatTab(id: string): ChatTab {
  return { id, type: 'chat', sessionId: `session-${id}` }
}

function mountTabBar(tabs: ChatTab[], activeTabId: string) {
  return mount(TabBar, {
    attachTo: document.body,
    props: {
      tabs,
      activeTabId,
      sessionId: `session-${activeTabId}`,
      chatSessionNames: Object.fromEntries(tabs.map(tab => [tab.sessionId, `Chat ${tab.id}`])),
      cachedSessionIds: null,
      isBranchSession: false,
      showSidebarToggle: false,
      showSplitButton: true,
      canClose: true,
      panelFocused: true,
    },
  })
}

async function openMenuOn(wrapper: ReturnType<typeof mountTabBar>, index: number, event = 'dblclick') {
  await wrapper.findAll('.tab-item')[index].trigger(event)
  await nextTick()
}

function menuLabels() {
  return Array.from(document.querySelectorAll('.app-context-item')).map(el => el.textContent?.trim())
}

function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('.app-context-item'))
    .find(el => el.textContent?.includes(label))
  if (!item) throw new Error(`menu item not found: ${label}`)
  item.click()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TabBar tab menu', () => {
  it('opens on double click and on right click', async () => {
    const wrapper = mountTabBar([chatTab('a'), chatTab('b')], 'a')

    await openMenuOn(wrapper, 0)
    expect(menuLabels()).toContain('Rename')

    await openMenuOn(wrapper, 0, 'contextmenu')
    expect(menuLabels()).toContain('Rename')

    clickMenuItem('Rename')
    await nextTick()
    expect(document.querySelector('.app-context-menu')).toBeNull()
    wrapper.unmount()
  })

  it('only offers the side-closes that have tabs on that side', async () => {
    const wrapper = mountTabBar([chatTab('a'), chatTab('b'), chatTab('c')], 'a')

    await openMenuOn(wrapper, 0)
    expect(menuLabels()).not.toContain('Close Tabs to the Left')
    expect(menuLabels()).toContain('Close Tabs to the Right')

    await openMenuOn(wrapper, 2)
    expect(menuLabels()).toContain('Close Tabs to the Left')
    expect(menuLabels()).not.toContain('Close Tabs to the Right')

    await openMenuOn(wrapper, 1)
    expect(menuLabels()).toEqual([
      'Rename',
      'Close',
      'Close Others',
      'Close Tabs to the Left',
      'Close Tabs to the Right',
      'Close All',
    ])
    wrapper.unmount()
  })

  it('hides the multi-tab actions for a lone tab', async () => {
    const wrapper = mountTabBar([chatTab('a')], 'a')

    await openMenuOn(wrapper, 0)
    expect(menuLabels()).toEqual(['Rename', 'Close'])
    wrapper.unmount()
  })

  it('emits the right id batches, closing the target last for Close All', async () => {
    const wrapper = mountTabBar([chatTab('a'), chatTab('b'), chatTab('c')], 'b')

    await openMenuOn(wrapper, 1)
    clickMenuItem('Close Others')
    await openMenuOn(wrapper, 1)
    clickMenuItem('Close Tabs to the Left')
    await openMenuOn(wrapper, 1)
    clickMenuItem('Close Tabs to the Right')
    await openMenuOn(wrapper, 1)
    clickMenuItem('Close All')

    expect(wrapper.emitted('closeTabs')).toEqual([
      [['a', 'c']],
      [['a']],
      [['c']],
      [['a', 'c', 'b']],
    ])

    await openMenuOn(wrapper, 1)
    clickMenuItem('Close')
    expect(wrapper.emitted('closeTab')).toEqual([['b']])
    wrapper.unmount()
  })

  it('renames through the menu without committing an in-flight IME composition', async () => {
    const wrapper = mountTabBar([chatTab('a'), chatTab('b')], 'a')

    await openMenuOn(wrapper, 0)
    clickMenuItem('Rename')
    await nextTick()

    const input = wrapper.find('.tab-title-input')
    expect(input.exists()).toBe(true)

    await input.setValue('你好')
    await input.trigger('compositionstart')
    // 组字中的 Enter 是选词,不是确认
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('renameSession')).toBeUndefined()
    expect(wrapper.find('.tab-title-input').exists()).toBe(true)

    await input.trigger('compositionend')
    // 组字刚结束的那一下 Enter 属于上屏尾巴,过了窗口才是确认
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('renameSession')).toBeUndefined()

    await new Promise(resolve => setTimeout(resolve, 60))
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(wrapper.emitted('renameSession')).toEqual([['session-a', '你好']])
    expect(wrapper.find('.tab-title-input').exists()).toBe(false)
    wrapper.unmount()
  })
})
