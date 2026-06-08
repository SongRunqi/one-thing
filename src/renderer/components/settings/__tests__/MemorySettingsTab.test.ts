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

    const timeout = wrapper.find('input[aria-label="recall timeout"]')
    await timeout.setValue('9000')
    await timeout.trigger('change')

    const emitted = wrapper.emitted('update:settings')
    expect(emitted).toBeTruthy()
    const nextSettings = emitted!.at(-1)![0] as ReturnType<typeof createDefaultSettings>
    expect(nextSettings.general.soulMemory?.activeMemory?.timeoutMs).toBe(9000)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('keeps scheduled dreaming owned by Tasks', () => {
    const wrapper = mount(MemorySettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    expect(wrapper.text()).toContain('Scheduled Memory')
    expect(wrapper.text()).toContain('Configure in Tasks')
    expect(wrapper.find('input[aria-label="Dreaming cron"]').exists()).toBe(false)
  })
})
