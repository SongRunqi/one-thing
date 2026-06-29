import { createGrepTool } from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'
import { Ripgrep } from '../../utils/ripgrep.js'

export const GrepTool = createGrepTool({
  search: options => Ripgrep.search(options),
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
})
