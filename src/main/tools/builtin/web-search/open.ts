import { createWebOpenTool } from '@onething/runtime/tools'
import { createRequiredAppFetch } from '../../../providers/bound-fetch.js'

export const WebOpenTool = createWebOpenTool({
  getFetch: () => createRequiredAppFetch({ policy: 'webSearch' }),
})
