import type { CommandDefinition, CommandContext, CommandResult } from '@/types/commands'
import { useSessionsStore } from '@/stores/sessions'

/**
 * /cd command - Change current session's working directory
 *
 * Usage:
 *   /cd           - Opens directory picker dialog
 *   /cd <path>    - Sets working directory to specified path
 */
export const cdCommand: CommandDefinition = {
  id: 'cd',
  name: 'Change Directory',
  description: 'Change the working directory for the current session',
  usage: '/cd [path]',

  async execute(context: CommandContext): Promise<CommandResult> {
    const sessionsStore = useSessionsStore()
    const targetPath = context.args[0]

    try {
      let finalPath: string

      if (!targetPath) {
        // No path provided - open directory picker dialog
        const result = await window.electronAPI.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Working Directory',
        })

        if (result.canceled || !result.filePaths?.[0]) {
          return { success: false, message: 'No directory selected' }
        }

        finalPath = result.filePaths[0]
      } else {
        finalPath = targetPath
      }

      // Use sessions store to update (this will update both backend and UI)
      const result = await sessionsStore.updateSessionWorkingDirectory(context.sessionId, finalPath)

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to change directory',
        }
      }

      return {
        success: true,
        message: finalPath,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to change directory',
      }
    }
  },
}
