import { networkInterfaces } from 'node:os'
import type { NetworkAddressFamily, NetworkInterfaceOption } from '../../shared/ipc.js'

function normalizeFamily(family: string | number): NetworkAddressFamily | null {
  if (family === 'IPv4' || family === 4) return 'IPv4'
  if (family === 'IPv6' || family === 6) return 'IPv6'
  return null
}

export function listNetworkInterfaces(): NetworkInterfaceOption[] {
  const entries = networkInterfaces()
  const options: NetworkInterfaceOption[] = []

  for (const [name, addresses] of Object.entries(entries)) {
    for (const addressInfo of addresses ?? []) {
      const family = normalizeFamily(addressInfo.family)
      if (!family || !addressInfo.address) continue

      options.push({
        id: `${name}:${family}:${addressInfo.address}`,
        name,
        address: addressInfo.address,
        family,
        internal: addressInfo.internal,
        mac: addressInfo.mac,
        cidr: addressInfo.cidr,
      })
    }
  }

  return options.sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1
    if (a.family !== b.family) return a.family === 'IPv4' ? -1 : 1
    return `${a.name} ${a.address}`.localeCompare(`${b.name} ${b.address}`)
  })
}
