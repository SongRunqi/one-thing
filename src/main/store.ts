// This file re-exports from the new modular store structure
// for backwards compatibility with existing imports

export {
  // Settings
  getSettings,
  saveSettings,

  // App state
  getCurrentSessionId,
  setCurrentSessionId,

  // Models cache
  getCachedModels,
  setCachedModels,
  clearModelsCache,

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
  updateSessionAgent,
  updateSessionModel,
  updateSessionWorkingDirectory,
  inheritSessionWorkingDirectory,
  updateSessionBuiltinMode,
  updateSessionTokenUsage,
  getSessionTokenUsage,
  deleteSessionsByWorkspace,
  // Optimized session loading (Phase 4: Metadata Separation)
  getSessionsList,
  getSessionDetails,
  getSessionMessages,
  getCachedProviderConfig,
  cacheSessionProviderConfig,

  // Workspaces
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  switchWorkspace,
  uploadWorkspaceAvatar,
  getCurrentWorkspaceId,
  setCurrentWorkspaceId,

  // Initialization
  initializeStores,
} from './stores/index.js'
