import fs from 'fs'
import type { ChatMessage, ChatSession, ToolCall } from '../../shared/ipc.js'
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
export function createSession(sessionId: string, name: string): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  inheritedMessages: ChatMessage[]
): ChatSession {
  const session: ChatSession = {
    id: sessionId,
    name,
    messages: inheritedMessages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentSessionId,
    branchFromMessageId,
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
  })
  saveSessionsIndex(index)

  // Set as current session
  setCurrentSessionId(sessionId)

  return session
}

// Delete a session
export function deleteSession(sessionId: string): void {
  // Delete session file
  deleteJsonFile(getSessionPath(sessionId))

  // Update index
  let index = loadSessionsIndex()
  index = index.filter((s) => s.id !== sessionId)
  saveSessionsIndex(index)

  // Update current session if needed
  if (getCurrentSessionId() === sessionId) {
    const nextSession = index[0]
    setCurrentSessionId(nextSession?.id || '')
  }
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

// Add a message to a session
export function addMessage(sessionId: string, message: ChatMessage): void {
  const session = getSession(sessionId)
  if (!session) return

  session.messages.push(message)
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
