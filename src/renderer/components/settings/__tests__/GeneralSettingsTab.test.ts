// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import GeneralSettingsTab from '../GeneralSettingsTab.vue'
import { createDefaultSettings } from '../../../../shared/defaults/settings'

vi.mock('../ThemeSelectorPanel.vue', () => ({
  default: { name: 'ThemeSelectorPanel', template: '<div />' },
}))

describe('GeneralSettingsTab', () => {
  it('does not expose the legacy agent loop stream opt-out', async () => {
    const settings = createDefaultSettings()
    const chat = settings.chat!
    chat.agentLoopStream = false
    chat.contextCompactEnabled = true
    chat.contextCompactThreshold = 85

    const wrapper = mount(GeneralSettingsTab, {
      props: { settings },
      global: {
        stubs: {
          ThemeSelectorPanel: { template: '<div />' },
          InputNumber: { template: '<input />' },
        },
      },
    })

    const toggle = wrapper.find('input[aria-label="use agent loop streaming"]')
    expect(toggle.exists()).toBe(false)
  })

  it('exposes max turns per run and emits a clamped update', async () => {
    const settings = createDefaultSettings()

    const wrapper = mount(GeneralSettingsTab, {
      props: { settings },
      global: {
        stubs: {
          ThemeSelectorPanel: { template: '<div />' },
          InputNumber: { template: '<input @change="$emit(\'update:model-value\', 9999)" />' },
        },
      },
    })

    const maxTurnsInput = wrapper.find('input[aria-label="max turns per run"]')
    expect(maxTurnsInput.exists()).toBe(true)

    await maxTurnsInput.trigger('change')

    const emitted = wrapper.emitted('update:settings')
    expect(emitted).toBeTruthy()
    const lastPatch = emitted![emitted!.length - 1][0] as { chat?: { maxTurns?: number } }
    expect(lastPatch.chat?.maxTurns).toBe(500)
  })
})
