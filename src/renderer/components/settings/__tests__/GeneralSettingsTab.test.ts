// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import GeneralSettingsTab from '../GeneralSettingsTab.vue'
import { createDefaultSettings } from '../../../../shared/defaults/settings'

vi.mock('../ThemeSelectorPanel.vue', () => ({
  default: { name: 'ThemeSelectorPanel', template: '<div />' },
}))

describe('GeneralSettingsTab', () => {
  it('emits agent loop streaming updates through chat settings', async () => {
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
    expect((toggle.element as HTMLInputElement).checked).toBe(false)

    await toggle.setValue(true)

    const emitted = wrapper.emitted('update:settings')
    expect(emitted).toBeTruthy()
    const nextSettings = emitted!.at(-1)![0] as ReturnType<typeof createDefaultSettings>
    expect(nextSettings.chat?.agentLoopStream).toBe(true)
    expect(nextSettings.chat?.contextCompactEnabled).toBe(true)
    expect(nextSettings.chat?.contextCompactThreshold).toBe(85)
  })
})
