/**
 * Hook Manager
 *
 * Central hub for registering and executing plugin hooks.
 * Implements sequential execution with input/output chaining for modifier hooks,
 * and parallel execution for event hooks.
 */

import type {
  Hooks,
  HookName,
  HookResult,
  LoadedPlugin,
  ModifierHookName,
  EventHookName,
  CollectorHookName,
} from '../types.js'
import type { ToolInfo } from '../../tools/core/tool.js'

/**
 * Registered hook handler with metadata
 */
interface RegisteredHook {
  pluginId: string
  handler: Function
  priority: number
}

/**
 * Hook execution statistics for debugging
 */
interface HookStats {
  totalCalls: number
  totalDuration: number
  errors: number
}

/**
 * HookManager - Manages plugin hook registration and execution
 *
 * Design principles:
 * 1. Sequential execution for modifier hooks (allows chaining)
 * 2. Parallel execution for event hooks (fire-and-forget)
 * 3. Error isolation - one plugin's error doesn't affect others
 * 4. Priority-based ordering (lower priority runs first)
 */
export class HookManager {
  private hooks: Map<HookName, RegisteredHook[]> = new Map()
  private stats: Map<HookName, HookStats> = new Map()
  private enabled: boolean = true

  /**
   * Register hooks from a loaded plugin
   * @param plugin - The loaded plugin to register
   */
  registerPlugin(plugin: LoadedPlugin): void {
    const pluginId = plugin.definition.meta.id

    for (const [hookName, handler] of Object.entries(plugin.hooks)) {
      if (typeof handler === 'function') {
        this.register(hookName as HookName, pluginId, handler)
      }
    }

    console.log(`[HookManager] Registered hooks for plugin: ${pluginId}`)
  }

  /**
   * Unregister all hooks from a plugin
   * @param pluginId - The plugin ID to unregister
   */
  unregisterPlugin(pluginId: string): void {
    let unregisteredCount = 0

    for (const [hookName, handlers] of this.hooks.entries()) {
      const before = handlers.length
      const filtered = handlers.filter((h) => h.pluginId !== pluginId)
      this.hooks.set(hookName, filtered)
      unregisteredCount += before - filtered.length
    }

    if (unregisteredCount > 0) {
      console.log(`[HookManager] Unregistered ${unregisteredCount} hooks for plugin: ${pluginId}`)
    }
  }

  /**
   * Register a single hook
   * @param hookName - The hook point name
   * @param pluginId - The plugin ID registering this hook
   * @param handler - The hook handler function
   * @param priority - Execution priority (lower runs first, default: 100)
   */
  private register(
    hookName: HookName,
    pluginId: string,
    handler: Function,
    priority: number = 100,
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }

    const handlers = this.hooks.get(hookName)!

    // Check for duplicate registration
    const existing = handlers.find((h) => h.pluginId === pluginId)
    if (existing) {
      console.warn(`[HookManager] Plugin ${pluginId} already registered for ${hookName}, skipping`)
      return
    }

    handlers.push({ pluginId, handler, priority })

    // Sort by priority (lower first)
    handlers.sort((a, b) => a.priority - b.priority)

