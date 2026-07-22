import {
  dumpOnethingProviderRequest,
  type OnethingProviderRequestDumpMode,
  type OnethingProviderRequestDumpPayload,
} from '@onething/runtime/providers'
import { getLogDir } from '../stores/paths.js'

export type ProviderRequestDumpMode = OnethingProviderRequestDumpMode
export type ProviderRequestDumpPayload = OnethingProviderRequestDumpPayload

export async function dumpProviderRequest(payload: ProviderRequestDumpPayload): Promise<string | undefined> {
  // Under vitest getLogDir() resolves to the developer's real ~/.onething, and
  // every provider now dumps — a suite run would otherwise spray full prompt
  // bodies into their live log directory.
  if (process.env.VITEST) return undefined

  return dumpOnethingProviderRequest(payload, {
    getLogDir,
    env: process.env,
    logger: console,
  })
}
