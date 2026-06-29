import {
  classifyCommand,
  createBashTool,
  parseCommand,
} from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'
import { getToolOutputsDir } from '../../stores/paths.js'
import { createLocalBashOperations } from '../core/bash-executor.js'

function configuredShellPath(): string | undefined {
  const bashSettings = getSettings().tools?.bash
  return bashSettings && 'shellPath' in bashSettings && typeof bashSettings.shellPath === 'string'
    ? bashSettings.shellPath
    : undefined
}

export const BashTool = createBashTool({
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
  getToolOutputsDir,
  getShellPath: configuredShellPath,
  createOperations: options => createLocalBashOperations(options),
})

export { classifyCommand, parseCommand }
