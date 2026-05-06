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
  updateSessionModel,
  updateSessionWorkingDirectory,
  updateSessionVariables,
  inheritSessionWorkingDirectory,
  updateSessionTokenUsage,
  getSessionTokenUsage,
  // Optimized session loading (Phase 4: Metadata Separation)
  getSessionsList,
  getSessionDetails,
  getSessionMessages,
  flushSessionSave,
  flushAllPendingSaves,

  // Initialization
  initializeStores,
} from './stores/index.js'
