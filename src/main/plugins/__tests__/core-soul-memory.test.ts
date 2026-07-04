import { describe, expect, it, vi } from 'vitest'
import {
  applyDailyNoteLineRemove,
  applyDailyNoteLineReplace,
  applyDailyNoteCaptureActions,
  applyDailyNoteCaptureActionsWithAdapters,
  applyDreamingMemoryActions,
  applyMemoryReviewCandidate,
  applyPlainReviewCandidateToContent,
  applySoulMemoryStatusMutationPlan,
  assertSoulMemoryAccessibleRelativePath,
  buildSoulMemoryAppendPayload,
  buildSoulMemoryRewriteFollowUp,
  buildActiveMemoryFilterPrompt,
  buildActiveMemoryPromptStyleLines,
  buildActiveMemoryRecallQuery,
  buildSoulMemoryDailyContextFragment,
  buildSoulMemoryFtsQuery,
  buildSoulMemoryCaptureDedupeTextWithAdapters,
  buildSoulMemoryCaptureInput,
  buildSoulMemoryCaptureInputWithAdapters,
  buildSoulMemoryCaptureCommandStatusInput,
  buildSoulMemoryCanonicalGraphMigrationCandidates,
  buildSoulMemoryCanonicalProfileSummary,
  buildSoulMemoryCanonicalSearchHits,
  buildSoulMemoryDreamingInput,
  buildSoulMemoryDreamingStatus,
  buildSoulMemoryExistingMemorySummary,
  buildHermesMemoryPromptFragment,
  buildSoulMemoryGraphProfileSummary,
  buildSoulMemoryGraphSearchHits,
  buildSoulMemoryIndexDirtyDiagnostic,
  buildSoulMemoryManagedFileCandidates,
  buildSoulMemoryMarkdownSearchHits,
  buildSoulMemoryOverview,
  buildSoulMemoryPendingCaptureMigrationCandidates,
  buildSoulMemoryPromptFragments,
  buildSoulMemoryPublicDreamingStatus,
  buildSoulMemoryRecentDailyContextFragmentWithAdapters,
  buildSoulMemoryReviewStatus,
  buildSoulMemoryReviewStatusWithAdapters,
  buildSoulMemoryReviewInput,
  buildSoulMemoryReviewInputWithAdapters,
  buildSoulMemoryReviewCommandRunContext,
  buildSoulMemorySearchResult,
  chunkSoulMemoryText,
  cleanReviewDocumentText,
  clampActiveMemorySearchQuery,
  compactSoulMemoryCaptureInput,
  CORE_HERMES_MEMORY_DELIMITER,
  CORE_SOUL_MEMORY_DEFAULT_INDEX_STATUS,
  CORE_SOUL_MEMORY_BEFORE_CONTEXT_COMPACT_HOOK_ID,
  CORE_SOUL_MEMORY_CAPTURE_HOOK_ID,
  CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE,
  CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE,
  CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
  CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
  CORE_SOUL_MEMORY_COMMAND_SPECS,
  CORE_SOUL_MEMORY_DREAMING_COMMAND_USAGE,
  CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT,
  CORE_SOUL_MEMORY_GET_COMMAND_USAGE,
  CORE_SOUL_MEMORY_MANIFEST,
  CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
  CORE_SOUL_MEMORY_PLUGIN_ID,
  CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE,
  CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX,
  CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID,
  CORE_SOUL_MEMORY_REVIEW_HOOK_ID,
  CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
  CORE_SOUL_MEMORY_SEARCH_COMMAND_USAGE,
  CORE_SOUL_MEMORY_TOOL_SPECS,
  CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
  countMemoryReviewUserTurns,
  cosineSoulMemoryVector,
  createSoulMemoryTimelineEntry,
  createSoulMemoryToolProvider,
  dedupeSoulMemoryCaptureLines,
  dedupeSoulMemoryCaptureLinesWithAdapters,
  dedupeSoulMemoryDailyNoteBullets,
  dedupeSoulMemoryDailyNoteBulletsWithAdapters,
  describeSoulMemoryManagedFile,
  describeSoulMemoryManagedFileWithAdapters,
  filterSoulMemoryPendingCapturesForAgent,
  extractLegacyMemoryCandidates,
  formatHermesMemoryEntries,
  formatSoulMemoryDateString,
  formatSoulMemoryDateStringDaysAgo,
  formatSoulMemoryHits,
  formatSoulMemoryDreamingStatus,
  formatSoulMemoryDreamingRunSummary,
  formatSoulMemoryActiveMemoryStatus,
  formatSoulMemoryCaptureCommandStatus,
  formatSoulMemoryCommandCanonicalLookup,
  formatSoulMemoryCommandFileExcerpt,
  formatSoulMemoryCommandStatus,
  formatSoulMemoryCanonicalProfileExport,
  formatSoulMemoryCanonicalDisplayText,
  formatSoulMemoryIndexCommandResult,
  formatSoulMemoryMaybeTimestamp,
  formatSoulMemoryMessagesForFlush,
  formatSoulMemoryRememberCommandResult,
  formatSoulMemoryReviewIntervalNotification,
  formatSoulMemoryReviewStatus,
  formatSoulMemoryReviewToggleNotification,
  formatSoulMemoryToolModelRef,
  formatMemoryReviewConversation,
  formatSoulMemoryGraphSearchContent,
  getSoulMemoryActiveMemoryCooldown,
  getSoulMemoryDreamingNextRunStatus,
  getMemoryReviewProgress,
  hashSoulMemoryText,
  getCoreSoulMemoryCommandSpec,
  getCoreSoulMemoryToolSpec,
  isSingletonSoulMemoryGraphObservation,
  handleSoulMemoryActiveMemoryCommand,
  handleSoulMemoryCaptureCommand,
  handleSoulMemoryCommandGet,
  handleSoulMemoryDreamingCommand,
  handleSoulMemoryGetTool,
  handleSoulMemoryMemoryCommand,
  handleSoulMemoryMemoryTool,
  handleSoulMemoryReviewCommand,
  handleSoulMemorySearchTool,
  handleSoulMemorySoulCommand,
  handleSoulMemorySoulGetTool,
  handleSoulMemorySoulUpdateTool,
  hasExplicitMemoryIntent,
  isLikelyRawRequestEcho,
  estimateSoulMemoryTokens,
  CoreSoulMemoryActiveMemoryRuntime,
  CoreSoulMemoryIndexTracker,
  CoreSoulMemoryIndexSyncScheduler,
  createSoulMemoryDailyIndexFile,
  createSoulMemoryRootMemoryIndexFile,
  getSoulMemoryDailyDateFromFileName,
  markSoulMemoryIndexCleanState,
  markSoulMemoryIndexDirtyState,
  normalizeSoulMemoryBulletText,
  normalizeSoulMemoryForDedupe,
  normalizeSoulMemoryRelativePath,
  normalizeSoulMemorySearchLimit,
  normalizeSoulMemoryDreamingTimezoneInput,
  normalizeSoulMemoryCanonicalMergeCandidates,
  normalizeSoulMemoryGraphMergeCandidates,
  normalizeSoulMemoryGraphEntityType,
  normalizeSoulMemoryGraphObservationKind,
  normalizeSoulMemoryGraphRelationType,
  normalizeSoulMemoryGraphStatus,
  normalizeActiveMemoryFilterResult,
  parseSoulMemoryActiveMemoryCommand,
  parseSoulMemoryCaptureCommand,
  parseSoulMemoryRootCommand,
  planHermesMemoryEntryAdd,
  planHermesMemoryTextRemove,
  planHermesMemoryTextReplace,
  parseDailyNoteBullets,
  parseDailyNoteCaptureResult,
  parseDreamingOutput,
  parseMemoryReviewModelResult,
  patchSoulMemorySettingsSection,
  patchSoulMemorySettingsSectionWithAdapters,
  planSoulMemoryCaptureDiscardStatusMutation,
  planSoulMemoryCaptureErrorStatusMutation,
  planSoulMemoryCaptureRuntimeStatusMutation,
  planSoulMemoryCaptureSuccessStatusMutation,
  planSoulMemoryDreamingErrorStatusMutation,
  planSoulMemoryDreamingRunStatusMutation,
  planSoulMemoryGraphDuplicateIgnore,
  planSoulMemoryGraphDuplicateMerge,
  planSoulMemoryGraphEntityDelete,
  planSoulMemoryGraphEntityUpsert,
  planSoulMemoryGraphObservationDelete,
  planSoulMemoryGraphObservationUpsert,
  planSoulMemoryGraphRelationDelete,
  planSoulMemoryGraphRelationUpsert,
  planSoulMemoryGraphSingletonObservationReconciliation,
  planSoulMemoryManualDreamingRun,
  planSoulMemoryWorkspacePaths,
  prepareSoulMemoryGraphObservationInput,
  planSoulMemoryDailyNoteAppend,
  planSoulMemoryIndexFileWrite,
  planSoulMemoryIndexFreshness,
  planSoulMemoryIndexSyncWork,
  planSoulMemoryProfileUpsert,
  planSoulMemoryReviewAppliedStatusMutation,
  planSoulMemoryReviewErrorStatusMutation,
  planSoulMemoryReviewNoneStatusMutation,
  planSoulMemoryReviewTurnStatusMutation,
  readSoulMemoryFileExcerptFromContent,
  readSoulMemoryManagedFileExcerptWithAdapters,
  readSoulMemoryManagedFileWithAdapters,
  refreshSoulMemoryIndexStatus,
  recordSoulMemoryActiveMemoryTimeout,
  runSoulMemoryActiveMemoryRecall,
  runSoulMemoryCanonicalEmbeddingWithAdapters,
  runSoulMemoryCapture,
  runSoulMemoryDreamingSweep,
  runSoulMemoryManualDreamingWithAdapters,
  runSoulMemoryReview,
  sanitizeHermesMemoryEntry,
  getSoulMemoryPendingCaptures,
  getSoulMemoryPublicPendingCaptures,
  saveSoulMemoryPendingCaptureWithAdapters,
  discardSoulMemoryPendingCaptureWithAdapters,
  listSoulMemoryManagedFilesWithAdapters,
  saveSoulMemoryManagedFileWithAdapters,
  isSoulMemoryIndexableMarkdownRelativePath,
  memoryReviewLastTurnKey,
  removeSoulMemoryPendingCapture,
  resolveSoulMemoryProviderConfig,
  resolveSoulMemoryFilePath,
  resolveSoulMemoryRootPath,
  resolveSoulMemoryAppendTarget,
  resolveSoulMemoryManagedFilePath,
  resolveSoulMemoryPlainReviewFilePath,
  resolveSoulMemoryToolProviderSelection,
  resolveSoulMemoryManagedFileMetadata,
  sanitizeSoulMemoryAgentPathSegment,
  rowToSoulMemoryCanonicalAuditEvent,
  rowToSoulMemoryCanonicalMemory,
  rowToSoulMemoryChunk,
  rowToSoulMemoryGraphAuditEvent,
  rowToSoulMemoryGraphDuplicate,
  rowToSoulMemoryGraphEntity,
  rowToSoulMemoryGraphObservation,
  rowToSoulMemoryGraphRelation,
  selectSoulMemoryPendingCapture,
  selectSoulMemoryCanonicalDuplicate,
  selectSoulMemoryGraphObservationDuplicateCandidate,
  collectSoulMemoryDailyDreamingSourcesWithAdapters,
  canonicalSoulMemoryKindFromCaptureKind,
  canonicalSoulMemoryTokens,
  deriveSoulMemoryCanonicalInput,
  selectSoulMemorySearchHits,
  selectSoulMemoryDailyContextFiles,
  selectSoulMemoryDailyDreamingSources,
  selectSoulMemoryGraphRelatedProjectEntityIds,
  setSoulMemoryPendingCaptures,
  shouldSkipSoulMemoryIndexDirectoryName,
  shouldSkipSoulMemoryIndexFileWrite,
  shouldInjectSoulMemoryDailyContext,
  extractSoulMemoryCandidateValue,
  isDurableSoulMemoryCaptureCandidate,
  looksLikeSoulMemoryNameValue,
  sanitizeSoulMemoryKey,
  scoreSoulMemoryCanonicalDuplicateCandidate,
  slugifySoulMemoryKeyPart,
  soulMemoryToolProviderAuthError,
  isSoulMemoryIndexMarkdownFileName,
  takeSoulMemoryPendingCapture,
  selectSoulMemoryMmrHits,
  scoreSoulMemorySearchHit,
  sortManagedMemoryFiles,
  soulMemoryAsBullet,
  soulMemoryActiveMemoryKey,
  soulMemoryActiveMemorySessionDisabledKey,
  soulMemoryCircuitKey,
  soulMemoryGraphDisplayName,
  soulMemoryGraphEntityIdFor,
  soulMemoryGraphEntityFtsContent,
  soulMemoryGraphEntityInput,
  soulMemoryGraphInputsFromCandidate,
  soulMemoryGraphObservationFtsContent,
  soulMemoryGraphRelationFtsContent,
  soulMemoryGraphSlotFromCandidate,
  soulMemoryTokenJaccard,
  soulMemoryTemporalFactor,
  previewSoulMemoryLine,
  truncateSoulMemoryText,
  splitHermesMemoryEntries,
} from '@onething/runtime/plugins'

