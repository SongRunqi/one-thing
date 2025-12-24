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
  addMessage,
  deleteMessage,
  updateMessageAndTruncate,
  updateMessageContent,
  updateMessageReasoning,
  updateMessageStreaming,
  updateMessageToolCalls,
  updateMessageContentParts,
  addMessageContentPart,
  updateMessageThinkingTime,
  updateMessageSkill,
  addMessageStep,
  updateMessageStep,
  updateSessionAgent,
  deleteSessionsByWorkspace,

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

  // Agents
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  uploadAgentAvatar,
  getPinnedAgentIds,
  pinAgent,
  unpinAgent,

  // Initialization
  initializeStores,
} from './stores/index.js'
