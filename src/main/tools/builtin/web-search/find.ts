import { createWebFindTool } from '@onething/runtime/tools'
import { createRequiredAppFetch } from '../../../providers/bound-fetch.js'

export const WebFindTool = createWebFindTool({
  getFetch: createRequiredAppFetch,
})
