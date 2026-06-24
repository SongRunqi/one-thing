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
})
