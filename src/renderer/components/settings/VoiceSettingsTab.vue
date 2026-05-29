<template>
  <div class="tab-content">
    <SettingsSection
      title="Voice Input"
      description="Use speech in chat without setting up a separate voice stack."
    >
      <SettingsGroup>
        <div class="voice-setup-summary">
          <div class="voice-setup-copy">
            <span
              class="voice-state-pill"
              :class="{ on: voice.enabled }"
            >
              {{ voice.enabled ? 'Voice on' : 'Voice off' }}
            </span>
            <h4>Current voice setup</h4>
            <p>{{ voiceSetupSummary }}</p>
          </div>
          <div class="voice-setup-grid">
            <div class="voice-setup-item">
              <span>Speech to text</span>
              <strong>{{ asrProviderLabel }}</strong>
              <small :class="{ warning: Boolean(asrSetupIssue) }">
                {{ asrSetupIssue || asrSetupStatus }}
              </small>
            </div>
            <div class="voice-setup-item">
              <span>Voice replies</span>
              <strong>{{ effectiveTTSProviderLabel }}</strong>
              <small :class="{ warning: Boolean(ttsSetupIssue) }">
                {{ ttsSetupIssue || ttsSetupStatus }}
              </small>
            </div>
          </div>
        </div>

        <SettingRow
          label="Turn on voice"
          description="Use the microphone while onething is running."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="voice.enabled"
              @change="updateVoice({ enabled: checked($event) })"
            >
          </label>
        </SettingRow>

        <SettingRow
          layout="stack"
          label="Conversation"
          description="The mic button starts a voice turn: listen, transcribe, send to the selected agent, then speak the assistant reply when voice replies are on."
        >
          <div class="settings-grid">
            <SettingsField label="Voice agent">
              <select
                class="form-input"
                :value="voice.conversation.defaultAgentId"
                @change="updateConversation({ defaultAgentId: value($event) })"
              >
                <option
                  v-for="agent in agents"
                  :key="agent.id"
                  :value="agent.id"
                >
                  {{ agent.name }}
                </option>
              </select>
            </SettingsField>
            <SettingsField label="Response timing">
              <select
                class="form-input"
                :value="voice.conversation.endpointing"
                @change="setEndpointing(value($event) as any)"
              >
                <option value="fast">
                  Fast response
                </option>
                <option value="balanced">
                  Balanced
                </option>
                <option value="patient">
                  Patient
                </option>
                <option value="custom">
                  Custom
                </option>
              </select>
            </SettingsField>
          </div>
        </SettingRow>

        <SettingRow
          layout="stack"
          label="Speech to text"
          :description="transcriptionDescription"
        >
          <div
            v-if="voice.asr.provider === 'openai-transcribe'"
            class="provider-note"
          >
            <span>Advanced OpenAI transcription is active.</span>
            <button
              type="button"
              @click="useRecommendedTranscription"
            >
              Use streaming ASR
            </button>
          </div>
          <div
            v-else-if="voice.asr.provider === 'funasr-server'"
            class="provider-note"
          >
            <span>Advanced FunASR transcription is active.</span>
            <button
              type="button"
              @click="useRecommendedTranscription"
            >
              Use streaming ASR
            </button>
          </div>
          <div
            v-else-if="voice.asr.provider === 'funasr-stream'"
            class="settings-grid settings-grid-compact"
          >
            <SettingsField
              label="FunASR WebSocket URL"
              hint="Required for streaming ASR. Example: ws://127.0.0.1:10095"
            >
              <input
                class="form-input"
                :value="voice.asr.funasr.url"
                placeholder="ws://127.0.0.1:10095"
                spellcheck="false"
                @input="updateFunASR({ url: value($event) })"
              >
            </SettingsField>
          </div>
          <div
            v-else
            class="settings-grid settings-grid-compact"
          >
            <SettingsField
              label="OpenRouter API key"
              :hint="hasOpenRouterProviderKey ? 'Global key found. Fill this only to override it.' : 'Required for voice input.'"
            >
              <input
                class="form-input"
                type="password"
                autocomplete="off"
                :value="voice.asr.openrouter.apiKey"
                :placeholder="hasOpenRouterProviderKey ? 'Using global key' : 'sk-or-...'"
                spellcheck="false"
                @input="updateOpenRouterASR({ apiKey: value($event) })"
              >
            </SettingsField>
          </div>
        </SettingRow>

        <SettingRow
          layout="stack"
          label="Voice replies"
          :description="ttsDescription"
        >
          <div class="voice-replies-control">
            <div class="voice-replies-toggle">
              <div>
                <span>Speak assistant replies</span>
                <small>Only replies to voice-started turns are read aloud.</small>
              </div>
              <label class="native-toggle">
                <input
                  type="checkbox"
                  :checked="voice.tts.autoSpeak"
                  @change="updateTTS({ autoSpeak: checked($event) })"
                >
              </label>
            </div>

            <div class="settings-grid settings-grid-compact">
              <SettingsField
                label="TTS provider"
                :hint="ttsProviderHint"
              >
                <select
                  class="form-input"
                  :value="voice.tts.provider"
                  @change="updateTTS({ provider: value($event) as any })"
                >
                  <option value="system-tts">
                    System voice (no key)
                  </option>
                  <option value="openrouter-tts">
                    OpenRouter TTS
                  </option>
                  <option value="openai-tts">
                    OpenAI TTS
                  </option>
                  <option value="qwen-tts">
                    Qwen / CosyVoice
                  </option>
                </select>
              </SettingsField>

              <SettingsField
                v-if="voice.tts.provider === 'openrouter-tts'"
                label="OpenRouter API key"
                :hint="hasOpenRouterTTSKey ? 'Using the voice OpenRouter key, speech-to-text key, or global OpenRouter key.' : 'Required for OpenRouter TTS. Without it, replies fall back to System voice.'"
              >
                <input
                  class="form-input"
                  type="password"
                  autocomplete="off"
                  :value="voice.tts.openrouter.apiKey"
                  :placeholder="openRouterTTSPlaceholder"
                  spellcheck="false"
                  @input="updateOpenRouterTTS({ apiKey: value($event) })"
                >
              </SettingsField>

              <SettingsField
                v-else-if="voice.tts.provider === 'openai-tts'"
                label="OpenAI API key"
                :hint="hasOpenAIProviderKey ? 'Global OpenAI key found. Fill this only to override it.' : 'Required for OpenAI TTS. Without it, replies fall back to System voice.'"
              >
                <input
                  class="form-input"
                  type="password"
                  autocomplete="off"
                  :value="voice.tts.openai.apiKey"
                  :placeholder="hasOpenAIProviderKey ? 'Using global key' : 'sk-...'"
                  spellcheck="false"
                  @input="updateOpenAITTS({ apiKey: value($event) })"
                >
              </SettingsField>

              <SettingsField
                v-else-if="voice.tts.provider === 'qwen-tts'"
                label="Qwen / CosyVoice URL"
                hint="OpenAI-compatible /audio/speech base URL."
              >
                <input
                  class="form-input"
                  :value="voice.tts.qwen.baseUrl"
                  placeholder="https://..."
                  spellcheck="false"
                  @input="updateQwenTTS({ baseUrl: value($event) })"
                >
              </SettingsField>

              <SettingsField
                v-else
                label="System voice"
                value="Default"
                hint="Uses the built-in browser/system speech voice."
              >
                <div class="readonly-provider">
                  No cloud TTS setup needed
                </div>
              </SettingsField>
            </div>

            <div
              v-if="voice.tts.provider === 'openrouter-tts'"
              class="settings-grid settings-grid-compact provider-config-grid"
            >
              <SettingsField
                label="OpenRouter TTS model"
                :hint="openRouterTTSModelHint"
              >
                <select
                  v-if="ttsModels.length"
                  class="form-input"
                  :value="voice.tts.openrouter.model"
                  @change="selectOpenRouterTTSModel(value($event))"
                >
                  <option
                    v-for="model in ttsModels"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name || model.id }}
                  </option>
                </select>
                <input
                  v-else
                  class="form-input"
                  :value="voice.tts.openrouter.model"
                  spellcheck="false"
                  @input="updateOpenRouterTTS({ model: value($event) })"
                >
              </SettingsField>
              <SettingsField
                label="Voice"
                :hint="openRouterTTSVoiceHint"
              >
                <select
                  v-if="selectedOpenRouterTTSVoices.length"
                  class="form-input"
                  :value="voice.tts.openrouter.voice"
                  @change="updateOpenRouterTTS({ voice: value($event) })"
                >
                  <option
                    v-for="voiceName in selectedOpenRouterTTSVoices"
                    :key="voiceName"
                    :value="voiceName"
                  >
                    {{ voiceName }}
                  </option>
                </select>
                <input
                  v-else
                  class="form-input"
                  :value="voice.tts.openrouter.voice"
                  spellcheck="false"
                  @input="updateOpenRouterTTS({ voice: value($event) })"
                >
              </SettingsField>
            </div>

            <div
              v-if="voice.tts.provider === 'openrouter-tts'"
              class="model-actions"
            >
              <button
                type="button"
                class="secondary-button compact-button"
                :disabled="ttsModelsStatus === 'loading'"
                @click="loadOpenRouterTTSModels(true)"
              >
                <Loader2
                  v-if="ttsModelsStatus === 'loading'"
                  class="spin"
                  :size="14"
                />
                <RefreshCw
                  v-else
                  :size="14"
                />
                <span>{{ ttsModels.length ? 'Refresh TTS models' : 'Load TTS models' }}</span>
              </button>
              <span
                v-if="ttsModelsMessage"
                class="model-status"
                :class="ttsModelsStatus"
              >
                {{ ttsModelsMessage }}
              </span>
            </div>

            <div
              v-if="voice.tts.provider === 'qwen-tts'"
              class="settings-grid settings-grid-compact provider-config-grid"
            >
              <SettingsField
                label="Qwen / CosyVoice API key"
                hint="Required for Qwen / CosyVoice. Without it, replies fall back to System voice."
              >
                <input
                  class="form-input"
                  type="password"
                  autocomplete="off"
                  :value="voice.tts.qwen.apiKey"
                  spellcheck="false"
                  @input="updateQwenTTS({ apiKey: value($event) })"
                >
              </SettingsField>
              <SettingsField label="Voice">
                <input
                  class="form-input"
                  :value="voice.tts.qwen.voice"
                  spellcheck="false"
                  @input="updateQwenTTS({ voice: value($event) })"
                >
              </SettingsField>
            </div>

            <div
              v-if="voice.tts.provider === 'openai-tts'"
              class="settings-grid settings-grid-compact provider-config-grid"
            >
              <SettingsField label="OpenAI TTS model">
                <input
                  class="form-input"
                  :value="voice.tts.openai.model"
                  spellcheck="false"
                  @input="updateOpenAITTS({ model: value($event) })"
                >
              </SettingsField>
              <SettingsField label="OpenAI voice">
                <input
                  class="form-input"
                  :value="voice.tts.openai.voice"
                  spellcheck="false"
                  @input="updateOpenAITTS({ voice: value($event) })"
                >
              </SettingsField>
            </div>

            <p
              v-if="ttsSetupIssue"
              class="setup-status warning"
            >
              {{ ttsSetupIssue }}
            </p>
          </div>
        </SettingRow>

        <div class="setup-actions">
          <button
            type="button"
            class="secondary-button"
            @click="useRecommendedDefaults"
          >
            <RefreshCw :size="15" />
            <span>Reset to recommended</span>
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="isTestingTTS"
            @click="testSystemVoice"
          >
            <Loader2
              v-if="isTestingTTS"
              class="spin"
              :size="15"
            />
            <Volume2
              v-else
              :size="15"
            />
            <span>{{ ttsTestButtonLabel }}</span>
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="isTestingASR"
            @click="testSpeechToText"
          >
            <Loader2
              v-if="isTestingASR"
              class="spin"
              :size="15"
            />
            <Mic
              v-else
              :size="15"
            />
            <span>{{ asrTestButtonLabel }}</span>
          </button>
          <p
            v-if="asrTestMessage"
            class="setup-status"
            :class="asrTestStatus"
          >
            {{ asrTestMessage }}
          </p>
          <p
            v-if="ttsTestMessage"
            class="setup-status"
            :class="ttsTestStatus"
          >
            {{ ttsTestMessage }}
          </p>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <button
      type="button"
      class="advanced-toggle"
      @click="showAdvanced = !showAdvanced"
    >
      {{ showAdvanced ? 'Hide advanced settings' : 'Advanced settings' }}
    </button>

    <SettingsSection
      v-if="showAdvanced"
      title="Advanced Recording"
      description="Tune automatic stop detection for mic button recordings."
    >
      <SettingsGroup>
        <div class="settings-grid">
          <SettingsField label="VAD provider">
            <select
              class="form-input"
              :value="voice.vad.provider"
              @change="updateVAD({ provider: value($event) as any })"
            >
              <option value="silero-web">
                Silero Web
              </option>
              <option value="energy">
                Energy fallback
              </option>
            </select>
          </SettingsField>
          <SettingsField label="Silence ms">
            <input
              class="form-input"
              type="number"
              min="300"
              max="10000"
              :value="voice.vad.silenceMs"
              @input="updateCustomSilenceMs(numberValue($event))"
            >
          </SettingsField>
        </div>

        <div class="settings-grid">
          <SettingsField label="Energy threshold">
            <input
              class="form-input"
              type="number"
              min="0.001"
              max="0.25"
              step="0.001"
              :value="voice.vad.energyThreshold"
              @input="updateVAD({ energyThreshold: numberValue($event) })"
            >
          </SettingsField>
          <SettingsField label="Max recording ms">
            <input
              class="form-input"
              type="number"
              min="3000"
              max="120000"
              :value="voice.vad.maxRecordingMs"
              @input="updateVAD({ maxRecordingMs: numberValue($event) })"
            >
          </SettingsField>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      v-if="showAdvanced"
      title="Advanced Speech Providers"
      description="Override models, local servers, or paid voice services."
    >
      <SettingsGroup>
        <div class="settings-grid">
          <SettingsField label="ASR provider">
            <select
              class="form-input"
              :value="voice.asr.provider"
              @change="updateASR({ provider: value($event) as any })"
            >
              <option value="funasr-stream">
                FunASR Streaming
              </option>
              <option value="openai-transcribe">
                OpenAI Transcribe
              </option>
              <option value="openrouter-transcribe">
                OpenRouter Whisper
              </option>
              <option value="funasr-server">
                FunASR HTTP Server
              </option>
            </select>
          </SettingsField>
          <SettingsField label="OpenAI ASR model">
            <input
              class="form-input"
              :value="voice.asr.openai.model"
              spellcheck="false"
              @input="updateOpenAIASR({ model: value($event) })"
            >
          </SettingsField>
        </div>

        <div class="settings-grid">
          <SettingsField
            label="OpenRouter ASR model"
            hint="Use openai/whisper-1 if you want OpenRouter's OpenAI Whisper route."
          >
            <input
              class="form-input"
              :value="voice.asr.openrouter.model"
              spellcheck="false"
              @input="updateOpenRouterASR({ model: value($event) })"
            >
          </SettingsField>
          <SettingsField
            label="OpenRouter API key"
            hint="Optional if your global OpenRouter provider already has a key."
          >
            <input
              class="form-input"
              type="password"
              autocomplete="off"
              :value="voice.asr.openrouter.apiKey"
              spellcheck="false"
              @input="updateOpenRouterASR({ apiKey: value($event) })"
            >
          </SettingsField>
        </div>

        <SettingRow layout="stack">
          <SettingsField
            label="FunASR URL"
            hint="Use ws:// or wss:// for streaming ASR. The legacy HTTP JSON endpoint only works with FunASR HTTP Server."
          >
            <input
              class="form-input"
              :value="voice.asr.funasr.url"
              placeholder="ws://127.0.0.1:10095"
              spellcheck="false"
              @input="updateFunASR({ url: value($event) })"
            >
          </SettingsField>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Loader2, Mic, RefreshCw, Volume2 } from 'lucide-vue-next'
