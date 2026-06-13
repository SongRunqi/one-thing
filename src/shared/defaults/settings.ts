/**
 * Unified Default Settings
 * Single source of truth for all default settings across main and renderer processes
 */

import { AIProvider } from '../ipc/providers.js'
import { DEFAULT_AGENT_ID } from '../ipc/agents.js'
import type {
  AppSettings,
  GeneralSettings,
  ChatSettings,
  EditorSettings,
  NetworkSettings,
  SoulMemoryActiveSettings,
  SoulMemoryDailyContextSettings,
  SoulMemoryDreamingSettings,
  SoulMemoryEmbeddingSettings,
  SoulMemoryFlushSettings,
  SoulMemoryCaptureSettings,
  SoulMemoryCanonicalSettings,
  SoulMemoryLoggingSettings,
  SoulMemoryReadSettings,
  SoulMemoryReviewSettings,
  SoulMemorySearchSettings,
  SoulMemorySettings,
} from '../ipc/settings.js'
import type { VoiceSettings } from '../ipc/voice.js'
import type { ProviderConfig, AISettings } from '../ipc/providers.js'
import type { ToolSettings } from '../ipc/tools.js'

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_CONTEXT_LENGTH = 128000

export const DEFAULT_EDITOR_SETTINGS: Required<EditorSettings> = {
  tabSize: 2,
  lineWrapping: true,
  softWrapColumn: 88,
  syntaxHighlighting: true,
  completionEnabled: true,
  composerMaxHeight: 200,
  markdownNoteAttachmentDirectory: '',
  markdownProjectAttachmentDirectory: '',
}

export const DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS: Required<SoulMemoryActiveSettings> = {
  enabled: true,
  queryMode: 'recent',
  promptStyle: 'balanced',
  timeoutMs: 15000,
  cacheTtlMs: 15000,
  maxSummaryChars: 220,
  recentUserTurns: 2,
  recentAssistantTurns: 1,
  recentUserChars: 220,
  recentAssistantChars: 180,
  circuitBreakerMaxTimeouts: 3,
  circuitBreakerCooldownMs: 60000,
}

export const DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS: Required<SoulMemorySearchSettings> = {
  enabled: true,
  chunkTokens: 400,
  chunkOverlap: 80,
  maxResults: 8,
  mmrEnabled: true,
  temporalDecayHalfLifeDays: 30,
}

export const DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS: Required<SoulMemoryEmbeddingSettings> = {
  enabled: true,
  providerId: 'auto',
  customProviderId: '',
  apiKey: '',
  model: '',
  baseUrl: '',
  dimensions: 0,
}

export const DEFAULT_SOUL_MEMORY_FLUSH_SETTINGS: Required<SoulMemoryFlushSettings> = {
  enabled: true,
  maxInputChars: 32000,
}

export const DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS: Required<SoulMemoryCaptureSettings> = {
  enabled: true,
  mode: 'auto',
  policy: 'high-confidence',
  targetPolicy: 'canonical-first',
  writePolicy: 'high-confidence-auto',
  target: 'memory',
  maxInputChars: 6000,
  timeoutMs: 12000,
  maxCandidates: 5,
  minConfidence: 0.55,
  longTermMinConfidence: 0.75,
  dailyMinConfidence: 0.55,
}

export const DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS: Required<SoulMemoryReviewSettings> = {
  enabled: true,
  interval: 10,
  maxInputChars: 16000,
  timeoutMs: 20000,
  maxCandidates: 6,
  minConfidence: 0.72,
}

export const DEFAULT_SOUL_MEMORY_CANONICAL_SETTINGS: Required<SoulMemoryCanonicalSettings> = {
  enabled: true,
  store: 'sqlite',
  highConfidenceThreshold: 0.75,
  semanticDedupeThreshold: 0.88,
}

export const DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS: Required<SoulMemoryDreamingSettings> = {
  enabled: false,
  frequency: '0 3 * * *',
  timezone: '',
  model: '',
  sources: ['daily', 'sessions', 'short-term'],
  lookbackDays: 30,
  maxSourceFiles: 12,
  maxSessions: 12,
  maxMessagesPerSession: 24,
  maxInputChars: 48000,
  maxPromotions: 10,
  minScore: 0.78,
  minRecallCount: 1,
  minUniqueSources: 1,
  timeoutMs: 60000,
}

