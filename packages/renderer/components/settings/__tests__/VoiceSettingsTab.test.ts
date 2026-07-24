// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VoiceSettingsTab from '../VoiceSettingsTab.vue'
import { createDefaultSettings } from '@shared/defaults/settings'

describe('VoiceSettingsTab', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (window as any).electronAPI
  })

  it('keeps the default voice setup focused on conversation input', () => {
    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Conversation')
    expect(text).toContain('Voice agent')
    expect(text).toContain('Fast response')
    expect(text).toContain('FunASR WebSocket URL')
    expect(text).toContain('TTS provider')
    expect(text).toContain('System voice (no key)')
    expect(text).toContain('OpenRouter TTS')
    expect(text).toContain('No cloud TTS setup needed')
    expect(text).toContain('Test in chat')
    expect(text).not.toContain('Porcupine')
    expect(text).not.toContain('AccessKey')
    expect(text).not.toContain('Wake phrase')
  })

  it('shows that OpenRouter TTS can reuse the speech-to-text OpenRouter key', () => {
    const settings = createDefaultSettings()
    settings.voice!.enabled = true
    settings.voice!.asr.provider = 'openrouter-transcribe'
    settings.voice!.asr.openrouter.apiKey = 'sk-or-asr'
    settings.voice!.tts.provider = 'openrouter-tts'
    settings.voice!.tts.openrouter.apiKey = ''

    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('OpenRouter TTS')
    expect(text).toContain('Using speech-to-text OpenRouter key')
    expect(text).toContain('OpenRouter TTS model')
  })

  it('loads OpenRouter TTS models and voices dynamically', async () => {
    const settings = createDefaultSettings()
    settings.voice!.enabled = true
    settings.voice!.asr.openrouter.apiKey = 'sk-or-asr'
    settings.voice!.tts.provider = 'openrouter-tts'
    settings.voice!.tts.openrouter.model = 'openai/gpt-4o-mini-tts-2025-12-15'
    settings.voice!.tts.openrouter.voice = 'alloy'
    const voiceGetTTSModels = vi.fn().mockResolvedValue({
      success: true,
      models: [{
        id: 'openai/gpt-4o-mini-tts-2025-12-15',
        name: 'OpenAI GPT-4o Mini TTS',
        supportedVoices: ['alloy', 'nova'],
      }],
    })
    ;(window as any).electronAPI = {
      listAgents: vi.fn().mockResolvedValue({ success: true, agents: [] }),
      voiceGetTTSModels,
    }

    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings,
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(voiceGetTTSModels).toHaveBeenCalledWith({ force: false })
    expect(wrapper.text()).toContain('OpenAI GPT-4o Mini TTS')
    expect(wrapper.text()).toContain('alloy')
    expect(wrapper.text()).toContain('nova')
    expect(wrapper.text()).toContain('Loaded 1 TTS models.')
  })

  it('makes an incomplete cloud TTS choice visible and explains the system fallback', () => {
    const settings = createDefaultSettings()
    settings.voice!.enabled = true
    settings.voice!.tts.provider = 'openai-tts'
    settings.voice!.tts.openai.apiKey = ''
    settings.ai.providers.openai.apiKey = ''

    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings,
      },
    })

    const text = wrapper.text()
    expect(text).toContain('OpenAI TTS')
    expect(text).toContain('System voice fallback')
    expect(text).toContain('Missing OpenAI key; using System voice.')
    expect(text).toContain('Required for OpenAI TTS')
  })

  it('explains setup before trying to record a speech-to-text test', async () => {
    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings: createDefaultSettings(),
      },
    })

    await wrapper.findAll('button').find(button => button.text() === 'Test in chat')?.trigger('click')

    expect(wrapper.text()).toContain('Turn on voice first.')
  })

  it('tests voice output through the app TTS path', async () => {
    vi.useFakeTimers()
    const settings = createDefaultSettings()
    settings.voice!.enabled = true
    const voiceTestTTS = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).electronAPI = {
      listAgents: vi.fn().mockResolvedValue({ success: true, agents: [] }),
      voiceTestTTS,
      voiceGetTTSModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
    }

    const wrapper = mount(VoiceSettingsTab, {
      props: {
        settings,
      },
    })

    await wrapper.findAll('button').find(button => button.text() === 'Test voice')?.trigger('click')
    await vi.advanceTimersByTimeAsync(650)

    expect(voiceTestTTS).toHaveBeenCalledWith({ text: 'Voice reply is ready.' })
    expect(wrapper.text()).toContain('Voice test sent. You should hear a reply.')
  })
})
