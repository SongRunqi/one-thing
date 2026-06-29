import {
  dumpOnethingProviderRequest,
  type OnethingProviderRequestDumpMode,
  type OnethingProviderRequestDumpPayload,
} from '@onething/runtime/providers'
import { getLogDir } from '../stores/paths.js'

export type ProviderRequestDumpMode = OnethingProviderRequestDumpMode
export type ProviderRequestDumpPayload = OnethingProviderRequestDumpPayload

export async function dumpProviderRequest(payload: ProviderRequestDumpPayload): Promise<string | undefined> {
  return dumpOnethingProviderRequest(payload, {
    getLogDir,
    env: process.env,
    logger: console,
  })
}
