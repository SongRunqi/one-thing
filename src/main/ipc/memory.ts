import { registerElectronMemoryIpcHandlers } from '@onething/electron-host/ipc/memory'
import { IPC_CHANNELS } from '../../shared/ipc.js'

type MemoryProxyBody = unknown

const DEFAULT_MEMORY_SERVER_HOST = '127.0.0.1'
const DEFAULT_MEMORY_SERVER_PORT = '8787'

function memoryServerBaseUrl(): string {
  if (process.env.ONETHING_SERVER_URL) {
    return process.env.ONETHING_SERVER_URL.replace(/\/+$/, '')
  }
  const host = process.env.ONETHING_SERVER_HOST || DEFAULT_MEMORY_SERVER_HOST
  const port = process.env.ONETHING_SERVER_PORT || DEFAULT_MEMORY_SERVER_PORT
  return `http://${host}:${port}`
}

async function postMemory(path: string, body?: MemoryProxyBody): Promise<unknown> {
  const url = `${memoryServerBaseUrl()}${path}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const payload = text ? JSON.parse(text) as unknown : { success: response.ok }
    if (!response.ok) {
      return {
        success: false,
        error: `Headless core server returned ${response.status} ${response.statusText}`,
        details: payload,
      }
    }
    return payload
  } catch (error) {
    return {
      success: false,
      error: `Headless core server is not reachable at ${url}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function registerMemoryHandlers(): void {
  registerElectronMemoryIpcHandlers({
    handlers: [
      { channel: IPC_CHANNELS.MEMORY_OVERVIEW, handle: request => postMemory('/api/memory/overview', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_READ, handle: request => postMemory('/api/memory/read', request) },
      { channel: IPC_CHANNELS.MEMORY_SEARCH, handle: request => postMemory('/api/memory/search', request) },
      { channel: IPC_CHANNELS.MEMORY_APPEND, handle: request => postMemory('/api/memory/append', request) },
      { channel: IPC_CHANNELS.MEMORY_SAVE_FILE, handle: request => postMemory('/api/memory/save-file', request) },
      { channel: IPC_CHANNELS.MEMORY_INDEX, handle: request => postMemory('/api/memory/index', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_RUN_DREAMING, handle: request => postMemory('/api/memory/dreaming/run', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_LIST, handle: request => postMemory('/api/memory/profile/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_SEARCH, handle: request => postMemory('/api/memory/profile/search', request) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_UPSERT, handle: request => postMemory('/api/memory/profile/upsert', request) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_DELETE, handle: request => postMemory('/api/memory/profile/delete', request) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_AUDIT, handle: request => postMemory('/api/memory/profile/audit', request) },
      { channel: IPC_CHANNELS.MEMORY_PROFILE_EXPORT, handle: request => postMemory('/api/memory/profile/export', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_OVERVIEW, handle: request => postMemory('/api/memory/graph/overview', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_LIST, handle: request => postMemory('/api/memory/graph/entities/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_UPSERT, handle: request => postMemory('/api/memory/graph/entities/upsert', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_ENTITIES_DELETE, handle: request => postMemory('/api/memory/graph/entities/delete', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_LIST, handle: request => postMemory('/api/memory/graph/observations/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_UPSERT, handle: request => postMemory('/api/memory/graph/observations/upsert', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_OBSERVATIONS_DELETE, handle: request => postMemory('/api/memory/graph/observations/delete', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_LIST, handle: request => postMemory('/api/memory/graph/relations/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_UPSERT, handle: request => postMemory('/api/memory/graph/relations/upsert', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_RELATIONS_DELETE, handle: request => postMemory('/api/memory/graph/relations/delete', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_LIST, handle: request => postMemory('/api/memory/graph/duplicates/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_MERGE, handle: request => postMemory('/api/memory/graph/duplicates/merge', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_DUPLICATES_IGNORE, handle: request => postMemory('/api/memory/graph/duplicates/ignore', request) },
      { channel: IPC_CHANNELS.MEMORY_GRAPH_AUDIT, handle: request => postMemory('/api/memory/graph/audit', request) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_LIST, handle: request => postMemory('/api/memory/logs/list', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_STATS, handle: () => postMemory('/api/memory/logs/stats', {}) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_OPEN_FOLDER, handle: () => postMemory('/api/memory/logs/open-folder', {}) },
      { channel: IPC_CHANNELS.MEMORY_LOGS_CLEANUP, handle: () => postMemory('/api/memory/logs/cleanup', {}) },
      { channel: IPC_CHANNELS.MEMORY_CAPTURE_SAVE, handle: request => postMemory('/api/memory/capture/save', request ?? {}) },
      { channel: IPC_CHANNELS.MEMORY_CAPTURE_DISCARD, handle: request => postMemory('/api/memory/capture/discard', request ?? {}) },
    ],
  })
}
