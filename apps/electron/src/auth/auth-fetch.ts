import { getElectronNetFetch } from './electron-auth.js'

export interface ElectronAuthFetchOptions {
  fallbackFetch: typeof fetch
  getElectronFetch?: () => typeof fetch | undefined
  logger?: Pick<Console, 'warn'>
}

export function createElectronAuthFetch({
  fallbackFetch,
  getElectronFetch = getElectronNetFetch,
  logger = console,
}: ElectronAuthFetchOptions): typeof fetch {
  return async (input, init) => {
    const electronFetch = getElectronFetch()
    if (!electronFetch) {
      return fallbackFetch(input, init)
    }

    try {
      return await electronFetch(input, init as any)
    } catch (error) {
      logger.warn('[Auth] net.fetch failed; falling back to app fetch:', error)
      return fallbackFetch(input, init)
    }
  }
}