export const DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS: Required<SoulMemoryDailyContextSettings> = {
  enabled: true,
  mode: 'session-start',
  daysBack: 1,
  maxChars: 12000,
}

export const DEFAULT_SOUL_MEMORY_READ_SETTINGS: Required<SoulMemoryReadSettings> = {
  defaultLines: 200,
  maxLines: 1000,
}

export const DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS: Required<SoulMemoryLoggingSettings> = {
  enabled: true,
  retentionDays: 7,
  level: 'info',
  maxPreviewChars: 600,
  includeHttpErrorBody: true,
}

export const DEFAULT_SOUL_MEMORY_SETTINGS: Required<SoulMemorySettings> = {
  enabled: true,
  directoryMode: 'ai-note-dir',
  customDirectory: '',
  bootstrapMaxChars: 12000,
  activeMemory: DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS,
  search: DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS,
  embeddings: DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS,
  memoryFlush: DEFAULT_SOUL_MEMORY_FLUSH_SETTINGS,
  capture: DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS,
  review: DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS,
  canonicalMemory: DEFAULT_SOUL_MEMORY_CANONICAL_SETTINGS,
  dreaming: DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS,
  dailyContext: DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS,
  read: DEFAULT_SOUL_MEMORY_READ_SETTINGS,
  logging: DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS,
}

// ============================================================================
// Provider Configurations
// ============================================================================

export const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  [AIProvider.OpenAI]: {
    apiKey: '',
    model: 'gpt-4o',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Claude]: {
    apiKey: '',
    model: 'claude-sonnet-4-5-20250929',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.DeepSeek]: {
    apiKey: '',
    model: 'deepseek-chat',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Kimi]: {
    apiKey: '',
    model: 'moonshot-v1-8k',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Zhipu]: {
    apiKey: '',
    model: 'glm-4-flash',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.OpenRouter]: {
    apiKey: '',
    model: 'openai/gpt-4o',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.Gemini]: {
    apiKey: '',
    model: 'gemini-2.0-flash-exp',
    selectedModels: [],
    enabled: false,
  },
  [AIProvider.ClaudeCode]: {
    model: 'claude-sonnet-4-20250514',
    selectedModels: [],
    authType: 'oauth',
    enabled: false,
  },
  [AIProvider.GitHubCopilot]: {
    model: 'gpt-4o',
    selectedModels: [],
    authType: 'oauth',
    enabled: false,
  },
  [AIProvider.Codex]: {
    model: 'gpt-5.3-codex',
    selectedModels: [],
    authType: 'oauth',
    enabled: false,
  },
  [AIProvider.Custom]: {
    apiKey: '',
    baseUrl: '',
    model: '',
    selectedModels: [],
    enabled: false,
  },
}

// ============================================================================
// AI Settings
// ============================================================================

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: AIProvider.OpenAI,
  temperature: DEFAULT_TEMPERATURE,
  providers: DEFAULT_PROVIDER_CONFIGS as AISettings['providers'],
  customProviders: [],
}

// ============================================================================
// General Settings
// ============================================================================

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  animationSpeed: 0.25,
  sendShortcut: 'enter',
  colorTheme: 'blue',
  baseTheme: 'obsidian',
  themeId: 'flexoki',
  darkThemeId: 'flexoki',
  lightThemeId: 'flexoki',
  typographyDensity: 'compact',
  messageListDensity: 'comfortable',
  shortcuts: {
    sendMessage: { key: 'Enter' },
    newChat: { key: 'n', metaKey: true },
    closeChat: { key: 'w', metaKey: true },
    toggleSidebar: { key: 'b', metaKey: true },
    focusInput: { key: '/' },
    searchEverywhere: { key: 'k', metaKey: true },
    toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
    toggleTodoPlan: { key: 't', metaKey: true, altKey: true },
  },
  quickCommands: [
    { commandId: 'cd', enabled: true },
    { commandId: 'git', enabled: true },
    { commandId: 'files', enabled: true },
  ],
  dailyNotes: {
    enabled: true,
    directoryMode: 'personal',
    customDirectory: '',
    useObsidianConfig: true,
    format: 'YYYY-MM-DD',
  },
  soulMemory: DEFAULT_SOUL_MEMORY_SETTINGS,
  todoPlan: {
    enabled: true,
    directory: '',
    cardHeight: 360,
    pinned: false,
    docked: false,
    autonomy: 'active',
  },
  editor: DEFAULT_EDITOR_SETTINGS,
}