import type { AgentDefinition, AppSettings, VoiceEndpointingMode, VoiceSettings, VoiceTTSModel } from '@/types'
import {
  SettingRow,
  SettingsField,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'
import { DEFAULT_VOICE_SETTINGS } from '@shared/defaults/settings'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const voice = computed<VoiceSettings>(() => props.settings.voice ?? DEFAULT_VOICE_SETTINGS)
const showAdvanced = ref(false)
const agents = ref<AgentDefinition[]>([])
const asrTestStatus = ref<'idle' | 'recording' | 'testing' | 'success' | 'error'>('idle')
const asrTestMessage = ref('')
const ttsTestStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
const ttsTestMessage = ref('')
const ttsModels = ref<VoiceTTSModel[]>([])
const ttsModelsStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const ttsModelsMessage = ref('')
let asrTestStream: MediaStream | null = null
let asrTestRecorder: MediaRecorder | null = null
const transcriptionDescription = computed(() => {
  if (voice.value.asr.provider === 'funasr-stream') {
    return 'Realtime path. Streams microphone PCM to your FunASR WebSocket server and receives partial transcripts.'
  }
  if (voice.value.asr.provider === 'funasr-server') {
    return 'Legacy path. Sends one completed recording to your FunASR HTTP endpoint.'
  }
  if (voice.value.asr.provider === 'openai-transcribe') {
    return 'This batch transcription path is enabled from Advanced settings. Switch back to streaming ASR below.'
  }
  return 'Batch path. Uses OpenRouter Whisper with your global OpenRouter key or the key below.'
})
const hasOpenRouterProviderKey = computed(() => Boolean(
  (props.settings.ai.providers.openrouter as any)?.apiKey?.trim(),
))
const hasOpenAIProviderKey = computed(() => Boolean(
  (props.settings.ai.providers.openai as any)?.apiKey?.trim(),
))
const hasOpenRouterASRKey = computed(() => Boolean(voice.value.asr.openrouter.apiKey?.trim()))
const hasOpenRouterTTSKey = computed(() => Boolean(
  voice.value.tts.openrouter.apiKey?.trim()
  || voice.value.asr.openrouter.apiKey?.trim()
  || hasOpenRouterProviderKey.value,
))
const openRouterTTSPlaceholder = computed(() => {
  if (voice.value.tts.openrouter.apiKey?.trim()) return ''
  if (hasOpenRouterASRKey.value) return 'Using speech-to-text OpenRouter key'
  if (hasOpenRouterProviderKey.value) return 'Using global OpenRouter key'
  return 'sk-or-...'
})
const selectedOpenRouterTTSModel = computed(() => (
  ttsModels.value.find(model => model.id === voice.value.tts.openrouter.model)
))
const selectedOpenRouterTTSVoices = computed(() => selectedOpenRouterTTSModel.value?.supportedVoices || [])
const openRouterTTSModelHint = computed(() => {
  if (ttsModelsStatus.value === 'loading') return 'Loading speech models from OpenRouter...'
  if (ttsModels.value.length) return 'Loaded from OpenRouter models API.'
  if (ttsModelsStatus.value === 'error') return 'Model loading failed. You can still type a model slug manually.'
  return 'Use OpenRouter speech model slugs, or load the model list.'
})
const openRouterTTSVoiceHint = computed(() => {
  if (selectedOpenRouterTTSVoices.value.length) return 'Voices are loaded from the selected OpenRouter model.'
  if (ttsModels.value.length) return 'This model did not report voices. You can type a provider-supported voice manually.'
  return 'Voice names depend on the selected OpenRouter model.'
})
const asrProviderLabel = computed(() => {
  if (voice.value.asr.provider === 'funasr-stream') return 'FunASR Streaming'
  if (voice.value.asr.provider === 'funasr-server') return 'FunASR Server'
  if (voice.value.asr.provider === 'openai-transcribe') return `OpenAI ${voice.value.asr.openai.model || 'Transcribe'}`
  return `OpenRouter ${voice.value.asr.openrouter.model || 'Whisper'}`
})
const asrSetupIssue = computed(() => getASRProviderSetupIssue())
const asrSetupStatus = computed(() => {
  if (voice.value.asr.provider === 'openrouter-transcribe' && hasOpenRouterProviderKey.value && !voice.value.asr.openrouter.apiKey?.trim()) {
    return 'Using global OpenRouter key'
  }
  if (voice.value.asr.provider === 'openai-transcribe' && hasOpenAIProviderKey.value && !voice.value.asr.openai.apiKey?.trim()) {
    return 'Using global OpenAI key'
  }
  return 'Configured'
})
const configuredTTSProviderLabel = computed(() => {
  if (voice.value.tts.provider === 'openrouter-tts') return 'OpenRouter TTS'
  if (voice.value.tts.provider === 'openai-tts') return 'OpenAI TTS'
  if (voice.value.tts.provider === 'qwen-tts') return 'Qwen / CosyVoice'
  return 'System voice'
})
const ttsProviderHasRequiredConfig = computed(() => {
  if (voice.value.tts.provider === 'system-tts') return true
  if (voice.value.tts.provider === 'openrouter-tts') return hasOpenRouterTTSKey.value
  if (voice.value.tts.provider === 'openai-tts') {
    return Boolean(voice.value.tts.openai.apiKey?.trim() || hasOpenAIProviderKey.value)
  }
  return Boolean(voice.value.tts.qwen.baseUrl.trim() && voice.value.tts.qwen.apiKey?.trim())
})
const effectiveTTSProviderLabel = computed(() => {
  if (!voice.value.tts.autoSpeak) return 'Off'
  if (ttsProviderHasRequiredConfig.value) return configuredTTSProviderLabel.value
  return `System voice fallback`
})
const ttsSetupIssue = computed(() => {
  if (!voice.value.tts.autoSpeak) return ''
  if (voice.value.tts.provider === 'openrouter-tts' && !ttsProviderHasRequiredConfig.value) {
    return 'Missing OpenRouter key; using System voice.'
  }
  if (voice.value.tts.provider === 'openai-tts' && !ttsProviderHasRequiredConfig.value) {
    return 'Missing OpenAI key; using System voice.'
  }
  if (voice.value.tts.provider === 'qwen-tts' && !voice.value.tts.qwen.baseUrl.trim()) {
    return 'Missing Qwen / CosyVoice URL; using System voice.'
  }
  if (voice.value.tts.provider === 'qwen-tts' && !voice.value.tts.qwen.apiKey?.trim()) {
    return 'Missing Qwen / CosyVoice API key; using System voice.'
  }
  return ''
})
const ttsSetupStatus = computed(() => {
  if (!voice.value.tts.autoSpeak) return 'Assistant replies will not be spoken'
  if (voice.value.tts.provider === 'system-tts') return 'No API key needed'
  if (voice.value.tts.provider === 'openrouter-tts' && hasOpenRouterASRKey.value && !voice.value.tts.openrouter.apiKey?.trim()) {
    return 'Using speech-to-text OpenRouter key'
  }
  if (voice.value.tts.provider === 'openrouter-tts' && hasOpenRouterProviderKey.value && !voice.value.tts.openrouter.apiKey?.trim()) {
    return 'Using global OpenRouter key'
  }
  if (voice.value.tts.provider === 'openai-tts' && hasOpenAIProviderKey.value && !voice.value.tts.openai.apiKey?.trim()) {
    return 'Using global OpenAI key'
  }
  return 'Configured'
})
const ttsDescription = computed(() => {
  if (!voice.value.tts.autoSpeak) return 'Voice replies are off. The assistant will answer in text only.'
  if (ttsSetupIssue.value) return 'The selected cloud TTS is incomplete, so replies fall back to System voice instead of failing silently.'
  return `Assistant replies from voice turns will be spoken with ${effectiveTTSProviderLabel.value}.`
})
const ttsProviderHint = computed(() => {
  if (voice.value.tts.provider === 'system-tts') return 'Recommended MVP path. It works without a paid TTS API.'
  if (voice.value.tts.provider === 'openrouter-tts') return 'Uses the same OpenRouter account as speech to text when available.'
  if (voice.value.tts.provider === 'openai-tts') return 'Uses OpenAI audio speech when a key is available; otherwise System voice is used.'
  return 'Uses an OpenAI-compatible Qwen/CosyVoice speech endpoint when configured.'
})
const voiceSetupSummary = computed(() => {
  if (!voice.value.enabled) return 'Turn on Voice, add speech-to-text credentials, then use the mic button in chat.'
  const inputState = asrSetupIssue.value ? 'speech to text still needs setup' : `${asrProviderLabel.value} is ready`
  const replyState = voice.value.tts.autoSpeak
    ? `replies use ${effectiveTTSProviderLabel.value}`
    : 'spoken replies are off'
  return `${inputState}; ${replyState}.`
})
const isTestingASR = computed(() => asrTestStatus.value === 'recording' || asrTestStatus.value === 'testing')
const isTestingTTS = computed(() => ttsTestStatus.value === 'testing')
const asrTestButtonLabel = computed(() => {
  if (asrTestStatus.value === 'recording') return 'Listening...'
  if (asrTestStatus.value === 'testing') return 'Checking...'
  if (voice.value.asr.provider === 'funasr-stream') return 'Test in chat'
  return 'Test speech to text'
})
const ttsTestButtonLabel = computed(() => isTestingTTS.value ? 'Testing voice...' : 'Test voice')

const ENDPOINTING_PRESETS: Record<Exclude<VoiceEndpointingMode, 'custom'>, number> = {
  fast: 650,
  balanced: 900,
  patient: 1300,
}

onMounted(async () => {
  try {
    const response = await window.electronAPI.listAgents()
    if (response.success && response.agents?.length) agents.value = response.agents
  } catch {
    agents.value = []
  }
  if (!agents.value.some(agent => agent.id === voice.value.conversation.defaultAgentId)) {
    agents.value = [{
      id: voice.value.conversation.defaultAgentId || 'default',
      name: 'Default Agent',
      systemPrompt: '',
      isDefault: true,
      createdAt: 0,
      updatedAt: 0,
    }]
  }

  if (voice.value.tts.provider === 'openrouter-tts') {
    void loadOpenRouterTTSModels()
  }
})

onUnmounted(() => {
  cleanupASRTest()
})

watch(() => voice.value.tts.provider, (provider) => {
  if (provider === 'openrouter-tts' && ttsModelsStatus.value === 'idle') {
    void loadOpenRouterTTSModels()
  }
})

function checked(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function value(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function numberValue(event: Event) {
  return Number(value(event))
}

function updateVoice(updates: Partial<VoiceSettings>) {
  emit('update:settings', {
    ...props.settings,
    voice: {
      ...voice.value,
      ...updates,
    },
  })
}

function updateVAD(updates: Partial<VoiceSettings['vad']>) {
  updateVoice({ vad: { ...voice.value.vad, ...updates } })
}

function updateConversation(updates: Partial<VoiceSettings['conversation']>) {
  updateVoice({ conversation: { ...voice.value.conversation, ...updates } })
}

function setEndpointing(mode: VoiceEndpointingMode) {
  const silenceMs = mode === 'custom'
    ? voice.value.vad.silenceMs
    : ENDPOINTING_PRESETS[mode]
  updateVoice({
    conversation: {
      ...voice.value.conversation,
      endpointing: mode,
    },
    vad: {
      ...voice.value.vad,
      silenceMs,
    },
  })
}

function updateCustomSilenceMs(silenceMs: number) {
  updateVoice({
    conversation: {
      ...voice.value.conversation,
      endpointing: 'custom',
    },
    vad: {
      ...voice.value.vad,
      silenceMs,
    },
  })
}

function updateASR(updates: Partial<VoiceSettings['asr']>) {
  updateVoice({ asr: { ...voice.value.asr, ...updates } })
}

function updateOpenAIASR(updates: Partial<VoiceSettings['asr']['openai']>) {
  updateASR({ openai: { ...voice.value.asr.openai, ...updates } })
}

function updateOpenRouterASR(updates: Partial<VoiceSettings['asr']['openrouter']>) {
  updateASR({ openrouter: { ...voice.value.asr.openrouter, ...updates } })
}

function updateFunASR(updates: Partial<VoiceSettings['asr']['funasr']>) {
  updateASR({ funasr: { ...voice.value.asr.funasr, ...updates } })
}

function updateTTS(updates: Partial<VoiceSettings['tts']>) {
  updateVoice({ tts: { ...voice.value.tts, ...updates } })
}

function updateOpenAITTS(updates: Partial<VoiceSettings['tts']['openai']>) {
  updateTTS({ openai: { ...voice.value.tts.openai, ...updates } })
}

function updateOpenRouterTTS(updates: Partial<VoiceSettings['tts']['openrouter']>) {
  updateTTS({ openrouter: { ...voice.value.tts.openrouter, ...updates } })
}

function selectOpenRouterTTSModel(modelId: string) {
  const model = ttsModels.value.find(item => item.id === modelId)
  const nextVoice = model?.supportedVoices?.includes(voice.value.tts.openrouter.voice)
    ? voice.value.tts.openrouter.voice
    : model?.supportedVoices?.[0] || voice.value.tts.openrouter.voice
  updateOpenRouterTTS({
    model: modelId,
    voice: nextVoice,
  })
}

function updateQwenTTS(updates: Partial<VoiceSettings['tts']['qwen']>) {
  updateTTS({ qwen: { ...voice.value.tts.qwen, ...updates } })
}

async function loadOpenRouterTTSModels(force = false) {
  if (ttsModelsStatus.value === 'loading') return
  try {
    ttsModelsStatus.value = 'loading'
    ttsModelsMessage.value = 'Loading OpenRouter TTS models...'
    const response = await window.electronAPI.voiceGetTTSModels({ force })
    if (!response.success) throw new Error(response.error || 'Failed to load OpenRouter TTS models.')
    ttsModels.value = response.models || []
    ttsModelsStatus.value = 'success'
    ttsModelsMessage.value = ttsModels.value.length
      ? `Loaded ${ttsModels.value.length} TTS models.`
      : 'No OpenRouter TTS models were returned.'

    const selected = ttsModels.value.find(model => model.id === voice.value.tts.openrouter.model)
    if (selected?.supportedVoices?.length && !selected.supportedVoices.includes(voice.value.tts.openrouter.voice)) {
      updateOpenRouterTTS({ voice: selected.supportedVoices[0] })
    }
  } catch (error: any) {
    ttsModelsStatus.value = 'error'
    ttsModelsMessage.value = error?.message || 'Failed to load OpenRouter TTS models.'
  }
}

function useRecommendedTranscription() {
  updateASR({
    provider: 'funasr-stream',
    funasr: {
      ...voice.value.asr.funasr,
      mode: '2pass',
      chunkSize: [5, 10, 5],
      chunkInterval: 10,
    },
  })
}

function useRecommendedDefaults() {
  updateVoice({
    alwaysOn: false,
    bargeIn: true,
    wake: {
      ...voice.value.wake,
      enabled: false,
      provider: 'porcupine-web',
    },
    vad: {
      ...voice.value.vad,
      provider: 'silero-web',
      silenceMs: ENDPOINTING_PRESETS.fast,
      maxRecordingMs: 20000,
      energyThreshold: 0.012,
    },
    conversation: {
      ...voice.value.conversation,
      endpointing: 'fast',
      speakProtocol: 'speak-blocks',
    },
    asr: {
      ...voice.value.asr,
      provider: 'funasr-stream',
      funasr: {
        ...voice.value.asr.funasr,
        mode: '2pass',
        chunkSize: [5, 10, 5],
        chunkInterval: 10,
      },
    },
    tts: {
      ...voice.value.tts,
      provider: 'system-tts',
      autoSpeak: true,
    },
  })
}

async function testSystemVoice() {
  if (isTestingTTS.value) return
  if (!voice.value.enabled) {
    ttsTestStatus.value = 'error'
    ttsTestMessage.value = 'Turn on voice first.'
    return
  }
  if (!voice.value.tts.autoSpeak) {
    ttsTestStatus.value = 'error'
    ttsTestMessage.value = 'Turn on Speak replies first.'
    return
  }

  try {
    ttsTestStatus.value = 'testing'
    ttsTestMessage.value = 'Sending a test voice reply...'
    await sleep(650)
    const response = await window.electronAPI.voiceTestTTS({ text: 'Voice reply is ready.' })
    if (!response.success) throw new Error(response.error || 'Voice test failed.')
    ttsTestStatus.value = 'success'
    ttsTestMessage.value = 'Voice test sent. You should hear a reply.'
  } catch (error: any) {
    ttsTestStatus.value = 'error'
    ttsTestMessage.value = error?.message || 'Voice test failed.'
  }
}

async function testSpeechToText() {
  if (isTestingASR.value) return

  const setupIssue = getASRSetupIssue()
  if (setupIssue) {
    asrTestStatus.value = 'error'
    asrTestMessage.value = setupIssue
    return
  }

  if (voice.value.asr.provider === 'funasr-stream') {
    asrTestStatus.value = 'success'
    asrTestMessage.value = 'Streaming ASR runs from the chat mic button so partial transcripts can appear live.'
    return
  }

  try {
    asrTestStatus.value = 'recording'
    asrTestMessage.value = 'Recording for 4 seconds. Say a short phrase.'
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
      },
    })
    asrTestStream = stream

    const chunks: Blob[] = []
    const mimeType = preferredMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    asrTestRecorder = recorder
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = event => reject((event as any).error || new Error('Microphone test failed.'))
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      }
    })

    recorder.start()
    await sleep(4000)
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await stopped
    cleanupASRTest()

    if (blob.size === 0) throw new Error('No microphone audio was captured.')
    asrTestStatus.value = 'testing'
    asrTestMessage.value = 'Sending the recording to speech to text...'

    // Settings save automatically from the parent page; give the debounce time to flush
    // so a freshly pasted API key is included in the test request.
    await sleep(650)
    const response = await window.electronAPI.voiceTestASR({
      audioBase64: await blobToBase64(blob),
      mimeType: blob.type || 'audio/webm',
    })

    if (!response.success) {
      throw new Error(response.error || 'Speech to text test failed.')
    }

    asrTestStatus.value = 'success'
    asrTestMessage.value = response.transcript
      ? `Heard: ${response.transcript}`
      : 'Speech to text returned no transcript.'
  } catch (error: any) {
    cleanupASRTest()
    asrTestStatus.value = 'error'
    asrTestMessage.value = normalizeASRTestError(error)
  }
}

