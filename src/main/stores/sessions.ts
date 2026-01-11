import fs from 'fs'
import type { ChatMessage, ChatSession, ToolCall, Step, ContentPart, SessionPlan } from '../../shared/ipc.js'
import {
  getSessionsDir,
  getSessionPath,
  readJsonFile,
  writeJsonFile,
  deleteJsonFile,
} from './paths.js'
import { getCurrentSessionId, setCurrentSessionId } from './app-state.js'
import { getWorkspace } from './workspaces.js'
import { getSettings } from './settings.js'
import { expandPath } from '../tools/core/sandbox.js'

/**
 * Sanitize a session after loading - clean up UI-only states
 * Note: Step/toolCall statuses are NOT modified here to preserve state across session switches
 * Status cleanup only happens on app startup via sanitizeAllSessions()
 */
function sanitizeSession(session: ChatSession): ChatSession {
  let modified = false

  for (const message of session.messages) {
    // Clean up streaming state (UI-only, safe to reset)
    if (message.isStreaming) {
      message.isStreaming = false
      modified = true
    }
  }

  return session
}

/**
 * Sanitize a step and its childSteps recursively
 * Returns true if any modifications were made
 */
function sanitizeStepRecursive(step: Step): boolean {
  let modified = false

  if (step.status === 'running' || step.status === 'pending') {
    step.status = 'failed'
    step.error = step.error || 'Interrupted: app was closed'
    if (step.title.startsWith('Running:') || step.title.startsWith('调用工具:')) {
      step.title = step.title.replace(/^(Running:|调用工具:)\s*/, 'Interrupted: ')
    }
    modified = true
  }
  if (step.status === 'awaiting-confirmation') {
    step.status = 'failed'
    step.error = 'Interrupted: permission request was not answered'
    modified = true
  }
  if (step.toolCall) {
    if (step.toolCall.status === 'executing' || step.toolCall.status === 'pending') {
      step.toolCall.status = 'cancelled'
      modified = true
    }
  }

  // Recursively sanitize childSteps
  if (step.childSteps?.length) {
    for (const childStep of step.childSteps) {
      if (sanitizeStepRecursive(childStep)) {
        modified = true
      }
    }
  }

  return modified
}

/**
 * Sanitize all sessions on app startup - clean up interrupted states
 * This should only be called once when the app starts
 */
export function sanitizeAllSessionsOnStartup(): void {
  const index = loadSessionsIndex()

  for (const meta of index) {
    const sessionPath = getSessionPath(meta.id)
    const session = readJsonFile<ChatSession | null>(sessionPath, null)
    if (!session) continue

    let modified = false

    for (const message of session.messages) {
      // Clean up streaming state
      if (message.isStreaming) {
        message.isStreaming = false
        modified = true
      }

      // Clean up interrupted steps (recursively including childSteps)
      if (message.steps) {
        for (const step of message.steps) {
          if (sanitizeStepRecursive(step)) {
            modified = true
          }
        }
      }

      // Clean up interrupted toolCalls
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          if (tc.status === 'executing' || tc.status === 'pending') {
            tc.status = 'cancelled'
            modified = true
          }
        }
      }
    }

    // Only write back if modified
    if (modified) {
      writeJsonFile(sessionPath, session)
    }
  }
}

// Session metadata stored in index for quick listing
interface SessionMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  parentSessionId?: string
  branchFromMessageId?: string
  lastModel?: string
  lastProvider?: string
  isPinned?: boolean
  isArchived?: boolean  // Archived (soft-deleted) session
  archivedAt?: number   // Timestamp when session was archived
  workspaceId?: string  // Associated workspace ID
  agentId?: string  // Associated agent ID for system prompt
}

// Get sessions index path
function getSessionsIndexPath(): string {
  return `${getSessionsDir()}/index.json`
}

// Load sessions index (metadata only)
function loadSessionsIndex(): SessionMeta[] {
  return readJsonFile(getSessionsIndexPath(), [])
}

// Save sessions index
function saveSessionsIndex(index: SessionMeta[]): void {
  writeJsonFile(getSessionsIndexPath(), index)
}

// Get all sessions with full data
export function getSessions(): ChatSession[] {
  const index = loadSessionsIndex()
  const sessions: ChatSession[] = []

  for (const meta of index) {
    const session = getSession(meta.id)
    if (session) {
      sessions.push(session)
    }
  }

  return sessions
}