// ============================================================================
// Chat Settings
// ============================================================================

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  branchOpenInSplitScreen: true,
  chatFontSize: 15,
  contextCompactEnabled: true,
  contextCompactThreshold: 85,
  contextCompactKeepRecentTurns: 6,
}

// ============================================================================
// Tool Settings
// ============================================================================

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  enableToolCalls: true,
  permissionMode: 'normal',
  toolCallModel: {
    providerId: '',
    model: '',
    thinking: false,
    thinkingEffort: 'medium',
  },
  // Per-tool settings are user overrides keyed by the dynamic tool registry.
  // Tool defaults come from each ToolDefinition, so new tools do not require
  // editing this settings file.
  tools: {},
  bash: {
    enableSandbox: true,
    defaultWorkingDirectory: '',
    allowedDirectories: [],
    confirmDangerousCommands: true,
    dangerousCommandWhitelist: [],
  },
}

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  proxy: {
    enabled: false,
    url: '',
    bypassRules: 'localhost;127.0.0.1;::1;*.local',
  },
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  alwaysOn: false,
  bargeIn: true,
  conversation: {
    defaultAgentId: DEFAULT_AGENT_ID,
    endpointing: 'fast',
    speakProtocol: 'speak-blocks',
  },
  wake: {
    enabled: false,
    phrase: 'hey onething',
    provider: 'porcupine-web',
    accessKey: '',
    keywordPath: '',
    modelPath: '',
  },
  vad: {
    provider: 'silero-web',
    silenceMs: 650,
    maxRecordingMs: 20000,
    energyThreshold: 0.012,
  },
  asr: {
    provider: 'funasr-stream',
    openai: {
      apiKey: '',
      model: 'gpt-4o-transcribe',
      language: '',
    },
    openrouter: {
      apiKey: '',
      model: 'openai/whisper-1',
      language: '',
    },
    funasr: {
      url: '',
      language: 'auto',
      hotwords: '',
      mode: '2pass',
      chunkSize: [5, 10, 5],
      chunkInterval: 10,
    },
  },
  tts: {
    provider: 'system-tts',
    autoSpeak: true,
    system: {
      voice: '',
      language: '',
      rate: 1,
      pitch: 1,
    },
    openrouter: {
      apiKey: '',
      model: 'openai/gpt-4o-mini-tts-2025-12-15',
      voice: 'alloy',
    },
    openai: {
      apiKey: '',
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
    },
    qwen: {
      apiKey: '',
      baseUrl: '',
      model: 'cosyvoice-v1',
      voice: 'longxiaochun',
    },
  },
}

// ============================================================================
// Complete Default Settings Factory
// ============================================================================

/**
 * Create a fresh copy of default settings
 * Use this function to ensure you get a clean copy without reference issues
 */
export function createDefaultSettings(): AppSettings {
  return {
    ai: JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS)),
    theme: 'dark',
    general: JSON.parse(JSON.stringify(DEFAULT_GENERAL_SETTINGS)),
    chat: JSON.parse(JSON.stringify(DEFAULT_CHAT_SETTINGS)),
    tools: JSON.parse(JSON.stringify(DEFAULT_TOOL_SETTINGS)),
    voice: JSON.parse(JSON.stringify(DEFAULT_VOICE_SETTINGS)),
    network: JSON.parse(JSON.stringify(DEFAULT_NETWORK_SETTINGS)),
  }
}

/**
 * Deep merge settings with defaults
 * Ensures all required fields exist while preserving user values
 */
