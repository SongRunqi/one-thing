export type VoiceRuntimeStatus =
  | 'disabled'
  | 'idle'
  | 'wake-listening'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error'

export type VoiceASRProvider = 'funasr-stream' | 'openai-transcribe' | 'openrouter-transcribe' | 'funasr-server' | 'doubao'
export type VoiceTTSProvider = 'system-tts' | 'openrouter-tts' | 'openai-tts' | 'qwen-tts' | 'doubao'
export type VoiceEndpointingMode = 'fast' | 'balanced' | 'patient' | 'custom'
export type VoiceWakeSensitivity = 'low' | 'medium' | 'high'

export interface VoiceWakeSettings {
  enabled: boolean
  phrase: string
  provider: 'porcupine-web' | 'web-speech' | 'sherpa-kws'
  sensitivity?: VoiceWakeSensitivity
  accessKey?: string
  keywordPath?: string
  modelPath?: string
}

// Shared Volcano Engine (Doubao) credentials and tuning for both ASR and TTS.
// Only apiKey (or the legacy appId+accessToken pair) is surfaced in the UI;
// the rest is normalized to defaults and editable via settings.json.
export interface VoiceDoubaoSettings {
  apiKey?: string
  appId?: string
  accessToken?: string
  asrResourceId?: string
  ttsResourceId?: string
  endpoint?: string
  endWindowMs?: number
  /** Two-pass recognition: stream partials, re-recognize each utterance for the final. */
  twoPass?: boolean
  speaker?: string
  format?: 'mp3' | 'ogg_opus' | 'pcm'
}

export interface VoiceVADSettings {
  provider: 'silero-web' | 'energy'
  silenceMs: number
  maxRecordingMs: number
  energyThreshold: number
}

export interface VoiceASRSettings {
  provider: VoiceASRProvider
  openai: {
    apiKey?: string
    model: 'gpt-4o-transcribe' | 'whisper-1' | string
    language?: string
  }
  openrouter: {
    apiKey?: string
    model: 'openai/whisper-1' | 'openai/whisper-large-v3' | string
    language?: string
  }
  funasr: {
    url: string
    language?: string
    hotwords?: string
    mode?: '2pass' | 'online'
    chunkSize?: [number, number, number]
    chunkInterval?: number
  }
}

export interface VoiceTTSSettings {
  provider: VoiceTTSProvider
  autoSpeak: boolean
  system: {
    voice?: string
    language?: string
    rate: number
    pitch: number
  }
  openrouter: {
    apiKey?: string
    model: 'openai/gpt-4o-mini-tts-2025-12-15' | 'hexgrad/kokoro-82m' | string
    voice: string
  }
  openai: {
    apiKey?: string
    model: 'gpt-4o-mini-tts' | 'tts-1' | 'tts-1-hd' | string
    voice: string
  }
  qwen: {
    apiKey?: string
    baseUrl: string
    model: string
    voice: string
  }
}

export interface VoiceConversationSettings {
  defaultAgentId: string
  endpointing: VoiceEndpointingMode
  speakProtocol: 'speak-blocks'
}

export interface VoiceSettings {
  enabled: boolean
  alwaysOn: boolean
  bargeIn: boolean
  conversation: VoiceConversationSettings
  wake: VoiceWakeSettings
  vad: VoiceVADSettings
  asr: VoiceASRSettings
  tts: VoiceTTSSettings
  doubao: VoiceDoubaoSettings
}

// Raw PCM uplink from the voice runtime window to the main process
// (used by main-process ASR/KWS providers such as Doubao and sherpa-kws).
export interface VoiceAudioChunkPayload {
  sessionId?: string
  /** int16 little-endian mono PCM. */
  chunkBase64?: string
  sampleRate?: number
  /** wake: feed keyword spotting + pre-roll; recording: feed the active ASR session. */
  phase?: 'wake' | 'recording'
  /** Marks the end of the utterance; main finalizes the ASR session. */
  last?: boolean
  /** With last: drop the session without submitting a transcript. */
  abort?: boolean
}

export interface VoiceTranscriptMetadata {
  transcriptId: string
  asrProvider: VoiceASRProvider
  asrModel: string
  durationMs?: number
}

