/**
 * Memory Helpers Module
 * Handles user profile and agent memory retrieval and formatting
 *
 * This module now supports TWO memory systems:
 * 1. Legacy: SQLite + embeddings (old functions)
 * 2. Text-based: Markdown files (new functions prefixed with text*)
 */

import type { UserFact, AgentUserRelationship, AgentMood, AgentMemory } from '../../../shared/ipc.js'
import type { IStorageProvider } from '../../storage/interfaces.js'
import type { AIMessageContent } from '../../providers/index.js'

// Import text-based memory system
import {
  loadCoreMemory,
  loadAgentMemory,
  formatMemoryPrompt as formatTextMemoryPrompt,
  recordAgentInteraction,
} from '../../services/memory-text/index.js'

/**
 * Format user profile facts into a readable prompt
 */
export function formatUserProfilePrompt(facts: UserFact[]): string | undefined {
  if (!facts || facts.length === 0) return undefined

  const sections: string[] = []

  const groupedFacts: Record<string, UserFact[]> = {
    personal: [],
    preference: [],
    goal: [],
    trait: [],
  }

  for (const fact of facts) {
    groupedFacts[fact.category].push(fact)
  }

  if (groupedFacts.personal.length > 0) {
    sections.push(`## 关于用户\n${groupedFacts.personal.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.preference.length > 0) {
    sections.push(`## 用户偏好\n${groupedFacts.preference.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.goal.length > 0) {
    sections.push(`## 用户目标\n${groupedFacts.goal.map(f => `- ${f.content}`).join('\n')}`)
  }

  if (groupedFacts.trait.length > 0) {
    sections.push(`## 用户特点\n${groupedFacts.trait.map(f => `- ${f.content}`).join('\n')}`)
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined
}

/**
 * Retrieve relevant user facts based on conversation context using embedding similarity
 * Instead of loading all facts, only retrieve facts relevant to the current conversation
 */
export async function retrieveRelevantFacts(
  storage: any,
  userMessage: string,
  limit = 10,
  minSimilarity = 0.3
): Promise<UserFact[]> {
  const messagePreview = userMessage.length > 50 ? userMessage.slice(0, 50) + '...' : userMessage
  console.log(`[Chat] Retrieving relevant facts for: "${messagePreview}"`)

  try {
    // Use semantic search to find relevant facts
    const relevantFacts = await storage.userProfile.searchFacts(userMessage)
    console.log(`[Chat] Found ${relevantFacts.length} relevant facts via semantic search`)
    return relevantFacts.slice(0, limit)
  } catch (error) {
    console.warn('[Chat] Failed to retrieve relevant facts, falling back to all facts:', error)
    // Fallback: return all facts if semantic search fails
    const profile = await storage.userProfile.getProfile()
    console.log(`[Chat] Fallback: returning all ${profile.facts.length} facts`)
    return profile.facts.slice(0, limit)
  }
}

/**
 * Retrieve relevant agent memories using semantic search
 */
export async function retrieveRelevantAgentMemories(
  storage: IStorageProvider,
  agentId: string,
  userMessage: string,
  limit = 5,
  minSimilarity = 0.3
): Promise<AgentMemory[]> {
  try {
    const memories = await storage.agentMemory.hybridRetrieveMemories(
      agentId,
      userMessage,
      limit,
      { minSimilarity }
    )
    return memories
  } catch (error) {
    console.error('[Chat] Failed to retrieve agent memories:', error)
    return []
  }
}

/**
 * Format agent memories into a readable prompt
 */
export function formatAgentMemoryPrompt(
  relationship: AgentUserRelationship,
  relevantMemories?: AgentMemory[]
): string | undefined {
  if (!relationship) return undefined

  const sections: string[] = []
  const rel = relationship.relationship

  // Relationship context
  sections.push(`## 与用户的关系
- 信任度: ${rel.trustLevel}/100
- 熟悉度: ${rel.familiarity}/100
- 总互动次数: ${rel.totalInteractions}`)

  // Current mood
  const moodMap: Record<AgentMood, string> = {
    happy: '开心',
    neutral: '平静',
    concerned: '担忧',
    excited: '兴奋',
  }
  const mood = relationship.agentFeelings
  sections.push(`## 当前状态
- 心情: ${moodMap[mood.currentMood]}${mood.notes ? `\n- 备注: ${mood.notes}` : ''}`)

  // Use provided relevant memories, or fallback to strength-based filtering
  const activeMemories = relevantMemories && relevantMemories.length > 0
    ? relevantMemories
    : relationship.observations
        .filter(m => m.strength > 10)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5)

  if (activeMemories.length > 0) {
    const memoryLines = activeMemories.map(m => {
      const vividnessEmoji: Record<string, string> = {
        vivid: '🌟',
        clear: '💭',
        hazy: '🌫️',
        fragment: '❓',
      }
      return `- ${vividnessEmoji[m.vividness] || '💭'} ${m.content}`
    })
    sections.push(`## 关于用户的记忆\n${memoryLines.join('\n')}`)
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined
}

/**
 * Extract text content from AIMessageContent
 */
export function getTextFromContent(content: AIMessageContent): string {
  if (typeof content === 'string') {
    return content
  }
  // Extract text from array content
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
}

// ============================================================================
// TEXT-BASED MEMORY SYSTEM (New)
// ============================================================================

/**
 * Result of text memory loading
 */
export interface TextMemoryResult {
  prompt: string | undefined
  retrievedFiles: Array<{
    path: string
    title: string
    score: number
    matchType: 'tag' | 'keyword' | 'related'
  }>
}

/**
 * Load memory for chat using text-based system
 * Only loads core memory (profile.md) and agent relationship memory.
 * Keyword-based topic retrieval is disabled for faster response.
 *
 * @param userMessage - Unused, kept for API compatibility
 * @param agentId - Optional agent ID for agent-specific memories
 */
export async function textLoadMemoryForChat(
  userMessage: string,
  agentId?: string
): Promise<TextMemoryResult> {
  try {
    // Only load core memory (profile.md) and agent memory
    // Skip keyword-based topic retrieval for faster response
    const [coreMemory, agentMemory] = await Promise.all([
      loadCoreMemory(),
      agentId ? loadAgentMemory(agentId) : Promise.resolve(undefined),
    ])

    // Format without topic memory (3rd param undefined)
    const prompt = formatTextMemoryPrompt(coreMemory, agentMemory, undefined)

    if (prompt) {
      console.log(`[TextMemory] Loaded core memory: core=${coreMemory ? 1 : 0}, agent=${agentMemory ? 1 : 0}`)
    }

    return { prompt, retrievedFiles: [] }
  } catch (error) {
    console.error('[TextMemory] Failed to load memory:', error)
    return { prompt: undefined, retrievedFiles: [] }
  }
}

/**
 * Record an interaction for text-based agent memory
 */
export async function textRecordAgentInteraction(agentId: string): Promise<void> {
  try {
    await recordAgentInteraction(agentId)
  } catch (error) {
    console.error('[TextMemory] Failed to record interaction:', error)
  }
}
