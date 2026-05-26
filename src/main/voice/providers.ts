import { randomUUID } from 'crypto'
import { createRequiredAppFetch } from '../providers/bound-fetch.js'
import { getSettings } from '../stores/settings.js'
import type { VoiceSettings, VoiceSubmitUtteranceRequest, VoiceTTSModel } from '../../shared/ipc.js'

interface TranscriptionResult {
  text: string
  transcriptId: string
  provider: string
  model: string
}

interface SpeechResult {
  audioBase64: string
  mimeType: string
}

interface SpeechStreamResult {
  mimeType: string
}

export interface SpeechStreamHandlers {
  onStart?: (metadata: { mimeType: string }) => void | Promise<void>
  onChunk?: (chunk: Uint8Array) => void | Promise<void>
}

interface OpenRouterSpeechModel {
  id: string
  name?: string
  description?: string
  pricing?: {
    prompt?: string
    completion?: string
  }
  supported_voices?: string[]
}

let openRouterTTSModelsCache: { fetchedAt: number; models: VoiceTTSModel[] } | null = null
const OPENROUTER_TTS_MODELS_CACHE_MS = 10 * 60 * 1000

function getOpenAIKey(settings: VoiceSettings): string {
  const voiceKey = settings.asr.openai.apiKey || settings.tts.openai.apiKey
  const appSettings = getSettings()
  const providerKey = (appSettings.ai.providers.openai as any)?.apiKey
  return (voiceKey || providerKey || '').trim()
}

function getTTSOpenAIKey(settings: VoiceSettings): string {
  const appSettings = getSettings()
  const providerKey = (appSettings.ai.providers.openai as any)?.apiKey
  return (settings.tts.openai.apiKey || providerKey || '').trim()
}

function getOpenRouterKey(settings: VoiceSettings): string {
  const appSettings = getSettings()
  const providerKey = (appSettings.ai.providers.openrouter as any)?.apiKey
  return (settings.asr.openrouter.apiKey || providerKey || '').trim()
}

function getOpenRouterTTSKey(settings: VoiceSettings): string {
  const appSettings = getSettings()
  const providerKey = (appSettings.ai.providers.openrouter as any)?.apiKey
  return (
    settings.tts.openrouter?.apiKey
    || settings.asr.openrouter.apiKey
    || providerKey
    || ''
  ).trim()
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Buffer.from(base64, 'base64')
  return new Blob([bytes], { type: mimeType })
}

function audioFormatFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'mp4'
  if (normalized.includes('ogg')) return 'ogg'
  return 'wav'
}

export async function transcribeUtterance(
  request: VoiceSubmitUtteranceRequest,
  settings: VoiceSettings,
): Promise<TranscriptionResult> {
  if (settings.asr.provider === 'funasr-stream') {
    throw new Error('FunASR streaming ASR submits transcripts from the voice runtime.')
  }
  if (settings.asr.provider === 'openrouter-transcribe') {
    return transcribeWithOpenRouter(request, settings)
  }
  if (settings.asr.provider === 'funasr-server') {
    return transcribeWithFunASR(request, settings)
  }
  return transcribeWithOpenAI(request, settings)
}

export function getVoiceInputConfigurationError(settings: VoiceSettings): string | null {
  if (settings.asr.provider === 'funasr-stream') {
    const url = settings.asr.funasr.url.trim()
    if (!url) return 'Add a FunASR WebSocket URL in Voice settings before using streaming voice input.'
    return /^wss?:\/\//i.test(url)
      ? null
      : 'FunASR streaming ASR needs a ws:// or wss:// WebSocket URL.'
  }
  if (settings.asr.provider === 'openrouter-transcribe') {
    return getOpenRouterKey(settings)
      ? null
      : 'Add an OpenRouter API key in Voice settings before using voice input.'
  }
  if (settings.asr.provider === 'funasr-server') {
    return settings.asr.funasr.url.trim()
      ? null
      : 'Add a FunASR server URL in Advanced settings before using voice input.'
  }
  return getOpenAIKey(settings)
    ? null
    : 'OpenAI transcription is selected in Advanced settings, but no OpenAI API key is configured.'
}