function getASRSetupIssue() {
  if (!voice.value.enabled) return 'Turn on voice first.'
  return getASRProviderSetupIssue()
}

function getASRProviderSetupIssue() {
  if (voice.value.asr.provider === 'funasr-stream') {
    const url = voice.value.asr.funasr.url.trim()
    if (!url) return 'Add a FunASR WebSocket URL before testing speech to text.'
    return /^wss?:\/\//i.test(url) ? '' : 'FunASR streaming ASR needs a ws:// or wss:// URL.'
  }
  if (voice.value.asr.provider === 'openrouter-transcribe') {
    const voiceKey = voice.value.asr.openrouter.apiKey?.trim()
    const globalKey = (props.settings.ai.providers.openrouter as any)?.apiKey?.trim()
    return voiceKey || globalKey ? '' : 'Add an OpenRouter API key before testing speech to text.'
  }
  if (voice.value.asr.provider === 'openai-transcribe') {
    const voiceKey = voice.value.asr.openai.apiKey?.trim()
    const globalKey = (props.settings.ai.providers.openai as any)?.apiKey?.trim()
    return voiceKey || globalKey ? '' : 'OpenAI transcription is selected but no OpenAI API key is configured.'
  }
  return voice.value.asr.funasr.url.trim() ? '' : 'Add a FunASR server URL before testing speech to text.'
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(reader.error || new Error('Could not read recorded audio.'))
    reader.readAsDataURL(blob)
  })
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function cleanupASRTest() {
  if (asrTestRecorder && asrTestRecorder.state !== 'inactive') {
    try {
      asrTestRecorder.stop()
    } catch {
      // Ignore cleanup races.
    }
  }
  asrTestRecorder = null
  asrTestStream?.getTracks().forEach(track => track.stop())
  asrTestStream = null
}

