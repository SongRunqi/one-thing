import {
  createBraveSearchProvider,
  __resetBraveRateLimiterForTests,
} from '@onething/runtime/tools'
import { createRequiredAppFetch } from '../../../../providers/bound-fetch.js'
import { getSettings } from '../../../../stores/settings.js'

export const braveProvider = createBraveSearchProvider({
  getApiKey: () => getSettings().tools?.webSearch?.braveApiKey,
  getFetch: () => createRequiredAppFetch({ policy: 'webSearch' }),
})

export { __resetBraveRateLimiterForTests }