export type VoiceLatencyMilestoneName =
  | 'asr-socket-open'
  | 'asr-first-audio-chunk'
  | 'asr-first-partial'
  | 'asr-finalized'
  | 'tts-request-start'
  | 'tts-audio-stream-start'
  | 'tts-first-audio-chunk'
  | 'tts-audio-stream-end'
  | 'tts-system-dispatched'

export interface VoiceLatencyMilestone {
  name: VoiceLatencyMilestoneName
  at: number
  elapsedMs?: number
  sessionId?: string
  requestId?: string
  transcriptId?: string
  provider?: VoiceASRProvider | VoiceTTSProvider
  model?: string
}

export interface VoiceRuntimeState {
  status: VoiceRuntimeStatus
  enabled: boolean
  runtimeReady: boolean
  /** A hands-free voice call is connected (continuous listen/reply loop). */
  callActive?: boolean
  currentSessionId?: string
  lastTranscript?: string
  lastMilestone?: VoiceLatencyMilestone
  lastError?: string
  updatedAt: number
}

export type VoiceEvent =
  | { type: 'state'; state: VoiceRuntimeState }
  | { type: 'runtime-ready' }
  | { type: 'wake-detected'; phrase?: string; sessionId?: string }
  | { type: 'recording-started'; sessionId?: string; reason?: string }
  | { type: 'recording-stopped'; sessionId?: string; durationMs?: number }
  | { type: 'partial-transcript'; sessionId?: string; transcriptId: string; text: string; durationMs?: number }
  | { type: 'transcript'; sessionId: string; transcriptId: string; text: string; durationMs?: number }
  | { type: 'submitted'; sessionId: string; transcriptId: string; text: string }
  | { type: 'latency-milestone'; milestone: VoiceLatencyMilestone }
  | { type: 'playback-start'; requestId?: string }
  | { type: 'playback-end'; requestId?: string }
  | { type: 'playback-idle' }
  | { type: 'error'; error: string; recoverable?: boolean }

export type VoiceRuntimeEvent = VoiceEvent

export type VoiceRuntimeCommand =
  | { type: 'configure'; settings: VoiceSettings; sessionId?: string }
  | { type: 'start-wake'; settings: VoiceSettings; sessionId?: string }
  | { type: 'start-recording'; settings: VoiceSettings; sessionId?: string; reason?: string }
  | { type: 'stop'; reason?: string; submit?: boolean }
  | { type: 'stop-recording'; reason?: string }
  | { type: 'stop-playback' }
  | { type: 'play-audio'; requestId?: string; audioBase64: string; mimeType: string }
  | { type: 'play-audio-stream-start'; requestId: string; mimeType: string }
  | { type: 'play-audio-stream-chunk'; requestId: string; chunkBase64: string }
  | { type: 'play-audio-stream-end'; requestId: string; error?: string }
  | { type: 'speak-text'; requestId?: string; text: string; voice?: string; language?: string; rate?: number; pitch?: number }

export interface VoiceStartRequest {
  sessionId?: string
  reason?: 'manual' | 'wake' | 'resume' | 'call'
}

export interface VoiceStopRequest {
  reason?: string
  submit?: boolean
}

export interface VoiceSubmitUtteranceRequest {
  sessionId?: string
  audioBase64: string
  mimeType: string
  durationMs?: number
}

export interface VoiceSubmitTranscriptRequest {
  sessionId?: string
  transcriptId?: string
  text: string
  asrProvider: VoiceASRProvider
  asrModel: string
  durationMs?: number
}

export interface VoiceSynthesizeRequest {
  text: string
  requestId?: string
}

export interface VoiceTestASRRequest {
  audioBase64?: string
  mimeType?: string
}

export interface VoiceTestTTSRequest {
  text?: string
}

export interface VoiceTTSModel {
  id: string
  name: string
  description?: string
  pricing?: {
    prompt?: string
    completion?: string
  }
  supportedVoices: string[]
}

export interface VoiceBaseResponse {
  success: boolean
  error?: string
}

export interface VoiceGetStateResponse extends VoiceBaseResponse {
  state?: VoiceRuntimeState
}

export interface VoiceSubmitUtteranceResponse extends VoiceBaseResponse {
  transcript?: string
  transcriptId?: string
}

export interface VoiceSynthesizeResponse extends VoiceBaseResponse {
  requestId?: string
  mimeType?: string
}

export interface VoiceTTSModelsResponse extends VoiceBaseResponse {
  models?: VoiceTTSModel[]
  fetchedAt?: number
}
