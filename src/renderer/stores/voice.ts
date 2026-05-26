import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { SessionEventEnvelope } from '../../shared/events/index.js'
import type { VoiceEvent, VoiceLatencyMilestone, VoiceRuntimeState } from '@/types'
import { useSessionsStore } from './sessions'

interface VoiceTurn {
  sessionId: string
  assistantMessageId?: string
  active: boolean
}

let initialized = false

export const useVoiceStore = defineStore('voice', () => {
  const state = ref<VoiceRuntimeState>({
    status: 'disabled',
    enabled: false,
    runtimeReady: false,
    updatedAt: Date.now(),
  })
  const lastError = ref<string>('')
  const lastTranscript = ref<string>('')
  const lastMilestone = ref<VoiceLatencyMilestone | null>(null)
  const milestones = ref<VoiceLatencyMilestone[]>([])
  const activeTurn = ref<VoiceTurn | null>(null)

  const isEnabled = computed(() => state.value.enabled)
  const status = computed(() => state.value.status)
  const isRecording = computed(() => state.value.status === 'recording' || state.value.status === 'transcribing')

  async function initialize() {
    if (initialized) return
    initialized = true

    try {
      const response = await window.electronAPI.voiceGetState()
      if (response.success && response.state) state.value = response.state
    } catch (error: any) {
      lastError.value = error.message || 'Failed to load voice state.'
    }

    window.electronAPI.onVoiceEvent(handleVoiceEvent)
    window.electronAPI.onSessionEvent(handleSessionEvent)
  }

  async function startListening(sessionId?: string) {
    const sessionsStore = useSessionsStore()
    const resolvedSessionId = sessionId || sessionsStore.currentSessionId
    if (!resolvedSessionId) {
      lastError.value = 'No active session for voice input.'
      return { success: false, error: lastError.value }
    }
    const response = await window.electronAPI.voiceStart({ sessionId: resolvedSessionId, reason: 'manual' })
    if (!response.success && response.error) lastError.value = response.error
    return response
  }

  async function stop(reason = 'user', submit = reason === 'mic-button') {
    return window.electronAPI.voiceStop({ reason, submit })
  }

  function dismissError() {
    lastError.value = ''
    state.value = {
      ...state.value,
      status: state.value.enabled ? 'idle' : 'disabled',
      lastError: undefined,
      updatedAt: Date.now(),
    }
  }

  function handleVoiceEvent(event: VoiceEvent) {
    if (event.type === 'state') {
      state.value = event.state
      lastError.value = event.state.lastError || ''
      if (event.state.lastMilestone) rememberMilestone(event.state.lastMilestone)
      return
    }
    if (event.type === 'error') {
      lastError.value = event.error
      return
    }
    if (event.type === 'latency-milestone') {
      rememberMilestone(event.milestone)
      return
    }
    if (event.type === 'partial-transcript' || event.type === 'transcript' || event.type === 'submitted') {
      lastTranscript.value = event.text
      if (event.type === 'partial-transcript') return
      activeTurn.value = {
        sessionId: event.sessionId,
        active: true,
      }
    }
  }

  function handleSessionEvent(envelope: SessionEventEnvelope) {
    const turn = activeTurn.value
    if (!turn || envelope.sessionId !== turn.sessionId) return
    const event = envelope.event
    if (event.type === 'message:assistant-created') {
      turn.assistantMessageId = event.message.id
      return
    }
    if (event.type === 'stream:complete' || event.type === 'stream:aborted' || event.type === 'stream:error') {
      turn.active = false
      activeTurn.value = null
    }
  }

  function rememberMilestone(milestone: VoiceLatencyMilestone) {
    const previous = lastMilestone.value
    lastMilestone.value = milestone
    if (
      previous
      && previous.name === milestone.name
      && previous.at === milestone.at
      && previous.requestId === milestone.requestId
      && previous.transcriptId === milestone.transcriptId
    ) {
      return
    }
    milestones.value = [...milestones.value, milestone].slice(-50)
  }

  return {
    state,
    status,
    isEnabled,
    isRecording,
    lastError,
    lastTranscript,
    lastMilestone,
    milestones,
    initialize,
    startListening,
    stop,
    dismissError,
  }
})
