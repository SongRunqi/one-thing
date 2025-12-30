/**
 * Memory Scheduler Service
 *
 * Handles periodic background tasks for the memory system:
 * - Memory decay (reduces memory strength over time)
 * - Memory cleanup (removes completely decayed memories)
 * - Re-embedding (updates embeddings when models change)
 */

import { getStorage } from '../../storage/index.js'
import { getAgents } from '../../stores/agents.js'

// Default decay interval: 4 hours
const DEFAULT_DECAY_INTERVAL_MS = 4 * 60 * 60 * 1000

// Minimum interval: 1 hour
const MIN_DECAY_INTERVAL_MS = 60 * 60 * 1000

// Maximum interval: 24 hours
const MAX_DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface MemorySchedulerConfig {
  /** Decay interval in milliseconds */
  decayIntervalMs?: number
  /** Run decay immediately on start */
  runOnStart?: boolean
  /** Enable debug logging */
  debug?: boolean
}

export interface DecayResult {
  agentId: string
  memoriesBefore: number
  memoriesAfter: number
  decayed: number
  removed: number
  error?: string
}

export interface SchedulerStats {
  isRunning: boolean
  lastDecayAt: number | null
  nextDecayAt: number | null
  totalDecayRuns: number
  totalMemoriesDecayed: number
  totalMemoriesRemoved: number
}

class MemoryScheduler {
  private intervalId: NodeJS.Timeout | null = null
  private decayIntervalMs: number
  private debug: boolean
  private stats: SchedulerStats = {
    isRunning: false,
    lastDecayAt: null,
    nextDecayAt: null,
    totalDecayRuns: 0,
    totalMemoriesDecayed: 0,
    totalMemoriesRemoved: 0,
  }

  constructor(config: MemorySchedulerConfig = {}) {
    this.decayIntervalMs = Math.max(
      MIN_DECAY_INTERVAL_MS,
      Math.min(MAX_DECAY_INTERVAL_MS, config.decayIntervalMs || DEFAULT_DECAY_INTERVAL_MS)
    )
    this.debug = config.debug || false
  }

  /**
   * Start the scheduler
   */
  async start(runOnStart = true): Promise<void> {
    if (this.stats.isRunning) {
      this.log('Scheduler already running')
      return
    }

    this.log('Starting memory scheduler')
    this.stats.isRunning = true

    // Run immediately if requested
    if (runOnStart) {
      await this.runDecay()
    }

    // Schedule periodic runs
    this.intervalId = setInterval(async () => {
      await this.runDecay()
    }, this.decayIntervalMs)

    this.updateNextDecayTime()
    this.log(`Scheduler started. Next decay at ${new Date(this.stats.nextDecayAt!).toLocaleString()}`)
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.stats.isRunning = false
    this.stats.nextDecayAt = null
    this.log('Scheduler stopped')
  }

  /**
   * Run memory decay for all agents
   */
  async runDecay(): Promise<DecayResult[]> {
    this.log('Running memory decay...')

    const results: DecayResult[] = []
    const storage = getStorage()
    const agents = getAgents()

    if (agents.length === 0) {
      this.log('No agents found, skipping decay')
      return results
    }

    for (const agent of agents) {
      try {
        // Get memory count before decay
        const relationship = await storage.agentMemory.getRelationship(agent.id)
        const memoriesBefore = relationship?.observations.length || 0

        // Run decay
        await storage.agentMemory.decayMemories(agent.id)

        // Get memory count after decay
        const relationshipAfter = await storage.agentMemory.getRelationship(agent.id)
        const memoriesAfter = relationshipAfter?.observations.length || 0

        const removed = memoriesBefore - memoriesAfter
        const decayed = memoriesAfter // All surviving memories were potentially decayed

        results.push({
          agentId: agent.id,
          memoriesBefore,
          memoriesAfter,
          decayed,
          removed,
        })

        // Update stats
        this.stats.totalMemoriesDecayed += decayed
        this.stats.totalMemoriesRemoved += removed

        this.log(`Agent ${agent.name}: ${memoriesBefore} -> ${memoriesAfter} memories (${removed} removed)`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[MemoryScheduler] Error decaying memories for agent ${agent.id}:`, error)

        results.push({
          agentId: agent.id,
          memoriesBefore: 0,
          memoriesAfter: 0,
          decayed: 0,
          removed: 0,
          error: errorMessage,
        })
      }
    }

    // Update stats
    this.stats.lastDecayAt = Date.now()
    this.stats.totalDecayRuns++
    this.updateNextDecayTime()

    this.log(`Decay completed for ${agents.length} agents`)
    return results
  }

  /**
   * Force an immediate decay run
   */
  async forceDecay(): Promise<DecayResult[]> {
    this.log('Forcing immediate decay run')
    return this.runDecay()
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return { ...this.stats }
  }

  /**
   * Update decay interval
   */
  setDecayInterval(intervalMs: number): void {
    this.decayIntervalMs = Math.max(
      MIN_DECAY_INTERVAL_MS,
      Math.min(MAX_DECAY_INTERVAL_MS, intervalMs)
    )

    // Restart if running
    if (this.stats.isRunning) {
      this.stop()
      this.start(false)
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.stats.isRunning
  }

  private updateNextDecayTime(): void {
    if (this.stats.isRunning && this.stats.lastDecayAt) {
      this.stats.nextDecayAt = this.stats.lastDecayAt + this.decayIntervalMs
    } else if (this.stats.isRunning) {
      this.stats.nextDecayAt = Date.now() + this.decayIntervalMs
    }
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[MemoryScheduler] ${message}`)
    }
  }
}

// Singleton instance
let schedulerInstance: MemoryScheduler | null = null

/**
 * Get the memory scheduler singleton
 */
export function getMemoryScheduler(config?: MemorySchedulerConfig): MemoryScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new MemoryScheduler(config)
  }
  return schedulerInstance
}

/**
 * Start the memory scheduler
 */
export async function startMemoryScheduler(config?: MemorySchedulerConfig): Promise<void> {
  const scheduler = getMemoryScheduler(config)
  await scheduler.start(config?.runOnStart ?? true)
}

/**
 * Stop the memory scheduler
 */
export function stopMemoryScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop()
  }
}

/**
 * Force an immediate memory decay
 */
export async function forceMemoryDecay(): Promise<DecayResult[]> {
  const scheduler = getMemoryScheduler()
  return scheduler.forceDecay()
}

/**
 * Get scheduler statistics
 */
export function getSchedulerStats(): SchedulerStats | null {
  if (schedulerInstance) {
    return schedulerInstance.getStats()
  }
  return null
}

export { MemoryScheduler }