function normalizeASRTestError(error: any) {
  const message = String(error?.message || error || 'Speech to text test failed.')
  if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
    return 'Microphone access was blocked. Allow microphone access and try again.'
  }
  if (message.includes('OpenRouter transcription failed (401)') || message.includes('OpenRouter transcription failed (403)')) {
    return 'OpenRouter rejected the API key.'
  }
  if (message.includes('transcription returned an empty transcript')) {
    return 'No speech was detected. Try the test again and say a short phrase.'
  }
  return message
}
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--border));
}

.settings-grid:last-child {
  border-bottom: 0;
}

.settings-grid-compact {
  padding: 0;
  border-bottom: 0;
}

.voice-setup-summary {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.2fr);
  gap: 14px;
  padding: 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--border));
  background: var(--settings-paper-2, var(--bg-secondary));
}

.voice-setup-copy {
  min-width: 0;
}

.voice-state-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 22px;
  padding: 3px 8px;
  border: 1px solid var(--settings-rule-soft, var(--border));
  border-radius: 999px;
  background: var(--settings-paper-1, var(--bg-primary));
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}

.voice-state-pill.on {
  border-color: color-mix(in srgb, #16a34a 36%, var(--settings-rule-soft, var(--border)));
  color: #15803d;
}

.voice-setup-copy h4 {
  margin: 10px 0 4px;
  color: var(--settings-ink-1, var(--text-primary));
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.voice-setup-copy p {
  margin: 0;
  color: var(--settings-ink-3, var(--text-secondary));
  font-size: 12px;
  line-height: 1.45;
}

.voice-setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.voice-setup-item {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--settings-rule-soft, var(--border));
  border-radius: 7px;
  background: var(--settings-paper-1, var(--bg-primary));
}

.voice-setup-item span,
.voice-setup-item small {
  display: block;
  min-width: 0;
}

.voice-setup-item span {
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  text-transform: uppercase;
}

.voice-setup-item strong {
  display: block;
  margin-top: 7px;
  overflow-wrap: anywhere;
  color: var(--settings-ink-1, var(--text-primary));
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
}

.voice-setup-item small {
  margin-top: 5px;
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  line-height: 1.35;
}

.voice-setup-item small.warning {
  color: #b45309;
}

.native-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--settings-accent, var(--accent));
}

