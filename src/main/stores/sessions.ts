import fs from 'fs'
import type { ChatMessage, ChatSession, ToolCall, Step, ContentPart } from '../../shared/ipc.js'
import {
  getSessionsDir,
  getSessionPath,
  readJsonFile,
  writeJsonFile,
  deleteJsonFile,
} from './paths.js'
import { getCurrentSessionId, setCurrentSessionId } from './app-state.js'

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
  return session || undefined
}

// Create a new session
export function createSession(sessionId: string, name: string, workspaceId?: string, agentId?: string): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    workspaceId,
    agentId,
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
  // Get parent session to inherit workspaceId and agentId if not provided
  const parentSession = getSession(parentSessionId)
  const inheritedWorkspaceId = parentSession?.workspaceId
  const inheritedAgentId = agentId ?? parentSession?.agentId

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

// Rename a session
export function renameSession(sessionId: string, newName: string): void {
  const session = getSession(sessionId)
  if (!session) return

  session.name = newName
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.name = newName
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }
}

// Update session pin status
export function updateSessionPin(sessionId: string, isPinned: boolean): void {
  const session = getSession(sessionId)
  if (!session) return

  session.isPinned = isPinned
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.isPinned = isPinned
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }
}

// Update session agent
export function updateSessionAgent(sessionId: string, agentId: string | null): void {
  const session = getSession(sessionId)
  if (!session) return

  if (agentId === null) {
    delete session.agentId
  } else {
    session.agentId = agentId
  }
  session.updatedAt = Date.now()

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
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
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
export function updateMessageAndTruncate(
  sessionId: string,
  messageId: string,
  newContent: string
): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const messageIndex = session.messages.findIndex((m) => m.id === messageId)
  if (messageIndex === -1) return false

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

// Update message content (for streaming)
export function updateMessageContent(sessionId: string, messageId: string, newContent: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.content = newContent
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

// Update message reasoning (for streaming)
export function updateMessageReasoning(sessionId: string, messageId: string, reasoning: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.reasoning = reasoning
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

// Update message streaming status
export function updateMessageStreaming(sessionId: string, messageId: string, isStreaming: boolean): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.isStreaming = isStreaming
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

// Update message tool calls
export function updateMessageToolCalls(sessionId: string, messageId: string, toolCalls: ToolCall[]): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.toolCalls = toolCalls
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

// Update message content parts (for sequential tool call display)
export function updateMessageContentParts(sessionId: string, messageId: string, contentParts: ChatMessage['contentParts']): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.contentParts = contentParts
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

// Add a single content part to message (for streaming)
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

// Update message thinking time (for persisting thinking duration after streaming completes)
export function updateMessageThinkingTime(sessionId: string, messageId: string, thinkingTime: number): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.thinkingTime = thinkingTime
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

// Update message skill used
export function updateMessageSkill(sessionId: string, messageId: string, skillUsed: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  message.skillUsed = skillUsed
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

// Add a step to a message
export function addMessageStep(sessionId: string, messageId: string, step: Step): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message) return false

  if (!message.steps) {
    message.steps = []
  }
  message.steps.push(step)
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

// Update a step in a message
export function updateMessageStep(sessionId: string, messageId: string, stepId: string, updates: Partial<Step>): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  const message = session.messages.find((m) => m.id === messageId)
  if (!message || !message.steps) return false

  const step = message.steps.find((s) => s.id === stepId)
  if (!step) return false

  // Apply updates
  Object.assign(step, updates)
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

// Update session model and provider
export function updateSessionModel(sessionId: string, provider: string, model: string): boolean {
  const session = getSession(sessionId)
  if (!session) return false

  session.lastProvider = provider
  session.lastModel = model
  session.updatedAt = Date.now()

  // Save session file
  writeJsonFile(getSessionPath(sessionId), session)

  // Update index
  const index = loadSessionsIndex()
  const meta = index.find((s) => s.id === sessionId)
  if (meta) {
    meta.lastProvider = provider
    meta.lastModel = model
    meta.updatedAt = session.updatedAt
    saveSessionsIndex(index)
  }

  return true
}