// Get a single session by ID
export function getSession(sessionId: string): ChatSession | undefined {
  const sessionPath = getSessionPath(sessionId)
  const session = readJsonFile<ChatSession | null>(sessionPath, null)
  if (!session) return undefined

  // Expand ~ in workingDirectory (handles legacy stored paths)
  if (session.workingDirectory) {
    session.workingDirectory = expandPath(session.workingDirectory)
  }

  // Sanitize session to clean up interrupted states
  return sanitizeSession(session)
}

// Create a new session
export function createSession(sessionId: string, name: string, workspaceId?: string, agentId?: string): ChatSession {
  // Inherit workingDirectory from workspace if available
  let workingDirectory: string | undefined
  if (workspaceId) {
    const workspace = getWorkspace(workspaceId)
    workingDirectory = workspace?.workingDirectory
  }

  // Fallback to defaultWorkingDirectory from settings if not set
  if (!workingDirectory) {
    const settings = getSettings()
    const defaultDir = settings.tools?.bash?.defaultWorkingDirectory
    if (defaultDir) {
      workingDirectory = expandPath(defaultDir)
    }
  }

  const session: ChatSession = {
    id: sessionId,
    name,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceId,
    agentId,
    workingDirectory,
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  index.unshift({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    workspaceId,
    agentId,
  })
  saveSessionsIndex(index)

  // Set as current session
  setCurrentSessionId(sessionId)

  return session
}

// Create a branch session
export function createBranchSession(
  sessionId: string,
  name: string,
  parentSessionId: string,
  branchFromMessageId: string,
  inheritedMessages: ChatMessage[],
  agentId?: string
): ChatSession {
  // Get parent session to inherit workspaceId, agentId, and workingDirectory if not provided
  const parentSession = getSession(parentSessionId)
  const inheritedWorkspaceId = parentSession?.workspaceId
  const inheritedAgentId = agentId ?? parentSession?.agentId

  // Inherit workingDirectory from parent session
  let workingDirectory = parentSession?.workingDirectory

  // Fallback to defaultWorkingDirectory from settings if not set
  if (!workingDirectory) {
    const settings = getSettings()
    const defaultDir = settings.tools?.bash?.defaultWorkingDirectory
    if (defaultDir) {
      workingDirectory = expandPath(defaultDir)
    }
  }

  // Calculate token usage from inherited messages
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0

  for (const message of inheritedMessages) {
    if (message.usage) {
      totalInputTokens += message.usage.inputTokens
      totalOutputTokens += message.usage.outputTokens
      totalTokens += message.usage.totalTokens
    }
  }

  const session: ChatSession = {
    id: sessionId,
    name,
    messages: inheritedMessages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentSessionId,
    branchFromMessageId,
    workspaceId: inheritedWorkspaceId,
    agentId: inheritedAgentId,
    workingDirectory,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  index.unshift({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    parentSessionId,
    branchFromMessageId,
    workspaceId: inheritedWorkspaceId,
    agentId: inheritedAgentId,
  })
  saveSessionsIndex(index)

  // Set as current session
  setCurrentSessionId(sessionId)

  return session
}

// Delete session result type
export interface DeleteSessionResult {
  deletedIds: string[]
  parentSessionId?: string
}

// Delete a session and all its child sessions (cascade delete)
export function deleteSession(sessionId: string): DeleteSessionResult {
  const session = getSession(sessionId)
  const parentSessionId = session?.parentSessionId

  // Recursively collect all child session IDs
  function collectChildSessionIds(parentId: string): string[] {
    const index = loadSessionsIndex()
    const children = index.filter(s => s.parentSessionId === parentId)
    let ids: string[] = []
    for (const child of children) {
      ids.push(child.id)
      ids = ids.concat(collectChildSessionIds(child.id))
    }
    return ids
  }

  // Collect all IDs to delete (current session + all children)
  const childIds = collectChildSessionIds(sessionId)
  const allIdsToDelete = [sessionId, ...childIds]

  // Delete all session files
  for (const id of allIdsToDelete) {
    deleteJsonFile(getSessionPath(id))
  }

  // Update index - remove all deleted sessions
  let index = loadSessionsIndex()
  index = index.filter(s => !allIdsToDelete.includes(s.id))
  saveSessionsIndex(index)

  // Update current session if it was deleted
  if (allIdsToDelete.includes(getCurrentSessionId())) {
    // If we have a parent session and it still exists, switch to it
    if (parentSessionId && index.some(s => s.id === parentSessionId)) {
      setCurrentSessionId(parentSessionId)
    } else {
      // Otherwise switch to the first available session
      const nextSession = index[0]
      setCurrentSessionId(nextSession?.id || '')
    }
  }

  return { deletedIds: allIdsToDelete, parentSessionId }
}

// Rename a session (does not update updatedAt to avoid reordering)
export function renameSession(sessionId: string, newName: string): void {
  const session = getSession(sessionId)
  if (!session) return

  session.name = newName

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index (only name, not updatedAt)
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.name = newName
    saveSessionsIndex(index)
  }
}

// Update session pin status (does not affect sort order)
export function updateSessionPin(sessionId: string, isPinned: boolean): void {
  const session = getSession(sessionId)
  if (!session) return

  session.isPinned = isPinned

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.isPinned = isPinned
    saveSessionsIndex(index)
  }
}