export function mergeWithDefaults(settings: Partial<AppSettings>): AppSettings {
  const defaults = createDefaultSettings()

  // Use type assertion because we know defaults provides all required fields
  // and spread operations preserve those values
  const merged = {
    ai: {
      ...defaults.ai,
      ...settings.ai,
      providers: {
        ...defaults.ai.providers,
        ...settings.ai?.providers,
      },
    },
    theme: settings.theme ?? defaults.theme,
    general: {
      ...defaults.general,
      ...settings.general,
      shortcuts: {
        ...defaults.general.shortcuts,
        ...settings.general?.shortcuts,
      },
      typographyDensity: normalizeTypographyDensity(settings.general?.typographyDensity),
      quickCommands: settings.general?.quickCommands ?? defaults.general.quickCommands,
      dailyNotes: {
        ...defaults.general.dailyNotes,
        ...settings.general?.dailyNotes,
      },
      soulMemory: normalizeSoulMemorySettings(settings.general?.soulMemory),
      todoPlan: {
        ...defaults.general.todoPlan,
        ...settings.general?.todoPlan,
      },
      editor: normalizeEditorSettings(settings.general?.editor),
    },
    chat: {
      ...defaults.chat,
      ...settings.chat,
      contextCompactEnabled: settings.chat?.contextCompactEnabled ?? DEFAULT_CHAT_SETTINGS.contextCompactEnabled,
      contextCompactThreshold: clampNumber(
        settings.chat?.contextCompactThreshold,
        50,
        100,
        DEFAULT_CHAT_SETTINGS.contextCompactThreshold ?? 85,
      ),
      contextCompactKeepRecentTurns: clampNumber(
        settings.chat?.contextCompactKeepRecentTurns,
        1,
        20,
        DEFAULT_CHAT_SETTINGS.contextCompactKeepRecentTurns ?? 6,
      ),
    },
    tools: {
      ...defaults.tools,
      ...settings.tools,
      toolCallModel: {
        ...defaults.tools.toolCallModel,
        ...settings.tools?.toolCallModel,
      },
      bash: {
        ...defaults.tools.bash,
        ...settings.tools?.bash,
      },
    },
    network: {
      ...defaults.network!,
      ...settings.network,
      proxy: {
        ...defaults.network!.proxy,
        ...settings.network?.proxy,
      },
    },
    voice: normalizeVoiceSettings(settings.voice),
    mcp: settings.mcp,
    skills: settings.skills,
  }

  stripLegacyProviderLocalAddress(merged.ai.providers)
  if (Array.isArray(merged.ai.customProviders)) {
    for (const provider of merged.ai.customProviders) {
      delete (provider as any).localAddress
    }
  }

  return merged as AppSettings
}

export function normalizeVoiceSettings(settings?: VoiceSettings): VoiceSettings {
  return {
    ...DEFAULT_VOICE_SETTINGS,
    ...settings,
    wake: {
      ...DEFAULT_VOICE_SETTINGS.wake,
      ...settings?.wake,
      phrase: (settings?.wake?.phrase || DEFAULT_VOICE_SETTINGS.wake.phrase).trim(),
    },
    conversation: {
      ...DEFAULT_VOICE_SETTINGS.conversation,
      ...settings?.conversation,
      defaultAgentId: (settings?.conversation?.defaultAgentId || DEFAULT_VOICE_SETTINGS.conversation.defaultAgentId).trim(),
      endpointing: ['fast', 'balanced', 'patient', 'custom'].includes(settings?.conversation?.endpointing as string)
        ? settings!.conversation!.endpointing
        : DEFAULT_VOICE_SETTINGS.conversation.endpointing,
      speakProtocol: 'speak-blocks',
    },
    vad: {
      ...DEFAULT_VOICE_SETTINGS.vad,
      ...settings?.vad,
      silenceMs: clampNumber(settings?.vad?.silenceMs, 300, 10000, DEFAULT_VOICE_SETTINGS.vad.silenceMs),
      maxRecordingMs: clampNumber(settings?.vad?.maxRecordingMs, 3000, 120000, DEFAULT_VOICE_SETTINGS.vad.maxRecordingMs),
      energyThreshold: clampNumber(settings?.vad?.energyThreshold, 0.001, 0.25, DEFAULT_VOICE_SETTINGS.vad.energyThreshold),
    },
    asr: {
      ...DEFAULT_VOICE_SETTINGS.asr,
      ...settings?.asr,
      openai: {
        ...DEFAULT_VOICE_SETTINGS.asr.openai,
        ...settings?.asr?.openai,
      },
      openrouter: {
        ...DEFAULT_VOICE_SETTINGS.asr.openrouter,
        ...settings?.asr?.openrouter,
      },
      funasr: {
        ...DEFAULT_VOICE_SETTINGS.asr.funasr,
        ...settings?.asr?.funasr,
      },
    },
    tts: {
      ...DEFAULT_VOICE_SETTINGS.tts,
      ...settings?.tts,
      system: {
        ...DEFAULT_VOICE_SETTINGS.tts.system,
        ...settings?.tts?.system,
        rate: clampNumber(settings?.tts?.system?.rate, 0.5, 2, DEFAULT_VOICE_SETTINGS.tts.system.rate),
        pitch: clampNumber(settings?.tts?.system?.pitch, 0, 2, DEFAULT_VOICE_SETTINGS.tts.system.pitch),
      },
      openrouter: {
        ...DEFAULT_VOICE_SETTINGS.tts.openrouter,
        ...settings?.tts?.openrouter,
      },
      openai: {
        ...DEFAULT_VOICE_SETTINGS.tts.openai,
        ...settings?.tts?.openai,
      },
      qwen: {
        ...DEFAULT_VOICE_SETTINGS.tts.qwen,
        ...settings?.tts?.qwen,
      },
    },
  }
}

