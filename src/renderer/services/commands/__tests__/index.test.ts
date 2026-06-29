import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NEW_SESSION_SLASH_COMMAND,
  SHARED_SLASH_COMMANDS,
} from '@onething/core/slash-commands'
import { executeCommand, findCommand, getCommands } from '../index'

const storeMocks = vi.hoisted(() => ({
  createSessionWithoutSwitch: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    createSessionWithoutSwitch: storeMocks.createSessionWithoutSwitch,
  }),
}))

describe('renderer command registry', () => {
  beforeEach(() => {
    storeMocks.createSessionWithoutSwitch.mockReset()
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
})
