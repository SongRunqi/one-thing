// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MemorySettingsTab from '../MemorySettingsTab.vue'
import { createDefaultSettings } from '../../../../shared/defaults/settings'

describe('MemorySettingsTab', () => {
  it('emits nested memory setting changes without saving directly', async () => {
    const saveSettings = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        saveSettings,
        showOpenDialog: vi.fn(),
      },
    })

    const wrapper = mount(MemorySettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    const timeout = wrapper.find('input[aria-label="capture timeout"]')
    await timeout.setValue('9000')
    await timeout.trigger('change')

    const emitted = wrapper.emitted('update:settings')
    expect(emitted).toBeTruthy()
    const nextSettings = emitted!.at(-1)![0] as ReturnType<typeof createDefaultSettings>
    expect(nextSettings.general.soulMemory?.capture?.timeoutMs).toBe(9000)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('only shows surviving sections (basics, capture, diagnostics)', () => {
    const wrapper = mount(MemorySettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    expect(wrapper.text()).toContain('Basics')
    expect(wrapper.text()).toContain('Capture')
    expect(wrapper.text()).toContain('Diagnostics')

    expect(wrapper.text()).not.toContain('Recall')
    expect(wrapper.text()).not.toContain('Profile')
    expect(wrapper.text()).not.toContain('Search Index')
    expect(wrapper.text()).not.toContain('Embeddings')
    expect(wrapper.text()).not.toContain('Daily Notes Context')
    expect(wrapper.text()).not.toContain('Compact Flush')
    expect(wrapper.text()).not.toContain('Scheduled Memory')
    expect(wrapper.text()).not.toContain('Configure in Tasks')
    expect(wrapper.find('input[aria-label="recall timeout"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="Dreaming cron"]').exists()).toBe(false)
  })

  it('hides retired capture routing controls', () => {
    const wrapper = mount(MemorySettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    expect(wrapper.find('option[value="ask"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Profile first')
    expect(wrapper.text()).not.toContain('Aggressive lowers capture thresholds')
    expect(wrapper.find('input[aria-label="capture candidates"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="daily capture confidence"]').exists()).toBe(false)
  })
})
