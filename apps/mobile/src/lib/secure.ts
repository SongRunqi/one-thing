import * as SecureStore from 'expo-secure-store'
import type { ServerTarget } from './api'

const KEY = 'onething.server-target.v1'

export async function saveTarget(target: ServerTarget): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(target))
}

export async function loadTarget(): Promise<ServerTarget | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ServerTarget>
    if (
      typeof parsed.host !== 'string'
      || typeof parsed.port !== 'number'
      || typeof parsed.token !== 'string'
    ) {
      return null
    }
    return { host: parsed.host, port: parsed.port, token: parsed.token }
  } catch {
    return null
  }
}

export async function clearTarget(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY)
}