// Update session archived status (does not affect sort order)
export function updateSessionArchived(sessionId: string, isArchived: boolean, archivedAt?: number | null): void {
  const session = getSession(sessionId)
  if (!session) return

  session.isArchived = isArchived
  if (isArchived && archivedAt) {
    session.archivedAt = archivedAt
  } else if (!isArchived) {
    delete session.archivedAt
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.isArchived = isArchived
    if (isArchived && archivedAt) {
      meta.archivedAt = archivedAt
    } else if (!isArchived) {
      delete meta.archivedAt
    }
    saveSessionsIndex(index)
  }
}

// Update session agent (does not affect sort order)
export function updateSessionAgent(sessionId: string, agentId: string | null): void {
  const session = getSession(sessionId)
  if (!session) return

  if (agentId === null) {
    delete session.agentId
  } else {
    session.agentId = agentId
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    if (agentId === null) {
      delete meta.agentId
    } else {
      meta.agentId = agentId
    }
    saveSessionsIndex(index)
  }
}

// Update session working directory (does not affect sort order)
export function updateSessionWorkingDirectory(sessionId: string, workingDirectory: string | null): void {
  const session = getSession(sessionId)
  if (!session) return

  if (workingDirectory === null || workingDirectory === '') {
    delete session.workingDirectory
  } else {
    // Expand ~ to home directory before storing
    session.workingDirectory = expandPath(workingDirectory)
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)
}

// Update session builtin mode (Ask mode / Build mode)
export function updateSessionBuiltinMode(sessionId: string, mode: 'build' | 'ask'): void {
  const session = getSession(sessionId)
  if (!session) return

  if (mode === 'build') {
    delete session.builtinMode  // 'build' is default, no need to store
  } else {
    session.builtinMode = mode
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)
}

// Update session plan (Planning workflow)
export function updateSessionPlan(sessionId: string, plan: SessionPlan | null): void {
  const session = getSession(sessionId)
  if (!session) return

  if (plan === null) {
    delete session.plan
  } else {
    session.plan = plan
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)
}

// Get session plan
export function getSessionPlan(sessionId: string): SessionPlan | undefined {
  const session = getSession(sessionId)
  return session?.plan
}

// Inherit working directory from workspace (does not update updatedAt)
export function inheritSessionWorkingDirectory(sessionId: string, workingDirectory: string): void {
  const session = getSession(sessionId)
  if (!session) return

  // Expand ~ to home directory before storing
  session.workingDirectory = expandPath(workingDirectory)

  // Save session file without updating timestamp
  writeJsonFile(getSessionPath(sessionId), session)
}

// Update session token usage (does not affect sort order)
export function updateSessionTokenUsage(
  sessionId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  lastTurnUsage?: { inputTokens: number; outputTokens: number }
): void {
  const session = getSession(sessionId)
  if (!session) return

  // Accumulate token usage (for statistics)
  session.totalInputTokens = (session.totalInputTokens || 0) + usage.inputTokens
  session.totalOutputTokens = (session.totalOutputTokens || 0) + usage.outputTokens
  session.totalTokens = (session.totalTokens || 0) + usage.totalTokens

  // Use last turn's usage for context size (NOT accumulated)
  const turnUsage = lastTurnUsage || usage
  session.lastInputTokens = turnUsage.inputTokens
  // Context size = input tokens only (context window limit applies to input)
  session.contextSize = turnUsage.inputTokens

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)
}

// Get session token usage
export function getSessionTokenUsage(sessionId: string): {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  lastInputTokens: number
  contextSize: number
} | null {
  const session = getSession(sessionId)
  if (!session) return null

  return {
    totalInputTokens: session.totalInputTokens || 0,
    totalOutputTokens: session.totalOutputTokens || 0,
    totalTokens: session.totalTokens || 0,
    lastInputTokens: session.lastInputTokens || 0,
    contextSize: session.contextSize || 0,
  }
}

