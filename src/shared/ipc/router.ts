/**
 * IPC Router - Type-safe IPC routing infrastructure
 *
 * Provides a single source of truth for IPC communication:
 * - Define routes once with full type information
 * - Auto-generate channel names from domain + method name
 * - Type-safe handler registration (main process)
 * - Type-safe API generation (preload/renderer)
 *
 * Usage:
 *   1. Define routes in shared/ipc/<domain>.ts using defineRouter()
 *   2. Register handlers in main/ipc/<domain>.ts using registerRouter()
 *   3. Create API in preload using createRouterAPI()
 *
 * Channel naming convention:
 *   domain + camelCase method → "domain:kebab-case"
 *   e.g., "memory-feedback" + "getStats" → "memory-feedback:get-stats"
 */

// --- Core Types ---

/** Route configuration - input/output types for a single IPC method */
export interface RouteConfig {
  input: unknown
  output: unknown
}

/** Domain routes - maps method names to their route configs */
export type DomainRoutes = Record<string, RouteConfig>

/** Router instance - carries domain name, channel map, and type info */
export interface Router<T extends DomainRoutes> {
  readonly domain: string
  readonly channels: { readonly [K in keyof T]: string }
  readonly methods: readonly (keyof T & string)[]
}

/** Handler implementations for a router (main process) */
export type RouteHandlers<T extends DomainRoutes> = {
  [K in keyof T]: (input: T[K]['input']) => Promise<T[K]['output']>
}

/** Client API type for a router (preload/renderer) */
export type RouteAPI<T extends DomainRoutes> = {
  [K in keyof T]: (input: T[K]['input']) => Promise<T[K]['output']>
}

// --- Utilities ---

/** Convert camelCase to kebab-case */
function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/** Generate channel name: "domain:method-name" */
export function getChannelName(domain: string, method: string): string {
  return `${domain}:${toKebab(method)}`
}

// --- Factory ---

/**
 * Define a domain router with auto-generated channel names.
 *
 * @param domain - Domain prefix for channels (e.g., "memory-feedback")
 * @param methods - Array of method names (must match keys of T)
 * @returns Frozen router instance with channel map and type info
 *
 * @example
 * ```ts
 * interface MyRoutes {
 *   getAll: { input: void; output: Item[] }
 *   create: { input: CreateRequest; output: CreateResponse }
 * }
 *
 * export const myRouter = defineRouter<MyRoutes>('my-domain', ['getAll', 'create'])
 * // myRouter.channels.getAll === 'my-domain:get-all'
 * // myRouter.channels.create === 'my-domain:create'
 * ```
 */
export function defineRouter<T extends DomainRoutes>(
  domain: string,
  methods: (keyof T & string)[]
): Router<T> {
  const channels = {} as Record<keyof T & string, string>
  for (const method of methods) {
    channels[method] = getChannelName(domain, method)
  }
  return Object.freeze({
    domain,
    channels: Object.freeze(channels),
    methods: Object.freeze(methods),
  }) as Router<T>
}
