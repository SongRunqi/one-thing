import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHANGE_DIRECTORY_SLASH_COMMAND,
  NEW_SESSION_SLASH_COMMAND,
  SHARED_SLASH_COMMANDS,
} from '@onething/core/slash-commands'
import { executeCommand, findCommand, getCommands } from '../index'

const storeMocks = vi.hoisted(() => ({
  createSessionWithoutSwitch: vi.fn(),
}))

const platformMocks = vi.hoisted(() => ({
  capabilities: {
    localFileSystem: true,
    workspaceFileSystem: true,
  },
  showOpenDialog: vi.fn(),
  updateSessionWorkingDirectory: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    createSessionWithoutSwitch: storeMocks.createSessionWithoutSwitch,
  }),
}))

vi.mock('@/platform', () => ({
  platformApi: platformMocks,
}))

describe('renderer command registry', () => {
  beforeEach(() => {
    storeMocks.createSessionWithoutSwitch.mockReset()
    platformMocks.capabilities.localFileSystem = true
    platformMocks.capabilities.workspaceFileSystem = true
    platformMocks.showOpenDialog.mockReset()
    platformMocks.updateSessionWorkingDirectory.mockReset()
  })

  it('registers /new for the command picker', () => {
    const command = findCommand('new')

    expect(command).toMatchObject({
      id: NEW_SESSION_SLASH_COMMAND.id,
      name: NEW_SESSION_SLASH_COMMAND.name,
      usage: NEW_SESSION_SLASH_COMMAND.usage,
      displayLabel: NEW_SESSION_SLASH_COMMAND.displayLabel,
      insertText: NEW_SESSION_SLASH_COMMAND.insertText,
    })
  })

  it('keeps renderer built-in commands in sync with the shared slash registry', () => {
    expect(getCommands().map(command => command.id)).toEqual(
      SHARED_SLASH_COMMANDS.map(command => command.id),
    )
  })

  it('creates a new session and returns the target for /new', async () => {
    storeMocks.createSessionWithoutSwitch.mockResolvedValue({
      id: 'session-new',
      name: 'New Chat',
    })

    const result = await executeCommand('new', {
      sessionId: 'session-1',
      args: '',
    })

    expect(result).toEqual({
      success: true,
      message: 'New session opened',
      switchToSessionId: 'session-new',
    })
    expect(storeMocks.createSessionWithoutSwitch).toHaveBeenCalledWith('New Chat')
  })

  it('rejects unexpected /new arguments', async () => {
    const result = await executeCommand('new', {
      sessionId: 'session-1',
      args: 'session',
    })

    expect(result).toEqual({ success: false, error: `Usage: ${NEW_SESSION_SLASH_COMMAND.usage}` })
    expect(storeMocks.createSessionWithoutSwitch).not.toHaveBeenCalled()
  })

  it('does not open a native directory picker for /cd without args on web hosts', async () => {
    platformMocks.capabilities.localFileSystem = false

    const result = await executeCommand('cd', {
      sessionId: 'session-1',
      args: '',
    })

    expect(result).toEqual({
      success: false,
      error: `Usage: ${CHANGE_DIRECTORY_SLASH_COMMAND.usage}`,
    })
    expect(platformMocks.showOpenDialog).not.toHaveBeenCalled()
    expect(platformMocks.updateSessionWorkingDirectory).not.toHaveBeenCalled()
  })

  it('uses the native directory picker for /cd without args on desktop hosts', async () => {
    platformMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/workspace/project'],
    })
    platformMocks.updateSessionWorkingDirectory.mockResolvedValue({ success: true })

    const result = await executeCommand('cd', {
      sessionId: 'session-1',
      args: '',
    })

    expect(result).toEqual({
      success: true,
      message: 'Working directory set to /workspace/project',
    })
    expect(platformMocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    })
    expect(platformMocks.updateSessionWorkingDirectory).toHaveBeenCalledWith('session-1', '/workspace/project')
  })
})
