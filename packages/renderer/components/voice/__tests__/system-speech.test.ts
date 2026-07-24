// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playSystemSpeech } from '../system-speech'

class MockSpeechSynthesisUtterance {
  text: string
  lang = ''
  rate = 1
  pitch = 1
  voice: any = null
  onend: (() => void) | null = null
  onerror: ((event: any) => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

describe('playSystemSpeech', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as any).speechSynthesis
    delete (window as any).SpeechSynthesisUtterance
    Reflect.deleteProperty(globalThis as any, 'SpeechSynthesisUtterance')
  })

  it('plays speak-text commands through system speech synthesis', () => {
    const finishPlayback = vi.fn()
    const speak = vi.fn((utterance: MockSpeechSynthesisUtterance) => {
      utterance.onend?.()
    })

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: vi.fn(() => [{ name: 'Test Voice' }]),
        speak,
      },
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    })
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    })

    const utterance = playSystemSpeech({
      requestId: 'tts-1',
      text: 'Voice reply is ready.',
      voice: 'Test Voice',
      language: 'en-US',
      rate: 1.1,
      pitch: 0.9,
    }, finishPlayback)

    expect(speak).toHaveBeenCalledTimes(1)
    expect(utterance?.text).toBe('Voice reply is ready.')
    expect(utterance?.lang).toBe('en-US')
    expect(utterance?.rate).toBe(1.1)
    expect(utterance?.pitch).toBe(0.9)
    expect(utterance?.voice).toEqual({ name: 'Test Voice' })
    expect(finishPlayback).toHaveBeenCalledWith('tts-1')
  })
})
