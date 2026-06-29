import { randomUUID } from 'node:crypto'

export function createCoreId(): string {
  return randomUUID()
}
