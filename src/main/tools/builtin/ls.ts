import { createLsTool } from '@onething/runtime/tools'
import { getSettings } from '../../stores/settings.js'

export const LsTool = createLsTool({
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
})
