import {
  createBraveSearchProvider,
  createWebSearchTool,
} from '@onething/runtime/tools'
import { createRequiredAppFetch } from '../../../providers/bound-fetch.js'
import { getSettings } from '../../../stores/settings.js'

const createWebSearchFetch = () => createRequiredAppFetch({ policy: 'webSearch' })

export const WebSearchTool = createWebSearchTool({
  providers: {
    brave: createBraveSearchProvider({
      getApiKey: () => getSettings().tools?.webSearch?.braveApiKey,
      getFetch: createWebSearchFetch,
    }),
  },
  getFetch: createWebSearchFetch,
})
