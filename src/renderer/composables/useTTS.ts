import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import type { AgentVoice } from '@/types'

export interface VoiceOption {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

// Global state for TTS (shared across components)
const isSpeaking = ref(false)
const isPaused = ref(false)
const currentUtterance = shallowRef<SpeechSynthesisUtterance | null>(null)
const availableVoices = ref<VoiceOption[]>([])
const isSupported = ref(false)

// Initialize voices
let voicesInitialized = false

function initVoices() {
  if (voicesInitialized) return

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    isSupported.value = false
    return
  }

  isSupported.value = true

  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices()
    availableVoices.value = voices.map(v => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
    }))

    if (voices.length > 0) {
      voicesInitialized = true
    }
  }

  // Try loading immediately
  loadVoices()

  // Chrome loads voices asynchronously
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices
  }
}

export function useTTS() {
  // Initialize on first use
  onMounted(() => {
    initVoices()
  })

  /**
   * Speak text with optional voice configuration
   */
  function speak(text: string, voiceConfig?: AgentVoice): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!isSupported.value) {
        reject(new Error('Speech synthesis not supported'))
        return
      }

      // Cancel any existing speech
      stop()

      const utterance = new SpeechSynthesisUtterance(text)

      // Apply voice configuration
      if (voiceConfig) {
        // Find voice by URI
        if (voiceConfig.voiceURI) {
          const voice = window.speechSynthesis.getVoices().find(
            v => v.voiceURI === voiceConfig.voiceURI
          )
          if (voice) {
            utterance.voice = voice
          }
        }

        // Apply rate, pitch, volume
        if (voiceConfig.rate !== undefined) {
          utterance.rate = Math.max(0.1, Math.min(10, voiceConfig.rate))
        }
        if (voiceConfig.pitch !== undefined) {
          utterance.pitch = Math.max(0, Math.min(2, voiceConfig.pitch))
        }
        if (voiceConfig.volume !== undefined) {
          utterance.volume = Math.max(0, Math.min(1, voiceConfig.volume))
        }
      }

      // Event handlers
      utterance.onstart = () => {
        isSpeaking.value = true
        isPaused.value = false
      }

      utterance.onend = () => {
        isSpeaking.value = false
        isPaused.value = false
        currentUtterance.value = null
        resolve()
      }

      utterance.onerror = (event) => {
        isSpeaking.value = false
        isPaused.value = false
        currentUtterance.value = null
        // 'canceled' is not an error, just means stop() was called
        if (event.error !== 'canceled') {
          reject(new Error(`Speech synthesis error: ${event.error}`))
        } else {
          resolve()
        }
      }

      currentUtterance.value = utterance
      window.speechSynthesis.speak(utterance)
    })
  }

  /**
   * Stop all speech
   */
  function stop() {
    if (isSupported.value) {
      window.speechSynthesis.cancel()
      isSpeaking.value = false
      isPaused.value = false
      currentUtterance.value = null
    }
  }

  /**
   * Pause speech
   */
  function pause() {
    if (isSupported.value && isSpeaking.value) {
      window.speechSynthesis.pause()
      isPaused.value = true
    }
  }

  /**
   * Resume speech
   */
  function resume() {
    if (isSupported.value && isPaused.value) {
      window.speechSynthesis.resume()
      isPaused.value = false
    }
  }

  /**
   * Toggle pause/resume
   */
  function togglePause() {
    if (isPaused.value) {
      resume()
    } else if (isSpeaking.value) {
      pause()
    }
  }

  /**
   * Get voices filtered by language
   */
  function getVoicesByLang(lang: string): VoiceOption[] {
    return availableVoices.value.filter(v =>
      v.lang.toLowerCase().startsWith(lang.toLowerCase())
    )
  }

  /**
   * Get Chinese voices
   */
  function getChineseVoices(): VoiceOption[] {
    return availableVoices.value.filter(v =>
      v.lang.startsWith('zh') || v.lang.includes('Chinese')
    )
  }

  /**
   * Get English voices
   */
  function getEnglishVoices(): VoiceOption[] {
    return availableVoices.value.filter(v =>
      v.lang.startsWith('en')
    )
  }

  /**
   * Preview a voice with sample text
   */
  function previewVoice(voiceURI: string, sampleText?: string) {
    const text = sampleText || 'Hello, this is a voice preview.'
    return speak(text, { enabled: true, voiceURI, rate: 1, pitch: 1, volume: 1 })
  }

  return {
    // State
    isSupported,
    isSpeaking,
    isPaused,
    availableVoices,

    // Actions
    speak,
    stop,
    pause,
    resume,
    togglePause,

    // Helpers
    getVoicesByLang,
    getChineseVoices,
    getEnglishVoices,
    previewVoice,
  }
}
