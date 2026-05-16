import { ensureStoreDirs } from './paths.js'
import { initializeSessionRepositoryIndex } from './sessions.js'

// Re-export all store modules
export { ensureStoreDirs, getStorePath } from './paths.js'
export { getSettings, saveSettings } from './settings.js'
export { getCurrentSessionId, setCurrentSessionId } from './app-state.js'
export {
  getSessions,
  getSession,
  createSession,
  createBranchSession,
  deleteSession,
  renameSession,
  addMessage,
  insertMessageAfter,
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
  updateSessionSummary,
  updateSessionPin,
  updateSessionArchived,
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
} from './sessions.js'

// Ensure all necessary directories exist on startup
export function initializeStores(): void {
  ensureStoreDirs()
  initializeSessionRepositoryIndex()
}