export function normalizeEditorSettings(settings?: EditorSettings): Required<EditorSettings> {
  return {
    tabSize: clampNumber(settings?.tabSize, 1, 8, DEFAULT_EDITOR_SETTINGS.tabSize),
    lineWrapping: settings?.lineWrapping ?? DEFAULT_EDITOR_SETTINGS.lineWrapping,
    softWrapColumn: clampNumber(
      settings?.softWrapColumn,
      40,
      200,
      DEFAULT_EDITOR_SETTINGS.softWrapColumn,
    ),
    syntaxHighlighting: settings?.syntaxHighlighting ?? DEFAULT_EDITOR_SETTINGS.syntaxHighlighting,
    completionEnabled: settings?.completionEnabled ?? DEFAULT_EDITOR_SETTINGS.completionEnabled,
    composerMaxHeight: clampNumber(
      settings?.composerMaxHeight,
      80,
      640,
      DEFAULT_EDITOR_SETTINGS.composerMaxHeight,
    ),
    markdownNoteAttachmentDirectory: settings?.markdownNoteAttachmentDirectory ?? DEFAULT_EDITOR_SETTINGS.markdownNoteAttachmentDirectory,
    markdownProjectAttachmentDirectory: settings?.markdownProjectAttachmentDirectory ?? DEFAULT_EDITOR_SETTINGS.markdownProjectAttachmentDirectory,
  }
}

export function normalizeSoulMemorySettings(settings?: SoulMemorySettings): Required<SoulMemorySettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_SETTINGS.enabled,
    directoryMode: settings?.directoryMode === 'custom' ? 'custom' : 'ai-note-dir',
    customDirectory: settings?.customDirectory ?? DEFAULT_SOUL_MEMORY_SETTINGS.customDirectory,
    bootstrapMaxChars: clampNumber(
      settings?.bootstrapMaxChars,
      1000,
      50000,
      DEFAULT_SOUL_MEMORY_SETTINGS.bootstrapMaxChars,
    ),
    activeMemory: normalizeSoulMemoryActiveSettings(settings?.activeMemory),
    search: normalizeSoulMemorySearchSettings(settings?.search),
    embeddings: normalizeSoulMemoryEmbeddingSettings(settings?.embeddings),
    memoryFlush: normalizeSoulMemoryFlushSettings(settings?.memoryFlush),
    capture: normalizeSoulMemoryCaptureSettings(settings?.capture),
    review: normalizeSoulMemoryReviewSettings(settings?.review),
    canonicalMemory: normalizeSoulMemoryCanonicalSettings(settings?.canonicalMemory),
    dreaming: normalizeSoulMemoryDreamingSettings(settings?.dreaming),
    dailyContext: normalizeSoulMemoryDailyContextSettings(settings?.dailyContext),
    read: normalizeSoulMemoryReadSettings(settings?.read),
    logging: normalizeSoulMemoryLoggingSettings(settings?.logging),
  }
}

