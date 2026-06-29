import fsp from 'node:fs/promises'
import path from 'node:path'
import type {
  OnethingProviderRequestDumpMode as OnethingAgentTurnRequestDumpMode,
  OnethingProviderRequestDumpValue,
} from './agent-turn.js'

export interface OnethingProviderRequestDumpPayload {
  providerId: string
  model: string
  mode: OnethingAgentTurnRequestDumpMode
  metadata?: Record<string, OnethingProviderRequestDumpValue>
  requestBody: OnethingProviderRequestDumpValue
}

export interface OnethingProviderRequestDumpLogger {
  log?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
}

export interface DumpOnethingProviderRequestOptions {
  getLogDir(): string
  env?: Record<string, string | undefined>
  logger?: OnethingProviderRequestDumpLogger
}

export function getOnethingProviderRequestDumpDir(logDir: string): string {
  return path.join(logDir, 'provider-requests')
}

export function shouldDumpOnethingProviderRequests(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.ONETHING_DUMP_PROVIDER_REQUESTS !== '0'
}

export function safeOnethingProviderRequestDumpFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return sanitized || 'unknown'
}

export function stringifyOnethingProviderRequestDump(value: OnethingProviderRequestDumpValue): string {
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

export async function dumpOnethingProviderRequest(
  payload: OnethingProviderRequestDumpPayload,
  options: DumpOnethingProviderRequestOptions,
): Promise<string | undefined> {
  if (!shouldDumpOnethingProviderRequests(options.env)) return undefined

  const dir = getOnethingProviderRequestDumpDir(options.getLogDir())
  const timestamp = new Date().toISOString()
  const filenameTimestamp = timestamp.replace(/[:.]/g, '-')
  const filename = [
    filenameTimestamp,
    safeOnethingProviderRequestDumpFilenamePart(payload.providerId),
    safeOnethingProviderRequestDumpFilenamePart(payload.model),
    safeOnethingProviderRequestDumpFilenamePart(payload.mode),
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
    await fsp.writeFile(filePath, `${stringifyOnethingProviderRequestDump(content)}\n`, 'utf-8')
    options.logger?.log?.('[ProviderRequestDump] wrote full request body:', filePath)
    return filePath
  } catch (error) {
    options.logger?.warn?.('[ProviderRequestDump] failed to write full request body:', error)
    return undefined
  }
}
