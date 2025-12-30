/**
 * Memory Extraction Trigger
 *
 * Extracts user facts and agent memories from conversations using AI analysis.
 * Uses smart triggers to only extract from meaningful conversations.
 * Runs after each conversation to build up the memory system over time.
 *
 * - With Agent: Saves both UserFacts (shared) and AgentMemories (per-agent)
 * - Without Agent: Saves only UserFacts (shared user profile)
 */

import type { Trigger, TriggerContext } from './index.js'
import { extractAndSaveMemories, extractAndSaveUserFactsOnly } from '../memory/memory-extractor.js'
import { shouldExtractMemory } from './smart-extraction.js'
import { getSettings } from '../../stores/index.js'

// Minimum message lengths to consider for extraction
const MIN_USER_MESSAGE_LENGTH = 4
const MIN_ASSISTANT_MESSAGE_LENGTH = 20

/**
 * Memory Extraction Trigger
 */
export const memoryExtractionTrigger: Trigger = {
  id: 'memory-extraction',
  name: 'Memory Extraction',
  priority: 5,  // Run early, before context compacting

  async shouldTrigger(ctx: TriggerContext): Promise<boolean> {
    const { lastUserMessage, lastAssistantMessage } = ctx

    // Check if memory is enabled in settings
    const settings = getSettings()
    const memoryEnabled = settings.embedding?.memoryEnabled !== false  // Default to true
    if (!memoryEnabled) {
      console.log('[MemoryExtraction] Skipped: Memory is disabled in settings')
      return false
    }

    // Skip if messages are too short
    if (lastUserMessage.length < MIN_USER_MESSAGE_LENGTH) {
      return false
    }

    if (lastAssistantMessage.length < MIN_ASSISTANT_MESSAGE_LENGTH) {
      return false
    }

    // Smart trigger: classify conversation before extraction
    const classification = await shouldExtractMemory(lastUserMessage, lastAssistantMessage)

    if (!classification.shouldExtract) {
      console.log(`[MemoryExtraction] Skipped: ${classification.reason}`)
      return false
    }

    console.log(`[MemoryExtraction] Will extract: ${classification.reason} (confidence: ${classification.confidence.toFixed(2)})`)
    return true
  },

  async execute(ctx: TriggerContext): Promise<void> {
    const {
      providerId,
      providerConfig,
      lastUserMessage,
      lastAssistantMessage,
      agentId
    } = ctx

    if (agentId) {
      // Agent mode: save both UserFacts and AgentMemories
      console.log('[MemoryExtraction] Starting memory extraction for agent:', agentId)
      await extractAndSaveMemories(
        providerId,
        providerConfig,
        lastUserMessage,
        lastAssistantMessage,
        agentId
      )
    } else {
      // Non-agent mode: save UserFacts only (shared user profile)
      console.log('[MemoryExtraction] Starting user facts extraction (non-agent mode)')
      await extractAndSaveUserFactsOnly(
        providerId,
        providerConfig,
        lastUserMessage,
        lastAssistantMessage
      )
    }
  }
}
