import fsp from 'fs/promises'
import path from 'path'
import { getLogDir } from '../stores/paths.js'
import type { JsonValue } from '../../shared/json.js'

export type ProviderRequestDumpMode =
  | 'stream'
  | 'stream-reasoning'
  | 'stream-tools'
  | 'stream-ui-messages'
  | 'generate'
  | 'codex-http'

export interface ProviderRequestDumpPayload {
  providerId: string
  model: string
  mode: ProviderRequestDumpMode
  metadata?: DumpRecord
  requestBody: DumpValue
}

type DumpRecord = { [key: string]: DumpValue }
type DumpValue =
  | JsonValue
  | DumpRecord
  | DumpValue[]
  | bigint
  | Error
  | object
  | undefined

function requestDumpDir(): string {
  return path.join(getLogDir(), 'provider-requests')
}

function shouldDumpProviderRequests(): boolean {
  if (process.env.ONETHING_DUMP_PROVIDER_REQUESTS === '0') return false
  return true
}

function safeFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return sanitized || 'unknown'
}

function stringifyForDump(value: DumpValue): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === 'bigint') {
        return current.toString()
      }
      if (typeof current === 'function') {
        return `[Function ${current.name || 'anonymous'}]`
      }
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack,
        }
      }
      if (current && typeof current === 'object') {
        if (seen.has(current)) {
          return '[Circular]'
        }
        seen.add(current)
      }
      return current
    },
    2,
  )
}

export async function dumpProviderRequest(payload: ProviderRequestDumpPayload): Promise<string | undefined> {
  if (!shouldDumpProviderRequests()) return undefined

  const dir = requestDumpDir()
  const timestamp = new Date().toISOString()
  const filenameTimestamp = timestamp.replace(/[:.]/g, '-')
  const filename = [
    filenameTimestamp,
    safeFilenamePart(payload.providerId),
    safeFilenamePart(payload.model),
    safeFilenamePart(payload.mode),
  ].join('__') + '.json'
  const filePath = path.join(dir, filename)

  const content = {
    metadata: {
      timestamp,
      providerId: payload.providerId,
      model: payload.model,
      mode: payload.mode,
      ...payload.metadata,
    },
    requestBody: payload.requestBody,
  }

  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(filePath, `${stringifyForDump(content)}\n`, 'utf-8')
    console.log('[ProviderRequestDump] wrote full request body:', filePath)
    return filePath
  } catch (error) {
    console.warn('[ProviderRequestDump] failed to write full request body:', error)
    return undefined
  }
}