function normalizeSoulMemoryActiveSettings(
  settings?: SoulMemoryActiveSettings,
): Required<SoulMemoryActiveSettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.enabled,
    queryMode:
      settings?.queryMode === 'message' || settings?.queryMode === 'full'
        ? settings.queryMode
        : DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.queryMode,
    promptStyle: normalizeSoulMemoryPromptStyle(settings?.promptStyle, settings?.queryMode),
    timeoutMs: clampNumber(settings?.timeoutMs, 1000, 60000, DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.timeoutMs),
    cacheTtlMs: clampNumber(settings?.cacheTtlMs, 0, 120000, DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.cacheTtlMs),
    maxSummaryChars: clampNumber(
      settings?.maxSummaryChars,
      100,
      5000,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.maxSummaryChars,
    ),
    recentUserTurns: clampNumber(
      settings?.recentUserTurns,
      1,
      8,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.recentUserTurns,
    ),
    recentAssistantTurns: clampNumber(
      settings?.recentAssistantTurns,
      0,
      6,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.recentAssistantTurns,
    ),
    recentUserChars: clampNumber(
      settings?.recentUserChars,
      120,
      6000,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.recentUserChars,
    ),
    recentAssistantChars: clampNumber(
      settings?.recentAssistantChars,
      120,
      6000,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.recentAssistantChars,
    ),
    circuitBreakerMaxTimeouts: clampNumber(
      settings?.circuitBreakerMaxTimeouts,
      1,
      10,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.circuitBreakerMaxTimeouts,
    ),
    circuitBreakerCooldownMs: clampNumber(
      settings?.circuitBreakerCooldownMs,
      1000,
      300000,
      DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.circuitBreakerCooldownMs,
    ),
  }
}

function normalizeSoulMemoryPromptStyle(
  style: SoulMemoryActiveSettings['promptStyle'],
  queryMode: SoulMemoryActiveSettings['queryMode'],
): Required<SoulMemoryActiveSettings>['promptStyle'] {
  if (
    style === 'balanced' ||
    style === 'strict' ||
    style === 'contextual' ||
    style === 'recall-heavy' ||
    style === 'precision-heavy' ||
    style === 'preference-only'
  ) {
    return style
  }
  if (queryMode === 'message') return 'strict'
  if (queryMode === 'full') return 'contextual'
  return DEFAULT_SOUL_MEMORY_ACTIVE_SETTINGS.promptStyle
}

function normalizeSoulMemorySearchSettings(
  settings?: SoulMemorySearchSettings,
): Required<SoulMemorySearchSettings> {
  const chunkTokens = clampNumber(
    settings?.chunkTokens,
    100,
    2000,
    DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.chunkTokens,
  )
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.enabled,
    chunkTokens,
    chunkOverlap: Math.min(
      chunkTokens - 1,
      clampNumber(
        settings?.chunkOverlap,
        0,
        1000,
        DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.chunkOverlap,
      ),
    ),
    maxResults: clampNumber(
      settings?.maxResults,
      1,
      20,
      DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.maxResults,
    ),
    mmrEnabled: settings?.mmrEnabled ?? DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.mmrEnabled,
    temporalDecayHalfLifeDays: clampNumber(
      settings?.temporalDecayHalfLifeDays,
      1,
      365,
      DEFAULT_SOUL_MEMORY_SEARCH_SETTINGS.temporalDecayHalfLifeDays,
    ),
  }
}

function normalizeSoulMemoryEmbeddingSettings(
  settings?: SoulMemoryEmbeddingSettings,
): Required<SoulMemoryEmbeddingSettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.enabled,
    providerId: settings?.providerId ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.providerId,
    customProviderId: settings?.customProviderId ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.customProviderId,
    apiKey: settings?.apiKey ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.apiKey,
    model: settings?.model ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.model,
    baseUrl: settings?.baseUrl ?? DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.baseUrl,
    dimensions: clampNumber(
      settings?.dimensions,
      0,
      8192,
      DEFAULT_SOUL_MEMORY_EMBEDDING_SETTINGS.dimensions,
    ),
  }
}

