import { classifyCommand, createBashTool, parseCommand } from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'
import { getConnectedDirectories } from '../../stores/connected-directories.js'
import { getToolOutputsDir } from '../../stores/paths.js'
import { createLocalBashOperations } from '../core/bash-executor.js'

function configuredShellPath(): string | undefined {
  const bashSettings = getSettings().tools?.bash
  return bashSettings && 'shellPath' in bashSettings && typeof bashSettings.shellPath === 'string'
    ? bashSettings.shellPath
    : undefined
}

/**
 * Read per call, not once at module load: the user can tighten this while the
 * app runs and the next command should honour it.
 */
function configuredEnvAllowlist(): string[] | null {
  const allowlist = getSettings().tools?.bash?.envAllowlist
  return Array.isArray(allowlist) ? allowlist : null
}

export const BashTool = createBashTool({
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
  getToolOutputsDir,
  getShellPath: configuredShellPath,
  getConnectedDirectories,
  createOperations: options => createLocalBashOperations({
    ...options,
    envAllowlist: configuredEnvAllowlist(),
  }),
})

export { classifyCommand, parseCommand }
