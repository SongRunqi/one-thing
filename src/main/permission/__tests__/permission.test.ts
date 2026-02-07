import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock uuid - returns incrementing IDs
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}))

// Mock workspace permissions
vi.mock('../workspace-permissions.js', () => ({
  areAllApprovedInWorkspace: vi.fn(() => false),
  approveInWorkspace: vi.fn(),
}))

// Mock IPC channels
vi.mock('../../../shared/ipc.js', () => ({
  IPC_CHANNELS: {
    PERMISSION_REQUEST: 'permission:request',
    PERMISSION_RESPOND: 'permission:respond',
  },
}))

import { Permission } from '../index'
import { BrowserWindow } from 'electron'
import * as WorkspacePermissions from '../workspace-permissions.js'

// Helper to safely clean up a session (suppresses rejections from pending promises)
function safeCleanSession(sessionId: string): Promise<void> {
  const pending = Permission.getPending(sessionId)
  if (pending.length === 0) {
    Permission.clearSession(sessionId)
    return Promise.resolve()
  }
  // Collect the pending promises before clearing so we can catch rejections
  const promises: Promise<void>[] = []
  for (const p of pending) {
    // We don't have access to the actual promises, so just clear and swallow globally
    // by adding a handler before clearSession triggers reject
  }
  Permission.clearSession(sessionId)
  // Give microtasks a chance to settle
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('Permission', () => {
  beforeEach(async () => {
    // Reset UUID counter
    uuidCounter = 0
    // Safely clear session state - no leftover pending from previous tests
    // since each test is responsible for its own cleanup
    vi.clearAllMocks()
  })

  // ─── getPending ────────────────────────────────────────────────────

  describe('getPending()', () => {
    it('should return empty array for new session', () => {
      const pending = Permission.getPending('new-session')
      expect(pending).toEqual([])
    })

    it('should return pending requests', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        sessionId: 'get-pending-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('get-pending-session')
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('bash')
      expect(pending[0].title).toBe('Run command')

      // Clean up
      Permission.respond({
        sessionId: 'get-pending-session',
        permissionId: pending[0].id,
        response: 'once',
      })
      await askPromise
    })
  })

  // ─── ask() ─────────────────────────────────────────────────────────

  describe('ask()', () => {
    it('should auto-approve when workspace-level permission exists', async () => {
      vi.mocked(WorkspacePermissions.areAllApprovedInWorkspace).mockReturnValueOnce(true)

      await Permission.ask({
        type: 'bash',
        title: 'Run command',
        pattern: 'bash:run',
        sessionId: 'ws-auto-session',
        messageId: 'msg-1',
        metadata: {},
        workingDirectory: '/workspace',
      })

      expect(Permission.getPending('ws-auto-session')).toHaveLength(0)
    })

    it('should auto-approve when session-level permission exists', async () => {
      const askPromise1 = Permission.ask({
        type: 'bash',
        title: 'Run command',
        pattern: 'bash:run',
        sessionId: 'session-auto',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('session-auto')
      Permission.respond({
        sessionId: 'session-auto',
        permissionId: pending[0].id,
        response: 'session',
      })
      await askPromise1

      // Second request with same pattern should auto-approve
      await Permission.ask({
        type: 'bash',
        title: 'Run command again',
        pattern: 'bash:run',
        sessionId: 'session-auto',
        messageId: 'msg-2',
        metadata: {},
      })

      expect(Permission.getPending('session-auto')).toHaveLength(0)
    })

    it('should send IPC event to all windows', async () => {
      const mockSend = vi.fn()
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
        { webContents: { send: mockSend } } as any,
      ])

      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        sessionId: 'ipc-session',
        messageId: 'msg-1',
        metadata: {},
      })

      expect(mockSend).toHaveBeenCalledWith('permission:request', expect.objectContaining({
        type: 'bash',
        title: 'Run command',
      }))

      // Clean up
      const pending = Permission.getPending('ipc-session')
      Permission.respond({
        sessionId: 'ipc-session',
        permissionId: pending[0].id,
        response: 'once',
      })
      await askPromise
    })

    it('should create info with correct fields', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Test title',
        pattern: 'test-pattern',
        callId: 'call-1',
        sessionId: 'fields-session',
        messageId: 'msg-1',
        metadata: { key: 'value' },
        workingDirectory: '/workspace',
      })

      const pending = Permission.getPending('fields-session')
      expect(pending[0]).toMatchObject({
        type: 'bash',
        pattern: 'test-pattern',
        callId: 'call-1',
        sessionId: 'fields-session',
        messageId: 'msg-1',
        title: 'Test title',
        metadata: { key: 'value' },
        workingDirectory: '/workspace',
      })
      expect(pending[0].id).toBeTypeOf('string')
      expect(pending[0].createdAt).toBeTypeOf('number')

      // Clean up
      Permission.respond({
        sessionId: 'fields-session',
        permissionId: pending[0].id,
        response: 'once',
      })
      await askPromise
    })
  })

  // ─── respond() ─────────────────────────────────────────────────────

  describe('respond()', () => {
    it('should return false for non-existent permission', () => {
      const result = Permission.respond({
        sessionId: 'respond-session',
        permissionId: 'non-existent',
        response: 'once',
      })
      expect(result).toBe(false)
    })

    it('should resolve promise on "once" response', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        sessionId: 'once-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('once-session')
      const result = Permission.respond({
        sessionId: 'once-session',
        permissionId: pending[0].id,
        response: 'once',
      })

      expect(result).toBe(true)
      await askPromise
      expect(Permission.getPending('once-session')).toHaveLength(0)
    })

    it('should reject promise on "reject" response', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        sessionId: 'reject-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('reject-session')
      Permission.respond({
        sessionId: 'reject-session',
        permissionId: pending[0].id,
        response: 'reject',
        rejectReason: 'Not allowed',
      })

      await expect(askPromise).rejects.toThrow('User rejected this operation: Not allowed')
    })

    it('should reject with default message when no reason given', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        sessionId: 'reject-default-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('reject-default-session')
      Permission.respond({
        sessionId: 'reject-default-session',
        permissionId: pending[0].id,
        response: 'reject',
      })

      await expect(askPromise).rejects.toThrow('The user rejected permission to use this tool')
    })

    it('should store session-level permission and auto-approve matching requests', async () => {
      // Create two requests with the same pattern
      const ask1 = Permission.ask({
        type: 'bash',
        title: 'Run command 1',
        pattern: 'bash:run',
        sessionId: 'session-level-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const ask2 = Permission.ask({
        type: 'bash',
        title: 'Run command 2',
        pattern: 'bash:run',
        sessionId: 'session-level-session',
        messageId: 'msg-2',
        metadata: {},
      })

      const pending = Permission.getPending('session-level-session')
      expect(pending).toHaveLength(2)

      // Approve the first one with 'session' scope
      Permission.respond({
        sessionId: 'session-level-session',
        permissionId: pending[0].id,
        response: 'session',
      })

      // Both should resolve
      await ask1
      await ask2

      expect(Permission.getPending('session-level-session')).toHaveLength(0)
    })

    it('should handle workspace-level permission and auto-approve matching', async () => {
      vi.mocked(WorkspacePermissions.areAllApprovedInWorkspace).mockReturnValue(true)

      const ask1 = Permission.ask({
        type: 'bash',
        title: 'Run command 1',
        pattern: 'bash:run',
        sessionId: 'ws-level-session',
        messageId: 'msg-1',
        metadata: {},
        workingDirectory: '/workspace',
      })

      const ask2 = Permission.ask({
        type: 'bash',
        title: 'Run command 2',
        pattern: 'bash:run',
        sessionId: 'ws-level-session',
        messageId: 'msg-2',
        metadata: {},
        workingDirectory: '/workspace',
      })

      await ask1
      await ask2
    })

    it('should normalize legacy "always" response to "session"', async () => {
      const askPromise = Permission.ask({
        type: 'bash',
        title: 'Run command',
        pattern: 'bash:run',
        sessionId: 'legacy-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('legacy-session')
      Permission.respond({
        sessionId: 'legacy-session',
        permissionId: pending[0].id,
        response: 'always',
      })

      await askPromise

      // The next request with same pattern should auto-approve
      await Permission.ask({
        type: 'bash',
        title: 'Run again',
        pattern: 'bash:run',
        sessionId: 'legacy-session',
        messageId: 'msg-2',
        metadata: {},
      })
    })
  })

  // ─── clearSession() ────────────────────────────────────────────────

  describe('clearSession()', () => {
    it('should reject all pending requests', async () => {
      const ask1 = Permission.ask({
        type: 'bash',
        title: 'Command 1',
        sessionId: 'clear-session-test',
        messageId: 'msg-1',
        metadata: {},
      })

      const ask2 = Permission.ask({
        type: 'write',
        title: 'Write file',
        sessionId: 'clear-session-test',
        messageId: 'msg-2',
        metadata: {},
      })

      // Catch the rejections BEFORE clearSession to avoid unhandled rejection
      const catchedAsk1 = ask1.catch(e => e)
      const catchedAsk2 = ask2.catch(e => e)

      Permission.clearSession('clear-session-test')

      const err1 = await catchedAsk1
      const err2 = await catchedAsk2

      expect(err1).toBeInstanceOf(Permission.RejectedError)
      expect(err1.message).toContain('Session cleared')
      expect(err2).toBeInstanceOf(Permission.RejectedError)
      expect(err2.message).toContain('Session cleared')
    })

    it('should be safe to clear non-existent session', () => {
      expect(() => Permission.clearSession('non-existent')).not.toThrow()
    })
  })

  // ─── RejectedError ────────────────────────────────────────────────

  describe('RejectedError', () => {
    it('should have correct properties', () => {
      const error = new Permission.RejectedError(
        'session-1',
        'perm-1',
        'call-1',
        { key: 'value' },
        'Custom reason'
      )

      expect(error.name).toBe('PermissionRejectedError')
      expect(error.sessionId).toBe('session-1')
      expect(error.permissionId).toBe('perm-1')
      expect(error.toolCallId).toBe('call-1')
      expect(error.metadata).toEqual({ key: 'value' })
      expect(error.message).toContain('Custom reason')
    })

    it('should use default message when no reason', () => {
      const error = new Permission.RejectedError('s1', 'p1')
      expect(error.message).toBe(
        'The user rejected permission to use this tool. You may try again with different parameters.'
      )
    })

    it('should be an instance of Error', () => {
      const error = new Permission.RejectedError('s1', 'p1')
      expect(error).toBeInstanceOf(Error)
    })
  })

  // ─── Wildcard matching (via session approval) ─────────────────────

  describe('wildcard matching', () => {
    it('should match wildcards in session-approved patterns', async () => {
      const ask1 = Permission.ask({
        type: 'bash',
        title: 'Run command',
        pattern: 'bash:*',
        sessionId: 'wildcard-session',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending = Permission.getPending('wildcard-session')
      Permission.respond({
        sessionId: 'wildcard-session',
        permissionId: pending[0].id,
        response: 'session',
      })
      await ask1

      // A more specific pattern should be auto-approved
      await Permission.ask({
        type: 'bash',
        title: 'Run specific command',
        pattern: 'bash:run',
        sessionId: 'wildcard-session',
        messageId: 'msg-2',
        metadata: {},
      })
    })
  })

  // ─── Multi-session isolation ──────────────────────────────────────

  describe('session isolation', () => {
    it('should not share session-level permissions across sessions', async () => {
      // Approve in session-1
      const ask1 = Permission.ask({
        type: 'bash',
        title: 'Run',
        pattern: 'bash:run',
        sessionId: 'iso-session-1',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending1 = Permission.getPending('iso-session-1')
      Permission.respond({
        sessionId: 'iso-session-1',
        permissionId: pending1[0].id,
        response: 'session',
      })
      await ask1

      // session-2 should still require permission
      const ask2 = Permission.ask({
        type: 'bash',
        title: 'Run',
        pattern: 'bash:run',
        sessionId: 'iso-session-2',
        messageId: 'msg-1',
        metadata: {},
      })

      const pending2 = Permission.getPending('iso-session-2')
      expect(pending2).toHaveLength(1)

      // Clean up properly
      Permission.respond({
        sessionId: 'iso-session-2',
        permissionId: pending2[0].id,
        response: 'once',
      })
      await ask2
    })
  })
})
