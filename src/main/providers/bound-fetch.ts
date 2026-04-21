/**
 * Bound Fetch
 *
 * Produces a `fetch` implementation that routes outgoing HTTP(S) connections
 * through a specific local source IP, letting us pin provider requests to a
 * chosen network interface (e.g. VPN TUN vs. physical Wi-Fi).
 *
 * Implemented via undici's Agent (ships with Node), which passes `localAddress`
 * down to `net.connect` / `tls.connect`.
 */

import { Agent, fetch as undiciFetch } from 'undici'

type FetchFn = typeof globalThis.fetch

const agentCache = new Map<string, Agent>()

function getAgent(localAddress: string): Agent {
  let agent = agentCache.get(localAddress)
  if (!agent) {
    agent = new Agent({ connect: { localAddress } })
    agentCache.set(localAddress, agent)
  }
  return agent
}

/**
 * Create a fetch bound to a specific outbound local IP.
 * Returns undefined when no address is provided so callers can spread the
 * result into provider factories without an extra branch.
 */
export function createBoundFetch(localAddress?: string): FetchFn | undefined {
  if (!localAddress) return undefined
  const dispatcher = getAgent(localAddress)
  return ((input: any, init?: any) =>
    undiciFetch(input, { ...(init || {}), dispatcher })) as unknown as FetchFn
}