export async function getOpenRouterTTSModels(force = false): Promise<{ models: VoiceTTSModel[]; fetchedAt: number }> {
  const now = Date.now()
  if (!force && openRouterTTSModelsCache && now - openRouterTTSModelsCache.fetchedAt < OPENROUTER_TTS_MODELS_CACHE_MS) {
    return openRouterTTSModelsCache
  }

  const fetchImpl = createRequiredAppFetch()
  const response = await fetchImpl('https://openrouter.ai/api/v1/models?output_modalities=speech', {
    headers: {
      accept: 'application/json',
      'HTTP-Referer': 'https://onething.app',
      'X-Title': 'onething',
    },
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter TTS model list failed (${response.status}): ${await response.text()}`)
  }

  const json = await response.json() as { data?: OpenRouterSpeechModel[] }
  const models = (json.data || [])
    .filter(model => model?.id)
    .map(model => ({
      id: model.id,
      name: model.name || model.id,
      description: model.description || '',
      pricing: model.pricing,
      supportedVoices: Array.isArray(model.supported_voices) ? model.supported_voices : [],
    }))
  openRouterTTSModelsCache = { fetchedAt: now, models }
  return openRouterTTSModelsCache
}

async function transcribeWithOpenAI(
  request: VoiceSubmitUtteranceRequest,
  settings: VoiceSettings,
): Promise<TranscriptionResult> {
  const apiKey = getOpenAIKey(settings)
  if (!apiKey) {
    throw new Error('OpenAI API key is required for voice transcription.')
  }

  const model = settings.asr.openai.model || 'gpt-4o-transcribe'
  const form = new FormData()
  form.set('model', model)
  if (settings.asr.openai.language?.trim()) {
    form.set('language', settings.asr.openai.language.trim())
  }
  form.set('file', base64ToBlob(request.audioBase64, request.mimeType), 'utterance.webm')

  const fetchImpl = createRequiredAppFetch()
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed (${response.status}): ${await response.text()}`)
  }

  const json = await response.json() as { text?: string }
  const text = (json.text || '').trim()
  if (!text) throw new Error('OpenAI transcription returned an empty transcript.')
  return {
    text,
    transcriptId: randomUUID(),
    provider: 'openai-transcribe',
    model,
  }
}