.voice-replies-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.voice-replies-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 42px;
}

.voice-replies-toggle span,
.voice-replies-toggle small {
  display: block;
}

.voice-replies-toggle span {
  color: var(--settings-ink-2, var(--text-primary));
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.voice-replies-toggle small {
  margin-top: 3px;
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  line-height: 1.35;
}

.provider-config-grid {
  padding-top: 2px;
}

.model-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}

.compact-button {
  min-height: 28px;
  padding: 5px 9px;
  font-size: 12px;
}

.model-status {
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  line-height: 1.35;
}

.model-status.error {
  color: #b91c1c;
}

.model-status.success {
  color: #15803d;
}

.readonly-provider {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--input-bg, var(--bg-primary)) 70%, transparent);
  color: var(--settings-ink-3, var(--text-secondary));
  font-size: 13px;
}

.setup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--settings-rule-soft, var(--border));
}

.setup-note {
  max-width: 560px;
  margin: 8px 0 0;
  color: var(--settings-ink-4, var(--text-muted));
  font-size: 12px;
  line-height: 1.45;
}

.setup-status {
  flex-basis: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--settings-rule-soft, var(--border));
  border-radius: 7px;
  background: var(--settings-paper-2, var(--bg-secondary));
  color: var(--settings-ink-3, var(--text-secondary));
  font-size: 12px;
  line-height: 1.4;
}

