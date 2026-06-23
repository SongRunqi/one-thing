import { describe, expect, it } from 'vitest'
import {
  agentSupportsInputModality,
  agentSupportsOutputModality,
  assertAgentMessagesSupportedByCapabilities,
  assertAgentOutputModalitiesSupportedByCapabilities,
  inputModalitiesFromAgentContent,
  providerSupportsInputModality,
  providerSupportsOutputModality,
} from '../capabilities.js'
import type { AgentModelCapabilities, AgentProvider } from '../types.js'

describe('agent loop capabilities', () => {
  it('detects audio and video input modalities from content parts', () => {
    expect(inputModalitiesFromAgentContent([
      { type: 'text', text: 'watch this' },
      { type: 'audio', audio: 'data:audio/wav;base64,abc', mediaType: 'audio/wav' },
      { type: 'video', video: 'data:video/mp4;base64,abc', mediaType: 'video/mp4' },
    ])).toEqual(['text', 'audio', 'video'])
  })

  it('maps modality support through explicit input lists or capability flags', () => {
    expect(agentSupportsInputModality({
      capabilities: ['text-input', 'text-output', 'video-input'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    }, 'video')).toBe(true)

    expect(() => assertAgentMessagesSupportedByCapabilities([
      {
        role: 'user',
        content: [{ type: 'audio', audio: 'data:audio/wav;base64,abc', mediaType: 'audio/wav' }],
      },
    ], {
      capabilities: ['text-input', 'text-output'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    })).toThrow('Agent provider does not support audio input for role "user"')
  })

  it('maps output modality support through explicit output lists or capability flags', () => {
    expect(agentSupportsOutputModality({
      capabilities: ['text-input', 'text-output', 'image-output', 'file-output'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    }, 'image')).toBe(true)
    expect(agentSupportsOutputModality({
      capabilities: ['text-input', 'text-output', 'image-output', 'file-output'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    }, 'file')).toBe(true)
    expect(agentSupportsOutputModality({
      capabilities: ['text-input', 'text-output'],
      inputModalities: ['text'],
      outputModalities: ['text', 'audio'],
    }, 'audio')).toBe(true)
    expect(agentSupportsOutputModality({
      capabilities: ['text-input', 'text-output'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    }, 'video')).toBe(false)
  })

  it('asserts requested output modalities against provider capabilities', () => {
    const capabilities: AgentModelCapabilities = {
      capabilities: ['text-input', 'text-output', 'image-output'],
      inputModalities: ['text'],
      outputModalities: ['text'],
    }

    expect(() => assertAgentOutputModalitiesSupportedByCapabilities(['text', 'image'], capabilities))
      .not.toThrow()
    expect(() => assertAgentOutputModalitiesSupportedByCapabilities(['audio'], capabilities))
      .toThrow('Agent provider does not support audio output')
  })

  it('exposes provider-level modality checks for provider factories and callers', async () => {
    const provider: AgentProvider = {
      id: 'multi-provider',
      getModelCapabilities: async () => ({
        capabilities: ['text-input', 'text-output', 'audio-output'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
      }),
    }

    await expect(providerSupportsInputModality(provider, 'multi-model', 'image')).resolves.toBe(true)
    await expect(providerSupportsOutputModality(provider, 'multi-model', 'audio')).resolves.toBe(true)
    await expect(providerSupportsOutputModality(provider, 'multi-model', 'video')).resolves.toBe(false)
  })
})