async function transcribeWithOpenRouter(
  request: VoiceSubmitUtteranceRequest,
  settings: VoiceSettings,
): Promise<TranscriptionResult> {
  const apiKey = getOpenRouterKey(settings)
  if (!apiKey) {
    throw new Error('OpenRouter API key is required for voice transcription.')
  }

  const model = settings.asr.openrouter.model || 'openai/whisper-1'

  const fetchImpl = createRequiredAppFetch()
  const response = await fetchImpl('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://onething.app',
      'X-Title': 'onething',
    },
    body: JSON.stringify({
      input_audio: {
        data: request.audioBase64,
        format: audioFormatFromMimeType(request.mimeType),
      },
      model,
      ...(settings.asr.openrouter.language?.trim()
        ? { language: settings.asr.openrouter.language.trim() }
        : {}),
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter transcription failed (${response.status}): ${await response.text()}`)
  }

  const json = await response.json() as { text?: string }
  const text = (json.text || '').trim()
  if (!text) throw new Error('OpenRouter transcription returned an empty transcript.')
  return {
    text,
    transcriptId: randomUUID(),
    provider: 'openrouter-transcribe',
    model,
  }
}

async function transcribeWithFunASR(
  request: VoiceSubmitUtteranceRequest,
  settings: VoiceSettings,
): Promise<TranscriptionResult> {
  const url = settings.asr.funasr.url.trim()
  if (!url) throw new Error('FunASR server URL is required.')

  const payload = {
    audio: request.audioBase64,
    mimeType: request.mimeType,
    language: settings.asr.funasr.language || 'auto',
    hotwords: settings.asr.funasr.hotwords || '',
  }

  const fetchImpl = createRequiredAppFetch()
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    throw new Error(`FunASR transcription failed (${response.status}): ${await response.text()}`)
  }

  const json = await response.json() as { text?: string; transcript?: string; result?: string }
  const text = (json.text || json.transcript || json.result || '').trim()
  if (!text) throw new Error('FunASR transcription returned an empty transcript.')
  return {
    text,
    transcriptId: randomUUID(),
    provider: 'funasr-server',
    model: 'funasr-server',
  }
}

export async function synthesizeSpeech(text: string, settings: VoiceSettings): Promise<SpeechResult> {
  const chunks: Uint8Array[] = []
  const result = await streamSynthesizeSpeech(text, settings, {
    onChunk: chunk => {
      chunks.push(chunk)
    },
  })
  return {
    audioBase64: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('base64'),
    mimeType: result.mimeType,
  }
}

export async function streamSynthesizeSpeech(
  text: string,
  settings: VoiceSettings,
  handlers: SpeechStreamHandlers = {},
): Promise<SpeechStreamResult> {
  if (settings.tts.provider === 'system-tts') {
    throw new Error('System TTS is played by the voice runtime and does not need a cloud API.')
  }
  if (settings.tts.provider === 'openrouter-tts') {
    return streamWithOpenRouter(text, settings, handlers)
  }
  if (settings.tts.provider === 'qwen-tts') {
    return streamWithQwen(text, settings, handlers)
  }
  return streamWithOpenAI(text, settings, handlers)
}

async function streamWithOpenRouter(
  text: string,
  settings: VoiceSettings,
  handlers: SpeechStreamHandlers,
): Promise<SpeechStreamResult> {
  const apiKey = getOpenRouterTTSKey(settings)
  if (!apiKey) throw new Error('OpenRouter API key is required for voice TTS.')

  return streamSpeechEndpoint('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://onething.app',
      'X-Title': 'onething',
    },
    body: JSON.stringify({
      model: settings.tts.openrouter?.model || 'openai/gpt-4o-mini-tts-2025-12-15',
      input: text,
      voice: settings.tts.openrouter?.voice || 'alloy',
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(60000),
  }, 'OpenRouter TTS', handlers)
}

async function streamWithOpenAI(
  text: string,
  settings: VoiceSettings,
  handlers: SpeechStreamHandlers,
): Promise<SpeechStreamResult> {
  const apiKey = getTTSOpenAIKey(settings)
  if (!apiKey) throw new Error('OpenAI API key is required for voice TTS.')

  return streamSpeechEndpoint('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.tts.openai.model || 'gpt-4o-mini-tts',
      voice: settings.tts.openai.voice || 'alloy',
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(60000),
  }, 'OpenAI TTS', handlers)
}

async function streamWithQwen(
  text: string,
  settings: VoiceSettings,
  handlers: SpeechStreamHandlers,
): Promise<SpeechStreamResult> {
  const baseUrl = settings.tts.qwen.baseUrl.trim().replace(/\/$/, '')
  const apiKey = (settings.tts.qwen.apiKey || '').trim()
  if (!baseUrl) throw new Error('Qwen/CosyVoice base URL is required.')
  if (!apiKey) throw new Error('Qwen/CosyVoice API key is required.')

  return streamSpeechEndpoint(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.tts.qwen.model,
      voice: settings.tts.qwen.voice,
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(60000),
  }, 'Qwen/CosyVoice TTS', handlers)
}

async function streamSpeechEndpoint(
  url: string,
  init: RequestInit,
  label: string,
  handlers: SpeechStreamHandlers,
): Promise<SpeechStreamResult> {
  const fetchImpl = createRequiredAppFetch()
  const response = await fetchImpl(url, init)
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${await response.text()}`)
  }

  const mimeType = normalizeAudioMimeType(response.headers.get('content-type') || 'audio/mpeg')
  await handlers.onStart?.({ mimeType })

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 0) await handlers.onChunk?.(buffer)
    return { mimeType }
  }

  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.byteLength) {
      await handlers.onChunk?.(value)
    }
  }

  return { mimeType }
}

function normalizeAudioMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim().toLowerCase()
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'audio/mpeg'
  if (normalized.includes('wav')) return 'audio/wav'
  if (normalized.includes('pcm')) return 'audio/mpeg'
  if (normalized.includes('ogg')) return 'audio/ogg'
  return normalized || 'audio/mpeg'
}