.setup-status.success {
  border-color: color-mix(in srgb, #16a34a 42%, var(--settings-rule-soft, var(--border)));
  color: #15803d;
}

.setup-status.error {
  border-color: color-mix(in srgb, #dc2626 42%, var(--settings-rule-soft, var(--border)));
  color: #b91c1c;
}

.setup-status.warning {
  border-color: color-mix(in srgb, #f59e0b 48%, var(--settings-rule-soft, var(--border)));
  color: #92400e;
  background: color-mix(in srgb, #fef3c7 28%, var(--settings-paper-2, var(--bg-secondary)));
}

.provider-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid var(--settings-rule-soft, var(--border));
  border-radius: 7px;
  background: var(--settings-paper-2, var(--bg-secondary));
  color: var(--settings-ink-3, var(--text-secondary));
  font-size: 12px;
  line-height: 1.35;
}

.provider-note button {
  flex-shrink: 0;
  min-height: 28px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--settings-paper-1, var(--bg-primary));
  color: var(--settings-ink-1, var(--text-primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.secondary-button,
.advanced-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 32px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--button-bg, var(--bg-secondary));
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

:deep(.setting-row-stack > .setting-row-control) {
  width: 100%;
}

.secondary-button:hover,
.advanced-toggle:hover {
  background: var(--hover-bg, var(--bg-tertiary));
}

.secondary-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.spin {
  animation: spin 0.8s linear infinite;
}

.advanced-toggle {
  width: 100%;
  margin: 0 0 12px;
  text-align: left;
  justify-content: flex-start;
  background: transparent;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg, var(--bg-primary));
  color: var(--text-primary);
  font-size: 13px;
}

@media (max-width: 720px) {
  .voice-setup-summary,
  .voice-setup-grid {
    grid-template-columns: 1fr;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .provider-note {
    align-items: stretch;
    flex-direction: column;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