// Add a message to a session
export function addMessage(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId)
  if (!session) return

  session.messages.push(message)
  if (message.role === 'assistant' && message.model) {
    session.lastModel = message.model
  }
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    meta.lastModel = message.role === 'assistant' ? message.model : meta.lastModel
    saveSessionsIndex(index)
  }
}

// Insert a message after a specific message ID
// Used for context compacting to insert summary message at the correct position
export function insertMessageAfter(sessionId: string, afterMessageId: string, message: ChatMessage): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const index = session.messages.findIndex((m) => m.id === afterMessageId)
  if (index === -1) {
    // If afterMessageId not found, append to end
    session.messages.push(message)
  } else {
    // Insert after the found message
    session.messages.splice(index + 1, 0, message)
  }

  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Delete a message from a session
export function deleteMessage(sessionId: string, messageId: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const index = session.messages.findIndex((m) => m.id === messageId)
  if (index === -1) return false

  session.messages.splice(index, 1)
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update a message and remove all messages after it
// Returns true if successful, also subtracts token usage of deleted messages from session total
export function updateMessageAndTruncate(
  sessionId: string,
  messageId: string,
  newContent: string
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const messageIndex = session.messages.findIndex((m) => m.id === messageId)
  if (messageIndex === -1) return false

  // Calculate token usage of messages that will be deleted
  const messagesToDelete = session.messages.slice(messageIndex + 1)
  let tokensToSubtract = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for (const msg of messagesToDelete) {
    if (msg.usage) {
      tokensToSubtract.inputTokens += msg.usage.inputTokens
      tokensToSubtract.outputTokens += msg.usage.outputTokens
      tokensToSubtract.totalTokens += msg.usage.totalTokens
    }
  }

  // Subtract deleted messages' token usage from session total
  if (tokensToSubtract.totalTokens > 0) {
    session.totalInputTokens = Math.max(0, (session.totalInputTokens || 0) - tokensToSubtract.inputTokens)
    session.totalOutputTokens = Math.max(0, (session.totalOutputTokens || 0) - tokensToSubtract.outputTokens)
    session.totalTokens = Math.max(0, (session.totalTokens || 0) - tokensToSubtract.totalTokens)
    console.log('[Sessions] Subtracted tokens from deleted messages:', tokensToSubtract, 'New session totals:', {
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      totalTokens: session.totalTokens,
    })
  }

  // Update the message content
  session.messages[messageIndex].content = newContent
  session.messages[messageIndex].timestamp = Date.now()

  // Remove all messages after this one
  session.messages = session.messages.slice(0, messageIndex + 1)
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}

// Update message content (for streaming, does not affect sort order)
export function updateMessageContent(sessionId: string, messageId: string, newContent: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.content = newContent

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message reasoning (for streaming, does not affect sort order)
export function updateMessageReasoning(sessionId: string, messageId: string, reasoning: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.reasoning = reasoning

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message streaming status (does not affect sort order)
export function updateMessageStreaming(sessionId: string, messageId: string, isStreaming: boolean): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.isStreaming = isStreaming

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message usage (does not affect sort order)
export function updateMessageUsage(
  sessionId: string,
  messageId: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.usage = usage

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message tool calls (does not affect sort order)
export function updateMessageToolCalls(sessionId: string, messageId: string, toolCalls: ToolCall[]): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.toolCalls = toolCalls

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message content parts (does not affect sort order)
export function updateMessageContentParts(sessionId: string, messageId: string, contentParts: ChatMessage['contentParts']): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.contentParts = contentParts

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Add a single content part to message (does not affect sort order)
export function addMessageContentPart(sessionId: string, messageId: string, part: ContentPart): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  // Initialize contentParts array if needed
  if (!message.contentParts) {
    message.contentParts = []
  }

  message.contentParts.push(part)

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message thinking time (does not affect sort order)
export function updateMessageThinkingTime(sessionId: string, messageId: string, thinkingTime: number): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.thinkingTime = thinkingTime

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message skill used (does not affect sort order)
export function updateMessageSkill(sessionId: string, messageId: string, skillUsed: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.skillUsed = skillUsed

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update message error details (for API errors during streaming)
export function updateMessageError(sessionId: string, messageId: string, errorDetails: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.errorDetails = errorDetails

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

/**
 * Find a step by ID, recursively searching in childSteps
 */
function findStepByIdRecursive(steps: Step[], stepId: string): Step | undefined {
  for (const step of steps) {
    if (step.id === stepId) return step
    if (step.childSteps?.length) {
      const found = findStepByIdRecursive(step.childSteps, stepId)
      if (found) return found
    }
  }
  return undefined
}

// Add a step to a message (does not affect sort order)
// If step has parentStepId, adds to parent's childSteps array
export function addMessageStep(sessionId: string, messageId: string, step: Step): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  if (!message.steps) {
    message.steps = []
  }

  // If step has a parent, add to parent's childSteps
  if (step.parentStepId) {
    const parentStep = findStepByIdRecursive(message.steps, step.parentStepId)
    if (parentStep) {
      if (!parentStep.childSteps) {
        parentStep.childSteps = []
      }
      // Check for duplicate in childSteps
      const existingChildIndex = parentStep.childSteps.findIndex(
        s => s.toolCallId && s.toolCallId === step.toolCallId
      )
      if (existingChildIndex >= 0) {
        parentStep.childSteps[existingChildIndex] = { ...parentStep.childSteps[existingChildIndex], ...step }
      } else {
        parentStep.childSteps.push(step)
      }
      // Save session file
      writeJsonFile(getSessionPath(sessionId), session)
      return true
    }
    // Parent not found - fall through to add as top-level step
    console.warn(`[sessions] Parent step not found for childStep: parentId=${step.parentStepId}, stepId=${step.id}`)
  }

  // Add as top-level step (no parent or parent not found)
  // Check for duplicate by toolCallId to avoid creating multiple steps for the same tool call
  const existingIndex = message.steps.findIndex(s => s.toolCallId && s.toolCallId === step.toolCallId)
  if (existingIndex >= 0) {
    // Update existing step instead of adding duplicate
    message.steps[existingIndex] = { ...message.steps[existingIndex], ...step }

  } else {
    message.steps.push(step)
  }

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update a step in a message (does not affect sort order)
// Searches recursively in childSteps
export function updateMessageStep(sessionId: string, messageId: string, stepId: string, updates: Partial<Step>): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message || !message.steps) return false

  // Use recursive search to find step (could be in childSteps)
  const step = findStepByIdRecursive(message.steps, stepId)
  if (!step) return false

  // Apply updates
  Object.assign(step, updates)

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  return true
}

// Update usage for all steps in a specific turn (does not affect sort order)
export function updateStepsUsageByTurn(
  sessionId: string,
  messageId: string,
  turnIndex: number,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
): string[] {
  const session = getSession(sessionId)
  if (!session) return []

  const message = session.messages.find((m) => m.id === messageId)
  if (!message || !message.steps) return []

  // Find all steps with matching turnIndex and update their usage
  const updatedStepIds: string[] = []
  for (const step of message.steps) {
    if (step.turnIndex === turnIndex) {
      step.usage = usage
      updatedStepIds.push(step.id)
    }
  }

  if (updatedStepIds.length > 0) {
    // Save session file
    writeJsonFile(getSessionPath(sessionId), session)
  }

  return updatedStepIds
}

// Update session summary (for context compacting)
export function updateSessionSummary(
  sessionId: string,
  summary: string,
  summaryUpToMessageId: string
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.summary = summary
  session.summaryUpToMessageId = summaryUpToMessageId
  session.summaryCreatedAt = Date.now()
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index timestamp
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}

// Delete all sessions associated with a workspace
export function deleteSessionsByWorkspace(workspaceId: string): number {
  const index = loadSessionsIndex()
  const sessionsToDelete = index.filter(s => s.workspaceId === workspaceId)

  // Delete session files
  for (const session of sessionsToDelete) {
    deleteJsonFile(getSessionPath(session.id))
  }

  // Update index - remove deleted sessions
  const newIndex = index.filter(s => s.workspaceId !== workspaceId)
  saveSessionsIndex(newIndex)

  // If current session was deleted, clear it
  const currentSessionId = getCurrentSessionId()
  if (sessionsToDelete.some(s => s.id === currentSessionId)) {
    // Try to switch to another session in default mode
    const defaultSession = newIndex.find(s => !s.workspaceId)
    setCurrentSessionId(defaultSession?.id || '')
  }

  return sessionsToDelete.length
}

// Update session model and provider (does not affect sort order)
export function updateSessionModel(sessionId: string, provider: string, model: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.lastProvider = provider
  session.lastModel = model

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index (without changing updatedAt)
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.lastProvider = provider
    meta.lastModel = model
    saveSessionsIndex(index)
  }

  return true
}
