import { createFindTool } from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'
import { Ripgrep } from '../../utils/ripgrep.js'

export const FindTool = createFindTool({
  files: options => Ripgrep.files(options),
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
})