describe('onething runtime soul-memory helpers', () => {
  it('owns the soul-memory plugin manifest in onething runtime', () => {
    expect(CORE_SOUL_MEMORY_PLUGIN_ID).toBe('soul-memory')
    expect(CORE_SOUL_MEMORY_DEFAULT_INDEX_STATUS).toEqual({
      indexedFiles: 0,
      indexedChunks: 0,
      ftsTokenizer: 'unknown',
    })
    expect(CORE_SOUL_MEMORY_REVIEW_LAST_TURN_KEY_PREFIX).toBe('memoryReviewLastTurn:')
    expect(memoryReviewLastTurnKey('agent', 'session')).toBe('memoryReviewLastTurn:agent:session')
    expect(memoryReviewLastTurnKey('custom:', 'agent', 'session')).toBe('custom:agent:session')
    expect(CORE_SOUL_MEMORY_MANIFEST).toEqual({
      name: 'soul-memory',
      version: '1.0.0',
      description: 'SOUL.md prompt context, SQLite graph memory, AI notes recall, and compact-time memory flush',
      author: 'onething',
    })
  })

  it('keeps plugin registration protocol and command parsing in core', () => {
    expect(CORE_SOUL_MEMORY_PROMPT_CONTEXT_PROVIDER_ID).toBe('soul-memory')
    expect(CORE_SOUL_MEMORY_BEFORE_CONTEXT_COMPACT_HOOK_ID).toBe('memory-flush')
    expect(CORE_SOUL_MEMORY_CAPTURE_HOOK_ID).toBe('memory-capture')
    expect(CORE_SOUL_MEMORY_REVIEW_HOOK_ID).toBe('memory-review')

    expect(CORE_SOUL_MEMORY_TOOL_SPECS.map(spec => spec.name)).toEqual([
      'soul_get',
      'soul_update',
      'memory',
      'memory_search',
      'memory_get',
    ])
    expect(getCoreSoulMemoryToolSpec('soul_update')).toMatchObject({
      permissionGuard: 'permission-gated',
    })
    expect(getCoreSoulMemoryToolSpec('memory_search')).toMatchObject({
      permissionGuard: 'safe',
    })

    expect(CORE_SOUL_MEMORY_COMMAND_SPECS.map(spec => spec.name)).toEqual([
      '/active-memory',
      '/dreaming',
      '/memory',
      '/soul',
    ])
    expect(getCoreSoulMemoryCommandSpec('/memory')?.usage).toContain('review <subcommand>')

    expect(parseSoulMemoryActiveMemoryCommand('off --global')).toEqual({
      action: 'off',
      isGlobal: true,
    })
    expect(parseSoulMemoryActiveMemoryCommand('')).toEqual({
      action: 'status',
      isGlobal: false,
    })
    expect(parseSoulMemoryRootCommand('capture mode auto')).toEqual({
      action: 'capture',
      rest: ['mode', 'auto'],
      restText: 'mode auto',
    })
    expect(parseSoulMemoryCaptureCommand(['save', 'abc123'])).toEqual({
      subcommand: 'save',
      id: 'abc123',
    })
    expect(formatSoulMemoryActiveMemoryStatus(true, false)).toBe('Active Memory is on globally and on for this session')
    expect(formatSoulMemoryCaptureCommandStatus({
      enabled: true,
      mode: 'auto',
      pending: [{ id: 'abcdef123456', content: 'remember this' }],
      lastCaptureStatus: 'saved',
    })).toContain('Latest pending: abcdef12 remember this')
    expect(buildSoulMemoryRewriteFollowUp('make it warmer')).toContain('make it warmer')
    expect(CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT)
      .toContain('Return markdown bullets only')
    expect(CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT)
      .toBe(CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT)
  })

  it('normalizes reusable soul-memory text primitives in core', () => {
    expect(normalizeSoulMemoryBulletText('  -  用户   今天  验证 headless core  ')).toBe('用户 今天 验证 headless core')
    expect(soulMemoryAsBullet('* 用户今天验证 CLI tool call。')).toBe('- 用户今天验证 CLI tool call。')
    expect(normalizeSoulMemoryForDedupe('- **用户** [链接](https://example.com) #tag'))
      .toBe('用户 tag')
    expect(slugifySoulMemoryKeyPart('DeepSeek Tool Call!')).toBe('deepseek.tool.call')
    expect(slugifySoulMemoryKeyPart('!!!')).toMatch(/^[a-f0-9]{10}$/)
    expect(sanitizeSoulMemoryKey(' User Pref: Theme! ')).toBe('user.pref.theme')
    expect(extractSoulMemoryCandidateValue("User's name is Ada.")).toBe('Ada')
    expect(looksLikeSoulMemoryNameValue('Ada Lovelace')).toBe(true)
    expect(looksLikeSoulMemoryNameValue('prefers compact UI')).toBe(false)
    expect(canonicalSoulMemoryKindFromCaptureKind('episodic')).toBe('fact')
    expect(isDurableSoulMemoryCaptureCandidate({ kind: 'summary' })).toBe(false)
    expect(isDurableSoulMemoryCaptureCandidate({ kind: 'fact' })).toBe(true)
    expect([...canonicalSoulMemoryTokens('Headless core, core CLI')]).toEqual(['headless', 'core', 'cli'])
    expect(soulMemoryTokenJaccard('headless core cli', 'headless core gateway')).toBeCloseTo(0.5)
    expect(cosineSoulMemoryVector([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSoulMemoryVector([1, 1], [1, 1])).toBeCloseTo(1)
    expect(CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID).toBe('user:self')
    expect(soulMemoryGraphEntityIdFor('user', 'Ada')).toBe('user:self')
    expect(soulMemoryGraphEntityIdFor('project', 'Headless Core')).toBe('project:headless-core')
    expect(soulMemoryGraphDisplayName(' "Headless   Core" ')).toBe('Headless Core')
    expect(soulMemoryGraphSlotFromCandidate({
      kind: 'preference',
      source: 'user',
      confidence: 0.8,
      text: '用户偏好中文回答。',
      value: '中文回答',
    }, 'preference', '中文回答')).toBe('language_preference')
    expect(soulMemoryGraphEntityInput({
      source: 'capture',
      entityType: 'person',
      name: 'me',
    })).toEqual({
      source: 'capture',
      id: 'user:self',
      entityType: 'user',
      name: 'self',
      displayName: 'User',
    })
    expect(soulMemoryGraphInputsFromCandidate({
      kind: 'decision',
      source: 'conversation',
      confidence: 0.82,
      text: 'Use headless core for Gateway.',
      value: 'Use headless core for Gateway',
      entityName: 'Gateway',
      relationType: 'depends_on',
      toEntityType: 'tech',
      toEntityName: 'Core Runtime',
    }, {
      source: 'review',
      sessionId: 's1',
      messageId: 'm1',
    })).toEqual({
      entities: [
        {
          source: 'review',
          sessionId: 's1',
          messageId: 'm1',
          entityType: 'user',
          name: 'self',
          confidence: 0.82,
          sensitivity: 'normal',
          id: 'user:self',
          displayName: 'User',
        },
        {
          source: 'review',
          sessionId: 's1',
          messageId: 'm1',
          entityType: 'tech',
          name: 'Core Runtime',
          confidence: 0.82,
          sensitivity: 'normal',
          displayName: 'Core Runtime',
        },
        {
          source: 'review',
          sessionId: 's1',
          messageId: 'm1',
          entityType: 'project',
          name: 'Gateway',
          confidence: 0.82,
          sensitivity: 'normal',
          displayName: 'Gateway',
        },
      ],
      observations: [
        {
          source: 'review',
          sessionId: 's1',
          messageId: 'm1',
          entityId: 'project:gateway',
          kind: 'decision',
          slot: 'decision_use_headless_core_for_gateway',
          value: 'Use headless core for Gateway',
          text: 'Use headless core for Gateway.',
          confidence: 0.82,
          sensitivity: 'normal',
          status: 'active',
        },
      ],
      relations: [
        {
          source: 'review',
          sessionId: 's1',
          messageId: 'm1',
          fromEntityId: 'user:self',
          relationType: 'depends_on',
          toEntityId: 'tech:core-runtime',
          text: 'Use headless core for Gateway.',
          confidence: 0.82,
          sensitivity: 'normal',
          status: 'active',
        },
      ],
    })
    expect(normalizeSoulMemoryGraphMergeCandidates([
      {
        kind: 'project',
        text: 'Gateway uses the headless core.',
        entityType: 'project',
        entityName: 'Gateway',
        relationType: 'uses',
        toEntityType: 'tech',
        toEntityName: 'Headless Core',
        explicit: true,
      },
    ], 0.77)).toEqual([
      {
        kind: 'project',
        source: 'conversation',
        confidence: 0.77,
        text: 'Gateway uses the headless core.',
        entityType: 'project',
        entityName: 'Gateway',
        relationType: 'uses',
        toEntityType: 'tech',
        toEntityName: 'Headless Core',
        sensitivity: 'normal',
        target: 'memory',
        explicit: true,
      },
    ])
    expect(normalizeSoulMemoryCanonicalMergeCandidates([
      {
        kind: 'preference',
        text: 'User prefers compact status updates.',
        memoryKey: 'user.preference.status',
        value: 'compact status updates',
      },
    ], 0.66)).toEqual([
      {
        kind: 'preference',
        source: 'conversation',
        confidence: 0.66,
        text: 'User prefers compact status updates.',
        memoryKey: 'user.preference.status',
        value: 'compact status updates',
        sensitivity: 'normal',
        target: 'memory',
        explicit: undefined,
      },
    ])
    expect(buildSoulMemoryPendingCaptureMigrationCandidates([
      {
        content: 'My name is Ada.\n- I prefer compact updates.\n\nUses headless core.',
        confidence: 0.72,
        explicit: true,
      },
    ])).toEqual([
      {
        kind: 'identity',
        source: 'user',
        confidence: 0.72,
        text: 'My name is Ada.',
        sensitivity: 'normal',
        target: 'memory',
        explicit: true,
      },
      {
        kind: 'preference',
        source: 'user',
        confidence: 0.72,
        text: 'I prefer compact updates.',
        sensitivity: 'normal',
        target: 'memory',
        explicit: true,
      },
      {
        kind: 'fact',
        source: 'user',
        confidence: 0.72,
        text: 'Uses headless core.',
        sensitivity: 'normal',
        target: 'memory',
        explicit: true,
      },
    ])
    expect(buildSoulMemoryCanonicalGraphMigrationCandidates([
      {
        kind: 'preference',
        confidence: 0.81,
        text: 'User prefers compact updates.',
        memoryKey: 'user.preference.status',
        value: 'compact updates',
        sensitivity: 'sensitive',
      },
    ])).toEqual([
      {
        kind: 'preference',
        source: 'user',
        confidence: 0.81,
        text: 'User prefers compact updates.',
        memoryKey: 'user.preference.status',
        value: 'compact updates',
        sensitivity: 'sensitive',
        target: 'memory',
        explicit: true,
      },
    ])
  })

  it('derives canonical memory inputs in core', () => {
    expect(deriveSoulMemoryCanonicalInput({
      kind: 'identity',
      source: 'user',
      confidence: 0.9,
      text: "My name is Ada.",
    }, {
      source: 'capture',
      evidence: 'message text',
      sessionId: 's1',
      messageId: 'm1',
    })).toEqual({
      memoryKey: 'user.name',
      kind: 'identity',
      subject: 'user',
      value: 'Ada',
      text: "User's name is Ada.",
      confidence: 0.9,
      sensitivity: 'normal',
      source: 'capture',
      evidence: 'message text',
      sessionId: 's1',
      messageId: 'm1',
    })
    expect(deriveSoulMemoryCanonicalInput({
      kind: 'decision',
      source: 'conversation',
      confidence: 0.8,
      text: 'Use headless core for CLI gateway.',
      memoryKey: ' Project Decision / Core ',
      value: 'Headless core for CLI gateway',
      sensitivity: 'sensitive',
    }, {
      source: 'review',
    })).toMatchObject({
      memoryKey: 'project.decision.core',
      kind: 'decision',
      subject: 'project',
      value: 'Headless core for CLI gateway',
      text: 'Use headless core for CLI gateway.',
      sensitivity: 'sensitive',
      source: 'review',
    })
    expect(deriveSoulMemoryCanonicalInput({
      kind: 'summary',
      source: 'assistant',
      confidence: 0.4,
      text: 'Transient summary',
    }, {
      source: 'capture',
    })).toBeNull()
  })

  it('plans profile upserts in core', () => {
    expect(planSoulMemoryProfileUpsert({
      kind: 'decision',
      memoryKey: 'project.decision.core',
      value: 'Use headless core',
    })).toEqual({
      action: 'create',
      input: {
        memoryKey: 'project.decision.core',
        kind: 'decision',
        subject: 'project',
        value: 'Use headless core',
        text: 'Use headless core',
        confidence: 1,
        sensitivity: 'normal',
        source: 'panel',
        evidence: 'Edited in Memory User Profile panel.',
      },
    })

    expect(planSoulMemoryProfileUpsert({
      kind: 'preference',
      value: 'compact updates',
      text: 'User prefers compact updates.',
    }, {
      memoryKey: 'user.preference.status',
      subject: 'user',
      confidence: 0.7,
      sensitivity: 'sensitive',
      evidence: 'Existing evidence.',
    })).toEqual({
      action: 'update',
      input: {
        memoryKey: 'user.preference.status',
        kind: 'preference',
        subject: 'user',
        value: 'compact updates',
        text: 'User prefers compact updates.',
        confidence: 0.7,
        sensitivity: 'sensitive',
        source: 'panel',
        evidence: 'Existing evidence.',
      },
    })
  })

  it('selects canonical memory duplicates in core', () => {
    const input = {
      memoryKey: 'user.preference.theme',
      normalizedText: 'user preference theme dark mode',
      embedding: [1, 0],
    }

    expect(scoreSoulMemoryCanonicalDuplicateCandidate(input, {
      text: 'User prefers dark mode.',
      normalizedText: 'user preference theme dark mode',
    })).toBe(1)
    expect(selectSoulMemoryCanonicalDuplicate({
      input,
      sameKey: {
        record: 'same-key',
        memoryKey: 'user.preference.theme',
        text: 'Existing same key',
      },
      candidates: [],
      threshold: 0.9,
    })?.record).toBe('same-key')
    expect(selectSoulMemoryCanonicalDuplicate({
      input,
      candidates: [
        {
          record: 'weak',
          memoryKey: 'user.preference.editor',
          text: 'User prefers compact editors.',
          normalizedText: 'compact editor',
          embeddingJson: JSON.stringify([0, 1]),
        },
        {
          record: 'vector-match',
          memoryKey: 'user.preference.ui',
          text: 'Theme preference.',
          normalizedText: 'theme preference',
          embeddingJson: JSON.stringify([0.98, 0.02]),
        },
      ],
      threshold: 0.9,
    })?.record).toBe('vector-match')
  })

  it('builds canonical and graph profile summaries in core', () => {
    expect(buildSoulMemoryCanonicalProfileSummary({
      maxChars: 1000,
      memories: [
        {
          memoryKey: 'user.name',
          kind: 'identity',
          text: "User's name is Ada.",
          confidence: 0.91,
        },
        {
          memoryKey: 'project.decision.core',
          kind: 'decision',
          text: 'Use headless core for CLI gateway.',
          confidence: 0.82,
        },
      ],
    })).toBe([
      '## Identity',
      "- user.name: User's name is Ada. (0.91)",
      '',
      '## Decisions',
      '- project.decision.core: Use headless core for CLI gateway. (0.82)',
    ].join('\n'))

    const relations = [
      {
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works_on',
        toEntityId: 'project:headless-core',
        text: 'User works on headless core.',
        status: 'active',
      },
      {
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works_on',
        toEntityId: 'project:archived',
        text: 'Old project.',
        status: 'deleted',
      },
    ]
    expect(selectSoulMemoryGraphRelatedProjectEntityIds(relations)).toEqual(['project:headless-core'])
    expect(buildSoulMemoryGraphProfileSummary({
      maxChars: 1000,
      userObservations: [
        {
          entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
          slot: 'language_preference',
          text: 'User prefers Chinese replies.',
          confidence: 0.9,
          status: 'active',
        },
      ],
      userRelations: relations,
      projectObservations: [
        {
          entityId: 'project:headless-core',
          entityDisplayName: 'Headless Core',
          slot: 'goal',
          text: 'Extract Electron-free core.',
          confidence: 0.88,
          status: 'active',
        },
      ],
      resolveEntityLabel: entityId => entityId === CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID ? 'User' : entityId,
    })).toBe([
      '## User',
      '- language_preference: User prefers Chinese replies. (0.90)',
      '',
      '## User Relations',
      '- User --works_on--> project:headless-core: User works on headless core.',
      '',
      '## Related Projects',
      '- Headless Core / goal: Extract Electron-free core.',
    ].join('\n'))
  })

  it('plans graph entity upserts in core', () => {
    const created = planSoulMemoryGraphEntityUpsert({
      input: {
        entityType: 'project',
        name: 'Headless Core',
        aliases: ['core'],
        source: 'capture',
      },
      now: 1000,
      highConfidenceThreshold: 0.8,
    })
    expect(created).toMatchObject({
      action: 'create',
      entity: {
        id: 'project:headless-core',
        entityType: 'project',
        name: 'Headless Core',
        displayName: 'Headless Core',
        aliases: ['core', 'Headless Core'],
        confidence: 0.8,
        sensitivity: 'normal',
        source: 'capture',
        createdAt: 1000,
        updatedAt: 1000,
      },
    })
    expect(created.ftsContent).toBe(soulMemoryGraphEntityFtsContent(created.entity))

    expect(planSoulMemoryGraphEntityUpsert({
      input: {
        entityType: 'project',
        name: 'Headless Core',
        source: 'capture',
        confidence: 0.5,
      },
      existing: created.entity,
      now: 2000,
      highConfidenceThreshold: 0.8,
    }).action).toBe('duplicate')

    const updated = planSoulMemoryGraphEntityUpsert({
      input: {
        entityType: 'project',
        name: 'Headless Core',
        displayName: 'Headless Core Runtime',
        aliases: ['core-runtime'],
        source: 'review',
        confidence: 0.95,
      },
      existing: created.entity,
      now: 3000,
      highConfidenceThreshold: 0.8,
    })
    expect(updated).toMatchObject({
      action: 'update',
      entity: {
        id: 'project:headless-core',
        displayName: 'Headless Core Runtime',
        aliases: ['core', 'Headless Core', 'core-runtime', 'Headless Core Runtime'],
        confidence: 0.95,
        source: 'review',
        updatedAt: 3000,
      },
    })
  })

  it('plans graph observation upserts in core', () => {
    const prepared = prepareSoulMemoryGraphObservationInput({
      input: {
        entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        kind: 'preference',
        slot: 'language_preference',
        value: 'Chinese replies',
        text: 'User prefers Chinese replies.',
        source: 'capture',
        confidence: 0.7,
      },
      now: 1000,
      highConfidenceThreshold: 0.8,
    })
    expect(prepared).toMatchObject({
      entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
      kind: 'preference',
      slot: 'language_preference',
      value: 'Chinese replies',
      text: 'User prefers Chinese replies.',
      confidence: 0.7,
      sensitivity: 'normal',
      status: 'active',
      embeddingInput: [
        CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        'language_preference',
        'User prefers Chinese replies.',
        'Chinese replies',
      ].join('\n'),
    })
    expect(isSingletonSoulMemoryGraphObservation(prepared.kind, prepared.slot)).toBe(true)

    const existing = {
      id: 'obs-1',
      entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
      kind: 'preference' as const,
      slot: 'language_preference',
      value: 'Chinese replies',
      text: 'User prefers Chinese replies.',
      confidence: 0.6,
      sensitivity: 'sensitive' as const,
      source: 'manual',
      status: 'active' as const,
      createdAt: 500,
      updatedAt: 500,
    }
    const update = planSoulMemoryGraphObservationUpsert({
      prepared,
      existingById: existing,
    })
    expect(update).toMatchObject({
      action: 'update',
      observation: {
        id: 'obs-1',
        confidence: 0.7,
        sensitivity: 'sensitive',
        updatedAt: 1000,
      },
    })
    expect(update.ftsContent).toBe(soulMemoryGraphObservationFtsContent(update.observation))

    const duplicate = planSoulMemoryGraphObservationUpsert({
      prepared,
      activeSameSlot: existing,
    })
    expect(duplicate).toMatchObject({
      action: 'duplicate',
      duplicateReason: 'same singleton slot value',
      observation: {
        id: 'obs-1',
        confidence: 0.7,
        updatedAt: 1000,
      },
    })

    const conflictPrepared = prepareSoulMemoryGraphObservationInput({
      input: {
        entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        kind: 'preference',
        slot: 'language_preference',
        value: 'English replies',
        text: 'User prefers English replies.',
        source: 'capture',
      },
      now: 2000,
      highConfidenceThreshold: 0.8,
    })
    const conflict = planSoulMemoryGraphObservationUpsert({
      prepared: conflictPrepared,
      activeSameSlot: existing,
    })
    expect(conflict).toMatchObject({
      action: 'conflict',
      supersededObservation: {
        id: 'obs-1',
      },
      observation: {
        entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        slot: 'language_preference',
        value: 'English replies',
        confidence: 0.8,
        createdAt: 2000,
        updatedAt: 2000,
      },
    })
    expect(selectSoulMemoryGraphObservationDuplicateCandidate({
      normalizedText: conflict.normalizedText,
      threshold: 0.4,
      candidates: [
        {
          id: 'weak',
          text: 'Unrelated editor preference',
          normalizedText: 'editor preference',
        },
        {
          id: 'strong',
          text: 'User prefers English replies.',
          normalizedText: 'user self language preference english replies',
        },
      ],
    })).toMatchObject({
      id: 'strong',
      reason: 'Similar observation: User prefers English replies.',
    })
    expect(planSoulMemoryGraphSingletonObservationReconciliation([
      {
        ...existing,
        id: 'older',
        confidence: 0.95,
        updatedAt: 1000,
      },
      {
        ...existing,
        id: 'keeper',
        confidence: 0.7,
        updatedAt: 3000,
      },
      {
        ...existing,
        id: 'fact-1',
        kind: 'fact',
        slot: 'misc',
        updatedAt: 2000,
      },
      {
        ...existing,
        id: 'fact-2',
        kind: 'fact',
        slot: 'misc',
        updatedAt: 1000,
      },
    ])).toEqual([
      {
        observationId: 'older',
        supersededBy: 'keeper',
        reason: 'singleton observation slot reconciliation',
        entityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        kind: 'preference',
        slot: 'language_preference',
      },
    ])
  })

  it('plans graph relation upserts in core', () => {
    const created = planSoulMemoryGraphRelationUpsert({
      input: {
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works on',
        toEntityId: 'project:headless-core',
        source: 'capture',
      },
      fromDisplayName: 'User',
      toDisplayName: 'Headless Core',
      now: 1000,
      highConfidenceThreshold: 0.8,
    })
    expect(created).toMatchObject({
      action: 'create',
      relationType: 'works_on',
      relation: {
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        fromDisplayName: 'User',
        relationType: 'works_on',
        toEntityId: 'project:headless-core',
        toDisplayName: 'Headless Core',
        text: 'User works on Headless Core.',
        confidence: 0.8,
        sensitivity: 'normal',
        source: 'capture',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      },
      embeddingInput: [
        CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        'works_on',
        'project:headless-core',
        'User works on Headless Core.',
      ].join('\n'),
    })
    expect(created.relation.id).toMatch(/^[a-f0-9]{64}$/)
    expect(created.ftsContent).toBe(soulMemoryGraphRelationFtsContent(created.relation))

    const existing = {
      ...created.relation,
      id: 'rel-1',
      confidence: 0.6,
      sensitivity: 'sensitive' as const,
      source: 'manual',
      createdAt: 500,
      updatedAt: 500,
    }
    const updated = planSoulMemoryGraphRelationUpsert({
      input: {
        id: 'rel-1',
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works_on',
        toEntityId: 'project:headless-core',
        text: 'User actively works on the headless core.',
        source: 'review',
        confidence: 0.9,
      },
      existingById: existing,
      fromDisplayName: 'User',
      toDisplayName: 'Headless Core',
      now: 2000,
      highConfidenceThreshold: 0.8,
    })
    expect(updated).toMatchObject({
      action: 'update',
      relation: {
        id: 'rel-1',
        text: 'User actively works on the headless core.',
        confidence: 0.9,
        sensitivity: 'sensitive',
        source: 'review',
        updatedAt: 2000,
      },
    })

    expect(planSoulMemoryGraphRelationUpsert({
      input: {
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works_on',
        toEntityId: 'project:headless-core',
        source: 'capture',
      },
      existingRelation: existing,
      now: 3000,
      highConfidenceThreshold: 0.8,
    })).toMatchObject({
      action: 'duplicate',
      relation: {
        id: 'rel-1',
      },
    })
  })

  it('formats graph memory search content in core', () => {
    expect(formatSoulMemoryGraphSearchContent({
      type: 'entity',
      value: {
        id: 'project:headless-core',
        entityType: 'project',
        name: 'Headless Core',
        displayName: 'Headless Core',
        aliases: ['core', 'runtime'],
        confidence: 0.9,
        sensitivity: 'normal',
        source: 'capture',
        createdAt: 1000,
        updatedAt: 1000,
      },
    })).toBe('project:headless-core: Headless Core (project) aliases: core, runtime')
    expect(formatSoulMemoryGraphSearchContent({
      type: 'observation',
      value: {
        id: 'obs-1',
        entityId: 'project:headless-core',
        kind: 'project',
        slot: 'goal',
        value: 'Extract core',
        text: 'Extract Electron-free core.',
        confidence: 0.9,
        sensitivity: 'normal',
        source: 'capture',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      },
    }, entityId => entityId === 'project:headless-core' ? 'Headless Core' : entityId))
      .toBe('Headless Core goal: Extract Electron-free core.')
    expect(formatSoulMemoryGraphSearchContent({
      type: 'relation',
      value: {
        id: 'rel-1',
        fromEntityId: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
        relationType: 'works_on',
        toEntityId: 'project:headless-core',
        text: 'User works on Headless Core.',
        confidence: 0.8,
        sensitivity: 'normal',
        source: 'capture',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      },
    }, entityId => entityId === CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID ? 'User' : 'Headless Core'))
      .toBe('User --works_on--> Headless Core: User works on Headless Core.')
  })

  it('handles active-memory commands in core through settings and store adapters', async () => {
    let settings = {
      general: {
        soulMemory: {
          activeMemory: {
            enabled: true,
          },
        },
      },
    }
    const values = new Map<string, unknown>()
    const notifications: string[] = []
    const run = (args: string) => handleSoulMemoryActiveMemoryCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: message => notifications.push(message),
      },
      store: {
        get: <T = unknown>(key: string) => values.get(key) as T | undefined,
        set: (key, value) => {
          values.set(key, value)
        },
        delete: key => {
          values.delete(key)
        },
      },
      getSettings: () => settings,
      saveSettings: next => {
        settings = next
      },
      getGlobalEnabled: current => current.general.soulMemory.activeMemory.enabled !== false,
      setGlobalEnabled: (current, enabled) => ({
        ...current,
        general: {
          ...current.general,
          soulMemory: {
            ...current.general.soulMemory,
            activeMemory: {
              ...current.general.soulMemory.activeMemory,
              enabled,
            },
          },
        },
      }),
    })

    await run('off --global')
    expect(settings.general.soulMemory.activeMemory.enabled).toBe(false)
    expect(notifications.at(-1)).toBe('Active Memory is off globally')

    await run('off')
    const key = soulMemoryActiveMemorySessionDisabledKey('session-1')
    expect(values.get(key)).toBe(true)
    expect(notifications.at(-1)).toBe('Active Memory is off for this session')

    await run('status')
    expect(notifications.at(-1)).toBe('Active Memory is off globally and off for this session')

    await run('on')
    expect(values.has(key)).toBe(false)
    expect(notifications.at(-1)).toBe('Active Memory is on')
  })

  it('handles memory capture commands in core through capture adapters', async () => {
    expect(buildSoulMemoryCaptureCommandStatusInput({
      capture: {
        enabled: true,
        mode: 'auto',
      },
      pending: [{ id: 'pending-abcdef', content: 'candidate memory' }],
      runtimeStatus: {
        lastCaptureStatus: 'saved',
        lastCaptureError: 'old error',
      },
    })).toEqual({
      enabled: true,
      mode: 'auto',
      pending: [{ id: 'pending-abcdef', content: 'candidate memory' }],
      lastCaptureStatus: 'saved',
      lastCaptureError: 'old error',
    })

    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const savedIds: Array<string | undefined> = []
    const discardedIds: Array<string | undefined> = []
    let capture = {
      enabled: false,
      mode: 'explicit-only',
    }
    const run = (rest: string[]) => handleSoulMemoryCaptureCommand({
      rest,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
      },
      getStatus: () => ({
        enabled: capture.enabled,
        mode: capture.mode,
        pending: [{ id: 'pending-abcdef', content: 'candidate memory' }],
        lastCaptureError: 'last error',
      }),
      savePendingCapture: id => {
        savedIds.push(id)
        return { relativePath: 'memory/2026-06-25.md' }
      },
      discardPendingCapture: id => {
        discardedIds.push(id)
        return { id: id || 'pending-default' }
      },
      saveSettingsPatch: patch => {
        capture = {
          ...capture,
          ...patch,
        }
        return capture
      },
    })

    await run(['status'])
    expect(notifications.at(-1)?.message).toContain('Memory Capture: off')
    expect(notifications.at(-1)?.message).toContain('Latest pending: pending- candidate memory')
    expect(notifications.at(-1)?.message).toContain('Last error: last error')

    await run(['on'])
    expect(capture.enabled).toBe(true)
    expect(notifications.at(-1)?.message).toBe('Memory Capture is on')

    await run(['mode', 'auto'])
    expect(capture.mode).toBe('auto')
    expect(notifications.at(-1)?.message).toBe('Memory Capture mode: auto')

    await run(['mode', 'invalid'])
    expect(notifications.at(-1)).toEqual({
      message: CORE_SOUL_MEMORY_CAPTURE_MODE_USAGE,
      level: 'warn',
    })

    await run(['save', 'pending-1'])
    expect(savedIds).toEqual(['pending-1'])
    expect(notifications.at(-1)?.message).toBe('Saved pending memory to memory/2026-06-25.md')

    await run(['discard', 'abcdef123456'])
    expect(discardedIds).toEqual(['abcdef123456'])
    expect(notifications.at(-1)?.message).toBe('Discarded pending memory abcdef12')

    await run(['unknown'])
    expect(notifications.at(-1)).toEqual({
      message: CORE_SOUL_MEMORY_CAPTURE_COMMAND_USAGE,
      level: 'warn',
    })
  })

  it('routes memory commands in core through action adapters', async () => {
    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const calls: string[] = []
    const run = (args: string) => handleSoulMemoryMemoryCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
      },
      handleDreaming: async commandArgs => {
        calls.push(`dreaming:${commandArgs}`)
      },
      handleReview: async commandArgs => {
        calls.push(`review:${commandArgs}`)
      },
      handleCapture: async rest => {
        calls.push(`capture:${rest.join(' ')}`)
      },
      search: async query => {
        calls.push(`search:${query}`)
        return `search result for ${query}`
      },
      get: async path => {
        calls.push(`get:${path}`)
        return `get result for ${path}`
      },
      remember: async input => {
        calls.push(`${input.action}:${input.content}`)
        return `remembered ${input.content}`
      },
      index: async () => {
        calls.push('index')
        return { indexedFiles: 3, indexedChunks: 9 }
      },
      status: async () => {
        calls.push('status')
        return 'memory status'
      },
    })

    await run('dreaming run now')
    await run('review status')
    await run('capture status')
    await run('search prior decision')
    await run('get entity:abc')
    await run('remember durable fact')
    await run('append another fact')
    await run('index')
    await run('unknown')

    expect(calls).toEqual([
      'dreaming:run now',
      'review:status',
      'capture:status',
      'search:prior decision',
      'get:entity:abc',
      'remember:durable fact',
      'append:another fact',
      'index',
      'status',
    ])
    expect(notifications.map(item => item.message)).toContain('search result for prior decision')
    expect(notifications.map(item => item.message)).toContain('get result for entity:abc')
    expect(notifications.map(item => item.message)).toContain('remembered durable fact')
    expect(notifications.map(item => item.message)).toContain(formatSoulMemoryIndexCommandResult({ indexedFiles: 3, indexedChunks: 9 }))
    expect(notifications.at(-1)?.message).toBe('memory status')
  })

  it('warns for memory command missing arguments in core', async () => {
    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const run = (args: string) => handleSoulMemoryMemoryCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
      },
      handleDreaming: async () => {},
      handleReview: async () => {},
      handleCapture: async () => {},
      search: async () => 'search',
      get: async () => 'get',
      remember: async () => 'remember',
      index: async () => ({ indexedFiles: 0, indexedChunks: 0 }),
      status: async () => 'status',
    })

    await run('search')
    await run('get')
    await run('remember')

    expect(notifications).toEqual([
      { message: CORE_SOUL_MEMORY_SEARCH_COMMAND_USAGE, level: 'warn' },
      { message: CORE_SOUL_MEMORY_GET_COMMAND_USAGE, level: 'warn' },
      { message: 'Usage: /memory remember <text>', level: 'warn' },
    ])
  })

  it('formats memory get and remember command adapter results in core', async () => {
    const canonical = {
      memoryKey: 'profile:timezone',
      text: 'User prefers UTC',
      kind: 'preference',
      subject: 'user',
      value: 'UTC',
      confidence: 0.875,
    }
    const excerpt = {
      relativePath: 'MEMORY.md',
      text: 'line 4',
      startLine: 4,
      endLine: 4,
      totalLines: 8,
      truncated: true,
    }

    expect(formatSoulMemoryCommandCanonicalLookup(canonical)).toBe([
      'profile:timezone',
      'User prefers UTC',
      'Kind: preference',
      'Confidence: 0.88',
    ].join('\n'))
    expect(formatSoulMemoryCommandFileExcerpt(excerpt)).toBe([
      'MEMORY.md:4-4',
      'line 4',
      'More content available from line 5.',
    ].join('\n\n'))
    expect(formatSoulMemoryRememberCommandResult({ relativePath: 'memory/2026-06-25.md' }))
      .toBe('Remembered in memory/2026-06-25.md')
    expect(formatSoulMemoryCanonicalProfileExport({
      exportedAt: new Date('2026-06-25T08:00:00.000Z'),
      memories: [
        {
          memoryKey: 'profile:timezone',
          kind: 'preference',
          confidence: 0.875,
          text: 'User prefers UTC',
        },
      ],
    })).toBe([
      '# Canonical User Profile',
      '',
      'Exported: 2026-06-25T08:00:00.000Z',
      '',
      '- **profile:timezone** (preference, 0.88): User prefers UTC',
    ].join('\n'))
    const canonicalRecord = rowToSoulMemoryCanonicalMemory({
      id: 'mem-1',
      memory_key: 'profile:timezone',
      kind: 'preference',
      subject: 'user',
      value: 'UTC',
      text: 'User prefers UTC',
      confidence: 0.875,
      sensitivity: null,
      source: 'capture',
      evidence: '',
      session_id: null,
      message_id: 'msg-1',
      created_at: 100,
      updated_at: 200,
      deleted_at: null,
    })
    expect(canonicalRecord).toEqual({
      id: 'mem-1',
      memoryKey: 'profile:timezone',
      kind: 'preference',
      subject: 'user',
      value: 'UTC',
      text: 'User prefers UTC',
      confidence: 0.875,
      sensitivity: 'normal',
      source: 'capture',
      evidence: undefined,
      sessionId: undefined,
      messageId: 'msg-1',
      createdAt: 100,
      updatedAt: 200,
      deletedAt: undefined,
    })
    expect(formatSoulMemoryCanonicalDisplayText(canonicalRecord)).toBe('profile:timezone: User prefers UTC')
    expect(rowToSoulMemoryCanonicalAuditEvent({
      id: 'event-1',
      memory_id: 'mem-1',
      action: 'create',
      created_at: 300,
      payload_json: '{"memoryKey":"profile:timezone","ignored":null}',
    })).toEqual({
      id: 'event-1',
      memoryId: 'mem-1',
      action: 'create',
      createdAt: 300,
      payload: { memoryKey: 'profile:timezone', ignored: null },
    })
    expect(rowToSoulMemoryCanonicalAuditEvent({
      id: 'event-2',
      memory_id: 'mem-1',
      action: 'bad-json',
      created_at: 400,
      payload_json: '{',
    }).payload).toEqual({})
    expect(normalizeSoulMemoryGraphStatus('conflict')).toBe('conflict')
    expect(normalizeSoulMemoryGraphStatus('unknown')).toBe('active')
    expect(normalizeSoulMemoryGraphEntityType('organization')).toBe('organization')
    expect(normalizeSoulMemoryGraphEntityType('wat')).toBe('concept')
    expect(normalizeSoulMemoryGraphObservationKind('episodic')).toBe('episodic')
    expect(normalizeSoulMemoryGraphObservationKind('wat')).toBe('fact')
    expect(normalizeSoulMemoryGraphRelationType('depends on')).toBe('depends_on')
    expect(rowToSoulMemoryGraphEntity({
      id: 'entity-1',
      entity_type: 'person',
      name: 'Ada',
      display_name: 'Ada Lovelace',
      aliases_json: '["Ada",""]',
      confidence: 0.9,
      sensitivity: null,
      source: 'capture',
      evidence: '',
      created_at: 1,
      updated_at: 2,
      deleted_at: null,
    })).toEqual({
      id: 'entity-1',
      entityType: 'person',
      name: 'Ada',
      displayName: 'Ada Lovelace',
      aliases: ['Ada'],
      confidence: 0.9,
      sensitivity: 'normal',
      source: 'capture',
      evidence: undefined,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: undefined,
    })
    expect(rowToSoulMemoryGraphObservation({
      id: 'obs-1',
      entity_id: 'entity-1',
      entity_display_name: 'Ada Lovelace',
      kind: 'preference',
      slot: 'timezone',
      value: 'UTC',
      text: 'Ada prefers UTC.',
      confidence: 0.8,
      sensitivity: 'sensitive',
      source: 'capture',
      evidence: null,
      session_id: 's1',
      message_id: null,
      status: 'superseded',
      created_at: 3,
      updated_at: 4,
      deleted_at: null,
    })).toMatchObject({
      id: 'obs-1',
      entityId: 'entity-1',
      kind: 'preference',
      status: 'superseded',
      sensitivity: 'sensitive',
      sessionId: 's1',
      messageId: undefined,
    })
    expect(rowToSoulMemoryGraphRelation({
      id: 'rel-1',
      from_entity_id: 'project:a',
      from_display_name: null,
      relation_type: 'depends_on',
      to_entity_id: 'tech:b',
      to_display_name: 'Tech B',
      text: 'Project A depends on Tech B.',
      confidence: 0.7,
      sensitivity: 'secret',
      source: 'capture',
      evidence: '',
      session_id: null,
      message_id: 'm1',
      status: 'unknown',
      created_at: 5,
      updated_at: 6,
      deleted_at: null,
    })).toMatchObject({
      id: 'rel-1',
      fromEntityId: 'project:a',
      fromDisplayName: undefined,
      toDisplayName: 'Tech B',
      status: 'active',
      sensitivity: 'secret',
      messageId: 'm1',
    })
    expect(rowToSoulMemoryGraphDuplicate({
      id: 'dup-1',
      kind: 'entity',
      source_id: 'old',
      target_id: 'new',
      score: 0.99,
      reason: 'same thing',
      status: 'pending',
      created_at: 7,
      updated_at: 8,
    })).toEqual({
      id: 'dup-1',
      kind: 'entity',
      sourceId: 'old',
      targetId: 'new',
      score: 0.99,
      reason: 'same thing',
      status: 'pending',
      createdAt: 7,
      updatedAt: 8,
    })
    expect(planSoulMemoryGraphDuplicateMerge({
      id: 'dup-1',
      kind: 'entity',
      source_id: 'old',
      target_id: 'new',
      score: 0.99,
      reason: 'same thing',
      status: 'pending',
      created_at: 7,
      updated_at: 8,
    }, 900)).toMatchObject({
      duplicateStatus: { id: 'dup-1', status: 'merged', updatedAt: 900 },
      operations: [
        { type: 'reassign-observation-entity', sourceId: 'old', targetId: 'new', updatedAt: 900 },
        { type: 'reassign-relation-from-entity', sourceId: 'old', targetId: 'new', updatedAt: 900 },
        { type: 'reassign-relation-to-entity', sourceId: 'old', targetId: 'new', updatedAt: 900 },
        { type: 'soft-delete-entity', id: 'old', deletedAt: 900 },
      ],
      ftsDeletes: [{ ownerKind: 'entity', ownerId: 'old' }],
      auditEvents: [
        { memoryId: 'new', action: 'merge' },
        { memoryId: 'old', action: 'merge' },
      ],
    })
    expect(planSoulMemoryGraphDuplicateMerge({
      id: 'dup-2',
      kind: 'observation',
      source_id: 'obs-old',
      target_id: 'obs-new',
      score: 0.91,
      reason: 'same observation',
      status: 'pending',
      created_at: 1,
      updated_at: 2,
    }, 901)).toMatchObject({
      operations: [{ type: 'soft-delete-observation', id: 'obs-old', status: 'superseded', deletedAt: 901 }],
      ftsDeletes: [{ ownerKind: 'observation', ownerId: 'obs-old' }],
    })
    expect(planSoulMemoryGraphDuplicateMerge({
      id: 'dup-3',
      kind: 'relation',
      source_id: 'rel-old',
      target_id: 'rel-new',
      score: 0.9,
      reason: 'same relation',
      status: 'pending',
      created_at: 1,
      updated_at: 2,
    }, 902)).toMatchObject({
      operations: [{ type: 'soft-delete-relation', id: 'rel-old', status: 'superseded', deletedAt: 902 }],
      ftsDeletes: [{ ownerKind: 'relation', ownerId: 'rel-old' }],
    })
    expect(planSoulMemoryGraphDuplicateIgnore({
      id: 'dup-4',
      kind: 'entity',
      source_id: 'source',
      target_id: 'target',
      score: 0.7,
      reason: 'different',
      status: 'pending',
      created_at: 1,
      updated_at: 2,
    }, 903)).toMatchObject({
      operations: [],
      ftsDeletes: [],
      duplicateStatus: { id: 'dup-4', status: 'ignored', updatedAt: 903 },
      auditEvents: [
        { memoryId: 'source', action: 'ignore' },
        { memoryId: 'target', action: 'ignore' },
      ],
    })
    const graphEntityDeletePlan = planSoulMemoryGraphEntityDelete({
      id: 'entity-delete',
      entityType: 'person',
      name: 'Ada',
      displayName: 'Ada',
      aliases: [],
      confidence: 0.9,
      sensitivity: 'normal',
      source: 'panel',
      evidence: 'manual',
      createdAt: 1,
      updatedAt: 2,
    }, 904)
    expect(graphEntityDeletePlan).toMatchObject({
      operations: [
        { type: 'soft-delete-entity', id: 'entity-delete', deletedAt: 904 },
        { type: 'soft-delete-observations-by-entity', entityId: 'entity-delete', status: 'deleted', deletedAt: 904 },
        { type: 'soft-delete-relations-by-entity', entityId: 'entity-delete', status: 'deleted', deletedAt: 904 },
      ],
      ftsDeletes: [{ mode: 'owner-or-id', ownerId: 'entity-delete', id: 'entity:entity-delete' }],
      auditEvents: [
        { memoryId: 'entity-delete', action: 'delete', payload: { deletedAt: 904 } },
      ],
    })
    expect(() => planSoulMemoryGraphEntityDelete({
      id: CORE_SOUL_MEMORY_USER_SELF_ENTITY_ID,
      entityType: 'person',
      name: 'User',
      displayName: 'User',
      aliases: [],
      confidence: 1,
      sensitivity: 'normal',
      source: 'system',
      createdAt: 1,
      updatedAt: 2,
    }, 905)).toThrow('user:self cannot be deleted')
    expect(planSoulMemoryGraphObservationDelete({
      id: 'obs-delete',
      entityId: 'entity-delete',
      entityDisplayName: 'Ada',
      kind: 'fact',
      slot: 'testing',
      value: 'Ada writes tests.',
      text: 'Ada writes tests.',
      confidence: 0.8,
      sensitivity: 'normal',
      status: 'active',
      source: 'panel',
      createdAt: 1,
      updatedAt: 2,
    }, 906)).toMatchObject({
      operations: [{ type: 'soft-delete-observation', id: 'obs-delete', status: 'deleted', deletedAt: 906 }],
      ftsDeletes: [{ ownerKind: 'observation', ownerId: 'obs-delete' }],
      auditEvents: [{ memoryId: 'obs-delete', action: 'delete', payload: { deletedAt: 906 } }],
    })
    expect(planSoulMemoryGraphRelationDelete({
      id: 'rel-delete',
      fromEntityId: 'entity-delete',
      relationType: 'uses',
      toEntityId: 'tool:test',
      text: 'Ada uses tests.',
      confidence: 0.7,
      sensitivity: 'normal',
      status: 'active',
      source: 'panel',
      createdAt: 1,
      updatedAt: 2,
    }, 907)).toMatchObject({
      operations: [{ type: 'soft-delete-relation', id: 'rel-delete', status: 'deleted', deletedAt: 907 }],
      ftsDeletes: [{ ownerKind: 'relation', ownerId: 'rel-delete' }],
      auditEvents: [{ memoryId: 'rel-delete', action: 'delete', payload: { deletedAt: 907 } }],
    })
    expect(rowToSoulMemoryGraphAuditEvent({
      id: 'graph-event-1',
      memory_id: 'entity-1',
      action: 'update',
      created_at: 9,
      payload_json: '{"id":"entity-1"}',
    })).toEqual({
      id: 'graph-event-1',
      memoryId: 'entity-1',
      action: 'update',
      createdAt: 9,
      payload: { id: 'entity-1' },
    })
    expect(rowToSoulMemoryGraphAuditEvent({
      id: 'graph-event-2',
      memory_id: 'entity-1',
      action: 'bad-json',
      created_at: 10,
      payload_json: '[',
    }).payload).toEqual({})

    await expect(handleSoulMemoryCommandGet({
      path: 'entity:e1',
      getGraph: path => ({ type: 'entity', output: `graph ${path}`, metadata: { id: 'e1' } }),
      getCanonical: () => {
        throw new Error('graph should win')
      },
      readFileExcerpt: () => {
        throw new Error('graph should win')
      },
    })).resolves.toBe('graph entity:e1')

    await expect(handleSoulMemoryCommandGet({
      path: 'profile:timezone',
      getGraph: () => null,
      getCanonical: () => canonical,
      readFileExcerpt: () => {
        throw new Error('canonical should win')
      },
    })).resolves.toBe([
      'profile:timezone',
      'User prefers UTC',
      'Kind: preference',
      'Confidence: 0.88',
    ].join('\n'))

    await expect(handleSoulMemoryCommandGet({
      path: 'MEMORY.md',
      getGraph: () => null,
      getCanonical: () => null,
      readFileExcerpt: () => excerpt,
    })).resolves.toBe([
      'MEMORY.md:4-4',
      'line 4',
      'More content available from line 5.',
    ].join('\n\n'))
  })

  it('handles dreaming commands in core through scheduler and settings adapters', async () => {
    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const patches: Array<{ enabled?: boolean; frequency?: string; timezone?: string }> = []
    let runRecord: { ok: boolean; error?: string; result?: any } = {
      ok: true,
      result: {
        status: 'ok',
        applied: 2,
        sourceFiles: ['memory/2026-06-25.md'],
        nextRunAt: Date.UTC(2026, 5, 26, 8, 0, 0),
      },
    }
    const events: string[] = []
    const run = (args: string) => handleSoulMemoryDreamingCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
      },
      getStatus: () => 'dreaming status',
      saveSettingsPatch: patch => {
        patches.push(patch)
        return {
          enabled: patch.enabled ?? true,
          frequency: patch.frequency ?? '0 8 * * *',
          timezone: patch.timezone ?? 'UTC',
        }
      },
      clearLastRun: () => {
        events.push('clear')
      },
      refreshSchedule: () => {
        events.push('refresh')
      },
      runNow: () => runRecord,
      getTimezone: () => 'UTC',
      validateFrequency: frequency => {
        if (frequency === 'bad cron') throw new Error('bad cron')
      },
      isValidTimezone: timezone => timezone === 'UTC' || timezone === 'Asia/Shanghai',
    })

    await run('status')
    expect(notifications.at(-1)?.message).toBe('dreaming status')

    await run('off')
    expect(patches.at(-1)).toEqual({ enabled: false })
    expect(events.slice(-2)).toEqual(['clear', 'refresh'])
    expect(notifications.at(-1)?.message).toBe('Memory Dreaming is off')

    await run('run')
    expect(notifications.at(-2)?.message).toBe('Memory Dreaming sweep started.')
    expect(notifications.at(-1)?.message).toContain('Memory Dreaming ok.')
    expect(notifications.at(-1)?.message).toContain('Applied: 2')

    runRecord = { ok: false, error: 'scheduler failed' }
    await run('run')
    expect(notifications.at(-1)).toEqual({
      message: 'Memory Dreaming failed: scheduler failed',
      level: 'error',
    })

    runRecord = { ok: true, result: null }
    await run('run')
    expect(notifications.at(-1)).toEqual({
      message: 'Memory Dreaming did not run because soul-memory is disabled.',
      level: 'warn',
    })

    await run('frequency 0 8 * * *')
    expect(patches.at(-1)).toEqual({ frequency: '0 8 * * *' })
    expect(notifications.at(-1)?.message).toBe('dreaming status')

    await run('frequency')
    expect(notifications.at(-1)).toEqual({
      message: '/dreaming frequency <5-field cron>',
      level: 'warn',
    })

    await run('frequency bad cron')
    expect(notifications.at(-1)).toEqual({
      message: 'Invalid dreaming cron: bad cron',
      level: 'warn',
    })

    await run('timezone system')
    expect(patches.at(-1)).toEqual({ timezone: '' })

    await run('timezone Mars/Base')
    expect(notifications.at(-1)).toEqual({
      message: 'Invalid timezone: Mars/Base',
      level: 'warn',
    })

    await run('model')
    expect(notifications.at(-1)?.message).toBe([
      'Memory Dreaming now uses the Tools tool provider/model.',
      'dreaming status',
    ].join('\n'))

    await run('wat')
    expect(notifications.at(-1)).toEqual({
      message: CORE_SOUL_MEMORY_DREAMING_COMMAND_USAGE,
      level: 'warn',
    })

    expect(normalizeSoulMemoryDreamingTimezoneInput(' local ')).toBe('')
    expect(normalizeSoulMemoryDreamingTimezoneInput('UTC')).toBe('UTC')
  })

  it('handles memory review commands in core through status settings and run adapters', async () => {
    expect(buildSoulMemoryReviewCommandRunContext({
      enabled: true,
      review: { enabled: true, interval: 4 },
      messages: [
        { role: 'user', content: 'remember this' },
        { role: 'assistant', content: 'stored' },
      ],
    })).toEqual({
      enabled: true,
      hasSession: true,
      hasRequiredMessages: true,
    })
    expect(buildSoulMemoryReviewCommandRunContext({
      enabled: true,
      review: { enabled: true, interval: 4 },
      messages: undefined,
    })).toEqual({
      enabled: true,
      hasSession: false,
      hasRequiredMessages: false,
    })
    expect(buildSoulMemoryReviewCommandRunContext({
      enabled: true,
      review: { enabled: true, interval: 0 },
      messages: [{ role: 'user', content: 'only user' }],
    })).toEqual({
      enabled: false,
      hasSession: true,
      hasRequiredMessages: false,
    })

    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const patches: Array<{ enabled?: boolean; interval?: number }> = []
    let review = {
      enabled: false,
      interval: 0,
    }
    let runContext = {
      enabled: true,
      hasSession: true,
      hasRequiredMessages: true,
    }
    let runResult = { lastStatus: 'ok' as string | undefined }
    let runError: Error | undefined
    let runCount = 0
    const run = (args: string) => handleSoulMemoryReviewCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
      },
      getStatus: () => 'review status',
      getSettings: () => review,
      saveSettingsPatch: patch => {
        patches.push(patch)
        review = {
          ...review,
          ...patch,
        }
        return review
      },
      getRunContext: () => runContext,
      runNow: () => {
        runCount += 1
        if (runError) throw runError
        return runResult
      },
    })

    await run('status')
    expect(notifications.at(-1)?.message).toBe('review status')

    await run('on')
    expect(patches.at(-1)).toEqual({ enabled: true, interval: 10 })
    expect(notifications.at(-1)?.message).toBe(formatSoulMemoryReviewToggleNotification(review, 'review status'))

    await run('off')
    expect(patches.at(-1)).toEqual({ enabled: false })
    expect(notifications.at(-1)?.message).toBe(formatSoulMemoryReviewToggleNotification(review, 'review status'))

    await run('interval 7')
    expect(patches.at(-1)).toEqual({ interval: 7, enabled: true })
    expect(notifications.at(-1)?.message).toBe(formatSoulMemoryReviewIntervalNotification(review, 'review status'))

    await run('interval 0')
    expect(patches.at(-1)).toEqual({ interval: 0, enabled: false })
    expect(notifications.at(-1)?.message).toBe(formatSoulMemoryReviewIntervalNotification(review, 'review status'))

    await run('interval 201')
    expect(notifications.at(-1)).toEqual({
      message: 'Usage: /memory review interval <0-200>',
      level: 'warn',
    })

    runContext = { enabled: false, hasSession: true, hasRequiredMessages: true }
    await run('run')
    expect(notifications.at(-1)).toEqual({
      message: 'Memory Review is disabled. Use /memory review on first.',
      level: 'warn',
    })

    runContext = { enabled: true, hasSession: false, hasRequiredMessages: true }
    await run('run')
    expect(notifications.at(-1)).toEqual({
      message: 'No current session found for Memory Review.',
      level: 'warn',
    })

    runContext = { enabled: true, hasSession: true, hasRequiredMessages: false }
    await run('run')
    expect(notifications.at(-1)).toEqual({
      message: 'Memory Review needs at least one user message and one assistant response.',
      level: 'warn',
    })

    runContext = { enabled: true, hasSession: true, hasRequiredMessages: true }
    await run('run')
    expect(runCount).toBe(1)
    expect(notifications.at(-2)?.message).toBe('Memory Review started.')
    expect(notifications.at(-1)?.message).toBe('Memory Review finished: ok')

    runResult = { lastStatus: undefined }
    await run('run')
    expect(runCount).toBe(2)
    expect(notifications.at(-1)?.message).toBe('Memory Review finished: none')

    runError = new Error('boom')
    await run('run')
    expect(runCount).toBe(3)
    expect(notifications.at(-1)).toEqual({
      message: 'Memory Review failed: boom',
      level: 'error',
    })

    await run('wat')
    expect(notifications.at(-1)).toEqual({
      message: CORE_SOUL_MEMORY_REVIEW_COMMAND_USAGE,
      level: 'warn',
    })
  })

  it('plans Hermes file memory text mutations in core', () => {
    expect(splitHermesMemoryEntries(`One${CORE_HERMES_MEMORY_DELIMITER}Two\n`)).toEqual(['One', 'Two'])
    expect(sanitizeHermesMemoryEntry(`A${CORE_HERMES_MEMORY_DELIMITER}B`)).toBe('A\nB')
    expect(formatHermesMemoryEntries([' A ', '', `B${CORE_HERMES_MEMORY_DELIMITER}C`]))
      .toBe(`A${CORE_HERMES_MEMORY_DELIMITER}B\nC\n`)

    const added = planHermesMemoryEntryAdd('', 'First memory')
    expect(added).toMatchObject({ changed: true, matches: 1, beforeChars: 0 })
    expect(added.next).toBe('First memory\n')

    const replaced = planHermesMemoryTextReplace({
      existing: `Old${CORE_HERMES_MEMORY_DELIMITER}Keep\n`,
      oldText: 'Old',
      newText: 'New',
    })
    expect(replaced).toMatchObject({ changed: true, matches: 1 })
    expect(replaced.next).toBe(`New${CORE_HERMES_MEMORY_DELIMITER}Keep\n`)

    const missing = planHermesMemoryTextReplace({
      existing: 'Keep\n',
      oldText: 'Missing',
      newText: 'New',
    })
    expect(missing).toMatchObject({ changed: false, matches: 0, next: 'Keep\n' })

    const removed = planHermesMemoryTextRemove({
      existing: `A${CORE_HERMES_MEMORY_DELIMITER}B\n`,
      text: 'A',
    })
    expect(removed).toMatchObject({ changed: true, matches: 1 })
    expect(removed.next).toBe('B\n')
  })

  it('builds Hermes file memory prompt fragments in core', () => {
    const fragment = buildHermesMemoryPromptFragment({
      user: {
        file: { absolutePath: '/tmp/USER.md', relativePath: 'USER.md' },
        content: 'User memory.',
      },
      memory: {
        file: { absolutePath: '/tmp/MEMORY.md', relativePath: 'MEMORY.md' },
        content: 'Long memory.',
      },
      maxChars: 2000,
    })

    expect(fragment).toContain('# Hermes File Memory')
    expect(fragment).toContain('<hermes_user_memory>')
    expect(fragment).toContain('<hermes_long_term_memory>')

    expect(buildHermesMemoryPromptFragment({
      user: {
        file: { absolutePath: '/tmp/USER.md', relativePath: 'USER.md' },
        content: '',
      },
      memory: {
        file: { absolutePath: '/tmp/MEMORY.md', relativePath: 'MEMORY.md' },
        content: '',
      },
      maxChars: 2000,
    })).toBeNull()
  })

  it('handles Hermes memory tool actions in core through file adapters', async () => {
    const changed: Array<{ relativePath: string; reason: string }> = []
    const baseOptions = {
      enabled: true,
      getStatus: () => ({ files: 2 }),
      read: (target: 'user' | 'memory') => ({
        file: {
          absolutePath: `/root/${target.toUpperCase()}.md`,
          relativePath: `${target.toUpperCase()}.md`,
        },
        content: target === 'user' ? 'User profile' : '',
        entries: target === 'user' ? ['User profile'] : [],
      }),
      add: (target: 'user' | 'memory', content: string) => ({
        relativePath: `${target.toUpperCase()}.md`,
        content,
      }),
      replace: (target: 'user' | 'memory', oldText: string, newText: string, replaceAll?: boolean) => ({
        relativePath: `${target.toUpperCase()}.md`,
        changed: oldText === 'old',
        matches: oldText === 'old' ? 1 : 0,
        newText,
        replaceAll,
      }),
      remove: (target: 'user' | 'memory', text: string, removeAll?: boolean) => ({
        relativePath: `${target.toUpperCase()}.md`,
        changed: text === 'remove me',
        matches: text === 'remove me' ? 2 : 0,
        removeAll,
      }),
      markChanged: (relativePath: string, reason: string) => {
        changed.push({ relativePath, reason })
      },
    }
    const run = (args: Parameters<typeof handleSoulMemoryMemoryTool>[0]['args']) =>
      handleSoulMemoryMemoryTool({ ...baseOptions, args })

    await expect(handleSoulMemoryMemoryTool({
      ...baseOptions,
      enabled: false,
      args: { action: 'status' },
    })).resolves.toEqual({
      title: 'Memory disabled',
      output: 'Soul-memory is disabled in settings.',
      metadata: { disabled: true },
    })

    await expect(run({ action: 'status' })).resolves.toMatchObject({
      title: 'Hermes file memory status',
      output: JSON.stringify({ files: 2 }, null, 2),
      metadata: { files: 2 },
    })

    await expect(run({ action: 'read', target: 'user' })).resolves.toMatchObject({
      title: 'Hermes memory: USER.md',
      output: 'User profile',
      metadata: {
        target: 'user',
        path: '/root/USER.md',
        relativePath: 'USER.md',
        chars: 'User profile'.length,
        entries: 1,
      },
    })
    await expect(run({ action: 'read' })).resolves.toMatchObject({
      title: 'Hermes memory: MEMORY.md',
      output: 'MEMORY.md is empty.',
    })

    await expect(run({ action: 'add', content: 'new memory' })).resolves.toMatchObject({
      title: 'Hermes memory added: MEMORY.md',
      output: 'Added memory to MEMORY.md.',
    })
    await expect(run({ action: 'replace', oldText: 'old', newText: 'new' })).resolves.toMatchObject({
      title: 'Hermes memory replaced: MEMORY.md',
      output: 'Replaced 1 matching memory entry in MEMORY.md.',
    })
    await expect(run({ action: 'remove', text: 'remove me', all: true })).resolves.toMatchObject({
      title: 'Hermes memory removed: MEMORY.md',
      output: 'Removed 2 matching memory entries from MEMORY.md.',
    })

    expect(changed).toEqual([
      { relativePath: 'MEMORY.md', reason: 'hermes-memory-add' },
      { relativePath: 'MEMORY.md', reason: 'hermes-memory-replace' },
      { relativePath: 'MEMORY.md', reason: 'hermes-memory-remove' },
    ])

    await expect(run({ action: 'replace', oldText: 'missing', newText: 'new' })).resolves.toMatchObject({
      title: 'Hermes memory unchanged',
      output: 'No exact match found in MEMORY.md.',
    })
    await expect(run({ action: 'add' })).rejects.toThrow('content is required for memory action "add"')
    await expect(run({ action: 'replace', oldText: 'old' })).rejects.toThrow('newText is required for memory action "replace"')
    await expect(run({ action: 'remove' })).rejects.toThrow('text, oldText, or content is required for memory action "remove"')
  })

  it('handles soul get and update tools in core through file adapters', async () => {
    await expect(handleSoulMemorySoulGetTool({
      enabled: false,
      soulPath: '/root/SOUL.md',
      readSoulContent: () => {
        throw new Error('should not read disabled soul')
      },
    })).resolves.toEqual({
      title: 'Soul disabled',
      output: 'Soul-memory is disabled in settings.',
      metadata: { disabled: true },
    })

    await expect(handleSoulMemorySoulGetTool({
      enabled: true,
      soulPath: '/root/SOUL.md',
      readSoulContent: () => 'voice notes',
    })).resolves.toEqual({
      title: 'SOUL.md',
      output: 'voice notes',
      metadata: { path: '/root/SOUL.md' },
    })

    const updates: Array<{ content: string; mode: 'replace' | 'append'; heading?: string }> = []
    const update = (args: { content: string; mode: 'replace' | 'append'; heading?: string }) => {
      updates.push(args)
      return {
        mode: args.mode,
        absolutePath: '/root/SOUL.md',
        changed: true,
      }
    }

    await expect(handleSoulMemorySoulUpdateTool({
      args: { content: 'new voice' },
      update,
    })).resolves.toEqual({
      title: 'SOUL.md updated',
      output: 'SOUL.md updated at /root/SOUL.md. Tell the user what changed.',
      metadata: {
        mode: 'replace',
        absolutePath: '/root/SOUL.md',
        changed: true,
      },
    })

    await expect(handleSoulMemorySoulUpdateTool({
      args: { content: 'appendix', mode: 'append', heading: 'Tone' },
      update,
    })).resolves.toMatchObject({
      title: 'SOUL.md appended',
      output: 'SOUL.md appended at /root/SOUL.md. Tell the user what changed.',
    })

    expect(updates).toEqual([
      { content: 'new voice', mode: 'replace', heading: undefined },
      { content: 'appendix', mode: 'append', heading: 'Tone' },
    ])
  })

  it('formats memory_search tool results in core through search adapters', async () => {
    const calls: Array<{ query: string; limit?: number; minScore?: number }> = []
    const result = await handleSoulMemorySearchTool({
      args: {
        query: 'launch notes',
        limit: 3,
        maxResults: 2,
        minScore: 0.4,
      },
      search: input => {
        calls.push(input)
        return [
          { path: 'MEMORY.md', score: 0.9, content: 'Launch decision' },
          { path: 'USER.md', score: 0.8, content: 'Preference' },
        ]
      },
      formatHits: hits => hits.map(hit => `${hit.path}:${hit.score}`).join('\n'),
    })

    expect(calls).toEqual([{ query: 'launch notes', limit: 2, minScore: 0.4 }])
    expect(result).toEqual({
      title: 'Memory search: launch notes',
      output: 'MEMORY.md:0.9\nUSER.md:0.8',
      metadata: {
        count: 2,
        hits: [
          { path: 'MEMORY.md', score: 0.9, content: 'Launch decision' },
          { path: 'USER.md', score: 0.8, content: 'Preference' },
        ],
      },
    })
  })

  it('resolves memory_get tool results in core using graph, canonical, then file fallback', async () => {
    await expect(handleSoulMemoryGetTool({
      args: { path: 'MEMORY.md' },
      enabled: false,
      getGraph: () => null,
      getCanonical: () => null,
      readFileExcerpt: () => {
        throw new Error('should not read when disabled')
      },
    })).resolves.toEqual({
      title: 'Memory disabled',
      output: 'Soul-memory is disabled in settings.',
      metadata: { disabled: true },
    })

    await expect(handleSoulMemoryGetTool({
      args: { path: 'entity:e1' },
      enabled: true,
      getGraph: path => ({
        type: path.split(':')[0],
        output: 'Graph entity output',
        metadata: { id: 'e1' },
      }),
      getCanonical: () => null,
      readFileExcerpt: () => {
        throw new Error('graph should win')
      },
    })).resolves.toEqual({
      title: 'Graph memory: entity',
      output: 'Graph entity output',
      metadata: { id: 'e1' },
    })

    await expect(handleSoulMemoryGetTool({
      args: { path: 'profile:timezone' },
      enabled: true,
      getGraph: () => null,
      getCanonical: () => ({
        memoryKey: 'profile:timezone',
        text: 'User prefers UTC',
        kind: 'preference',
        subject: 'user',
        value: 'UTC',
        confidence: 0.875,
        evidence: 'Asked for UTC.',
      }),
      readFileExcerpt: () => {
        throw new Error('canonical should win')
      },
    })).resolves.toMatchObject({
      title: 'Canonical memory: profile:timezone',
      output: [
        'profile:timezone: User prefers UTC',
        'Kind: preference',
        'Subject: user',
        'Value: UTC',
        'Confidence: 0.88',
        'Evidence: Asked for UTC.',
      ].join('\n'),
    })

    await expect(handleSoulMemoryGetTool({
      args: { path: 'MEMORY.md', startLine: 2, lines: 2 },
      enabled: true,
      getGraph: () => null,
      getCanonical: () => null,
      readFileExcerpt: args => ({
        relativePath: args.path,
        text: 'line 2\nline 3',
        startLine: 2,
        endLine: 3,
        totalLines: 6,
        truncated: true,
      }),
    })).resolves.toEqual({
      title: 'Memory file: MEMORY.md',
      output: 'line 2\nline 3\n\n[More content available. Continue from line 4.]',
      metadata: {
        path: 'MEMORY.md',
        startLine: 2,
        endLine: 3,
        totalLines: 6,
        truncated: true,
      },
    })
  })

  it('handles soul commands in core through workspace and file adapters', async () => {
    const notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
    const followUps: string[] = []
    const workspace = {
      soulPath: '/tmp/SOUL.md',
      settings: {
        bootstrapMaxChars: 100,
      },
    }
    const run = (args: string) => handleSoulMemorySoulCommand({
      args,
      ctx: {
        sessionId: 'session-1',
        notify: (message, level) => notifications.push({ message, level }),
        followUp: content => followUps.push(content),
      },
      getWorkspace: () => workspace,
      readSoulContent: (_workspace, maxChars) => 'warm voice\n'.repeat(20).slice(0, maxChars),
    })

    await run('status')
    expect(notifications.at(-1)?.message).toContain('SOUL.md: /tmp/SOUL.md')

    await run('show')
    expect(notifications.at(-1)?.message).toContain('warm voice')

    await run('rewrite make the voice warmer')
    expect(followUps.at(-1)).toContain('make the voice warmer')
    expect(notifications.at(-1)?.message).toBe('Queued a SOUL.md revision request for the assistant.')

    await run('rewrite')
    expect(notifications.at(-1)).toEqual({
      message: 'Usage: /soul rewrite <instruction>',
      level: 'warn',
    })
  })

  it('formats memory status command output in core', () => {
    const output = formatSoulMemoryCommandStatus({
      root: '/memory-root',
      dbPath: '/memory-root/memory.db',
      userPath: '/memory-root/USER.md',
      memoryPath: '/memory-root/MEMORY.md',
      graph: {
        entities: 2,
        observations: 3,
        relations: 4,
        pendingDuplicates: 1,
      },
      canonicalRows: 5,
      index: {
        indexedFiles: 6,
        indexedChunks: 7,
        ftsTokenizer: 'unicode61',
        embeddingProvider: 'deepseek',
        embeddingModel: 'embedding-model',
        lastError: 'index failed',
        lastDreamingAt: Date.UTC(2026, 5, 25, 8, 0, 0),
        lastDreamingStatus: 'ok',
        lastDreamingApplied: 2,
      },
      review: {
        enabled: true,
        interval: 4,
        turnsUntilReview: 2,
        lastRunAt: Date.UTC(2026, 5, 25, 7, 0, 0),
        lastStatus: 'ok',
        lastApplied: 1,
      },
      dreaming: {
        enabled: true,
        frequency: '0 8 * * *',
        timezone: 'UTC',
        nextRunAt: Date.UTC(2026, 5, 26, 8, 0, 0),
      },
    })

    expect(output).toContain('Root: /memory-root')
    expect(output).toContain('Graph memory: 2 entities, 3 observations, 4 relations, 1 possible duplicates')
    expect(output).toContain('Legacy canonical rows: 5')
    expect(output).toContain('Embeddings: deepseek/embedding-model')
    expect(output).toContain('Memory Review: on, every 4 user turns (2 until next)')
    expect(output).toContain('Dreaming: on (0 8 * * *)')
    expect(output).toContain('Last error: index failed')
  })

  it('chunks indexed memory text with overlap without host workspace state', () => {
    const chunks = chunkSoulMemoryText(
      ['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta'].join('\n'),
      5,
      2,
      value => value.split(/\s+/).filter(Boolean).length,
    )

    expect(chunks).toEqual([
      { content: 'alpha beta\ngamma delta\nepsilon zeta', startLine: 1, endLine: 3, tokenCount: 6 },
      { content: 'epsilon zeta\neta theta', startLine: 3, endLine: 4, tokenCount: 4 },
    ])
  })

  it('normalizes search limits and selects MMR hits without database access', () => {
    expect(normalizeSoulMemorySearchLimit('8', 4)).toBe(8)
    expect(normalizeSoulMemorySearchLimit('bad', 30)).toBe(20)
    expect(scoreSoulMemorySearchHit({
      keywordScore: 1,
      vectorScore: 0.5,
      factor: 0.5,
    })).toBeCloseTo(0.3875)
    expect(scoreSoulMemorySearchHit({
      keywordScore: 0,
      vectorScore: 0.5,
      keywordWeight: 0.6,
      vectorWeight: 0.4,
      factor: 1.35,
    })).toBeCloseTo(0.27)
    expect(scoreSoulMemorySearchHit({ keywordScore: 0.25 })).toBeCloseTo(0.1375)
    expect(buildSoulMemoryGraphSearchHits({
      limit: 2,
      minScore: 0.2,
      candidates: [
        {
          ownerType: 'entity',
          ownerId: 'project:headless-core',
          content: 'Headless Core',
          keywordScore: 1,
        },
        {
          ownerType: 'observation',
          ownerId: 'obs-low',
          content: 'Low score',
          vectorScore: 0.1,
        },
        {
          ownerType: 'relation',
          ownerId: 'rel-1',
          content: 'User works on headless core.',
          vectorScore: 0.8,
        },
      ],
    }).map(hit => ({
      path: hit.path,
      kind: hit.kind,
      score: Number(hit.score.toFixed(3)),
    }))).toEqual([
      { path: 'entity:project:headless-core', kind: 'graph', score: 0.81 },
      { path: 'relation:rel-1', kind: 'graph', score: 0.432 },
    ])
    expect(buildSoulMemoryCanonicalSearchHits({
      limit: 1,
      candidates: [
        {
          id: 'memory-low',
          memoryKey: 'user.fact.low',
          displayText: 'low',
          keywordScore: 0.1,
        },
        {
          id: 'memory-pref',
          memoryKey: 'user.preference.status',
          displayText: 'user.preference.status: compact updates',
          keywordScore: 0.5,
          vectorScore: 0.75,
        },
      ],
    })).toMatchObject([
      {
        id: 'memory-pref',
        path: 'profile:user.preference.status',
        kind: 'canonical',
        content: 'user.preference.status: compact updates',
      },
    ])

    const hits = [
      { path: 'a.md', chunkIndex: 1, score: 0.95, id: 'a1' },
      { path: 'a.md', chunkIndex: 2, score: 0.9, id: 'a2' },
      { path: 'b.md', chunkIndex: 1, score: 0.8, id: 'b1' },
    ]
    expect(selectSoulMemoryMmrHits(hits, 2).map(hit => hit.id)).toEqual(['a1', 'b1'])
    const searchResult = buildSoulMemorySearchResult({
      graphHits: [hits[2]],
      markdownHits: [hits[0], hits[1]],
      limit: 2,
      mmrEnabled: true,
      embeddingsEnabled: true,
    })
    expect(searchResult.selected.map(hit => hit.id)).toEqual(['a1', 'b1'])
    expect(searchResult.summary).toEqual({
      graphHits: 1,
      markdownCandidates: 2,
      returned: 2,
      usedMmr: true,
      usedEmbeddings: true,
    })
  })

  it('builds markdown search hits and final selection in core', () => {
    const now = new Date('2026-06-25T00:00:00Z').getTime()
    const hits = buildSoulMemoryMarkdownSearchHits({
      temporalDecayHalfLifeDays: 7,
      minScore: 0.2,
      now,
      candidates: [
        {
          chunk: {
            id: 'daily-old',
            path: 'memory/2026-06-01.md',
            kind: 'daily',
            date: '2026-06-01',
            chunkIndex: 1,
            startLine: 1,
            endLine: 2,
            content: 'Old daily note',
          },
          keywordScore: 0.2,
        },
        {
          chunk: {
            id: 'memory-1',
            path: 'MEMORY.md',
            kind: 'memory',
            chunkIndex: 1,
            startLine: 10,
            endLine: 12,
            content: 'Stable memory',
          },
          keywordScore: 0.8,
          vectorScore: 0.6,
        },
        {
          chunk: {
            id: 'daily-recent',
            path: 'memory/2026-06-24.md',
            kind: 'daily',
            date: '2026-06-24',
            chunkIndex: 1,
            startLine: 3,
            endLine: 5,
            content: 'Recent daily note',
          },
          vectorScore: 0.7,
        },
      ],
    })

    expect(hits.map(hit => hit.id)).toEqual(['memory-1', 'daily-recent'])
    expect(hits[0]).toMatchObject({
      path: 'MEMORY.md',
      kind: 'memory',
      content: 'Stable memory',
      keywordScore: 0.8,
      vectorScore: 0.6,
    })

    expect(selectSoulMemorySearchHits([
      { id: 'a1', path: 'a.md', chunkIndex: 1, score: 0.95 },
      { id: 'a2', path: 'a.md', chunkIndex: 2, score: 0.9 },
      { id: 'b1', path: 'b.md', chunkIndex: 1, score: 0.8 },
    ], {
      limit: 2,
      mmrEnabled: true,
    }).map(hit => hit.id)).toEqual(['a1', 'b1'])
  })

  it('validates accessible managed memory relative paths in core', () => {
    expect(assertSoulMemoryAccessibleRelativePath('USER.md')).toBe('USER.md')
    expect(assertSoulMemoryAccessibleRelativePath('memory\\2026-06-25.md')).toBe('memory/2026-06-25.md')
    expect(() => assertSoulMemoryAccessibleRelativePath('SOUL.md')).toThrow(
      'Only USER.md, MEMORY.md, and files under memory/ can be accessed',
    )
    expect(() => assertSoulMemoryAccessibleRelativePath('DREAMS.md')).toThrow(
      'Only USER.md, MEMORY.md, and files under memory/ can be accessed',
    )
    expect(assertSoulMemoryAccessibleRelativePath('DREAMS.md', { allowDreams: true })).toBe('DREAMS.md')
  })

  it('formats temporal helpers and flush inputs in core', () => {
    const now = new Date('2026-06-25T00:00:00').getTime()
    expect(soulMemoryTemporalFactor({ kind: 'memory' }, 7, now)).toBe(1)
    expect(soulMemoryTemporalFactor({ kind: 'daily', date: '2026-06-18' }, 7, now)).toBeCloseTo(0.5)
    expect(formatSoulMemoryMaybeTimestamp(undefined)).toBe('never')
    expect(formatSoulMemoryMessagesForFlush([
      { role: 'system', content: 'ignore' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ], 200)).toBe('User: hello\n\nAssistant: hi')
  })

  it('keeps active-memory cache and circuit breaker state in core', async () => {
    let now = 1000
    const runtime = new CoreSoulMemoryActiveMemoryRuntime({ now: () => now })

    expect(runtime.getCache('query')).toBeUndefined()
    runtime.setCache('query', 'summary', 50)
    expect(runtime.getCache('query')).toBe('summary')
    now = 1051
    expect(runtime.getCache('query')).toBeUndefined()

    runtime.setCache('empty', null, 100)
    expect(runtime.getCache('empty')).toBeNull()

    const settings = {
      circuitBreakerMaxTimeouts: 2,
      circuitBreakerCooldownMs: 500,
    }
    expect(runtime.getCooldown('provider:model')).toEqual({
      active: false,
      remainingMs: 0,
    })
    runtime.recordTimeout('provider:model', settings)
    expect(runtime.getCooldown('provider:model')).toEqual({
      active: false,
      remainingMs: 0,
    })
    runtime.recordTimeout('provider:model', settings)
    expect(runtime.getCooldown('provider:model')).toEqual({
      active: true,
      remainingMs: 500,
      cooldownUntil: 1551,
      timeoutCount: 2,
    })
    runtime.clearTimeout('provider:model')
    expect(runtime.getCooldown('provider:model').active).toBe(false)

    await expect(runtime.withTimeout(new Promise<string>(() => undefined), 1))
      .rejects.toThrow('timeout')
  })

  it('builds capture and dreaming prompt inputs in core', async () => {
    expect(buildSoulMemoryCaptureInput({
      context: {
        messages: [
          { role: 'user', content: 'remember Bun' },
          { role: 'assistant', content: 'noted' },
        ],
        lastUserMessage: 'remember Bun',
        lastAssistantMessage: 'noted',
      },
      dailyRelativePath: 'memory/2026-06-25.md',
      dailyContent: '- Existing daily note.',
      maxChars: 1000,
    })).toContain('Current daily note (memory/2026-06-25.md):')

    await expect(buildSoulMemoryCaptureInputWithAdapters({
      context: {
        messages: [
          { role: 'user', content: 'remember Bun' },
          { role: 'assistant', content: 'noted' },
        ],
        lastUserMessage: 'remember Bun',
        lastAssistantMessage: 'noted',
      },
      dailyRelativePath: 'memory/2026-06-25.md',
      readDailyContent: () => '- Adapter daily note.',
      maxChars: 1000,
    })).resolves.toContain('- Adapter daily note.')

    expect(compactSoulMemoryCaptureInput({
      messages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'remember Bun' },
        { role: 'assistant', content: 'noted' },
      ],
      lastUserMessage: 'remember Bun',
      lastAssistantMessage: 'noted',
    }, 1000)).toContain('Latest assistant response:\nnoted')

    expect(buildSoulMemoryDreamingInput([
      { relativePath: '2026-06-25.md', sourceType: 'daily', content: 'Today we moved logic to core.' },
    ], 1000)).toBe('## daily:2026-06-25.md\nToday we moved logic to core.')

    const now = new Date('2026-06-25T00:00:00Z').getTime()
    expect(selectSoulMemoryDailyDreamingSources([
      {
        sourceType: 'daily',
        relativePath: 'memory/2026-06-25.md',
        date: '2026-06-25',
        content: '# 2026-06-25\nFresh note',
        mtimeMs: 300,
      },
      {
        sourceType: 'daily',
        relativePath: 'memory/2026-06-24.md',
        date: '2026-06-24',
        content: '# 2026-06-24\nOlder note',
        mtimeMs: 400,
      },
      {
        sourceType: 'daily',
        relativePath: 'memory/2026-06-10.md',
        date: '2026-06-10',
        content: 'Too old',
        mtimeMs: 500,
      },
      {
        sourceType: 'daily',
        relativePath: 'memory/heading-only.md',
        content: '# 2026-06-25\n',
        mtimeMs: 600,
      },
    ], {
      now,
      lookbackDays: 7,
      maxSourceFiles: 1,
    }).map(source => source.relativePath)).toEqual(['memory/2026-06-24.md'])

    await expect(collectSoulMemoryDailyDreamingSourcesWithAdapters([
      {
        kind: 'daily',
        absolutePath: '/memory/2026-06-25.md',
        relativePath: 'memory/2026-06-25.md',
        date: '2026-06-25',
      },
      {
        kind: 'profile',
        absolutePath: '/memory/USER.md',
        relativePath: 'USER.md',
      },
      {
        kind: 'daily',
        absolutePath: '/memory/missing.md',
        relativePath: 'memory/missing.md',
      },
      {
        kind: 'daily',
        absolutePath: '/memory/heading-only.md',
        relativePath: 'memory/heading-only.md',
        date: '2026-06-25',
      },
    ], {
      now,
      lookbackDays: 7,
      maxSourceFiles: 2,
      statFile: absolutePath => absolutePath.includes('missing') ? null : { mtimeMs: absolutePath.includes('heading') ? 600 : 500 },
      readFile: absolutePath => absolutePath.includes('heading') ? '# 2026-06-25\n' : 'Useful daily note',
    })).resolves.toEqual([
      {
        sourceType: 'daily',
        relativePath: 'memory/2026-06-25.md',
        content: 'Useful daily note',
        mtimeMs: 500,
        date: '2026-06-25',
      },
    ])

    expect(buildSoulMemoryExistingMemorySummary({
      graphSummary: 'User prefers concise updates.',
      memoryContent: 'Project uses Bun.',
    })).toContain('## Existing MEMORY.md')

    expect(buildSoulMemoryReviewInput({
      messages: [
        { role: 'user', content: 'Please remember Bun.' },
        { role: 'assistant', content: 'Noted.' },
      ],
      soulContent: 'Soul fact.',
      dreamsContent: '',
      userContent: 'User fact.',
      memoryContent: 'Long-term fact.',
      maxChars: 2000,
    })).toContain('# Conversation snapshot')
  })

  it('builds memory review input through core read adapters', async () => {
    const calls: string[] = []
    const input = await buildSoulMemoryReviewInputWithAdapters({
      messages: [
        { role: 'user', content: 'Keep this in memory.' },
        { role: 'assistant', content: 'Saved.' },
      ],
      maxChars: 3000,
      async readPlain(target) {
        calls.push(`plain:${target}`)
        return {
          relativePath: target === 'soul' ? 'SOUL.md' : 'DREAMS.md',
          content: `${target} content`,
        }
      },
      async readHermes(target) {
        calls.push(`hermes:${target}`)
        return {
          relativePath: `${target.toUpperCase()}.md`,
          content: `${target} content`,
          entries: [`${target} content`],
        }
      },
    })

    expect(calls.sort()).toEqual(['hermes:memory', 'hermes:user', 'plain:dreams', 'plain:soul'])
    expect(input).toContain('# Existing SOUL.md')
    expect(input).toContain('soul content')
    expect(input).toContain('# Existing USER.md')
    expect(input).toContain('memory content')
    expect(input).toContain('# Conversation snapshot')
  })

  it('builds soul-memory prompt context fragments in core', () => {
    const fragments = buildSoulMemoryPromptFragments({
      rulesPrompt: 'Rules',
      soulPath: '/memory/SOUL.md',
      soulContent: 'Soul content',
      hermesFileMemory: 'Hermes memory',
      graphProfile: 'Graph facts',
      dailyContext: 'Daily notes',
      activeMemory: 'Active recall',
    })

    expect(fragments.map(fragment => `${fragment.role}:${fragment.source}`)).toEqual([
      'developer:memory/soul-memory-rules',
      'developer:plugins/soul-memory/SOUL.md',
      'user:plugins/soul-memory/hermes-file-memory',
      'user:plugins/soul-memory/graph-profile',
      'user:plugins/soul-memory/recent-daily-memory',
      'user:plugins/soul-memory/active-memory',
    ])
    expect(fragments[1].content).toContain('Path: /memory/SOUL.md')
    expect(fragments[3].content).toContain('<graph_memory>\nGraph facts\n</graph_memory>')
    expect(fragments[4].content).toContain('<recent_daily_memory>\nDaily notes\n</recent_daily_memory>')
    expect(fragments[5].content).toContain('<active_memory_plugin>\nActive recall\n</active_memory_plugin>')
  })

  it('patches nested soul-memory settings sections without host store access', () => {
    const settings = {
      general: {
        locale: 'zh-CN',
        soulMemory: {
          dreaming: {
            enabled: true,
            frequency: '0 3 * * *',
          },
          capture: {
            enabled: true,
          },
        },
      },
      ai: { provider: 'deepseek' },
    }

    expect(patchSoulMemorySettingsSection(settings, 'dreaming', {
      frequency: '0 4 * * *',
      timezone: 'Asia/Shanghai',
    })).toEqual({
      general: {
        locale: 'zh-CN',
        soulMemory: {
          dreaming: {
            enabled: true,
            frequency: '0 4 * * *',
            timezone: 'Asia/Shanghai',
          },
          capture: {
            enabled: true,
          },
        },
      },
      ai: { provider: 'deepseek' },
    })

    expect(patchSoulMemorySettingsSection({ general: {} }, 'review', {
      enabled: false,
    })).toEqual({
      general: {
        soulMemory: {
          review: {
            enabled: false,
          },
        },
      },
    })
  })

  it('patches soul-memory settings sections through core host adapters', () => {
    let settings = {
      general: {
        soulMemory: {
          review: {
            enabled: true,
            intervalTurns: 8,
          },
        },
      },
    }
    const writes: Array<typeof settings> = []

    const result = patchSoulMemorySettingsSectionWithAdapters({
      section: 'review',
      patch: { intervalTurns: 12 },
      getSettings: () => settings,
      saveSettings: next => {
        settings = next
        writes.push(next)
      },
      resolveSettings: current => ({
        review: {
          enabled: Boolean((current.general.soulMemory as any).review.enabled),
          intervalTurns: Number((current.general.soulMemory as any).review.intervalTurns),
        },
      }),
      selectSection: resolved => resolved.review,
    })

    expect(result).toEqual({ enabled: true, intervalTurns: 12 })
    expect(writes).toHaveLength(1)
    expect(settings.general.soulMemory.review.intervalTurns).toBe(12)
  })

  it('formats hits and stable keys in core', () => {
    expect(formatSoulMemoryHits([
      {
        path: 'MEMORY.md',
        startLine: 1,
        endLine: 2,
        score: 0.91234,
        content: 'A useful memory snippet.',
      },
    ])).toBe('1. MEMORY.md:1-2 score=0.912\nA useful memory snippet.')

    expect(soulMemoryActiveMemoryKey('agent', 'session', 'query', value => `hash:${value.length}`))
      .toBe('hash:19')
    expect(soulMemoryCircuitKey(undefined, 'model')).toBe('unknown:model')
  })

  it('decides daily context injection without session store access', () => {
    expect(shouldInjectSoulMemoryDailyContext({
      settings: { enabled: false, mode: 'always' },
      sessionId: 's1',
      userTurnCount: 10,
    })).toBe(false)
    expect(shouldInjectSoulMemoryDailyContext({
      settings: { enabled: true, mode: 'always' },
    })).toBe(true)
    expect(shouldInjectSoulMemoryDailyContext({
      settings: { enabled: true, mode: 'session-start' },
    })).toBe(false)
    expect(shouldInjectSoulMemoryDailyContext({
      settings: { enabled: true, mode: 'session-start' },
      sessionId: 's1',
      userTurnCount: 1,
    })).toBe(true)
    expect(shouldInjectSoulMemoryDailyContext({
      settings: { enabled: true, mode: 'session-start' },
      sessionId: 's1',
      userTurnCount: 2,
    })).toBe(false)
  })

  it('selects and formats daily context files in core', () => {
    expect(selectSoulMemoryDailyContextFiles([
      { name: '2026-06-24.md', isFile: true },
      { name: '2026-06-25-work.md', isFile: true },
      { name: '2026-06-25.md', isFile: true },
      { name: '2026-06-23.md', isFile: true },
      { name: '2026-06-25.txt', isFile: true },
      { name: '2026-06-25-dir.md', isFile: false },
    ], new Set(['2026-06-24', '2026-06-25']))).toEqual([
      { date: '2026-06-25', name: '2026-06-25-work.md' },
      { date: '2026-06-25', name: '2026-06-25.md' },
      { date: '2026-06-24', name: '2026-06-24.md' },
    ])

    expect(buildSoulMemoryDailyContextFragment([
      { relativePath: 'memory/2026-06-25.md', content: '  Today moved logic.  ' },
      { relativePath: 'memory/empty.md', content: '   ' },
      { relativePath: 'memory/2026-06-24.md', content: 'Yesterday notes.' },
    ], 1000)).toBe([
      '## memory/2026-06-25.md',
      '',
      'Today moved logic.',
      '',
      '## memory/2026-06-24.md',
      '',
      'Yesterday notes.',
    ].join('\n'))

    expect(buildSoulMemoryDailyContextFragment([
      { relativePath: 'memory/empty.md', content: '   ' },
    ], 1000)).toBeNull()
  })

  it('builds recent daily context through core filesystem adapters', async () => {
    const readPaths: Array<{ path: string; maxChars: number }> = []
    const fragment = await buildSoulMemoryRecentDailyContextFragmentWithAdapters({
      root: '/workspace',
      memoryDir: '/workspace/memory',
      sessionId: 's1',
      settings: {
        enabled: true,
        mode: 'session-start',
        daysBack: 1,
        maxChars: 1000,
      },
      adapters: {
        userTurnCount: () => 1,
        dateForDaysAgo: daysAgo => daysAgo === 0 ? '2026-06-25' : '2026-06-24',
        async listEntries() {
          return [
            { name: '2026-06-25.md', isFile: true },
            { name: '2026-06-24-work.md', isFile: true },
            { name: '2026-06-23.md', isFile: true },
            { name: '2026-06-25.txt', isFile: true },
          ]
        },
        joinPath: (root, name) => `${root}/${name}`,
        relativePath: (root, absolutePath) => absolutePath.replace(`${root}/`, ''),
        readContent: (absolutePath, maxChars) => {
          readPaths.push({ path: absolutePath, maxChars })
          return absolutePath.endsWith('2026-06-25.md')
            ? 'Today note.'
            : 'Yesterday work note.'
        },
      },
    })

    expect(fragment).toBe([
      '## memory/2026-06-25.md',
      '',
      'Today note.',
      '',
      '## memory/2026-06-24-work.md',
      '',
      'Yesterday work note.',
    ].join('\n'))
    expect(readPaths).toEqual([
      { path: '/workspace/memory/2026-06-25.md', maxChars: 1000 },
      { path: '/workspace/memory/2026-06-24-work.md', maxChars: 1000 },
    ])

    await expect(buildSoulMemoryRecentDailyContextFragmentWithAdapters({
      root: '/workspace',
      memoryDir: '/workspace/memory',
      sessionId: 's1',
      settings: {
        enabled: true,
        mode: 'session-start',
        daysBack: 1,
        maxChars: 1000,
      },
      adapters: {
        userTurnCount: () => 2,
        dateForDaysAgo: () => '2026-06-25',
        listEntries: async () => {
          throw new Error('should be gated before listing')
        },
        joinPath: (root, name) => `${root}/${name}`,
        relativePath: (root, absolutePath) => absolutePath.replace(`${root}/`, ''),
        readContent: () => '',
      },
    })).resolves.toBeNull()

    await expect(buildSoulMemoryRecentDailyContextFragmentWithAdapters({
      root: '/workspace',
      memoryDir: '/workspace/memory',
      sessionId: 's1',
      settings: {
        enabled: true,
        mode: 'always',
        daysBack: 0,
        maxChars: 1000,
      },
      adapters: {
        dateForDaysAgo: () => '2026-06-25',
        listEntries: async () => {
          throw new Error('directory unavailable')
        },
        joinPath: (root, name) => `${root}/${name}`,
        relativePath: (root, absolutePath) => absolutePath.replace(`${root}/`, ''),
        readContent: () => '',
      },
    })).resolves.toBeNull()
  })

  it('updates active-memory timeout circuit breaker state in core', () => {
    const settings = {
      circuitBreakerMaxTimeouts: 2,
      circuitBreakerCooldownMs: 5000,
    }
    const first = recordSoulMemoryActiveMemoryTimeout({
      settings,
      now: 1000,
    })
    expect(first).toEqual({
      count: 1,
      cooldownUntil: 0,
    })
    expect(getSoulMemoryActiveMemoryCooldown({ state: first, now: 1000 })).toEqual({
      active: false,
      remainingMs: 0,
    })

    const second = recordSoulMemoryActiveMemoryTimeout({
      existing: first,
      settings,
      now: 2000,
    })
    expect(second).toEqual({
      count: 2,
      cooldownUntil: 7000,
    })
    expect(getSoulMemoryActiveMemoryCooldown({ state: second, now: 2500 })).toEqual({
      active: true,
      remainingMs: 4500,
      cooldownUntil: 7000,
      timeoutCount: 2,
    })
  })

  it('builds timeline entries and status text in core', () => {
    expect(createSoulMemoryTimelineEntry(
      { type: 'step', title: 'Dreamed', status: 'ok' },
      { now: () => 123, randomId: () => 'entry-1' },
    )).toEqual({
      id: 'entry-1',
      timestamp: 123,
      type: 'step',
      title: 'Dreamed',
      status: 'ok',
    })

    expect(formatSoulMemoryDreamingStatus({
      enabled: true,
      frequency: '0 9 * * *',
      timezone: '',
      model: 'deepseek/deepseek-chat',
      lookbackDays: 7,
      maxSourceFiles: 5,
      maxPromotions: 3,
      minScore: 0.7,
      timeoutMs: 30000,
      lastSourceFiles: ['a.md', 'b.md'],
      inFlight: false,
      lastStatus: 'ok',
      lastApplied: 2,
    })).toContain('Last result: ok, applied 2')

    expect(formatSoulMemoryReviewStatus({
      enabled: true,
      interval: 6,
      maxInputChars: 12000,
      timeoutMs: 20000,
      maxCandidates: 4,
      minConfidence: 0.75,
      userTurns: 10,
      turnsUntilReview: 2,
      lastReviewedTurn: 8,
    })).toContain('Last reviewed turn: 8')
  })

  it('builds dreaming and review status DTOs in core', () => {
    const storeValues = new Map<string, unknown>([
      ['lastDreamingNextRunAt', 200],
      ['lastDreamingAt', 300],
      ['lastDreamingApplied', 4],
      ['lastDreamingStatus', 'stored-dream'],
      ['lastDreamingSourceFiles', ['memory/2026-01-01.md']],
      ['lastReviewAt', 500],
      ['lastReviewApplied', 2],
      ['lastReviewStatus', 'stored-review'],
      ['review:last:agent-a:s1', 2],
    ])
    const store = {
      get: <T,>(key: string) => storeValues.get(key) as T | undefined,
    }

    expect(buildSoulMemoryDreamingStatus({
      settings: {
        enabled: true,
        frequency: '0 9 * * *',
        timezone: 'Asia/Shanghai',
        lookbackDays: 7,
        maxSourceFiles: 5,
        maxPromotions: 3,
        minScore: 0.8,
        timeoutMs: 30000,
      },
      model: 'deepseek/deepseek-chat',
      next: { nextRunAt: 100 },
      scheduled: { nextRunAt: 50, lastRunReason: 'scheduled' },
      store,
      runtimeStatus: { lastDreamingStatus: 'runtime-dream', lastDreamingNextRunAt: 900 },
      inFlight: true,
    })).toMatchObject({
      nextRunAt: 50,
      lastRunAt: 300,
      lastApplied: 4,
      lastStatus: 'stored-dream',
      lastSourceFiles: ['memory/2026-01-01.md'],
      inFlight: true,
    })

    expect(buildSoulMemoryPublicDreamingStatus({
      settings: {
        enabled: true,
        frequency: '0 9 * * *',
        timezone: 'UTC',
        lookbackDays: 7,
        maxSourceFiles: 5,
        maxPromotions: 3,
        minScore: 0.8,
        timeoutMs: 30000,
      },
      resolveNextRunAt: () => 123,
    }).nextRunAt).toBe(123)
    expect(buildSoulMemoryPublicDreamingStatus({
      settings: {
        enabled: false,
        frequency: '0 9 * * *',
        timezone: 'UTC',
        lookbackDays: 7,
        maxSourceFiles: 5,
        maxPromotions: 3,
        minScore: 0.8,
        timeoutMs: 30000,
      },
      resolveNextRunAt: () => 123,
    }).nextRunAt).toBeUndefined()

    expect(buildSoulMemoryReviewStatus({
      enabled: true,
      settings: {
        enabled: true,
        interval: 5,
        maxInputChars: 12000,
        timeoutMs: 20000,
        maxCandidates: 4,
        minConfidence: 0.75,
      },
      progress: {
        userTurns: 13,
        turnsSinceReview: 3,
        turnsUntilReview: 2,
        shouldReview: false,
      },
      lastReviewedTurn: 10,
      store,
      runtimeStatus: { lastReviewStatus: 'runtime-review' },
    })).toMatchObject({
      enabled: true,
      interval: 5,
      userTurns: 13,
      turnsUntilReview: 2,
      lastRunAt: 500,
      lastApplied: 2,
      lastStatus: 'stored-review',
      lastReviewedTurn: 10,
    })

    expect(buildSoulMemoryReviewStatusWithAdapters({
      enabled: true,
      settings: {
        enabled: true,
        interval: 3,
        maxInputChars: 12000,
        timeoutMs: 20000,
        maxCandidates: 4,
        minConfidence: 0.75,
      },
      messages: [
        { role: 'user' },
        { role: 'assistant' },
        { role: 'user' },
        { role: 'user' },
      ],
      keyPrefix: 'review:last:',
      agentId: 'agent-a',
      sessionId: 's1',
      store,
      runtimeStatus: { lastReviewStatus: 'runtime-review' },
    })).toMatchObject({
      enabled: true,
      userTurns: 3,
      turnsSinceReview: 0,
      turnsUntilReview: 0,
      shouldReview: true,
      lastReviewedTurn: 2,
      lastRunAt: 500,
      lastStatus: 'stored-review',
    })

    const overview = buildSoulMemoryOverview({
      workspace: {
        enabled: true,
        agentId: 'agent-a',
        root: '/memory-root',
        memoryDir: '/memory-root/memory',
        soulPath: '/memory-root/SOUL.md',
        userPath: '/memory-root/USER.md',
        memoryPath: '/memory-root/MEMORY.md',
        dreamsPath: '/memory-root/DREAMS.md',
        todayPath: '/memory-root/memory/2026-06-25.md',
        dbPath: '/memory-root/memory.sqlite',
        settings: { enabled: true },
      },
      status: {
        chunks: 1,
        lastCaptureStatus: 'runtime-capture',
      },
      captureStatusStore: {
        get: <T,>(key: string) => ({
          lastCaptureAt: 700,
          lastCaptureStatus: 'stored-capture',
        }[key] as T | undefined),
      },
      dreaming: { enabled: true },
      pendingCaptures: [{ id: 'capture-1' }],
      canonicalCount: 3,
      graph: { entities: 2 },
      files: [{ relativePath: 'MEMORY.md' }],
    })

    expect(overview).toMatchObject({
      enabled: true,
      agentId: 'agent-a',
      root: '/memory-root',
      status: {
        chunks: 1,
        lastCaptureAt: 700,
        lastCaptureStatus: 'stored-capture',
      },
      pendingCaptures: [{ id: 'capture-1' }],
      canonicalCount: 3,
      graph: { entities: 2 },
      files: [{ relativePath: 'MEMORY.md' }],
    })
  })

  it('resolves dreaming next-run status through an injected scheduler', () => {
    const from = new Date('2026-06-25T00:00:00Z')
    expect(getSoulMemoryDreamingNextRunStatus(
      { frequency: '0 9 * * *', timezone: 'Asia/Shanghai' },
      (_frequency, _timezone, inputFrom) => inputFrom.getTime() + 1000,
      from,
    )).toEqual({ nextRunAt: from.getTime() + 1000 })

    expect(getSoulMemoryDreamingNextRunStatus(
      { frequency: 'bad', timezone: 'UTC' },
      () => {
        throw new Error('invalid cron')
      },
      from,
    )).toEqual({ error: 'invalid cron' })
  })

  it('plans dreaming run store and runtime status mutations in core', async () => {
    expect(planSoulMemoryDreamingRunStatusMutation({
      status: 'applied',
      applied: 2,
      sourceFiles: ['memory/2026-06-25.md'],
      runAt: 100,
      nextRunAt: 200,
    })).toEqual({
      storeSet: [
        ['lastDreamingAt', 100],
        ['lastDreamingApplied', 2],
        ['lastDreamingStatus', 'applied'],
        ['lastDreamingSourceFiles', ['memory/2026-06-25.md']],
        ['lastDreamingNextRunAt', 200],
      ],
      storeDelete: ['lastDreamingError'],
      runtimePatch: {
        lastDreamingAt: 100,
        lastDreamingApplied: 2,
        lastDreamingStatus: 'applied',
        lastDreamingSourceFiles: ['memory/2026-06-25.md'],
        lastDreamingNextRunAt: 200,
      },
      runtimeDelete: ['lastDreamingError'],
    })

    expect(planSoulMemoryDreamingErrorStatusMutation('provider unavailable')).toEqual({
      storeSet: [
        ['lastDreamingError', 'provider unavailable'],
      ],
      storeDelete: [],
      runtimePatch: {
        lastDreamingError: 'provider unavailable',
        lastDreamingStatus: 'error',
      },
      runtimeDelete: [],
    })

    expect(planSoulMemoryCaptureSuccessStatusMutation({
      status: 'approved',
      capturedAt: 123,
    })).toEqual({
      storeSet: [
        ['lastCaptureAt', 123],
        ['lastCaptureStatus', 'approved'],
      ],
      storeDelete: ['lastCaptureError'],
      runtimePatch: {
        lastCaptureAt: 123,
        lastCaptureStatus: 'approved',
      },
      runtimeDelete: ['lastCaptureError'],
    })
    expect(planSoulMemoryCaptureErrorStatusMutation('capture failed')).toEqual({
      storeSet: [
        ['lastCaptureError', 'capture failed'],
        ['lastCaptureStatus', 'error'],
      ],
      storeDelete: [],
      runtimePatch: {
        lastCaptureError: 'capture failed',
        lastCaptureStatus: 'error',
      },
      runtimeDelete: [],
    })
    expect(planSoulMemoryCaptureDiscardStatusMutation()).toEqual({
      storeSet: [
        ['lastCaptureStatus', 'discarded'],
      ],
      storeDelete: [],
      runtimePatch: {
        lastCaptureStatus: 'discarded',
      },
      runtimeDelete: [],
    })
    expect(planSoulMemoryCaptureRuntimeStatusMutation('none')).toEqual({
      storeSet: [],
      storeDelete: [],
      runtimePatch: {
        lastCaptureStatus: 'none',
      },
      runtimeDelete: [],
    })

    expect(formatSoulMemoryDreamingRunSummary({
      status: 'applied',
      applied: 2,
      sourceFiles: ['memory/2026-06-25.md'],
      nextRunAt: Date.UTC(2026, 5, 26, 1, 0, 0),
      timezone: 'UTC',
    })).toContain('Sources: memory/2026-06-25.md')
    expect(formatSoulMemoryDreamingRunSummary({
      status: 'skipped',
      applied: 0,
      sourceFiles: [],
    })).toContain('Sources: none')

    expect(planSoulMemoryManualDreamingRun({
      defaultAgentId: 'default',
      hasActivePluginApi: true,
    })).toEqual({
      route: 'scheduler',
      agentId: 'default',
      reason: 'manual',
      force: true,
    })
    expect(planSoulMemoryManualDreamingRun({
      agentId: 'agent-2',
      defaultAgentId: 'default',
      hasActivePluginApi: true,
    })).toEqual({
      route: 'plugin-api',
      agentId: 'agent-2',
      reason: 'manual',
      force: true,
    })
    expect(planSoulMemoryManualDreamingRun({
      agentId: 'agent-2',
      defaultAgentId: 'default',
      hasActivePluginApi: false,
    })).toEqual({
      route: 'scheduler',
      agentId: 'agent-2',
      reason: 'manual',
      force: true,
    })

    await expect(runSoulMemoryManualDreamingWithAdapters({
      agentId: 'agent-2',
      defaultAgentId: 'default',
      hasActivePluginApi: true,
      runWithPluginApi: async plan => ({
        source: plan.route,
        agentId: plan.agentId,
      }),
      runWithScheduler: async () => {
        throw new Error('scheduler should not run')
      },
    })).resolves.toEqual({
      source: 'plugin-api',
      agentId: 'agent-2',
    })

    await expect(runSoulMemoryManualDreamingWithAdapters({
      agentId: 'agent-2',
      defaultAgentId: 'default',
      hasActivePluginApi: false,
      runWithPluginApi: async () => {
        throw new Error('plugin should not run')
      },
      runWithScheduler: async plan => ({
        ok: true,
        result: {
          source: plan.route,
          agentId: plan.agentId,
        },
      }),
    })).resolves.toEqual({
      source: 'scheduler',
      agentId: 'agent-2',
    })

    await expect(runSoulMemoryManualDreamingWithAdapters({
      defaultAgentId: 'default',
      hasActivePluginApi: false,
      runWithPluginApi: async () => null,
      runWithScheduler: async () => ({
        ok: false,
        error: 'scheduler failed',
      }),
    })).rejects.toThrow('scheduler failed')
  })

  it('applies status mutation plans to an injected store and runtime status in core', () => {
    const storeValues = new Map<string, unknown>([
      ['lastDreamingError', 'old error'],
    ])
    const runtimeStatus = {
      lastDreamingError: 'old error',
      lastDreamingStatus: 'error',
    }

    applySoulMemoryStatusMutationPlan({
      store: {
        set: (key, value) => storeValues.set(key, value),
        delete: key => storeValues.delete(key),
      },
      runtimeStatus,
      plan: planSoulMemoryDreamingRunStatusMutation({
        status: 'applied',
        applied: 1,
        sourceFiles: ['memory/2026-06-25.md'],
        runAt: 100,
        nextRunAt: 200,
      }),
    })

    expect(storeValues.get('lastDreamingStatus')).toBe('applied')
    expect(storeValues.has('lastDreamingError')).toBe(false)
    expect(runtimeStatus).toMatchObject({
      lastDreamingStatus: 'applied',
      lastDreamingApplied: 1,
      lastDreamingNextRunAt: 200,
    })
    expect(runtimeStatus.lastDreamingError).toBeUndefined()
  })

  it('runs memory dreaming sweep in core through model and memory adapters', async () => {
    let nowMs = 1000
    const runAt = new Date('2026-06-25T08:00:00Z')
    const dreaming = {
      enabled: true,
      frequency: '0 8 * * *',
      timezone: 'UTC',
      lookbackDays: 7,
      maxSourceFiles: 3,
      maxPromotions: 2,
      minScore: 0.7,
      timeoutMs: 1000,
      maxInputChars: 4000,
    }
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    let generatedPrompt = ''
    const base = {
      reason: 'manual',
      enabled: true,
      dreaming,
      force: true,
      now: runAt,
      hash: (value: string) => `hash:${value.length}:${value.slice(0, 8)}`,
      collectSources: () => [
        {
          relativePath: 'memory/2026-06-25.md',
          sourceType: 'daily',
          content: '- 用户今天确认 start-electron 使用 Bun scripts。',
        },
      ],
      getNextRunAt: () => ({ nextRunAt: Date.UTC(2026, 5, 26, 8, 0, 0) }),
      getExistingMemory: () => '- Existing durable memory.',
      resolveProvider: () => ({
        provider: { id: 'provider' },
        modelRef: 'deepseek/deepseek-chat',
        source: 'tools',
      }),
      generateDreaming: ({ system, prompt }: { system: string; prompt: string }) => {
        expect(system).toContain(CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT)
        expect(system).toContain('score >= 0.7')
        generatedPrompt = prompt
        return JSON.stringify({
          action: 'dream',
          confidence: 0.9,
          memories: [
            {
              action: 'add',
              confidence: 0.92,
              content: 'User prefers Bun scripts in start-electron.',
            },
          ],
        })
      },
      applyMemoryActions: () => ({
        applied: 1,
        block: '- User prefers Bun scripts in start-electron.',
        added: 1,
        replaced: 0,
        removed: 0,
        skipped: 0,
      }),
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      nowMs: () => nowMs,
    }

    await expect(runSoulMemoryDreamingSweep(base)).resolves.toMatchObject({
      status: 'applied',
      applied: 1,
      sourceFiles: ['memory/2026-06-25.md'],
      memory: '- User prefers Bun scripts in start-electron.',
      runAt: runAt.getTime(),
      nextRunAt: Date.UTC(2026, 5, 26, 8, 0, 0),
    })
    expect(generatedPrompt).toContain('Existing memory:\n- Existing durable memory.')
    expect(generatedPrompt).toContain('Daily notes to consolidate:')
    expect(statusPlans.at(-1)).toMatchObject({
      storeSet: [
        ['lastDreamingAt', runAt.getTime()],
        ['lastDreamingApplied', 1],
        ['lastDreamingStatus', 'applied'],
        ['lastDreamingSourceFiles', ['memory/2026-06-25.md']],
        ['lastDreamingNextRunAt', Date.UTC(2026, 5, 26, 8, 0, 0)],
      ],
    })
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'sweep', stage: 'start', status: 'started' }),
      expect.objectContaining({ operation: 'model-sweep', stage: 'request', status: 'started' }),
      expect.objectContaining({ operation: 'sweep', stage: 'finish', status: 'ok' }),
    ]))

    nowMs = 2000
    statusPlans.length = 0
    await expect(runSoulMemoryDreamingSweep({
      ...base,
      collectSources: () => [],
    })).resolves.toMatchObject({
      status: 'skipped',
      applied: 0,
      sourceFiles: [],
      memory: 'NONE',
    })
    expect(statusPlans.at(-1)).toMatchObject({
      storeSet: [
        ['lastDreamingAt', runAt.getTime()],
        ['lastDreamingApplied', 0],
        ['lastDreamingStatus', 'skipped'],
        ['lastDreamingSourceFiles', []],
        ['lastDreamingNextRunAt', Date.UTC(2026, 5, 26, 8, 0, 0)],
      ],
    })
  })

  it('skips and records memory dreaming errors in core', async () => {
    const runAt = new Date('2026-06-25T08:00:00Z')
    const dreaming = {
      enabled: true,
      frequency: '0 8 * * *',
      timezone: 'UTC',
      lookbackDays: 7,
      maxSourceFiles: 3,
      maxPromotions: 2,
      minScore: 0.7,
      timeoutMs: 1000,
      maxInputChars: 4000,
    }
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    const base = {
      reason: 'scheduled',
      enabled: true,
      dreaming,
      now: runAt,
      hash: (value: string) => `hash:${value.length}`,
      collectSources: () => [{ relativePath: 'memory/2026-06-25.md', content: '- durable source' }],
      getNextRunAt: () => ({ nextRunAt: 123 }),
      getExistingMemory: () => '',
      resolveProvider: () => ({ provider: {}, modelRef: 'deepseek/deepseek-chat' }),
      generateDreaming: () => {
        throw new Error('provider failed')
      },
      applyMemoryActions: () => ({ applied: 0, block: '', added: 0, replaced: 0, removed: 0, skipped: 0 }),
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      nowMs: () => 3000,
    }

    await expect(runSoulMemoryDreamingSweep({
      ...base,
      enabled: false,
    })).resolves.toBeNull()
    expect(statusPlans).toHaveLength(0)
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'sweep',
      stage: 'gate',
      status: 'skipped',
      summary: 'Soul-memory is disabled.',
    })

    await expect(runSoulMemoryDreamingSweep(base)).rejects.toThrow('provider failed')
    expect(statusPlans.at(-1)).toEqual(planSoulMemoryDreamingErrorStatusMutation('provider failed'))
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'sweep',
      stage: 'finish',
      status: 'error',
    })
  })

  it('runs memory capture in core through model and daily-note adapters', async () => {
    let now = 1000
    const settings = {
      enabled: true,
      mode: 'explicit-only' as const,
      maxInputChars: 4000,
      timeoutMs: 1000,
    }
    const context = {
      messages: [
        { role: 'user', content: 'please remember that this repo uses Bun scripts' },
        { role: 'assistant', content: 'Noted.' },
      ],
      lastUserMessage: 'please remember that this repo uses Bun scripts',
      lastAssistantMessage: 'Noted.',
    }
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    const notifications: unknown[] = []
    let generatedPrompt = ''
    const base = {
      sessionId: 'session-1',
      assistantMessageId: 'assistant-1',
      context,
      enabled: true,
      capture: settings,
      dailyRelativePath: 'memory/2026-06-25.md',
      readDailyContent: () => '- Existing note.',
      hash: (value: string) => `hash:${value.length}:${value.slice(0, 8)}`,
      resolveProvider: () => ({
        provider: { id: 'provider' },
        providerId: 'deepseek',
        model: 'deepseek-chat',
        source: 'tools',
      }),
      generateCapture: ({ system, prompt }: { system: string; prompt: string }) => {
        expect(system).toBe(CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT)
        generatedPrompt = prompt
        return JSON.stringify({
          action: 'capture',
          confidence: 0.9,
          memories: [
            {
              action: 'add',
              confidence: 0.9,
              content: '用户今天确认 start-electron 使用 Bun scripts。',
            },
          ],
        })
      },
      applyDailyActions: () => ({
        relativePath: 'memory/2026-06-25.md',
        applied: 1,
        added: 1,
        replaced: 0,
        removed: 0,
        skipped: 0,
      }),
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      notify: (message: string, level?: 'info' | 'warn' | 'error') => {
        notifications.push({ message, level })
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      now: () => now,
    }

    await expect(runSoulMemoryCapture(base)).resolves.toMatchObject({
      status: 'saved',
      explicitIntent: true,
      applied: 1,
      relativePath: 'memory/2026-06-25.md',
      lastStatus: 'daily-saved daily:add:1 replace:0 remove:0 skipped:0',
    })
    expect(generatedPrompt).toContain('Current daily note (memory/2026-06-25.md):')
    expect(generatedPrompt).toContain('Latest user message:')
    expect(statusPlans).toHaveLength(1)
    expect(statusPlans.at(0)).toMatchObject({
      storeSet: [
        ['lastCaptureAt', 1000],
        ['lastCaptureStatus', 'daily-saved daily:add:1 replace:0 remove:0 skipped:0'],
      ],
    })
    expect(notifications).toEqual([
      { message: 'Daily note saved to memory/2026-06-25.md', level: 'info' },
    ])
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'after-assistant-response', stage: 'start', status: 'started' }),
      expect.objectContaining({ operation: 'model-classify', stage: 'request', status: 'started' }),
      expect.objectContaining({ operation: 'after-assistant-response', stage: 'finish', status: 'ok' }),
    ]))

    now = 2000
    statusPlans.length = 0
    await expect(runSoulMemoryCapture({
      ...base,
      sessionId: 'session-2',
      capture: { ...settings, mode: 'auto' },
      generateCapture: () => JSON.stringify({ action: 'none', confidence: 1, memories: [] }),
    })).resolves.toMatchObject({
      status: 'none',
      lastStatus: 'none',
    })
    expect(statusPlans.at(-1)).toEqual(planSoulMemoryCaptureRuntimeStatusMutation('none'))
  })

  it('skips and records memory capture errors in core', async () => {
    const settings = {
      enabled: true,
      mode: 'explicit-only' as const,
      maxInputChars: 4000,
      timeoutMs: 1000,
    }
    const context = {
      messages: [
        { role: 'user', content: 'No explicit memory intent here.' },
        { role: 'assistant', content: 'Okay.' },
      ],
      lastUserMessage: 'No explicit memory intent here.',
      lastAssistantMessage: 'Okay.',
    }
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    const base = {
      sessionId: 'session-1',
      assistantMessageId: 'assistant-1',
      context,
      enabled: true,
      capture: settings,
      dailyRelativePath: 'memory/2026-06-25.md',
      readDailyContent: () => '',
      hash: (value: string) => `hash:${value.length}`,
      resolveProvider: () => ({ provider: {}, providerId: 'deepseek', model: 'deepseek-chat' }),
      generateCapture: () => {
        throw new Error('provider failed')
      },
      applyDailyActions: () => null,
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      now: () => 3000,
    }

    await expect(runSoulMemoryCapture(base)).resolves.toMatchObject({
      status: 'skipped',
      explicitIntent: false,
      lastStatus: 'skipped',
    })
    expect(statusPlans.at(-1)).toEqual(planSoulMemoryCaptureRuntimeStatusMutation('skipped'))
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'after-assistant-response',
      stage: 'gate',
      status: 'skipped',
    })

    statusPlans.length = 0
    await expect(runSoulMemoryCapture({
      ...base,
      context: {
        ...context,
        lastUserMessage: 'please remember that this should be captured',
      },
    })).resolves.toMatchObject({
      status: 'error',
      error: 'provider failed',
      lastStatus: 'error',
    })
    expect(statusPlans.at(-1)).toEqual(planSoulMemoryCaptureErrorStatusMutation('provider failed'))
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'after-assistant-response',
      stage: 'finish',
      status: 'error',
    })
  })

  it('selects memory tool providers from settings in core', () => {
    const settings = {
      ai: {
        provider: 'deepseek',
        providers: {
          deepseek: { model: 'deepseek-chat' },
          openai: { selectedModels: ['gpt-5.3'] },
        },
        customProviders: [{ id: 'custom-local', model: 'local-model', baseUrl: 'http://localhost' }],
      },
      tools: {
        toolCallModel: {
          providerId: 'openai',
          model: 'gpt-5.3-mini',
        },
      },
    }

    expect(resolveSoulMemoryToolProviderSelection(settings)).toEqual({
      providerId: 'openai',
      model: 'gpt-5.3-mini',
      source: 'tool',
      config: { selectedModels: ['gpt-5.3'], model: 'gpt-5.3-mini' },
    })
    expect(formatSoulMemoryToolModelRef(settings)).toBe('openai/gpt-5.3-mini')
    expect(resolveSoulMemoryProviderConfig(settings, 'custom-local', 'local-model').config)
      .toEqual({ id: 'custom-local', model: 'local-model', baseUrl: 'http://localhost' })

    expect(resolveSoulMemoryToolProviderSelection({
      ...settings,
      tools: {},
    }).source).toBe('default')

    const selection = resolveSoulMemoryToolProviderSelection(settings)
    expect(createSoulMemoryToolProvider(selection, {
      kind: 'api-key',
      apiKey: 'test-key',
    }, 'Memory Dreaming')).toMatchObject({
      providerId: 'openai',
      modelRef: 'openai/gpt-5.3-mini',
      config: {
        model: 'gpt-5.3-mini',
        selectedModels: ['gpt-5.3'],
        apiKey: 'test-key',
        authContext: { kind: 'api-key', apiKey: 'test-key' },
      },
    })

    expect(createSoulMemoryToolProvider({
      ...selection,
      config: { model: 'fallback-model' },
    }, {
      kind: 'oauth',
      token: 'oauth-token',
    }, 'Memory Review')).toMatchObject({
      modelRef: 'openai/gpt-5.3-mini',
      config: {
        selectedModels: ['gpt-5.3-mini'],
        apiKey: '',
        oauthToken: 'oauth-token',
      },
    })

    expect(() => createSoulMemoryToolProvider(selection, null, 'Memory Dreaming'))
      .toThrow(soulMemoryToolProviderAuthError(selection, 'Memory Dreaming'))
  })

  it('dedupes capture lines against existing memory text in core', async () => {
    const existing = [
      '- User prefers Bun.',
      '- Existing note.',
    ].join('\n')
    expect(dedupeSoulMemoryCaptureLines(existing, [
      '- User prefers Bun.',
      '- New project uses headless core.',
      '- New project uses headless core.',
    ])).toEqual(['- New project uses headless core.'])

    expect(dedupeSoulMemoryDailyNoteBullets(existing, [
      'User prefers Bun.',
      'User confirmed CLI smoke tests.',
    ])).toEqual(['User confirmed CLI smoke tests.'])

    await expect(buildSoulMemoryCaptureDedupeTextWithAdapters({
      readMemoryContent: () => '- User prefers Bun.',
      readDailyContent: () => '- Existing note.',
    })).resolves.toBe('- User prefers Bun.\n- Existing note.')

    await expect(dedupeSoulMemoryCaptureLinesWithAdapters({
      readMemoryContent: () => '- User prefers Bun.',
      readDailyContent: () => '- Existing note.',
      lines: [
        '- Existing note.',
        '- New adapter note.',
      ],
    })).resolves.toEqual(['- New adapter note.'])

    await expect(dedupeSoulMemoryDailyNoteBulletsWithAdapters({
      readMemoryContent: () => '- User prefers Bun.',
      readDailyContent: () => '- Existing note.',
      bullets: [
        'Existing note.',
        'Adapter added note.',
      ],
    })).resolves.toEqual(['Adapter added note.'])
  })

  it('describes managed memory files and reads excerpts in core', async () => {
    expect(resolveSoulMemoryFilePath({
      root: '/repo/memory-root',
      inputPath: 'memory/2026-06-25.md',
    })).toEqual({
      absolutePath: '/repo/memory-root/memory/2026-06-25.md',
      relativePath: 'memory/2026-06-25.md',
    })
    expect(() => resolveSoulMemoryFilePath({
      root: '/repo/memory-root',
      inputPath: '../outside.md',
    })).toThrow('Path is outside the configured memory directory')
    expect(resolveSoulMemoryManagedFilePath({
      root: '/repo/memory-root',
      inputPath: 'DREAMS.md',
    })).toEqual({
      absolutePath: '/repo/memory-root/DREAMS.md',
      relativePath: 'DREAMS.md',
    })
    expect(() => resolveSoulMemoryManagedFilePath({
      root: '/repo/memory-root',
      inputPath: 'private.md',
    })).toThrow('Only SOUL.md, USER.md, MEMORY.md, DREAMS.md, and files under memory/ can be accessed')
    expect(resolveSoulMemoryPlainReviewFilePath({
      soulPath: '/repo/memory-root/SOUL.md',
      dreamsPath: '/repo/memory-root/DREAMS.md',
      target: 'soul',
    })).toEqual({
      absolutePath: '/repo/memory-root/SOUL.md',
      relativePath: 'SOUL.md',
    })
    expect(resolveSoulMemoryPlainReviewFilePath({
      soulPath: '/repo/memory-root/SOUL.md',
      dreamsPath: '/repo/memory-root/DREAMS.md',
      target: 'dreams',
    })).toEqual({
      absolutePath: '/repo/memory-root/DREAMS.md',
      relativePath: 'DREAMS.md',
    })

    expect(resolveSoulMemoryAppendTarget({
      root: '/repo/memory-root',
      memoryPath: '/repo/memory-root/MEMORY.md',
      todayPath: '/repo/memory-root/memory/2026-06-25.md',
      target: 'daily',
    })).toEqual({
      absolutePath: '/repo/memory-root/memory/2026-06-25.md',
      relativePath: 'memory/2026-06-25.md',
    })
    expect(() => resolveSoulMemoryAppendTarget({
      root: '/repo/memory-root',
      memoryPath: '/repo/memory-root/MEMORY.md',
      todayPath: '/repo/memory-root/memory/2026-06-25.md',
      target: 'memory',
    })).toThrow('MEMORY.md is a legacy compatibility file')
    expect(buildSoulMemoryAppendPayload({
      relativePath: 'memory\\2026-06-25.md',
      content: '  hello memory  ',
      heading: 'Now',
      exists: false,
    })).toEqual({
      heading: 'Now',
      content: 'hello memory',
      text: '# 2026-06-25\n\n## Now\n\nhello memory\n',
    })
    expect(() => buildSoulMemoryAppendPayload({
      relativePath: 'memory/2026-06-25.md',
      content: '   ',
      exists: true,
    })).toThrow('Memory content is empty')
    expect(planSoulMemoryDailyNoteAppend({
      bullets: ['  - 用户今天完成了 headless core 拆分。 ', '', '* 用户今天验证了 CLI tool call。'],
      heading: 'Now',
    })).toEqual({
      heading: 'Now',
      content: '- 用户今天完成了 headless core 拆分。\n- 用户今天验证了 CLI tool call。',
    })
    expect(planSoulMemoryDailyNoteAppend({
      bullets: ['   ', '-   '],
      heading: 'Ignored',
    })).toBeNull()
    expect(planSoulMemoryDailyNoteAppend({
      bullets: ['用户今天复核了 core 边界。'],
      now: new Date(2026, 5, 25, 8, 9, 0),
    })?.heading).toMatch(/8:09|08:09/)
    expect(buildSoulMemoryManagedFileCandidates({
      soulPath: '/repo/memory-root/SOUL.md',
      userPath: '/repo/memory-root/USER.md',
      memoryPath: '/repo/memory-root/MEMORY.md',
      dreamsPath: '/repo/memory-root/DREAMS.md',
      indexedFiles: [
        {
          absolutePath: '/repo/memory-root/MEMORY.md',
          relativePath: 'MEMORY.md',
          kind: 'memory',
        },
        {
          absolutePath: '/repo/memory-root/memory/2026-06-25.md',
          relativePath: 'memory\\2026-06-25.md',
          kind: 'daily',
          date: '2026-06-25',
        },
      ],
    })).toEqual([
      { absolutePath: '/repo/memory-root/SOUL.md', relativePath: 'SOUL.md', kind: 'soul' },
      { absolutePath: '/repo/memory-root/USER.md', relativePath: 'USER.md', kind: 'user' },
      { absolutePath: '/repo/memory-root/MEMORY.md', relativePath: 'MEMORY.md', kind: 'memory' },
      { absolutePath: '/repo/memory-root/DREAMS.md', relativePath: 'DREAMS.md', kind: 'dreams' },
      {
        absolutePath: '/repo/memory-root/memory/2026-06-25.md',
        relativePath: 'memory/2026-06-25.md',
        kind: 'daily',
        date: '2026-06-25',
      },
    ])

    expect(describeSoulMemoryManagedFile({
      absolutePath: '/tmp/MEMORY.md',
      relativePath: 'memory\\2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
      size: 42,
      mtimeMs: 100,
      content: '# 2026-06-25\n\n- First note\n- Second note',
    })).toEqual({
      absolutePath: '/tmp/MEMORY.md',
      relativePath: 'memory/2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
      size: 42,
      mtimeMs: 100,
      lineCount: 4,
      preview: '- First note - Second note',
    })

    expect(resolveSoulMemoryManagedFileMetadata('SOUL.md')).toEqual({
      relativePath: 'SOUL.md',
      kind: 'soul',
    })
    expect(resolveSoulMemoryManagedFileMetadata('memory\\2026-06-25.md')).toEqual({
      relativePath: 'memory/2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
    })

    await expect(describeSoulMemoryManagedFileWithAdapters({
      absolutePath: '/repo/memory-root/SOUL.md',
      relativePath: 'SOUL.md',
      kind: 'soul',
      statFile: () => ({ isFile: () => true, size: 12, mtimeMs: 50 }),
      readFile: () => '# Soul\n\nSteady voice',
    })).resolves.toMatchObject({
      relativePath: 'SOUL.md',
      kind: 'soul',
      size: 12,
      mtimeMs: 50,
      preview: 'Steady voice',
    })

    const readFullMemoryFile = vi.fn(() => '# Soul\n\nFull content should stay lazy')
    const readPreviewMemoryFile = vi.fn(() => '# Soul\n\nPreview only')
    const countMemoryLines = vi.fn(() => 123)
    await expect(describeSoulMemoryManagedFileWithAdapters({
      absolutePath: '/repo/memory-root/SOUL.md',
      relativePath: 'SOUL.md',
      kind: 'soul',
      statFile: () => ({ isFile: () => true, size: 4096, mtimeMs: 51 }),
      countLines: countMemoryLines,
      readFile: readFullMemoryFile,
      readPreviewFile: readPreviewMemoryFile,
    })).resolves.toMatchObject({
      relativePath: 'SOUL.md',
      lineCount: 123,
      preview: 'Preview only',
    })
    expect(countMemoryLines).toHaveBeenCalledWith(
      '/repo/memory-root/SOUL.md',
      expect.objectContaining({ relativePath: 'SOUL.md', kind: 'soul' }),
    )
    expect(readPreviewMemoryFile).toHaveBeenCalledWith(
      '/repo/memory-root/SOUL.md',
      expect.objectContaining({ relativePath: 'SOUL.md', kind: 'soul' }),
      8192,
    )
    expect(readFullMemoryFile).not.toHaveBeenCalled()

    await expect(listSoulMemoryManagedFilesWithAdapters({
      soulPath: '/repo/memory-root/SOUL.md',
      userPath: '/repo/memory-root/USER.md',
      memoryPath: '/repo/memory-root/MEMORY.md',
      dreamsPath: '/repo/memory-root/DREAMS.md',
      indexedFiles: [
        {
          absolutePath: '/repo/memory-root/memory/2026-06-25.md',
          relativePath: 'memory/2026-06-25.md',
          kind: 'daily',
          date: '2026-06-25',
        },
        {
          absolutePath: '/repo/memory-root/ignored.md',
          relativePath: 'ignored.md',
          kind: 'other',
        },
      ],
      statFile: absolutePath => absolutePath.endsWith('USER.md')
        ? { isFile: () => false, size: 0, mtimeMs: 0 }
        : { isFile: () => true, size: absolutePath.length, mtimeMs: absolutePath.endsWith('2026-06-25.md') ? 500 : 100 },
      readFile: absolutePath => absolutePath.endsWith('2026-06-25.md')
        ? '# 2026-06-25\n\nDaily note'
        : `${absolutePath} content`,
    })).resolves.toMatchObject([
      { relativePath: 'SOUL.md', kind: 'soul' },
      { relativePath: 'MEMORY.md', kind: 'memory' },
      { relativePath: 'DREAMS.md', kind: 'dreams' },
      { relativePath: 'memory/2026-06-25.md', kind: 'daily', preview: 'Daily note' },
    ])

    expect(readSoulMemoryFileExcerptFromContent({
      relativePath: 'MEMORY.md',
      content: ['one', 'two', 'three', 'four'].join('\n'),
      startLine: 2,
      lines: 2,
      defaultLines: 3,
      maxLines: 3,
    })).toEqual({
      relativePath: 'MEMORY.md',
      text: 'two\nthree',
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      truncated: true,
    })

    await expect(readSoulMemoryManagedFileExcerptWithAdapters({
      root: '/repo/memory-root',
      inputPath: 'memory/2026-06-25.md',
      startLine: 2,
      lines: 1,
      defaultLines: 3,
      maxLines: 3,
      readFile: (_absolutePath, target) => [
        `path:${target.relativePath}`,
        'line two',
        'line three',
      ].join('\n'),
    })).resolves.toEqual({
      relativePath: 'memory/2026-06-25.md',
      text: 'line two',
      startLine: 2,
      endLine: 2,
      totalLines: 3,
      truncated: true,
    })

    await expect(readSoulMemoryManagedFileWithAdapters({
      root: '/repo/memory-root',
      inputPath: '',
      defaultLines: 3,
      maxLines: 3,
      readFile: () => '',
    })).rejects.toThrow('Memory file path is required')
    await expect(readSoulMemoryManagedFileWithAdapters({
      root: '/repo/memory-root',
      inputPath: 'USER.md',
      defaultLines: 3,
      maxLines: 3,
      readFile: () => ['alpha', 'beta'].join('\n'),
    })).resolves.toMatchObject({
      relativePath: 'USER.md',
      text: 'alpha\nbeta',
      totalLines: 2,
    })

    expect(isSoulMemoryIndexableMarkdownRelativePath('MEMORY.md')).toBe(true)
    expect(isSoulMemoryIndexableMarkdownRelativePath('memory/2026-06-25.md')).toBe(true)
    expect(isSoulMemoryIndexableMarkdownRelativePath('memory/.dreams/private.md')).toBe(false)
    expect(isSoulMemoryIndexableMarkdownRelativePath('SOUL.md')).toBe(false)
    expect(normalizeSoulMemoryRelativePath('memory\\2026-06-25.md')).toBe('memory/2026-06-25.md')
    expect(formatSoulMemoryDateString(new Date('2026-06-25T12:34:56Z'))).toBe('2026-06-25')
    expect(formatSoulMemoryDateStringDaysAgo(2, new Date('2026-06-25T12:34:56Z'))).toBe('2026-06-23')
    expect(hashSoulMemoryText('memory')).toBe('c064fbca9d9de8dd9bb0624984403b28d0da807a69365d4f7fb09123ecb0c405')
    expect(estimateSoulMemoryTokens('one two three')).toBe(4)
    expect(truncateSoulMemoryText('x'.repeat(100), 20)).toBe('\n\n[Truncated at 20 chars]')
    expect(previewSoulMemoryLine('  hello\n\tcore   memory  ', 50)).toBe('hello core memory')
    expect(buildSoulMemoryFtsQuery('alpha beta')).toBe('"alpha" OR "beta"')
    expect(buildSoulMemoryFtsQuery('""')).toBe('""""""')
    expect(sanitizeSoulMemoryAgentPathSegment('agent/a:b', 'default')).toBe('agent_a_b')
    expect(resolveSoulMemoryRootPath({
      settings: { directoryMode: 'custom', customDirectory: '~/memory' },
      defaultAgentId: 'default',
      agentsDir: '/agents',
      aiNoteDir: '/notes',
      expandPath: value => value.replace('~', '/home/user'),
    })).toBe('/home/user/memory')
    expect(planSoulMemoryWorkspacePaths({
      settings: { directoryMode: 'ai-note-dir' },
      defaultAgentId: 'default',
      agentsDir: '/agents',
      storePath: '/store',
      aiNoteDir: '/notes',
      today: new Date('2026-06-25T12:34:56Z'),
    })).toMatchObject({
      agentId: 'default',
      root: '/notes',
      memoryDir: '/notes/memory',
      soulPath: '/notes/SOUL.md',
      todayPath: '/notes/memory/2026-06-25.md',
      dbPath: '/store/plugin-data/soul-memory.sqlite',
    })
    expect(planSoulMemoryWorkspacePaths({
      settings: { directoryMode: 'custom', customDirectory: '/ignored-for-agent' },
      agentId: 'agent/a',
      defaultAgentId: 'default',
      agentsDir: '/agents',
      storePath: '/store',
      aiNoteDir: '/notes',
      today: new Date('2026-06-25T12:34:56Z'),
    })).toMatchObject({
      agentId: 'agent/a',
      root: '/agents/agent_a',
      dbPath: '/agents/agent_a/plugin-data/soul-memory.sqlite',
    })

    const writes = new Map<string, { content: string; mtimeMs: number }>()
    const indexableWrites: string[] = []
    await expect(saveSoulMemoryManagedFileWithAdapters({
      root: '/repo/memory-root',
      inputPath: 'memory/2026-06-25.md',
      content: 'Saved note.   \n\n',
      writeFile: (absolutePath, content) => {
        writes.set(absolutePath, { content, mtimeMs: 700 })
      },
      statFile: absolutePath => {
        const write = writes.get(absolutePath)
        return write ? { isFile: () => true, size: write.content.length, mtimeMs: write.mtimeMs } : null
      },
      readFile: absolutePath => writes.get(absolutePath)?.content || '',
      onIndexableWrite: target => {
        indexableWrites.push(target.relativePath)
      },
    })).resolves.toMatchObject({
      relativePath: 'memory/2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
      size: 'Saved note.\n'.length,
      mtimeMs: 700,
      preview: 'Saved note.',
    })
    expect(writes.get('/repo/memory-root/memory/2026-06-25.md')?.content).toBe('Saved note.\n')
    expect(indexableWrites).toEqual(['memory/2026-06-25.md'])

    await expect(saveSoulMemoryManagedFileWithAdapters({
      root: '/repo/memory-root',
      inputPath: '',
      content: 'ignored',
      writeFile: () => undefined,
      statFile: () => null,
      readFile: () => '',
    })).rejects.toThrow('Memory file path is required')
  })

  it('manages pending captures through a core store-like interface', async () => {
    const data = new Map<string, unknown>()
    const store = {
      get: <T>(key: string) => data.get(key) as T | undefined,
      set: <T>(key: string, value: T) => data.set(key, value),
    }
    const captures = [
      {
        id: 'old',
        sessionId: 's1',
        agentId: 'agent-a',
        createdAt: 1,
        target: 'daily' as const,
        heading: 'H',
        content: 'old',
        confidence: 0.8,
        explicit: false,
        userPreview: 'u',
        assistantPreview: 'a',
      },
      {
        id: 'new',
        sessionId: 's2',
        agentId: 'agent-b',
        createdAt: 2,
        target: 'memory' as const,
        heading: 'H',
        content: 'new',
        confidence: 0.9,
        explicit: true,
        userPreview: 'u',
        assistantPreview: 'a',
      },
    ]

    setSoulMemoryPendingCaptures(store, captures, { key: 'pending', maxPending: 10 })
    expect(getSoulMemoryPendingCaptures(store, { key: 'pending', maxPending: 10 }).map(capture => capture.id))
      .toEqual(['new', 'old'])
    expect(filterSoulMemoryPendingCapturesForAgent(captures, 'agent-a', 'default').map(capture => capture.id))
      .toEqual(['old'])
    expect(getSoulMemoryPublicPendingCaptures(store, {
      key: 'pending',
      maxPending: 10,
      agentId: 'agent-b',
      defaultAgentId: 'default',
    }).map(capture => capture.id)).toEqual(['new'])
    expect(selectSoulMemoryPendingCapture(captures, 'new').content).toBe('new')
    expect(removeSoulMemoryPendingCapture(captures, 'old').map(capture => capture.id)).toEqual(['new'])
    expect(takeSoulMemoryPendingCapture(store, {
      key: 'pending',
      maxPending: 10,
      id: 'new',
    })).toMatchObject({
      selected: { id: 'new' },
      remaining: [{ id: 'old' }],
    })

    const statusData = new Map<string, unknown>()
    const mutationStore = {
      get: <T>(key: string) => statusData.get(key) as T | undefined,
      set: <T>(key: string, value: T) => {
        statusData.set(key, value)
      },
      delete: (key: string) => {
        statusData.delete(key)
      },
    }
    const runtimeStatus = { lastCaptureError: 'old error', lastCaptureStatus: 'error' }
    setSoulMemoryPendingCaptures(mutationStore, captures, { key: 'pending', maxPending: 10 })

    await expect(saveSoulMemoryPendingCaptureWithAdapters({
      store: mutationStore,
      runtimeStatus,
      key: 'pending',
      maxPending: 10,
      id: 'new',
      saveSelectedCapture: capture => ({ path: capture.content }),
    })).resolves.toEqual({ path: 'new' })
    expect(getSoulMemoryPendingCaptures(mutationStore, { key: 'pending', maxPending: 10 }).map(capture => capture.id))
      .toEqual(['old'])
    expect(statusData.get('lastCaptureStatus')).toBe('approved')
    expect(statusData.has('lastCaptureError')).toBe(false)
    expect(runtimeStatus.lastCaptureStatus).toBe('approved')
    expect(runtimeStatus.lastCaptureError).toBeUndefined()

    expect(discardSoulMemoryPendingCaptureWithAdapters({
      store: mutationStore,
      runtimeStatus,
      key: 'pending',
      maxPending: 10,
      id: 'old',
    }).id).toBe('old')
    expect(getSoulMemoryPendingCaptures(mutationStore, { key: 'pending', maxPending: 10 })).toEqual([])
    expect(statusData.get('lastCaptureStatus')).toBe('discarded')
  })

  it('extracts legacy MEMORY.md bullets into graph candidates', () => {
    expect(extractLegacyMemoryCandidates([
      '# MEMORY.md',
      '',
      '## Preferences',
      '- User prefers direct answers.',
      '',
      '## Decisions',
      '- User approved using Bun scripts.',
      '',
      '## Random',
      '- Assistant completed a task.',
    ].join('\n'))).toEqual([
      expect.objectContaining({
        kind: 'preference',
        text: 'User prefers direct answers.',
        target: 'memory',
      }),
      expect.objectContaining({
        kind: 'decision',
        text: 'User approved using Bun scripts.',
        target: 'memory',
      }),
    ])
  })

  it('detects explicit memory intent without host state', () => {
    expect(hasExplicitMemoryIntent('以后请叫我 Yitian')).toBe(true)
    expect(hasExplicitMemoryIntent('please remember that I prefer short answers')).toBe(true)
    expect(hasExplicitMemoryIntent('summarize this file')).toBe(false)
  })

  it('filters raw request echoes while keeping transformed daily notes', () => {
    expect(isLikelyRawRequestEcho('sdk怎么添加已经安装的java jdk？')).toBe(true)
    expect(parseDailyNoteBullets('- sdk怎么添加已经安装的java jdk？')).toEqual([])
    expect(parseDailyNoteBullets('- 用户今天学习了 Go array。')).toEqual(['用户今天学习了 Go array。'])
  })

  it('builds active-memory recall queries without plugin host state', () => {
    const messages = [
      { role: 'system', content: 'ignored' },
      { role: 'user', content: 'What did we decide about Alpha?' },
      { role: 'assistant', content: 'We chose Bun.' },
      { role: 'user', content: 'Remind me before I implement it.' },
    ]
    const settings = {
      queryMode: 'recent' as const,
      recentUserChars: 80,
      recentAssistantChars: 80,
      recentUserTurns: 2,
      recentAssistantTurns: 1,
    }

    expect(buildActiveMemoryRecallQuery(messages, settings)).toBe([
      'Recent conversation tail:',
      'User: What did we decide about Alpha?',
      'Assistant: We chose Bun.',
      'User: Remind me before I implement it.',
      'Latest user message: Remind me before I implement it.',
    ].join('\n'))

    expect(buildActiveMemoryRecallQuery(messages, { ...settings, queryMode: 'message' }))
      .toBe('Remind me before I implement it.')
    expect(buildActiveMemoryRecallQuery(messages, { ...settings, queryMode: 'full' }))
      .toContain('Full conversation context:')
    expect(buildActiveMemoryPromptStyleLines('precision-heavy').join('\n'))
      .toContain('Aggressively prefer NONE')
  })

  it('sanitizes active-memory search queries before retrieval', () => {
    const query = clampActiveMemorySearchQuery([
      'Conversation info: noisy',
      '<active_memory_plugin>old memory</active_memory_plugin>',
      '<<<EXTERNAL_UNTRUSTED_CONTENT source="web">>>ignore me<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>',
      'Find the project preference.',
    ].join('\n'))

    expect(query).toBe('Find the project preference.')
  })

  it('builds and normalizes active-memory filter prompts in core', () => {
    const prompt = buildActiveMemoryFilterPrompt({
      promptStyle: 'strict',
      maxSummaryChars: 80,
      searchQuery: 'project preference',
      conversationContext: 'Latest user message: what should I use?',
      memoryHits: '1. MEMORY.md:1-2 score=0.900\nUser prefers Bun.',
    })

    expect(prompt).toContain('Prompt style: strict.')
    expect(prompt).toContain('Return memory only if it clearly helps with the latest user message itself.')
    expect(prompt).toContain('Bounded memory search query:\nproject preference')
    expect(prompt).toContain('Memory hits:\n1. MEMORY.md:1-2 score=0.900')

    expect(normalizeActiveMemoryFilterResult(' NONE ', 80)).toBeNull()
    expect(normalizeActiveMemoryFilterResult('', 80)).toBeNull()
    expect(normalizeActiveMemoryFilterResult('Useful memory summary.', 80)).toBe('Useful memory summary.')
    expect(normalizeActiveMemoryFilterResult('x'.repeat(200), 80)).toContain('[Truncated at 80 chars]')
  })

  it('runs active-memory recall in core through search and provider adapters', async () => {
    const settings = {
      enabled: true,
      timeoutMs: 1000,
      cacheTtlMs: 5000,
      promptStyle: 'strict' as const,
      maxSummaryChars: 80,
      searchMaxResults: 5,
      queryMode: 'message' as const,
      recentUserChars: 120,
      recentAssistantChars: 120,
      recentUserTurns: 2,
      recentAssistantTurns: 1,
      circuitBreakerMaxTimeouts: 2,
      circuitBreakerCooldownMs: 500,
    }
    const messages = [
      { role: 'assistant', content: 'Earlier context' },
      { role: 'user', content: 'Which runtime should we use for this project?' },
    ]
    const hash = (value: string) => `hash:${value.length}:${value.slice(0, 8)}`
    const diagnostics: unknown[] = []
    const logs: string[] = []
    let now = 1000
    const runtime = new CoreSoulMemoryActiveMemoryRuntime({ now: () => now })
    const searchCalls: Array<{ query: string; limit: number }> = []
    const base = {
      sessionId: 'session-1',
      agentId: 'agent-1',
      messages,
      pluginEnabled: true,
      sessionDisabled: false,
      settings,
      runtime,
      hash,
      search: (input: { query: string; limit: number }) => {
        searchCalls.push(input)
        return [{ path: 'MEMORY.md', content: 'Use Bun for scripts.' }]
      },
      formatHits: (hits: Array<{ path: string; content: string }>) =>
        hits.map(hit => `${hit.path}: ${hit.content}`).join('\n'),
      resolveProvider: () => null as { providerId: string; config: { model: string } } | null,
      providerId: (provider: { providerId: string }) => provider.providerId,
      providerModel: (provider: { config: { model: string } }) => provider.config.model,
      generateFilter: () => {
        throw new Error('raw fallback should not call filter model')
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      logger: {
        info: (message: string) => logs.push(message),
        warn: (message: string) => logs.push(message),
      },
    }

    await expect(runSoulMemoryActiveMemoryRecall(base)).resolves.toBe('MEMORY.md: Use Bun for scripts.')
    expect(searchCalls).toEqual([{ query: 'Which runtime should we use for this project?', limit: 5 }])
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'search', status: 'started' }),
      expect.objectContaining({ stage: 'finish', status: 'ok' }),
    ]))

    now = 1100
    await expect(runSoulMemoryActiveMemoryRecall(base)).resolves.toBe('MEMORY.md: Use Bun for scripts.')
    expect(searchCalls).toHaveLength(1)
    expect(logs.some(message => message.includes('cache-hit'))).toBe(true)

    let generatedPrompt = ''
    await expect(runSoulMemoryActiveMemoryRecall({
      ...base,
      sessionId: 'session-2',
      runtime: new CoreSoulMemoryActiveMemoryRuntime({ now: () => now }),
      resolveProvider: () => ({ providerId: 'deepseek', config: { model: 'deepseek-chat' } }),
      generateFilter: ({ system, prompt }) => {
        expect(system).toContain('untrusted user notes')
        generatedPrompt = prompt
        return 'Filtered project runtime memory.'
      },
    })).resolves.toBe('Filtered project runtime memory.')
    expect(generatedPrompt).toContain('Prompt style: strict.')
    expect(generatedPrompt).toContain('Memory hits:\nMEMORY.md: Use Bun for scripts.')
  })

  it('skips active-memory recall in core when disabled or circuit-open', async () => {
    const settings = {
      enabled: true,
      timeoutMs: 1000,
      cacheTtlMs: 5000,
      promptStyle: 'balanced' as const,
      maxSummaryChars: 80,
      searchMaxResults: 5,
      queryMode: 'message' as const,
      recentUserChars: 120,
      recentAssistantChars: 120,
      recentUserTurns: 2,
      recentAssistantTurns: 1,
      circuitBreakerMaxTimeouts: 1,
      circuitBreakerCooldownMs: 500,
    }
    const diagnostics: Array<{ stage?: string; status?: string; summary?: string }> = []
    const runtime = new CoreSoulMemoryActiveMemoryRuntime({ now: () => 1000 })
    const base = {
      sessionId: 'session-1',
      agentId: 'agent-1',
      messages: [{ role: 'user', content: 'Need memory.' }],
      pluginEnabled: true,
      sessionDisabled: false,
      settings,
      runtime,
      hash: (value: string) => `hash:${value.length}`,
      search: () => {
        throw new Error('search should be skipped')
      },
      formatHits: () => '',
      resolveProvider: () => ({ providerId: 'deepseek', config: { model: 'deepseek-chat' } }),
      providerId: (provider: { providerId: string }) => provider.providerId,
      providerModel: (provider: { config: { model: string } }) => provider.config.model,
      generateFilter: () => 'filtered',
      logDiagnostic: (event: { stage?: string; status?: string; summary?: string }) => diagnostics.push(event),
    }

    await expect(runSoulMemoryActiveMemoryRecall({
      ...base,
      pluginEnabled: false,
    })).resolves.toBeNull()
    expect(diagnostics.at(-1)).toMatchObject({
      stage: 'gate',
      status: 'skipped',
      summary: 'Active Memory is disabled.',
    })

    runtime.recordTimeout('deepseek:deepseek-chat', settings)
    await expect(runSoulMemoryActiveMemoryRecall(base)).resolves.toBeNull()
    expect(diagnostics.at(-1)).toMatchObject({
      stage: 'circuit-breaker',
      status: 'skipped',
    })
  })

  it('parses daily-note add, replace, and remove mutations from compact JSON', () => {
    expect(parseDailyNoteCaptureResult(JSON.stringify({
      action: 'capture',
      confidence: 0.88,
      memories: [
        {
          action: 'add',
          confidence: 0.9,
          content: '用户今天在 start-electron 拆分 headless core。',
        },
        {
          action: 'replace',
          oldText: '- 用户问了 core。',
          newText: '用户今天确认 headless core 要脱离 Electron。',
        },
        {
          action: 'remove',
          text: '- sdk怎么添加已经安装的java jdk？',
        },
        {
          action: 'add',
          sensitivity: 'secret',
          content: 'api key is secret',
        },
      ],
    }))).toEqual({
      confidence: 0.88,
      candidates: [
        {
          action: 'add',
          confidence: 0.9,
          content: '用户今天在 start-electron 拆分 headless core。',
        },
        {
          action: 'replace',
          confidence: 0.88,
          oldText: '- 用户问了 core。',
          newText: '用户今天确认 headless core 要脱离 Electron。',
        },
        {
          action: 'remove',
          confidence: 0.88,
          text: '- sdk怎么添加已经安装的java jdk？',
        },
      ],
    })
  })

  it('applies daily-note line replacement and removal without filesystem access', () => {
    const content = [
      '# 2026-06-25',
      '',
      '- 用户问了 core。',
      '- sdk怎么添加已经安装的java jdk？',
      '',
    ].join('\n')

    const replaced = applyDailyNoteLineReplace(
      content,
      '- 用户问了 core。',
      '用户今天确认 headless core 要脱离 Electron。',
    )
    expect(replaced.changed).toBe(true)
    expect(replaced.next).toContain('- 用户今天确认 headless core 要脱离 Electron。')

    const removed = applyDailyNoteLineRemove(replaced.next, '- sdk怎么添加已经安装的java jdk？')
    expect(removed.changed).toBe(true)
    expect(removed.next).not.toContain('sdk怎么添加')
  })

  it('applies daily-note capture actions through injected host adapters', async () => {
    let content = [
      '# 2026-06-25',
      '',
      '- 用户今天排查旧问题。',
      '- 临时噪音。',
    ].join('\n')
    const appended: string[][] = []

    const result = await applyDailyNoteCaptureActions({
      candidates: [
        {
          action: 'replace',
          confidence: 0.9,
          oldText: '- 用户今天排查旧问题。',
          newText: '用户今天完成 headless core 状态拆分。',
        },
        {
          action: 'remove',
          confidence: 0.9,
          text: '- 临时噪音。',
        },
        {
          action: 'add',
          confidence: 0.9,
          content: '用户今天验证 core 禁用依赖扫描为空。',
        },
        {
          action: 'add',
          confidence: 0.9,
          content: '重复项。',
        },
      ],
      readContent: () => content,
      writeContent: next => {
        content = next
      },
      dedupeAdditions: bullets => bullets.filter(bullet => bullet !== '重复项。'),
      appendBullets: bullets => {
        appended.push(bullets)
        return true
      },
    })

    expect(result).toEqual({
      applied: 3,
      skipped: 1,
      added: 1,
      replaced: 1,
      removed: 1,
    })
    expect(content).toContain('- 用户今天完成 headless core 状态拆分。')
    expect(content).not.toContain('临时噪音')
    expect(appended).toEqual([['用户今天验证 core 禁用依赖扫描为空。']])

    let adapterContent = [
      '# 2026-06-25',
      '',
      '- 旧的 adapter note。',
    ].join('\n')
    const adapterAppended: string[][] = []
    const adapterResult = await applyDailyNoteCaptureActionsWithAdapters({
      candidates: [
        {
          action: 'replace',
          confidence: 0.9,
          oldText: '- 旧的 adapter note。',
          newText: '新的 adapter note。',
        },
        {
          action: 'add',
          confidence: 0.9,
          content: 'Memory duplicate.',
        },
        {
          action: 'add',
          confidence: 0.9,
          content: 'Adapter new note.',
        },
      ],
      readDailyContent: () => adapterContent,
      writeDailyContent: next => {
        adapterContent = next
      },
      readMemoryContent: () => '- Memory duplicate.',
      appendBullets: bullets => {
        adapterAppended.push(bullets)
        return true
      },
    })

    expect(adapterResult).toEqual({
      applied: 2,
      skipped: 1,
      added: 1,
      replaced: 1,
      removed: 0,
    })
    expect(adapterContent).toContain('- 新的 adapter note。')
    expect(adapterAppended).toEqual([['Adapter new note.']])
  })

  it('parses dreaming memory JSON and legacy tagged output without host providers', () => {
    expect(parseDreamingOutput(JSON.stringify({
      action: 'dream',
      confidence: 0.9,
      memories: [
        {
          action: 'add',
          confidence: 0.92,
          content: 'Project Alpha uses Bun for scripts.',
        },
        {
          action: 'replace',
          oldText: 'Project Alpha uses npm.',
          newText: 'Project Alpha uses Bun.',
        },
        {
          action: 'remove',
          text: 'Temporary troubleshooting note.',
        },
        {
          action: 'add',
          sensitivity: 'secret',
          content: 'secret token',
        },
      ],
    }))).toEqual({
      confidence: 0.9,
      memory: [
        '- Project Alpha uses Bun for scripts.',
        '~ Project Alpha uses Bun.',
        '- Temporary troubleshooting note.',
      ].join('\n'),
      candidates: [
        {
          action: 'add',
          confidence: 0.92,
          content: 'Project Alpha uses Bun for scripts.',
        },
        {
          action: 'replace',
          confidence: 0.9,
          oldText: 'Project Alpha uses npm.',
          newText: 'Project Alpha uses Bun.',
        },
        {
          action: 'remove',
          confidence: 0.9,
          text: 'Temporary troubleshooting note.',
        },
      ],
    })

    expect(parseDreamingOutput('<durable_memory>\n- User prefers precise answers.\n</durable_memory>'))
      .toEqual({
        confidence: 0.8,
        memory: '- User prefers precise answers.',
        candidates: [{
          action: 'add',
          confidence: 0.8,
          content: 'User prefers precise answers.',
        }],
      })
  })

  it('applies dreaming memory actions through injected host adapters', async () => {
    const actions: string[] = []
    const result = await applyDreamingMemoryActions({
      maxPromotions: 5,
      minScore: 0.7,
      result: {
        confidence: 0.9,
        memory: '',
        candidates: [
          { action: 'add', confidence: 0.9, content: 'New durable memory.' },
          { action: 'add', confidence: 0.9, content: 'Keep existing memory.' },
          { action: 'replace', confidence: 0.9, oldText: 'Old memory.', newText: 'Updated memory.' },
          { action: 'remove', confidence: 0.9, text: 'Stale memory.' },
          { action: 'add', confidence: 0.2, content: 'Low confidence memory.' },
        ],
      },
      readExisting: () => ({
        content: ['- Old memory.', '- Keep existing memory.'].join('\n'),
        entries: ['Old memory.', 'Keep existing memory.'],
      }),
      add: content => {
        actions.push(`add:${content}`)
      },
      replace: (oldText, newText) => {
        actions.push(`replace:${oldText}->${newText}`)
        return { changed: oldText === 'Old memory.' }
      },
      remove: text => {
        actions.push(`remove:${text}`)
        return { changed: text === 'Stale memory.' }
      },
    })

    expect(result).toEqual({
      applied: 3,
      block: ['+ - New durable memory.', '~ - Updated memory.', '- - Stale memory.'].join('\n'),
      added: 1,
      replaced: 1,
      removed: 1,
      skipped: 2,
    })
    expect(actions).toEqual([
      'add:New durable memory.',
      'replace:Old memory.->Updated memory.',
      'remove:Stale memory.',
    ])
  })

  it('parses memory review results and tracks review progress without main types', () => {
    const messages = [
      { role: 'user', content: 'question 1' },
      { role: 'assistant', content: 'answer 1' },
      { role: 'user', content: 'question 2' },
    ]

    expect(countMemoryReviewUserTurns(messages)).toBe(2)
    expect(getMemoryReviewProgress({ messages, interval: 2 })).toMatchObject({
      userTurns: 2,
      turnsSinceReview: 0,
      turnsUntilReview: 0,
      shouldReview: true,
    })

    expect(formatMemoryReviewConversation(messages, 1000)).toBe([
      'User: question 1',
      'Assistant: answer 1',
      'User: question 2',
    ].join('\n\n'))

    expect(parseMemoryReviewModelResult(JSON.stringify({
      action: 'review',
      confidence: 0.86,
      memories: [
        {
          action: 'replace',
          target: 'soul',
          oldText: 'Keep replies formal.',
          newText: 'Keep replies warm.',
          confidence: 0.9,
        },
        {
          action: 'add',
          target: 'memory',
          content: 'api_key = secret',
          sensitivity: 'secret',
        },
      ],
    }))).toEqual({
      confidence: 0.86,
      reason: undefined,
      candidates: [
        {
          action: 'replace',
          target: 'soul',
          confidence: 0.9,
          content: 'Keep replies formal.',
          oldText: 'Keep replies formal.',
          newText: 'Keep replies warm.',
          text: 'Keep replies formal.',
        },
      ],
    })
  })

  it('plans memory review status mutations in core', () => {
    expect(planSoulMemoryReviewTurnStatusMutation({
      lastTurnKey: 'memoryReviewLastTurn:agent:session',
      userTurns: 4,
    })).toMatchObject({
      storeSet: [
        ['memoryReviewLastTurn:agent:session', 4],
        ['lastReviewTurn', 4],
      ],
      runtimePatch: { lastReviewTurn: 4 },
    })
    expect(planSoulMemoryReviewNoneStatusMutation({ runAt: 1000 })).toMatchObject({
      storeSet: [
        ['lastReviewAt', 1000],
        ['lastReviewStatus', 'none'],
        ['lastReviewApplied', 0],
      ],
      storeDelete: ['lastReviewError'],
    })
    expect(planSoulMemoryReviewAppliedStatusMutation({
      runAt: 1200,
      applied: 2,
      skipped: 1,
      userTurns: 6,
    })).toMatchObject({
      storeSet: [
        ['lastReviewAt', 1200],
        ['lastReviewApplied', 2],
        ['lastReviewStatus', 'applied:2 skipped:1 turn:6'],
      ],
    })
    expect(planSoulMemoryReviewErrorStatusMutation({
      runAt: 1300,
      errorMessage: 'boom',
    })).toMatchObject({
      storeSet: [
        ['lastReviewError', 'boom'],
        ['lastReviewStatus', 'error'],
        ['lastReviewAt', 1300],
      ],
    })
  })

  it('runs memory review in core through model and memory adapters', async () => {
    let now = 1000
    const settings = {
      enabled: true,
      interval: 2,
      maxInputChars: 4000,
      timeoutMs: 1000,
      maxCandidates: 2,
      minConfidence: 0.7,
    }
    const messages = [
      { role: 'user', content: 'Remember I prefer Bun scripts.' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'Use that for this repo.' },
      { role: 'assistant', content: 'I will use Bun.' },
    ]
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    const notifications: unknown[] = []
    const appliedCandidates: unknown[] = []
    let generatedPrompt = ''
    const base = {
      sessionId: 'session-1',
      assistantMessageId: 'assistant-1',
      agentId: 'agent-1',
      keyPrefix: 'memoryReviewLastTurn:',
      messages,
      lastUserMessage: 'Use that for this repo.',
      lastAssistantMessage: 'I will use Bun.',
      enabled: true,
      review: settings,
      hash: (value: string) => `hash:${value.length}:${value.slice(0, 8)}`,
      readPlain: (target: 'soul' | 'dreams') => ({
        relativePath: target === 'soul' ? 'SOUL.md' : 'DREAMS.md',
        content: target === 'soul' ? 'Warm voice.' : '',
      }),
      readHermes: (target: 'user' | 'memory') => ({
        relativePath: target === 'user' ? 'USER.md' : 'MEMORY.md',
        content: '',
        entries: [],
      }),
      resolveProvider: () => ({
        provider: { id: 'provider' },
        providerId: 'deepseek',
        model: 'deepseek-chat',
        source: 'tools',
      }),
      generateReview: ({ system, prompt }: { system: string; prompt: string }) => {
        expect(system).toBe(CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT)
        generatedPrompt = prompt
        return JSON.stringify({
          action: 'review',
          confidence: 0.9,
          memories: [
            {
              action: 'add',
              target: 'memory',
              confidence: 0.92,
              content: 'User prefers Bun scripts for this repo.',
            },
            {
              action: 'add',
              target: 'dreams',
              confidence: 0.4,
              content: 'Low confidence idea.',
            },
          ],
        })
      },
      applyCandidate: (candidate: unknown, minConfidence: number) => {
        appliedCandidates.push({ candidate, minConfidence })
        const record = candidate as { confidence: number; target: string }
        return record.confidence >= minConfidence
          ? { changed: true, skipped: false, relativePath: record.target === 'memory' ? 'MEMORY.md' : 'DREAMS.md' }
          : { changed: false, skipped: true, relativePath: 'DREAMS.md' }
      },
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      notify: (message: string, level?: 'info' | 'warn' | 'error') => {
        notifications.push({ message, level })
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      now: () => now,
    }

    await expect(runSoulMemoryReview(base)).resolves.toMatchObject({
      status: 'applied',
      userTurns: 2,
      applied: 1,
      skipped: 1,
      paths: ['MEMORY.md'],
      lastStatus: 'applied:1 skipped:1 turn:2',
    })
    expect(generatedPrompt).toContain('# Existing SOUL.md')
    expect(generatedPrompt).toContain('User: Remember I prefer Bun scripts.')
    expect(appliedCandidates).toHaveLength(2)
    expect(statusPlans).toHaveLength(2)
    expect(statusPlans.at(0)).toMatchObject({
      storeSet: [
        ['memoryReviewLastTurn:agent-1:session-1', 2],
        ['lastReviewTurn', 2],
      ],
    })
    expect(statusPlans.at(1)).toMatchObject({
      storeSet: [
        ['lastReviewAt', 1000],
        ['lastReviewApplied', 1],
        ['lastReviewStatus', 'applied:1 skipped:1 turn:2'],
      ],
    })
    expect(notifications).toEqual([
      { message: 'Memory Review saved 1 update to MEMORY.md', level: 'info' },
    ])
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'model-review', stage: 'request', status: 'started' }),
      expect.objectContaining({ operation: 'after-assistant-response', stage: 'finish', status: 'ok' }),
    ]))

    now = 2000
    statusPlans.length = 0
    await expect(runSoulMemoryReview({
      ...base,
      sessionId: 'session-2',
      generateReview: () => JSON.stringify({ action: 'none', confidence: 1, memories: [] }),
      now: () => now,
    })).resolves.toMatchObject({
      status: 'none',
      applied: 0,
      lastStatus: 'none',
    })
    expect(statusPlans.at(1)).toMatchObject({
      storeSet: [
        ['lastReviewAt', 2000],
        ['lastReviewStatus', 'none'],
        ['lastReviewApplied', 0],
      ],
    })
  })

  it('skips and records memory review errors in core', async () => {
    const settings = {
      enabled: true,
      interval: 2,
      maxInputChars: 4000,
      timeoutMs: 1000,
      maxCandidates: 2,
      minConfidence: 0.7,
    }
    const messages = [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'assistant', content: 'four' },
    ]
    const statusPlans: unknown[] = []
    const diagnostics: unknown[] = []
    const base = {
      sessionId: 'session-1',
      assistantMessageId: 'assistant-1',
      agentId: 'agent-1',
      keyPrefix: 'memoryReviewLastTurn:',
      messages,
      lastUserMessage: 'three',
      lastAssistantMessage: 'four',
      enabled: true,
      review: settings,
      hash: (value: string) => `hash:${value.length}`,
      readPlain: (target: 'soul' | 'dreams') => ({ relativePath: `${target}.md`, content: '' }),
      readHermes: (target: 'user' | 'memory') => ({ relativePath: `${target}.md`, content: '', entries: [] }),
      resolveProvider: () => ({ provider: {}, providerId: 'deepseek', model: 'deepseek-chat' }),
      generateReview: () => {
        throw new Error('provider failed')
      },
      applyCandidate: () => ({ changed: true, skipped: false, relativePath: 'MEMORY.md' }),
      applyStatusMutation: (plan: unknown) => {
        statusPlans.push(plan)
      },
      logDiagnostic: (event: unknown) => diagnostics.push(event),
      now: () => 3000,
    }

    await expect(runSoulMemoryReview({
      ...base,
      enabled: false,
    })).resolves.toMatchObject({
      status: 'skipped',
      userTurns: 2,
    })
    expect(statusPlans).toHaveLength(0)
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'after-assistant-response',
      stage: 'gate',
      status: 'skipped',
    })

    await expect(runSoulMemoryReview(base)).resolves.toMatchObject({
      status: 'error',
      error: 'provider failed',
      lastStatus: 'error',
    })
    expect(statusPlans.at(-1)).toMatchObject({
      storeSet: [
        ['lastReviewError', 'provider failed'],
        ['lastReviewStatus', 'error'],
        ['lastReviewAt', 3000],
      ],
    })
    expect(diagnostics.at(-1)).toMatchObject({
      operation: 'after-assistant-response',
      stage: 'finish',
      status: 'error',
    })
  })

  it('applies plain review document mutations without filesystem access', () => {
    expect(cleanReviewDocumentText(' hello\r\n\n')).toBe('hello')

    const added = applyPlainReviewCandidateToContent('Keep replies formal.\n', {
      action: 'add',
      target: 'soul',
      confidence: 0.9,
      content: 'Prefer concise examples.',
    })
    expect(added).toEqual({
      changed: true,
      skipped: false,
      next: 'Keep replies formal.\n\nPrefer concise examples.\n',
    })

    expect(applyPlainReviewCandidateToContent(added.next!, {
      action: 'add',
      target: 'soul',
      confidence: 0.9,
      content: 'Prefer concise examples.',
    })).toMatchObject({
      changed: false,
      skipped: true,
      reason: 'duplicate',
    })

    const replaced = applyPlainReviewCandidateToContent(added.next!, {
      action: 'replace',
      target: 'soul',
      confidence: 0.9,
      oldText: 'Keep replies formal.',
      newText: 'Keep replies warm.',
    })
    expect(replaced.next).toContain('Keep replies warm.')
    expect(replaced.next).not.toContain('Keep replies formal.')

    const removed = applyPlainReviewCandidateToContent(replaced.next!, {
      action: 'remove',
      target: 'soul',
      confidence: 0.9,
      text: 'Prefer concise examples.',
    })
    expect(removed.changed).toBe(true)
    expect(removed.next).not.toContain('Prefer concise examples.')
  })

  it('applies review candidates through injected host adapters', async () => {
    let soulContent = 'Keep replies formal.\n'
    const hermesActions: string[] = []
    const adapters = {
      readPlain: () => ({ content: soulContent, relativePath: 'SOUL.md' }),
      writePlain: (_target: 'soul' | 'dreams', content: string) => {
        soulContent = content
      },
      readHermes: () => ({
        content: '- Existing durable memory.',
        entries: ['Existing durable memory.'],
        relativePath: 'MEMORY.md',
      }),
      addHermes: (target: 'user' | 'memory', content: string) => {
        hermesActions.push(`add:${target}:${content}`)
        return { relativePath: target === 'memory' ? 'MEMORY.md' : 'USER.md' }
      },
      replaceHermes: (target: 'user' | 'memory', oldText: string, newText: string) => {
        hermesActions.push(`replace:${target}:${oldText}->${newText}`)
        return { changed: oldText === 'Old durable memory.', relativePath: 'MEMORY.md' }
      },
      removeHermes: (target: 'user' | 'memory', text: string) => {
        hermesActions.push(`remove:${target}:${text}`)
        return { changed: false, relativePath: 'MEMORY.md' }
      },
    }

    await expect(applyMemoryReviewCandidate({
      ...adapters,
      minConfidence: 0.8,
      candidate: { action: 'add', target: 'soul', confidence: 0.9, content: 'Prefer precise status updates.' },
    })).resolves.toEqual({ changed: true, skipped: false, relativePath: 'SOUL.md' })
    expect(soulContent).toContain('Prefer precise status updates.')

    await expect(applyMemoryReviewCandidate({
      ...adapters,
      minConfidence: 0.8,
      candidate: { action: 'add', target: 'memory', confidence: 0.9, content: 'Existing durable memory.' },
    })).resolves.toEqual({
      changed: false,
      skipped: true,
      relativePath: 'MEMORY.md',
      reason: 'duplicate',
    })

    await expect(applyMemoryReviewCandidate({
      ...adapters,
      minConfidence: 0.8,
      candidate: {
        action: 'replace',
        target: 'memory',
        confidence: 0.9,
        oldText: 'Old durable memory.',
        newText: 'Updated durable memory.',
      },
    })).resolves.toEqual({ changed: true, skipped: false, relativePath: 'MEMORY.md', reason: undefined })
    expect(hermesActions).toEqual(['replace:memory:Old durable memory.->Updated durable memory.'])
  })

  it('sorts managed memory files by core display order', () => {
    expect(sortManagedMemoryFiles([
      { kind: 'daily', relativePath: 'memory/2026-06-24.md', date: '2026-06-24', mtimeMs: 1 },
      { kind: 'memory', relativePath: 'MEMORY.md', mtimeMs: 1 },
      { kind: 'soul', relativePath: 'SOUL.md', mtimeMs: 1 },
      { kind: 'daily', relativePath: 'memory/2026-06-25.md', date: '2026-06-25', mtimeMs: 1 },
      { kind: 'dreams', relativePath: 'DREAMS.md', mtimeMs: 1 },
      { kind: 'user', relativePath: 'USER.md', mtimeMs: 1 },
    ]).map(file => file.relativePath)).toEqual([
      'SOUL.md',
      'USER.md',
      'MEMORY.md',
      'DREAMS.md',
      'memory/2026-06-25.md',
      'memory/2026-06-24.md',
    ])
  })

  it('tracks markdown index dirty state transitions in core', () => {
    const initial = {
      dirty: true,
      dirtyReason: 'startup',
      dirtyRevision: 1,
      indexedRevision: 0,
    }

    const dirty = markSoulMemoryIndexDirtyState(initial, 'filesystem-change')
    expect(dirty).toEqual({
      dirty: true,
      dirtyReason: 'filesystem-change',
      dirtyRevision: 2,
      indexedRevision: 0,
    })

    expect(markSoulMemoryIndexCleanState(dirty, 1)).toEqual({
      dirty: true,
      dirtyReason: 'filesystem-change',
      dirtyRevision: 2,
      indexedRevision: 1,
    })

    expect(markSoulMemoryIndexCleanState(dirty, 2)).toEqual({
      dirty: false,
      dirtyReason: '',
      dirtyRevision: 2,
      indexedRevision: 2,
    })

    expect(refreshSoulMemoryIndexStatus({
      indexedFiles: 1,
      indexedChunks: 2,
      ftsTokenizer: 'old',
      lastError: 'kept',
    }, {
      indexedFiles: 3,
      indexedChunks: 4,
    }, 'unicode61')).toEqual({
      indexedFiles: 3,
      indexedChunks: 4,
      ftsTokenizer: 'unicode61',
      lastError: 'kept',
    })

    expect(buildSoulMemoryIndexDirtyDiagnostic({
      reason: 'filesystem-change',
      state: dirty,
      metadata: { relativePath: 'memory/2026-06-25.md' },
    })).toEqual({
      subsystem: 'index',
      operation: 'dirty-state',
      stage: 'mark',
      status: 'ok',
      summary: 'Markdown memory index marked dirty: filesystem-change',
      metadata: {
        revision: 2,
        relativePath: 'memory/2026-06-25.md',
      },
    })
  })

  it('builds markdown index file descriptors in core', () => {
    expect(shouldSkipSoulMemoryIndexDirectoryName('.dreams')).toBe(true)
    expect(shouldSkipSoulMemoryIndexDirectoryName('daily')).toBe(false)
    expect(isSoulMemoryIndexMarkdownFileName('MEMORY.md')).toBe(true)
    expect(isSoulMemoryIndexMarkdownFileName('image.png')).toBe(false)
    expect(getSoulMemoryDailyDateFromFileName('2026-06-25-note.md')).toBe('2026-06-25')
    expect(getSoulMemoryDailyDateFromFileName('MEMORY.md')).toBeUndefined()

    expect(createSoulMemoryRootMemoryIndexFile('/repo/MEMORY.md')).toEqual({
      absolutePath: '/repo/MEMORY.md',
      relativePath: 'MEMORY.md',
      kind: 'memory',
    })
    expect(createSoulMemoryDailyIndexFile({
      absolutePath: '/repo/memory/2026-06-25-note.md',
      relativePath: 'memory/2026-06-25-note.md',
      fileName: '2026-06-25-note.md',
    })).toEqual({
      absolutePath: '/repo/memory/2026-06-25-note.md',
      relativePath: 'memory/2026-06-25-note.md',
      kind: 'daily',
      date: '2026-06-25',
    })
  })

  it('runs canonical embedding through core adapters with fallback diagnostics', async () => {
    const settings = { general: { soulMemory: { embeddings: { enabled: true } } } }
    const disabledSettings = { general: { soulMemory: { embeddings: { enabled: false } } } }
    const resolveSettings = (value: typeof settings | typeof disabledSettings) => ({
      embeddings: {
        enabled: value.general.soulMemory.embeddings.enabled,
      },
    })
    let embedCalls = 0

    await expect(runSoulMemoryCanonicalEmbeddingWithAdapters({
      settings: disabledSettings,
      text: 'Skip embeddings',
      getSettings: () => settings,
      resolveSettings,
      embedTexts: async () => {
        embedCalls += 1
        return { vectors: [[1]], providerId: 'unused', model: 'unused' }
      },
      hashText: value => `hash:${value}`,
      previewText: value => value,
    })).resolves.toEqual({})
    expect(embedCalls).toBe(0)

    await expect(runSoulMemoryCanonicalEmbeddingWithAdapters({
      settings,
      text: 'Use embeddings',
      getSettings: () => disabledSettings,
      resolveSettings,
      embedTexts: async input => {
        embedCalls += 1
        expect(input.values).toEqual(['Use embeddings'])
        return { vectors: [[0.1, 0.2]], providerId: 'deepseek', model: 'embedding-model' }
      },
      hashText: value => `hash:${value}`,
      previewText: value => value,
    })).resolves.toEqual({
      embedding: [0.1, 0.2],
      provider: 'deepseek',
      model: 'embedding-model',
    })
    expect(embedCalls).toBe(1)

    const diagnostics: unknown[] = []
    const errors: string[] = []
    await expect(runSoulMemoryCanonicalEmbeddingWithAdapters({
      settings,
      text: 'Fallback text',
      getSettings: () => settings,
      resolveSettings,
      embedTexts: async () => {
        throw new Error('provider unavailable')
      },
      hashText: () => '0123456789abcdef9999',
      previewText: (value, maxChars) => `${value.slice(0, maxChars)} preview`,
      setLastError: message => errors.push(message),
      logDiagnostic: event => diagnostics.push(event),
    })).resolves.toEqual({})
    expect(errors).toEqual([
      'Canonical embedding unavailable; using text dedupe only: provider unavailable',
    ])
    expect(diagnostics).toEqual([{
      subsystem: 'embedding',
      operation: 'graph-memory',
      stage: 'embed',
      status: 'fallback',
      error: expect.any(Error),
      metadata: {
        textHash: '0123456789abcdef',
        textPreview: 'Fallback text preview',
      },
      summary: 'Graph/canonical embedding unavailable; text dedupe remains active.',
    }])
  })

  it('plans markdown index freshness from live files and stored rows in core', () => {
    const liveFiles = [
      {
        absolutePath: '/repo/memory/MEMORY.md',
        relativePath: 'memory/MEMORY.md',
        kind: 'memory' as const,
        mtimeMs: 1000,
        size: 10,
      },
      {
        absolutePath: '/repo/memory/2026-06-25.md',
        relativePath: 'memory/2026-06-25.md',
        kind: 'daily' as const,
        date: '2026-06-25',
        mtimeMs: 2000,
        size: 20,
      },
      {
        absolutePath: '/repo/memory/new.md',
        relativePath: 'memory/new.md',
        kind: 'memory' as const,
        mtimeMs: 3000,
        size: 30,
      },
    ]

    const plan = planSoulMemoryIndexFreshness(liveFiles, [
      { path: 'memory/MEMORY.md', mtime_ms: 1000.25, size: 10 },
      { path: 'memory/2026-06-25.md', mtime_ms: 1990, size: 20 },
      { path: 'memory/deleted.md', mtime_ms: 1500, size: 15 },
    ])

    expect(plan.files).toBe(liveFiles)
    expect(plan.changedFiles.map(file => file.relativePath)).toEqual([
      'memory/2026-06-25.md',
      'memory/new.md',
    ])
    expect(plan.deletedPaths).toEqual(['memory/deleted.md'])

    expect(planSoulMemoryIndexFreshness(liveFiles.slice(0, 1), [
      { path: 'memory/MEMORY.md', mtime_ms: 1000.25, size: 10 },
    ], {
      mtimeToleranceMs: 0.1,
    }).changedFiles.map(file => file.relativePath)).toEqual(['memory/MEMORY.md'])
  })

  it('plans markdown index sync work from freshness in core', () => {
    const unchanged = {
      files: [{ absolutePath: '/a', relativePath: 'a.md', kind: 'memory' as const, mtimeMs: 1, size: 1 }],
      changedFiles: [],
      deletedPaths: [],
    }

    expect(planSoulMemoryIndexSyncWork(unchanged)).toEqual({
      filesToIndex: [],
      shouldSkipNoChanges: true,
    })
    expect(planSoulMemoryIndexSyncWork(unchanged, { force: true })).toEqual({
      filesToIndex: unchanged.files,
      shouldSkipNoChanges: false,
    })

    const changed = {
      ...unchanged,
      changedFiles: unchanged.files,
    }
    expect(planSoulMemoryIndexSyncWork(changed)).toEqual({
      filesToIndex: unchanged.files,
      shouldSkipNoChanges: false,
    })

    expect(planSoulMemoryIndexSyncWork({
      ...unchanged,
      deletedPaths: ['deleted.md'],
    })).toEqual({
      filesToIndex: [],
      shouldSkipNoChanges: false,
    })
  })

  it('plans markdown index file writes in core', () => {
    expect(shouldSkipSoulMemoryIndexFileWrite(
      { hash: 'content-hash', mtime_ms: 123, size: 42 },
      'content-hash',
      { mtimeMs: 123, size: 42 },
    )).toBe(true)
    expect(shouldSkipSoulMemoryIndexFileWrite(
      { hash: 'old-hash', mtime_ms: 123, size: 42 },
      'content-hash',
      { mtimeMs: 123, size: 42 },
    )).toBe(false)

    const plan = planSoulMemoryIndexFileWrite({
      file: {
        absolutePath: '/repo/memory/2026-06-25.md',
        relativePath: 'memory/2026-06-25.md',
        kind: 'daily',
        date: '2026-06-25',
      },
      stat: { mtimeMs: 123, size: 42 },
      contentHash: 'content-hash',
      chunks: [
        { content: 'alpha', startLine: 1, endLine: 1, tokenCount: 2 },
        { content: 'beta', startLine: 2, endLine: 2, tokenCount: 3 },
      ],
      oldChunkIds: ['old-1'],
      embeddings: [[0.1, 0.2]],
      embeddingProvider: 'deepseek',
      embeddingModel: 'embedding-model',
      indexedAt: 999,
      hash: value => `hash:${value}`,
    })

    expect(plan.oldChunkIds).toEqual(['old-1'])
    expect(plan.file).toEqual({
      path: 'memory/2026-06-25.md',
      kind: 'daily',
      absolutePath: '/repo/memory/2026-06-25.md',
      mtimeMs: 123,
      size: 42,
      hash: 'content-hash',
      indexedAt: 999,
    })
    expect(plan.chunks).toEqual([
      {
        id: 'hash:memory/2026-06-25.md:0:alpha',
        path: 'memory/2026-06-25.md',
        kind: 'daily',
        date: '2026-06-25',
        chunkIndex: 0,
        startLine: 1,
        endLine: 1,
        content: 'alpha',
        hash: 'hash:alpha',
        tokenCount: 2,
        embeddingJson: '[0.1,0.2]',
        embeddingProvider: 'deepseek',
        embeddingModel: 'embedding-model',
        mtimeMs: 123,
      },
      {
        id: 'hash:memory/2026-06-25.md:1:beta',
        path: 'memory/2026-06-25.md',
        kind: 'daily',
        date: '2026-06-25',
        chunkIndex: 1,
        startLine: 2,
        endLine: 2,
        content: 'beta',
        hash: 'hash:beta',
        tokenCount: 3,
        embeddingJson: null,
        embeddingProvider: null,
        embeddingModel: null,
        mtimeMs: 123,
      },
    ])
    expect(plan.ftsRows).toEqual([
      { id: 'hash:memory/2026-06-25.md:0:alpha', path: 'memory/2026-06-25.md', content: 'alpha' },
      { id: 'hash:memory/2026-06-25.md:1:beta', path: 'memory/2026-06-25.md', content: 'beta' },
    ])
  })

  it('maps indexed chunk rows in core', () => {
    expect(rowToSoulMemoryChunk({
      id: 'chunk-1',
      path: 'memory/2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
      chunk_index: 2,
      start_line: 10,
      end_line: 14,
      content: 'remember this',
      hash: 'content-hash',
      token_count: 3,
      embedding_json: '[0.1,0.2]',
      embedding_provider: 'deepseek',
      embedding_model: 'embedding-model',
      mtime_ms: 123,
    })).toEqual({
      id: 'chunk-1',
      path: 'memory/2026-06-25.md',
      kind: 'daily',
      date: '2026-06-25',
      chunkIndex: 2,
      startLine: 10,
      endLine: 14,
      content: 'remember this',
      hash: 'content-hash',
      tokenCount: 3,
      embedding: [0.1, 0.2],
      embeddingProvider: 'deepseek',
      embeddingModel: 'embedding-model',
      mtimeMs: 123,
    })

    expect(rowToSoulMemoryChunk({
      id: 'chunk-2',
      path: 'MEMORY.md',
      kind: 'memory',
      date: null,
      chunk_index: 0,
      start_line: 1,
      end_line: 1,
      content: 'plain memory',
      hash: 'plain-hash',
      token_count: 2,
      embedding_json: null,
      embedding_provider: null,
      embedding_model: null,
      mtime_ms: 456,
    })).toMatchObject({
      id: 'chunk-2',
      kind: 'memory',
      date: undefined,
      embedding: undefined,
      embeddingProvider: undefined,
      embeddingModel: undefined,
    })
  })

  it('owns markdown index dirty lifecycle in the core tracker', () => {
    const tracker = new CoreSoulMemoryIndexTracker()

    expect(tracker.getState()).toEqual({
      dirty: true,
      dirtyReason: 'startup',
      dirtyRevision: 1,
      indexedRevision: 0,
    })
    expect(tracker.shouldSync()).toBe(true)

    expect(tracker.markDirty('filesystem-change')).toEqual({
      dirty: true,
      dirtyReason: 'filesystem-change',
      dirtyRevision: 2,
      indexedRevision: 0,
    })
    expect(tracker.markClean(1)).toEqual({
      dirty: true,
      dirtyReason: 'filesystem-change',
      dirtyRevision: 2,
      indexedRevision: 1,
    })
    expect(tracker.markClean(2)).toEqual({
      dirty: false,
      dirtyReason: '',
      dirtyRevision: 2,
      indexedRevision: 2,
    })
    expect(tracker.shouldSync()).toBe(false)
    expect(tracker.shouldSync(true)).toBe(true)
    expect(tracker.dirty).toBe(false)
    expect(tracker.dirtyRevision).toBe(2)
    expect(tracker.indexedRevision).toBe(2)
  })

  it('schedules markdown index sync through the core scheduler', async () => {
    const tracker = new CoreSoulMemoryIndexTracker()
    const diagnostics: unknown[] = []
    const scheduledCallbacks: Array<() => void> = []
    let syncCalls = 0
    let resolveFirst: ((value: string) => void) | undefined

    const scheduler = new CoreSoulMemoryIndexSyncScheduler<{ reason: string; force?: boolean }, string>({
      tracker,
      sync: async request => {
        syncCalls += 1
        if (syncCalls === 1) {
          return new Promise<string>(resolve => {
            resolveFirst = resolve
          })
        }
        tracker.markClean(tracker.dirtyRevision)
        return `synced:${request.reason}`
      },
      logDiagnostic: event => diagnostics.push(event),
      setTimeout: callback => {
        scheduledCallbacks.push(callback)
      },
    })

    expect(scheduler.schedule({ reason: 'startup' })).toBe('scheduled')
    expect(scheduler.isInFlight()).toBe(true)
    expect(scheduler.schedule({ reason: 'already-running' })).toBe('skipped-in-flight')
    expect(syncCalls).toBe(1)

    tracker.markDirty('during-sync')
    const first = scheduler.getInFlight()
    resolveFirst?.('first')
    await first
    expect(scheduler.isInFlight()).toBe(false)
    expect(scheduledCallbacks).toHaveLength(1)

    scheduledCallbacks[0]()
    await scheduler.getInFlight()
    expect(syncCalls).toBe(2)
    expect(tracker.dirty).toBe(false)
    expect(diagnostics).toMatchObject([
      { status: 'started', summary: 'Background index sync scheduled: startup', metadata: { dirtyReason: 'startup' } },
      { status: 'skipped', metadata: { reason: 'already-running' } },
      { status: 'started', summary: 'Background index sync scheduled: dirty-during-sync', metadata: { dirtyReason: 'during-sync' } },
    ])

    expect(scheduler.schedule({ reason: 'clean' })).toBe('skipped-clean')
  })
})