function normalizeSoulMemoryLoggingSettings(
  settings?: SoulMemoryLoggingSettings,
): Required<SoulMemoryLoggingSettings> {
  const level = settings?.level === 'debug' ||
    settings?.level === 'warn' ||
    settings?.level === 'error' ||
    settings?.level === 'info'
    ? settings.level
    : DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS.level
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS.enabled,
    retentionDays: clampNumber(
      settings?.retentionDays,
      1,
      90,
      DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS.retentionDays,
    ),
    level,
    maxPreviewChars: clampNumber(
      settings?.maxPreviewChars,
      120,
      4000,
      DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS.maxPreviewChars,
    ),
    includeHttpErrorBody: settings?.includeHttpErrorBody ?? DEFAULT_SOUL_MEMORY_LOGGING_SETTINGS.includeHttpErrorBody,
  }
}

function normalizeSoulMemoryFlushSettings(
  settings?: SoulMemoryFlushSettings,
): Required<SoulMemoryFlushSettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_FLUSH_SETTINGS.enabled,
    maxInputChars: clampNumber(
      settings?.maxInputChars,
      2000,
      120000,
      DEFAULT_SOUL_MEMORY_FLUSH_SETTINGS.maxInputChars,
    ),
  }
}

function normalizeSoulMemoryCaptureSettings(
  settings?: SoulMemoryCaptureSettings,
): Required<SoulMemoryCaptureSettings> {
  const mode = settings?.mode === 'explicit-only' ||
    settings?.mode === 'auto' ||
    settings?.mode === 'ask' ||
    settings?.mode === 'off'
    ? settings.mode
    : DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.mode
  const legacyTargetPolicy = settings?.target === 'daily'
    ? 'daily-only'
    : settings?.target === 'memory'
      ? 'canonical-first'
      : undefined
  return {
    enabled: mode === 'off' ? false : settings?.enabled ?? DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.enabled,
    mode,
    policy: settings?.policy === 'aggressive'
      ? 'aggressive'
      : DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.policy,
    writePolicy: 'high-confidence-auto',
    targetPolicy:
      settings?.targetPolicy === 'daily-only' || settings?.targetPolicy === 'hybrid' || settings?.targetPolicy === 'canonical-first'
        ? settings.targetPolicy
        : legacyTargetPolicy || DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.targetPolicy,
    target: settings?.target === 'memory' ? 'memory' : DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.target,
    maxInputChars: clampNumber(
      settings?.maxInputChars,
      1000,
      50000,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.maxInputChars,
    ),
    timeoutMs: clampNumber(
      settings?.timeoutMs,
      1000,
      60000,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.timeoutMs,
    ),
    maxCandidates: clampNumber(
      settings?.maxCandidates,
      1,
      20,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.maxCandidates,
    ),
    minConfidence: clampFraction(
      settings?.minConfidence,
      0,
      1,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.minConfidence,
    ),
    longTermMinConfidence: clampFraction(
      settings?.longTermMinConfidence ?? settings?.minConfidence,
      0,
      1,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.longTermMinConfidence,
    ),
    dailyMinConfidence: clampFraction(
      settings?.dailyMinConfidence ?? settings?.minConfidence,
      0,
      1,
      DEFAULT_SOUL_MEMORY_CAPTURE_SETTINGS.dailyMinConfidence,
    ),
  }
}

function normalizeSoulMemoryReviewSettings(
  settings?: SoulMemoryReviewSettings,
): Required<SoulMemoryReviewSettings> {
  const rawInterval = typeof settings?.interval === 'number' ? settings.interval : undefined
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.enabled,
    interval: rawInterval === 0
      ? 0
      : clampNumber(
        rawInterval,
        1,
        200,
        DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.interval,
      ),
    maxInputChars: clampNumber(
      settings?.maxInputChars,
      4000,
      80000,
      DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.maxInputChars,
    ),
    timeoutMs: clampNumber(
      settings?.timeoutMs,
      1000,
      120000,
      DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.timeoutMs,
    ),
    maxCandidates: clampNumber(
      settings?.maxCandidates,
      1,
      20,
      DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.maxCandidates,
    ),
    minConfidence: clampFraction(
      settings?.minConfidence,
      0,
      1,
      DEFAULT_SOUL_MEMORY_REVIEW_SETTINGS.minConfidence,
    ),
  }
}

