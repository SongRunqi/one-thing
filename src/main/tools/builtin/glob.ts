import { createGlobTool } from '@onething/runtime/tools'
import { Ripgrep } from '../../utils/ripgrep.js'

export const GlobTool = createGlobTool({
  files: options => Ripgrep.files(options),
})
