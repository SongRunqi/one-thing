/**
 * LRU (Least Recently Used) Cache Implementation
 *
 * A generic LRU cache that evicts the least recently accessed items
 * when the cache reaches its maximum size.
 *
 * Used for:
 * - Session caching: Keep only N most recently accessed sessions in memory
 * - Reduces memory footprint while maintaining fast access to active sessions
 */

export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; accessedAt: number }>()
  private maxSize: number

  constructor(maxSize: number = 5) {
    this.maxSize = maxSize
  }

  /**
   * Get a value from the cache
   * Updates the access time if found
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (entry) {
      // Update access time on read
      entry.accessedAt = Date.now()
      return entry.value
    }
    return undefined
  }

  /**
   * Set a value in the cache
   * Evicts the oldest entry if cache is full
   */
  set(key: K, value: V): void {
    // If key already exists, just update the value and access time
    if (this.cache.has(key)) {
      this.cache.set(key, { value, accessedAt: Date.now() })
      return
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest()
    }

    this.cache.set(key, { value, accessedAt: Date.now() })
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get all keys in cache (for debugging)
   */
  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: K | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt
        oldestKey = key
      }
    }

    if (oldestKey !== null) {
      console.log(`[LRUCache] Evicting oldest entry: ${oldestKey}`)
      this.cache.delete(oldestKey)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; keys: K[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: this.keys(),
    }
  }
}