    // Initialize stats
    if (!this.stats.has(hookName)) {
      this.stats.set(hookName, { totalCalls: 0, totalDuration: 0, errors: 0 })
    }
  }

  /**
   * Execute modifier hooks sequentially with input/output chaining
   *
   * Modifier hooks can transform the input and optionally abort execution.
   * Each hook receives the output of the previous hook as input.
   *
   * @param hookName - The hook point name
   * @param input - Initial input value
   * @returns HookResult with final transformed value or abort info
   */
  async executeChain<I, O>(hookName: ModifierHookName, input: I): Promise<HookResult<O>> {
    if (!this.enabled) {
      return { value: input as unknown as O }
    }

    const handlers = this.hooks.get(hookName) || []
    if (handlers.length === 0) {
      return { value: input as unknown as O }
    }

    const stats = this.stats.get(hookName)!
    const startTime = Date.now()
    stats.totalCalls++

    let currentValue = input as unknown as O

    for (const { pluginId, handler } of handlers) {
      try {
        const result = (await handler(currentValue)) as HookResult<O>

        if (result.abort) {
          console.log(
            `[HookManager] Hook ${hookName} aborted by plugin ${pluginId}: ${result.abortReason || 'No reason'}`,
          )
          stats.totalDuration += Date.now() - startTime
          return result
        }

        currentValue = result.value
      } catch (error: any) {
        console.error(`[HookManager] Hook ${hookName} error in plugin ${pluginId}:`, error)
        stats.errors++
        // Continue with other plugins on error
      }
    }

    stats.totalDuration += Date.now() - startTime
    return { value: currentValue }
  }

  /**
   * Execute event hooks in parallel (fire-and-forget)
   *
   * Event hooks receive input but don't return modified data.
   * Errors are isolated per plugin.
   *
   * @param hookName - The hook point name
   * @param input - Input value to pass to hooks
   */
  async executeAll<I>(hookName: EventHookName, input: I): Promise<void> {
    if (!this.enabled) {
      return
    }

    const handlers = this.hooks.get(hookName) || []
    if (handlers.length === 0) {
      return
    }

    const stats = this.stats.get(hookName) || { totalCalls: 0, totalDuration: 0, errors: 0 }
    const startTime = Date.now()
    stats.totalCalls++

    await Promise.all(
      handlers.map(async ({ pluginId, handler }) => {
        try {
          await handler(input)
        } catch (error: any) {
          console.error(`[HookManager] Hook ${hookName} error in plugin ${pluginId}:`, error)
          stats.errors++
        }
      }),
    )

    stats.totalDuration += Date.now() - startTime
  }

  /**
   * Execute collector hooks and aggregate results
   *
   * Collector hooks return arrays that get merged together.
   * Used for hooks like tool:register that collect items from all plugins.
   *
   * @param hookName - The hook point name
   * @returns Aggregated array from all plugins
   */
  async executeCollector<T>(hookName: CollectorHookName): Promise<T[]> {
    if (!this.enabled) {
      return []
    }

    const handlers = this.hooks.get(hookName) || []
    if (handlers.length === 0) {
      return []
    }

    const results: T[] = []

    for (const { pluginId, handler } of handlers) {
      try {
        const items = await handler()
        if (Array.isArray(items)) {
          results.push(...items)
        }
      } catch (error: any) {
        console.error(`[HookManager] Hook ${hookName} error in plugin ${pluginId}:`, error)
      }
    }

    return results
  }

  /**
   * Convenience method to collect tools from all plugins
   */
  async collectTools(): Promise<ToolInfo[]> {
    return this.executeCollector<ToolInfo>('tool:register')
  }

  /**
   * Check if any hooks are registered for a hook point
   * @param hookName - The hook point name
   */
  hasHooks(hookName: HookName): boolean {
    return (this.hooks.get(hookName)?.length ?? 0) > 0
  }

  /**
   * Get count of registered hooks for a hook point
   * @param hookName - The hook point name
   */
  getHookCount(hookName: HookName): number {
    return this.hooks.get(hookName)?.length ?? 0
  }

  /**
   * Enable/disable all hooks
   * @param enabled - Whether hooks should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    console.log(`[HookManager] Hooks ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get statistics for a hook point
   * @param hookName - The hook point name
   */
  getStats(hookName: HookName): HookStats | undefined {
    return this.stats.get(hookName)
  }

  /**
   * Get all statistics
   */
  getAllStats(): Map<HookName, HookStats> {
    return new Map(this.stats)
  }

  /**
   * Get all registered hook names
   */
  getRegisteredHooks(): HookName[] {
    return Array.from(this.hooks.keys()).filter((name) => (this.hooks.get(name)?.length ?? 0) > 0)
  }

  /**
   * Get plugins registered for a hook point
   * @param hookName - The hook point name
   */
  getPluginsForHook(hookName: HookName): string[] {
    return (this.hooks.get(hookName) || []).map((h) => h.pluginId)
  }

  /**
   * Clear all hooks and stats (for testing or cleanup)
   */
  clear(): void {
    this.hooks.clear()
    this.stats.clear()
    console.log('[HookManager] All hooks cleared')
  }
}

// Singleton instance
export const hookManager = new HookManager()
