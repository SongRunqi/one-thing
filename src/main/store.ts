// This file re-exports from the new modular store structure
// for backwards compatibility with existing imports

export {
  // Settings
  getSettings,
  saveSettings,

  // App state
  getCurrentSessionId,
  setCurrentSessionId,

  // Sessions
  getSessions,
  getSession,
  createSession,
  createBranchSession,
  deleteSession,
  renameSession,
  updateSessionPin,
  updateSessionArchived,
  addMessage,
  deleteMessage,
  deleteMessageAndTruncate,
  updateMessageAndTruncate,
  updateMessageContent,
  updateMessageReasoning,
  updateMessageStreaming,
  updateMessageUsage,
  updateMessageToolCalls,
  updateMessageContentParts,
  addMessageContentPart,
  updateMessageThinkingTime,
  updateMessageSkill,
  updateMessageError,
  addMessageStep,
  updateMessageStep,
  updateStepsUsageByTurn,
  insertMessageAfter,
  updateSessionSummary,
  updateSessionModel,
  updateSessionWorkingDirectory,
  updateSessionVariables,
  inheritSessionWorkingDirectory,
  updateSessionTokenUsage,
  updateSessionContextSize,
  updateSessionPromptContext,
  getSessionTokenUsage,
  // Optimized session loading (Phase 4: Metadata Separation)
  getSessionsList,
  getSessionDetails,
  getSessionMessages,
  getSessionMessagesPage,
  getSessionUserMessageMarkers,
  initializeSessionRepositoryIndex,
  flushSessionSave,
  flushAllPendingSaves,

  // Initialization
  initializeStores,
} from './stores/index.js'
