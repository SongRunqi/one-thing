import { createDefaultVariablesFile, type VariablesFile } from './schema.js'
import type { ContextVariable } from './types.js'

export interface VariablesStorePersistence {
  loadFromDisk(): VariablesFile
  saveToDisk(state: VariablesFile): void
}

export class VariablesStore {
  private state: VariablesFile = createDefaultVariablesFile()
  private initialized = false
  private listeners = new Set<() => void>()

  constructor(private readonly persistence: VariablesStorePersistence) {}

  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    this.state = this.persistence.loadFromDisk()
  }

  getAiNoteDir(): string {
    this.initialize()
    return this.state.ai_note_dir
  }

  setAiNoteDir(value: string): void {
    this.state = { ...this.state, ai_note_dir: value }
    this.persistAndNotify()
  }

  getUserNoteDir(): string {
    this.initialize()
    return this.state.user_note_dir
  }

  setUserNoteDir(value: string): void {
    this.state = { ...this.state, user_note_dir: value }
    this.persistAndNotify()
  }

  getWorkNoteDir(): string {
    this.initialize()
    return this.state.work_note_dir
  }

  setWorkNoteDir(value: string): void {
    this.state = { ...this.state, work_note_dir: value }
    this.persistAndNotify()
  }

  getGlobalVariables(): ContextVariable[] {
    this.initialize()
    return this.state.global_variables.map(v => ({
      ...v,
      scope: 'global',
    }))
  }

  setGlobalVariables(variables: ContextVariable[]): void {
    this.state = {
      ...this.state,
      global_variables: variables.map(v => ({
        name: v.name,
        value: v.value,
        description: v.description,
        updatedAt: v.updatedAt,
      })),
    }
    this.persistAndNotify()
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  hydrateForTests(state: VariablesFile): void {
    this.state = state
    this.initialized = true
  }

  resetForTests(): void {
    this.state = createDefaultVariablesFile()
    this.initialized = false
    this.listeners.clear()
  }

  private persistAndNotify(): void {
    this.persistence.saveToDisk(this.state)
    for (const cb of this.listeners) {
      try {
        cb()
      } catch (err) {
        console.error('[variables.store] listener error:', err)
      }
    }
  }
}
