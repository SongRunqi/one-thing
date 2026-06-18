<template>
  <div class="tab-content memory-settings-tab">
    <SettingsSection
      title="Basics"
      description="Choose where memory lives and whether it participates in chat."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable Memory"
          description="Use saved notes, profile facts, and recall during conversations."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.enabled !== false"
              @change="updateMemory({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Directory"
          description="The memory workspace. AI note dir follows the configured note directory; custom uses a dedicated folder."
          layout="stack"
        >
          <div class="memory-directory-control">
            <div class="segmented-control">
              <Button
                unstyled
                :class="['segment-btn', { active: memory.directoryMode === 'ai-note-dir' }]"
                native-type="button"
                @click="updateMemory({ directoryMode: 'ai-note-dir' })"
              >
                AI note dir
              </Button>
              <Button
                unstyled
                :class="['segment-btn', { active: memory.directoryMode === 'custom' }]"
                native-type="button"
                @click="updateMemory({ directoryMode: 'custom' })"
              >
                Custom
              </Button>
            </div>
            <div
              v-if="memory.directoryMode === 'custom'"
              class="directory-field"
            >
              <input
                class="form-input"
                :value="memory.customDirectory"
                placeholder="/path/to/memory"
                spellcheck="false"
                @input="updateMemory({ customDirectory: ($event.target as HTMLInputElement).value })"
              >
              <Button
                unstyled
                class="secondary-btn"
                native-type="button"
                @click="chooseMemoryDirectory"
              >
                Choose
              </Button>
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label="Prompt cap"
          description="Maximum characters from bootstrap memory added to the prompt."
        >
          <InputNumber
            :model-value="memory.bootstrapMaxChars"
            :min="1000"
            :max="50000"
            :step="1000"
            aria-label="memory prompt cap"
            @update:model-value="value => updateMemory({ bootstrapMaxChars: value })"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Recall"
      description="How memory is retrieved and summarized before the model sees it."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable recall"
          description="Inject relevant memory into chats."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.activeMemory.enabled !== false"
              :disabled="memory.enabled === false"
              @change="updateActiveMemory({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Query scope"
          description="How much recent conversation is used to search memory."
        >
          <select
            class="form-select"
            :value="memory.activeMemory.queryMode"
            :disabled="memoryDisabled || memory.activeMemory.enabled === false"
            @change="updateActiveMemory({ queryMode: ($event.target as HTMLSelectElement).value as SoulMemoryActiveSettings['queryMode'] })"
          >
            <option value="recent">
              Recent turns
            </option>
            <option value="message">
              Latest message
            </option>
            <option value="full">
              Full tail
            </option>
          </select>
        </SettingRow>

        <SettingRow
          label="Prompt style"
          description="Tone and selectivity used when summarizing recalled memory."
        >
          <select
            class="form-select"
            :value="memory.activeMemory.promptStyle"
            :disabled="memoryDisabled || memory.activeMemory.enabled === false"
            @change="updateActiveMemory({ promptStyle: ($event.target as HTMLSelectElement).value as SoulMemoryActiveSettings['promptStyle'] })"
          >
            <option value="balanced">
              Balanced
            </option>
            <option value="strict">
              Strict
            </option>
            <option value="contextual">
              Contextual
            </option>
            <option value="recall-heavy">
              Recall-heavy
            </option>
            <option value="precision-heavy">
              Precision-heavy
            </option>
            <option value="preference-only">
              Preference-only
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Timeout"
            description="Maximum recall time."
          >
            <InputNumber
              :model-value="memory.activeMemory.timeoutMs"
              :min="1000"
              :max="60000"
              :step="1000"
              suffix="ms"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recall timeout"
              @update:model-value="value => updateActiveMemory({ timeoutMs: value })"
            />
          </SettingRow>
          <SettingRow
            label="Cache TTL"
            description="Reuse recent recall results."
          >
            <InputNumber
              :model-value="memory.activeMemory.cacheTtlMs"
              :min="0"
              :max="120000"
              :step="1000"
              suffix="ms"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recall cache ttl"
              @update:model-value="value => updateActiveMemory({ cacheTtlMs: value })"
            />
          </SettingRow>
        </div>

        <div class="settings-grid-row">
          <SettingRow
            label="Summary chars"
            description="Maximum recalled summary length."
          >
            <InputNumber
              :model-value="memory.activeMemory.maxSummaryChars"
              :min="100"
              :max="5000"
              :step="50"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recall summary chars"
              @update:model-value="value => updateActiveMemory({ maxSummaryChars: value })"
            />
          </SettingRow>
          <SettingRow
            label="Recent turns"
            description="User and assistant turns sampled for recall."
          >
            <div class="dual-stepper">
              <InputNumber
                :model-value="memory.activeMemory.recentUserTurns"
                :min="1"
                :max="8"
                size="small"
                :disabled="memoryDisabled || memory.activeMemory.enabled === false"
                aria-label="recent user turns"
                @update:model-value="value => updateActiveMemory({ recentUserTurns: value })"
              />
              <InputNumber
                :model-value="memory.activeMemory.recentAssistantTurns"
                :min="0"
                :max="6"
                size="small"
                :disabled="memoryDisabled || memory.activeMemory.enabled === false"
                aria-label="recent assistant turns"
                @update:model-value="value => updateActiveMemory({ recentAssistantTurns: value })"
              />
            </div>
          </SettingRow>
        </div>

        <div class="settings-grid-row">
          <SettingRow
            label="User chars"
            description="Characters per user turn."
          >
            <InputNumber
              :model-value="memory.activeMemory.recentUserChars"
              :min="120"
              :max="6000"
              :step="20"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recent user chars"
              @update:model-value="value => updateActiveMemory({ recentUserChars: value })"
            />
          </SettingRow>
          <SettingRow
            label="Assistant chars"
            description="Characters per assistant turn."
          >
            <InputNumber
              :model-value="memory.activeMemory.recentAssistantChars"
              :min="120"
              :max="6000"
              :step="20"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recent assistant chars"
              @update:model-value="value => updateActiveMemory({ recentAssistantChars: value })"
            />
          </SettingRow>
        </div>

        <div class="settings-grid-row">
          <SettingRow
            label="Timeout breaker"
            description="Timeouts before recall cools down."
          >
            <InputNumber
              :model-value="memory.activeMemory.circuitBreakerMaxTimeouts"
              :min="1"
              :max="10"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recall timeout breaker"
              @update:model-value="value => updateActiveMemory({ circuitBreakerMaxTimeouts: value })"
            />
          </SettingRow>
          <SettingRow
            label="Cooldown"
            description="Cooldown after repeated timeouts."
          >
            <InputNumber
              :model-value="memory.activeMemory.circuitBreakerCooldownMs"
              :min="1000"
              :max="300000"
              :step="1000"
              suffix="ms"
              :disabled="memoryDisabled || memory.activeMemory.enabled === false"
              aria-label="recall cooldown"
              @update:model-value="value => updateActiveMemory({ circuitBreakerCooldownMs: value })"
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Capture"
      description="Extract daily-note bullets after assistant replies."
    >
      <SettingsGroup>
        <SettingRow
          label="Mode"
          description="Auto captures daily notes after replies. Explicit only waits for clear remember intent."
        >
          <select
            class="form-select"
            :value="captureMode"
            :disabled="memoryDisabled"
            @change="updateCaptureMode(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">
              Auto
            </option>
            <option value="explicit-only">
              Explicit only
            </option>
            <option value="off">
              Off
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Input chars"
            description="Maximum conversation text sent to capture."
          >
            <InputNumber
              :model-value="memory.capture.maxInputChars"
              :min="1000"
              :max="50000"
              :step="1000"
              :disabled="memoryDisabled || memory.capture.enabled === false"
              aria-label="capture input chars"
              @update:model-value="value => updateCapture({ maxInputChars: value })"
            />
          </SettingRow>
          <SettingRow
            label="Timeout"
            description="Maximum capture time."
          >
            <InputNumber
              :model-value="memory.capture.timeoutMs"
              :min="1000"
              :max="60000"
              :step="1000"
              suffix="ms"
              :disabled="memoryDisabled || memory.capture.enabled === false"
              aria-label="capture timeout"
              @update:model-value="value => updateCapture({ timeoutMs: value })"
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Profile"
      description="Structured facts, entities, connections, and dedupe rules."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable Profile"
          description="Store durable facts in the editable Profile database."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.canonicalMemory.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateCanonical({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="High-confidence threshold"
            description="Default confidence for trusted Profile writes."
          >
            <InputNumber
              :model-value="memory.canonicalMemory.highConfidenceThreshold"
              :min="0"
              :max="1"
              :step="0.01"
              :disabled="memoryDisabled || memory.canonicalMemory.enabled === false"
              aria-label="profile confidence threshold"
              @update:model-value="value => updateCanonical({ highConfidenceThreshold: value })"
            />
          </SettingRow>
          <SettingRow
            label="Dedupe threshold"
            description="Similarity required to mark Profile duplicates."
          >
            <InputNumber
              :model-value="memory.canonicalMemory.semanticDedupeThreshold"
              :min="0.5"
              :max="1"
              :step="0.01"
              :disabled="memoryDisabled || memory.canonicalMemory.enabled === false"
              aria-label="profile dedupe threshold"
              @update:model-value="value => updateCanonical({ semanticDedupeThreshold: value })"
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Search Index"
      description="Keyword/vector index settings for memory search and recall."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable index"
          description="Search memory files and Profile facts."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.search.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateSearch({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Results"
            description="Default search result count."
          >
            <InputNumber
              :model-value="memory.search.maxResults"
              :min="1"
              :max="20"
              :disabled="memoryDisabled || memory.search.enabled === false"
              aria-label="memory search results"
              @update:model-value="value => updateSearch({ maxResults: value })"
            />
          </SettingRow>
          <SettingRow
            label="Chunk tokens"
            description="Approximate token size per indexed chunk."
          >
            <InputNumber
              :model-value="memory.search.chunkTokens"
              :min="100"
              :max="2000"
              :step="50"
              :disabled="memoryDisabled || memory.search.enabled === false"
              aria-label="memory search chunk tokens"
              @update:model-value="value => updateSearch({ chunkTokens: value })"
            />
          </SettingRow>
        </div>

        <div class="settings-grid-row">
          <SettingRow
            label="Chunk overlap"
            description="Shared tokens between adjacent chunks."
          >
            <InputNumber
              :model-value="memory.search.chunkOverlap"
              :min="0"
              :max="1000"
              :step="10"
              :disabled="memoryDisabled || memory.search.enabled === false"
              aria-label="memory search chunk overlap"
              @update:model-value="value => updateSearch({ chunkOverlap: value })"
            />
          </SettingRow>
          <SettingRow
            label="Half-life"
            description="Temporal ranking decay in days."
          >
            <InputNumber
              :model-value="memory.search.temporalDecayHalfLifeDays"
              :min="1"
              :max="365"
              suffix="d"
              :disabled="memoryDisabled || memory.search.enabled === false"
              aria-label="memory search half life"
              @update:model-value="value => updateSearch({ temporalDecayHalfLifeDays: value })"
            />
          </SettingRow>
        </div>

        <SettingRow
          label="MMR dedupe"
          description="Prefer diverse search results instead of near-duplicates."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.search.mmrEnabled !== false"
              :disabled="memoryDisabled || memory.search.enabled === false"
              @change="updateSearch({ mmrEnabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Embeddings"
      description="Optional vector search provider. Auto uses configured provider credentials when available."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable embeddings"
          :description="embeddingDescription"
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.embeddings.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateEmbeddings({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Provider"
          description="Auto chooses the first configured compatible provider."
        >
          <select
            class="form-select"
            :value="memory.embeddings.providerId"
            :disabled="memoryDisabled || memory.embeddings.enabled === false"
            @change="updateEmbeddings({ providerId: ($event.target as HTMLSelectElement).value })"
          >
            <option value="auto">
              Auto
            </option>
            <option value="openai">
              OpenAI
            </option>
            <option value="gemini">
              Gemini
            </option>
            <option value="openrouter">
              OpenRouter
            </option>
            <option value="custom">
              Custom
            </option>
            <option value="ollama">
              Ollama
            </option>
          </select>
        </SettingRow>

        <div
          class="embedding-summary"
          :class="{ warning: !embeddingTarget.available }"
        >
          <span>Provider</span>
          <strong>{{ embeddingTarget.providerLabel }}</strong>
          <span>Model</span>
          <code>{{ embeddingTarget.model }}</code>
          <span>Endpoint</span>
          <code>{{ embeddingTarget.baseUrl || 'Custom endpoint required' }}</code>
          <span>Key</span>
          <strong>{{ embeddingTarget.apiKeyHint }}</strong>
        </div>

        <template v-if="memory.embeddings.providerId !== 'auto'">
          <div class="settings-grid-row">
            <SettingRow
              label="Model"
              description="Leave blank for provider default."
            >
              <input
                class="form-input"
                :value="memory.embeddings.model"
                :placeholder="embeddingTarget.model"
                spellcheck="false"
                :disabled="memoryDisabled || memory.embeddings.enabled === false"
                @input="updateEmbeddings({ model: ($event.target as HTMLInputElement).value })"
              >
            </SettingRow>
            <SettingRow
              label="API key"
              description="Overrides provider key for embeddings."
            >
              <input
                class="form-input"
                type="password"
                :value="memory.embeddings.apiKey"
                placeholder="Provider key"
                autocomplete="off"
                spellcheck="false"
                :disabled="memoryDisabled || memory.embeddings.enabled === false"
                @input="updateEmbeddings({ apiKey: ($event.target as HTMLInputElement).value })"
              >
            </SettingRow>
          </div>

          <div class="settings-grid-row">
            <SettingRow
              label="Dimensions"
              description="Use 0 for provider default."
            >
              <InputNumber
                :model-value="memory.embeddings.dimensions"
                :min="0"
                :max="8192"
                :step="1"
                :disabled="memoryDisabled || memory.embeddings.enabled === false"
                aria-label="embedding dimensions"
                @update:model-value="value => updateEmbeddings({ dimensions: value })"
              />
            </SettingRow>
            <SettingRow
              label="Base URL"
              description="Optional OpenAI-compatible endpoint."
            >
              <input
                class="form-input"
                :value="memory.embeddings.baseUrl"
                :placeholder="embeddingTarget.baseUrl || 'OpenAI-compatible /v1 endpoint'"
                spellcheck="false"
                :disabled="memoryDisabled || memory.embeddings.enabled === false"
                @input="updateEmbeddings({ baseUrl: ($event.target as HTMLInputElement).value })"
              >
            </SettingRow>
          </div>

          <SettingRow
            v-if="memory.embeddings.providerId === 'custom'"
            label="Custom provider"
            description="Only OpenAI-compatible custom providers are shown."
          >
            <select
              class="form-select"
              :value="memory.embeddings.customProviderId"
              :disabled="memoryDisabled || memory.embeddings.enabled === false"
              @change="updateEmbeddings({ customProviderId: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">
                First compatible provider
              </option>
              <option
                v-for="provider in openAICompatibleCustomProviders"
                :key="provider.id"
                :value="provider.id"
              >
                {{ provider.name || provider.id }}
              </option>
            </select>
          </SettingRow>
        </template>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Daily Notes Context"
      description="Recent daily notes can be added to new or ongoing chats."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable daily context"
          description="Read recent daily notes into memory context."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.dailyContext.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateDailyContext({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Mode"
          description="Add daily context only when a chat starts, or on every turn."
        >
          <select
            class="form-select"
            :value="memory.dailyContext.mode"
            :disabled="memoryDisabled || memory.dailyContext.enabled === false"
            @change="updateDailyContext({ mode: ($event.target as HTMLSelectElement).value as SoulMemoryDailyContextSettings['mode'] })"
          >
            <option value="session-start">
              New chats
            </option>
            <option value="always">
              Every turn
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Days back"
            description="How many previous days to include."
          >
            <InputNumber
              :model-value="memory.dailyContext.daysBack"
              :min="0"
              :max="14"
              :disabled="memoryDisabled || memory.dailyContext.enabled === false"
              aria-label="daily context days back"
              @update:model-value="value => updateDailyContext({ daysBack: value })"
            />
          </SettingRow>
          <SettingRow
            label="Max chars"
            description="Maximum daily context characters."
          >
            <InputNumber
              :model-value="memory.dailyContext.maxChars"
              :min="1000"
              :max="50000"
              :step="1000"
              :disabled="memoryDisabled || memory.dailyContext.enabled === false"
              aria-label="daily context max chars"
              @update:model-value="value => updateDailyContext({ maxChars: value })"
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Compact Flush"
      description="When chat history is compacted, summarize older context into memory first."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable compact flush"
          description="Write compacted memory before old chat turns are summarized away."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.memoryFlush.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateFlush({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>
        <SettingRow
          label="Input chars"
          description="Maximum compacted text sent to the memory writer."
        >
          <InputNumber
            :model-value="memory.memoryFlush.maxInputChars"
            :min="2000"
            :max="120000"
            :step="1000"
            :disabled="memoryDisabled || memory.memoryFlush.enabled === false"
            aria-label="compact flush input chars"
            @update:model-value="value => updateFlush({ maxInputChars: value })"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Diagnostics"
      description="Controls retained diagnostics; the Memory panel now shows health instead of raw logs."
    >
      <SettingsGroup>
        <SettingRow
          label="Enable diagnostics"
          description="Record memory operation diagnostics on disk."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.logging.enabled !== false"
              :disabled="memoryDisabled"
              @change="updateLogging({ enabled: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>

        <SettingRow
          label="Level"
          description="Minimum diagnostic detail recorded."
        >
          <select
            class="form-select"
            :value="memory.logging.level"
            :disabled="memoryDisabled || memory.logging.enabled === false"
            @change="updateLogging({ level: ($event.target as HTMLSelectElement).value as SoulMemoryLoggingSettings['level'] })"
          >
            <option value="debug">
              Debug
            </option>
            <option value="info">
              Info
            </option>
            <option value="warn">
              Warn
            </option>
            <option value="error">
              Error
            </option>
          </select>
        </SettingRow>

        <div class="settings-grid-row">
          <SettingRow
            label="Retention"
            description="Days of diagnostic files to keep."
          >
            <InputNumber
              :model-value="memory.logging.retentionDays"
              :min="1"
              :max="90"
              suffix="d"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              aria-label="memory log retention"
              @update:model-value="value => updateLogging({ retentionDays: value })"
            />
          </SettingRow>
          <SettingRow
            label="Preview chars"
            description="Maximum request/response preview size."
          >
            <InputNumber
              :model-value="memory.logging.maxPreviewChars"
              :min="120"
              :max="4000"
              :step="20"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              aria-label="memory log preview chars"
              @update:model-value="value => updateLogging({ maxPreviewChars: value })"
            />
          </SettingRow>
        </div>

        <SettingRow
          label="Include HTTP error body"
          description="Store provider error body previews when memory calls fail."
        >
          <label class="native-toggle">
            <input
              type="checkbox"
              :checked="memory.logging.includeHttpErrorBody !== false"
              :disabled="memoryDisabled || memory.logging.enabled === false"
              @change="updateLogging({ includeHttpErrorBody: ($event.target as HTMLInputElement).checked })"
            >
          </label>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection
      title="Scheduled Memory"
      description="Memory Dreaming is configured from Tasks so scheduling and run history live together."
    >
      <SettingsGroup>
        <SettingRow
          label="Dreaming task"
          :description="`Current schedule: ${memory.dreaming.enabled ? memory.dreaming.frequency : 'disabled'}`"
        >
          <span class="readonly-pill">Configure in Tasks</span>
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed } from 'vue'
import type { AppSettings } from '@/types'
import type {
  SoulMemoryActiveSettings,
  SoulMemoryCanonicalSettings,
  SoulMemoryCaptureSettings,
  SoulMemoryDailyContextSettings,
  SoulMemoryDreamingSettings,
  SoulMemoryEmbeddingSettings,
  SoulMemoryFlushSettings,
  SoulMemoryLoggingSettings,
  SoulMemoryReadSettings,
  SoulMemorySearchSettings,
  SoulMemorySettings,
} from '@shared/ipc/settings'
import { normalizeSoulMemorySettings } from '@shared/defaults/settings'
import { resolveSoulMemoryEmbeddingTarget } from '@shared/embeddings/defaults'
import InputNumber from '@/components/common/InputNumber.vue'
import {
  SettingRow,
  SettingsGroup,
  SettingsSection,
} from './settings-primitives'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

type NormalizedSoulMemorySettings = Omit<
  Required<SoulMemorySettings>,
  | 'activeMemory'
  | 'search'
  | 'embeddings'
  | 'memoryFlush'
  | 'capture'
  | 'canonicalMemory'
  | 'dreaming'
  | 'dailyContext'
  | 'read'
  | 'logging'
> & {
  activeMemory: Required<SoulMemoryActiveSettings>
  search: Required<SoulMemorySearchSettings>
  embeddings: Required<SoulMemoryEmbeddingSettings>
  memoryFlush: Required<SoulMemoryFlushSettings>
  capture: Required<SoulMemoryCaptureSettings>
  canonicalMemory: Required<SoulMemoryCanonicalSettings>
  dreaming: Required<SoulMemoryDreamingSettings>
  dailyContext: Required<SoulMemoryDailyContextSettings>
  read: Required<SoulMemoryReadSettings>
  logging: Required<SoulMemoryLoggingSettings>
}

const memory = computed<NormalizedSoulMemorySettings>(() =>
  normalizeSoulMemorySettings(props.settings.general.soulMemory) as NormalizedSoulMemorySettings,
)
const memoryDisabled = computed(() => memory.value.enabled === false)
const captureMode = computed(() =>
  memory.value.capture.enabled === false ? 'off' : memory.value.capture.mode,
)
const openAICompatibleCustomProviders = computed(() =>
  (props.settings.ai.customProviders || []).filter(provider => provider.apiType === 'openai'),
)
const embeddingTarget = computed(() =>
  resolveSoulMemoryEmbeddingTarget({
    providerId: memory.value.embeddings.providerId,
    customProviderId: memory.value.embeddings.customProviderId,
    apiKey: memory.value.embeddings.apiKey,
    model: memory.value.embeddings.model,
    baseUrl: memory.value.embeddings.baseUrl,
    providers: props.settings.ai.providers,
    customProviders: props.settings.ai.customProviders,
  }),
)
const embeddingDescription = computed(() =>
  embeddingTarget.value.available
    ? `${embeddingTarget.value.providerLabel} / ${embeddingTarget.value.model}`
    : embeddingTarget.value.reason || 'Embedding provider needs credentials or an endpoint.',
)

function updateMemory(patch: Partial<SoulMemorySettings>): void {
  const nextMemory = normalizeSoulMemorySettings({
    ...memory.value,
    ...patch,
  })
  emit('update:settings', {
    ...props.settings,
    general: {
      ...props.settings.general,
      soulMemory: nextMemory,
    },
  })
}

function updateActiveMemory(patch: Partial<SoulMemoryActiveSettings>): void {
  updateMemory({ activeMemory: { ...memory.value.activeMemory, ...patch } })
}

function updateCapture(patch: Partial<SoulMemoryCaptureSettings>): void {
  updateMemory({ capture: { ...memory.value.capture, ...patch } })
}

function updateCaptureMode(mode: string): void {
  if (mode === 'off') {
    updateCapture({ enabled: false, mode: 'off' })
    return
  }
  updateCapture({
    enabled: true,
    mode: mode as SoulMemoryCaptureSettings['mode'],
  })
}

function updateCanonical(patch: Partial<SoulMemoryCanonicalSettings>): void {
  updateMemory({ canonicalMemory: { ...memory.value.canonicalMemory, ...patch } })
}

function updateSearch(patch: Partial<SoulMemorySearchSettings>): void {
  updateMemory({ search: { ...memory.value.search, ...patch } })
}

function updateEmbeddings(patch: Partial<SoulMemoryEmbeddingSettings>): void {
  updateMemory({ embeddings: { ...memory.value.embeddings, ...patch } })
}

function updateDailyContext(patch: Partial<SoulMemoryDailyContextSettings>): void {
  updateMemory({ dailyContext: { ...memory.value.dailyContext, ...patch } })
}

function updateFlush(patch: Partial<SoulMemoryFlushSettings>): void {
  updateMemory({ memoryFlush: { ...memory.value.memoryFlush, ...patch } })
}

function updateLogging(patch: Partial<SoulMemoryLoggingSettings>): void {
  updateMemory({ logging: { ...memory.value.logging, ...patch } })
}

async function chooseMemoryDirectory(): Promise<void> {
  const result = await window.electronAPI.showOpenDialog({
    title: 'Choose Memory Directory',
    properties: ['openDirectory'],
    defaultPath: memory.value.customDirectory || undefined,
  })
  if (!result.canceled && result.filePaths[0]) {
    updateMemory({
      directoryMode: 'custom',
      customDirectory: result.filePaths[0],
    })
  }
}
</script>

<style scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.memory-settings-tab {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.memory-directory-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.memory-directory-control .segmented-control {
  width: fit-content;
  max-width: 100%;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
}

.memory-directory-control .segment-btn {
  min-width: 0;
  padding-inline: 12px;
  white-space: nowrap;
}

.directory-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
}

.settings-grid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

.settings-grid-row :deep(.setting-row) {
  border-bottom: 0;
}

.settings-grid-row :deep(.setting-row:first-child) {
  border-right: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
}

.dual-stepper {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.dual-stepper :deep(.app-input-number) {
  --app-input-number-height: 22px;
  --app-input-number-control-width: 20px;
  --app-input-number-padding-x: 3px;
  --app-input-number-font-size: 11px;

  min-width: 84px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.embedding-summary {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 7px 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
}

.embedding-summary.warning {
  background: var(--ui-status-warning-bg, transparent);
}

.embedding-summary strong,
.embedding-summary code {
  min-width: 0;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  overflow-wrap: anywhere;
}

.embedding-summary code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.readonly-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  border-radius: 6px;
  background: var(--settings-paper-2, var(--ui-surface-app-bg, var(--bg)));
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--text-muted)));
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .settings-grid-row {
    grid-template-columns: 1fr;
  }

  .settings-grid-row :deep(.setting-row:first-child) {
    border-right: 0;
    border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-default-border, var(--border)));
  }

  .directory-field {
    grid-template-columns: 1fr;
  }
}
</style>
