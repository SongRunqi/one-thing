/**
 * Trigger System
 *
 * A framework for running post-response hooks after AI responses.
 * Triggers run asynchronously and don't block the user experience.
 */

import type { ChatMessage, ChatSession, ProviderConfig } from '../../../shared/ipc.js'

/**
 * Context passed to triggers when they run.
 */
export interface TriggerContext {
  sessionId: string
  session: ChatSession
  messages: ChatMessage[]
  lastUserMessage: string
  lastAssistantMessage: string
  providerId: string
  providerConfig: ProviderConfig
  agentId?: string
}

/**
 * Trigger interface - implement this to create a new trigger.
 */
export interface Trigger {
  id: string
  name: string
  priority: number  // Lower = runs first

  /**
   * Check if this trigger should run given the context.
   */
  shouldTrigger: (ctx: TriggerContext) => Promise<boolean>

  /**
   * Execute the trigger logic.
   */
  execute: (ctx: TriggerContext) => Promise<void>
}

/**
 * TriggerManager - manages and runs all registered triggers.
 */
class TriggerManager {
  private triggers: Trigger[] = []
  private enabled: boolean = true

  /**
   * Register a new trigger.
   */
  register(trigger: Trigger): void {
    // Check for duplicate
    const existing = this.triggers.find(t => t.id === trigger.id)
    if (existing) {
      console.warn(`[TriggerManager] Trigger ${trigger.id} already registered, skipping`)
      return
    }

    this.triggers.push(trigger)
    // Sort by priority
    this.triggers.sort((a, b) => a.priority - b.priority)
    console.log(`[TriggerManager] Registered trigger: ${trigger.name} (priority: ${trigger.priority})`)
  }

  /**
   * Unregister a trigger by ID.
   */
  unregister(triggerId: string): void {
    const index = this.triggers.findIndex(t => t.id === triggerId)
    if (index !== -1) {
      const trigger = this.triggers[index]
      this.triggers.splice(index, 1)
      console.log(`[TriggerManager] Unregistered trigger: ${trigger.name}`)
    }
  }

  /**
   * Enable/disable all triggers.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    console.log(`[TriggerManager] Triggers ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Get all registered triggers.
   */
  getTriggers(): Trigger[] {
    return [...this.triggers]
  }

  /**
   * Run all triggers that should fire for the given context.
   * Runs asynchronously - errors are isolated per trigger.
   */
  async runPostResponse(ctx: TriggerContext): Promise<void> {
    if (!this.enabled) {
      console.log('[TriggerManager] Triggers disabled, skipping')
      return
    }

    if (this.triggers.length === 0) {
      return
    }

    console.log(`[TriggerManager] Running ${this.triggers.length} triggers for session ${ctx.sessionId}`)

    for (const trigger of this.triggers) {
      try {
        const shouldRun = await trigger.shouldTrigger(ctx)
        if (shouldRun) {
          console.log(`[TriggerManager] Executing trigger: ${trigger.name}`)
          await trigger.execute(ctx)
          console.log(`[TriggerManager] Completed trigger: ${trigger.name}`)
        }
      } catch (error) {
        // Isolate errors - one trigger failure shouldn't affect others
        console.error(`[TriggerManager] Trigger ${trigger.name} failed:`, error)
      }
    }
  }
}

// Singleton instance
export const triggerManager = new TriggerManager()

// Re-export for convenience
export { TriggerManager }