function normalizeSoulMemoryCanonicalSettings(
  settings?: SoulMemoryCanonicalSettings,
): Required<SoulMemoryCanonicalSettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_CANONICAL_SETTINGS.enabled,
    store: 'sqlite',
    highConfidenceThreshold: clampFraction(
      settings?.highConfidenceThreshold,
      0,
      1,
      DEFAULT_SOUL_MEMORY_CANONICAL_SETTINGS.highConfidenceThreshold,
    ),
    semanticDedupeThreshold: clampFraction(
      settings?.semanticDedupeThreshold,
      0.5,
      1,
      DEFAULT_SOUL_MEMORY_CANONICAL_SETTINGS.semanticDedupeThreshold,
    ),
  }
}

function normalizeSoulMemoryDreamingSettings(
  settings?: SoulMemoryDreamingSettings,
): Required<SoulMemoryDreamingSettings> {
  const frequency = settings?.frequency?.trim() || DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.frequency
  const allowedSources = new Set(['daily', 'sessions', 'short-term', 'recall'])
  const sources = Array.isArray(settings?.sources)
    ? settings.sources.filter(source => allowedSources.has(source))
    : DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.sources
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.enabled,
    frequency,
    timezone: settings?.timezone?.trim() || DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.timezone,
    model: settings?.model?.trim() || DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.model,
    sources: sources.length > 0 ? sources : DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.sources,
    lookbackDays: clampNumber(
      settings?.lookbackDays,
      1,
      365,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.lookbackDays,
    ),
    maxSourceFiles: clampNumber(
      settings?.maxSourceFiles,
      1,
      100,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.maxSourceFiles,
    ),
    maxSessions: clampNumber(
      settings?.maxSessions,
      0,
      100,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.maxSessions,
    ),
    maxMessagesPerSession: clampNumber(
      settings?.maxMessagesPerSession,
      1,
      200,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.maxMessagesPerSession,
    ),
    maxInputChars: clampNumber(
      settings?.maxInputChars,
      2000,
      200000,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.maxInputChars,
    ),
    maxPromotions: clampNumber(
      settings?.maxPromotions,
      0,
      100,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.maxPromotions,
    ),
    minScore: clampFraction(
      settings?.minScore,
      0,
      1,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.minScore,
    ),
    minRecallCount: clampNumber(
      settings?.minRecallCount,
      1,
      20,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.minRecallCount,
    ),
    minUniqueSources: clampNumber(
      settings?.minUniqueSources,
      1,
      10,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.minUniqueSources,
    ),
    timeoutMs: clampNumber(
      settings?.timeoutMs,
      5000,
      300000,
      DEFAULT_SOUL_MEMORY_DREAMING_SETTINGS.timeoutMs,
    ),
  }
}

function normalizeSoulMemoryDailyContextSettings(
  settings?: SoulMemoryDailyContextSettings,
): Required<SoulMemoryDailyContextSettings> {
  return {
    enabled: settings?.enabled ?? DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS.enabled,
    mode: settings?.mode === 'always' ? 'always' : DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS.mode,
    daysBack: clampNumber(
      settings?.daysBack,
      0,
      14,
      DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS.daysBack,
    ),
    maxChars: clampNumber(
      settings?.maxChars,
      1000,
      50000,
      DEFAULT_SOUL_MEMORY_DAILY_CONTEXT_SETTINGS.maxChars,
    ),
  }
}

function normalizeSoulMemoryReadSettings(
  settings?: SoulMemoryReadSettings,
): Required<SoulMemoryReadSettings> {
  const maxLines = clampNumber(settings?.maxLines, 50, 5000, DEFAULT_SOUL_MEMORY_READ_SETTINGS.maxLines)
  return {
    defaultLines: Math.min(
      maxLines,
      clampNumber(settings?.defaultLines, 20, 1000, DEFAULT_SOUL_MEMORY_READ_SETTINGS.defaultLines),
    ),
    maxLines,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampFraction(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function normalizeTypographyDensity(value: unknown): GeneralSettings['typographyDensity'] {
  return value === 'comfortable' ? 'comfortable' : DEFAULT_GENERAL_SETTINGS.typographyDensity
}

function stripLegacyProviderLocalAddress(providers: Record<string, unknown>): void {
  for (const config of Object.values(providers)) {
    if (config && typeof config === 'object') {
      delete (config as any).localAddress
    }
  }
}
