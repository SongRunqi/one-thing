/**
 * Memory Extractor Service
 *
 * Automatically extracts user facts and agent memories from conversations
 * using AI analysis. Runs asynchronously after each conversation to avoid
 * blocking the user experience.
 *
 * Uses the MemoryManager for intelligent ADD/UPDATE/DELETE/NOOP decisions
 * based on embedding similarity + LLM reasoning.
 */

import { generateChatResponse } from '../providers/index.js'
import { getStorage } from '../storage/index.js'
import { processUserFact, processAgentMemory } from './memory-manager.js'
import type { ProviderConfig, UserFactCategory, AgentMemoryCategory, MemoryVividness } from '../../shared/ipc.js'

// Extracted memory types
interface ExtractedUserFact {
  content: string
  category: UserFactCategory
  confidence: number
}

interface ExtractedAgentMemory {
  content: string
  category: AgentMemoryCategory
  emotionalWeight: number
}

interface ExtractedMemories {
  userFacts: ExtractedUserFact[]
  agentMemories: ExtractedAgentMemory[]
}

// Prompt template for memory extraction
const EXTRACTION_PROMPT = `你是一个记忆分析助手。分析以下对话，提取有价值的信息用于记忆系统。

## 对话内容
用户: {userMessage}

助手: {assistantMessage}

## 任务
1. **用户画像事实** - 提取关于用户的持久性信息（个人信息、偏好、目标、特点）
2. **Agent 观察记忆** - 提取 Agent 应该记住的关于这次对话的观察

## 输出格式
请严格输出 JSON 格式，不要包含任何其他文字：
{
  "userFacts": [
    {
      "content": "用户的具体信息描述",
      "category": "personal|preference|goal|trait",
      "confidence": 80
    }
  ],
  "agentMemories": [
    {
      "content": "Agent 应该记住的观察",
      "category": "observation|event|feeling|learning",
      "emotionalWeight": 5
    }
  ]
}

## 类别说明
**userFacts.category:**
- personal: 个人信息（姓名、职业、家庭、位置等）
- preference: 偏好（喜欢/不喜欢、习惯等）
- goal: 目标（正在学习、想要达成的事情等）
- trait: 特点（性格、沟通风格等）

**agentMemories.category:**
- observation: 观察到的用户行为或状态
- event: 发生的重要事件
- feeling: 对话中的情感氛围
- learning: 学到的关于用户的新知识

## 规则
- 只提取**明确提到或强烈暗示**的信息，不要猜测
- 跳过日常问候、闲聊、技术问答等无持久价值的内容
- 如果没有值得记录的内容，返回空数组
- confidence: 50-100，信息越明确越高
- emotionalWeight: 1-10，越重要/情感越强越高
- 每个类别最多提取 2 条最重要的信息`

/**
 * Extract memories from a conversation using AI analysis
 */
export async function extractMemoriesFromConversation(
  providerId: string,
  providerConfig: ProviderConfig,
  userMessage: string,
  assistantMessage: string
): Promise<ExtractedMemories | null> {
  // Skip if messages are too short (likely not meaningful)
  if (userMessage.length < 4 || assistantMessage.length < 20) {
    return null
  }

  // Build the analysis prompt
  const prompt = EXTRACTION_PROMPT
    .replace('{userMessage}', userMessage)
    .replace('{assistantMessage}', assistantMessage)

  try {
    const response = await generateChatResponse(
      providerId,
      {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      },
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 500 }  // Low temperature for consistent JSON output
    )

    // Parse the JSON response
    const parsed = parseExtractionResponse(response)
    return parsed
  } catch (error) {
    console.error('[MemoryExtractor] Failed to extract memories:', error)
    return null
  }
}

/**
 * Parse the AI response and validate the structure
 */
function parseExtractionResponse(response: string): ExtractedMemories | null {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[MemoryExtractor] No JSON found in response')
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate and clean the structure
    const result: ExtractedMemories = {
      userFacts: [],
      agentMemories: []
    }

    // Validate userFacts
    if (Array.isArray(parsed.userFacts)) {
      for (const fact of parsed.userFacts) {
        if (
          typeof fact.content === 'string' &&
          fact.content.length > 0 &&
          ['personal', 'preference', 'goal', 'trait'].includes(fact.category)
        ) {
          result.userFacts.push({
            content: fact.content.slice(0, 200),  // Limit length
            category: fact.category as UserFactCategory,
            confidence: Math.min(100, Math.max(50, fact.confidence || 80))
          })
        }
      }
    }

    // Validate agentMemories
    if (Array.isArray(parsed.agentMemories)) {
      for (const memory of parsed.agentMemories) {
        if (
          typeof memory.content === 'string' &&
          memory.content.length > 0 &&
          ['observation', 'event', 'feeling', 'learning'].includes(memory.category)
        ) {
          result.agentMemories.push({
            content: memory.content.slice(0, 300),  // Limit length
            category: memory.category as AgentMemoryCategory,
            emotionalWeight: Math.min(10, Math.max(1, memory.emotionalWeight || 5))
          })
        }
      }
    }

    // Return null if nothing was extracted
    if (result.userFacts.length === 0 && result.agentMemories.length === 0) {
      return null
    }

    return result
  } catch (error) {
    console.error('[MemoryExtractor] Failed to parse response:', error)
    return null
  }
}

/**
 * Extract and save memories from a conversation
 * This is the main entry point called after conversation completion
 *
 * Uses MemoryManager for intelligent deduplication and conflict resolution
 */
export async function extractAndSaveMemories(
  providerId: string,
  providerConfig: ProviderConfig,
  userMessage: string,
  assistantMessage: string,
  agentId: string,
  agentName?: string
): Promise<void> {
  console.log('[MemoryExtractor] Starting memory extraction for agent:', agentId)

  const extracted = await extractMemoriesFromConversation(
    providerId,
    providerConfig,
    userMessage,
    assistantMessage
  )

  if (!extracted) {
    console.log('[MemoryExtractor] No memories extracted')
    return
  }

  let factsAdded = 0
  let factsUpdated = 0
  let factsSkipped = 0
  let memoriesAdded = 0
  let memoriesUpdated = 0
  let memoriesSkipped = 0

  // Process user facts with intelligent memory management
  for (const fact of extracted.userFacts) {
    try {
      const result = await processUserFact(
        providerId,
        providerConfig,
        {
          content: fact.content,
          category: fact.category,
          confidence: fact.confidence,
        },
        agentId
      )

      switch (result.action) {
        case 'added':
          factsAdded++
          console.log('[MemoryExtractor] Added user fact:', fact.content.slice(0, 50))
          break
        case 'updated':
          factsUpdated++
          console.log('[MemoryExtractor] Updated user fact:', result.decision.reason)
          break
        case 'deleted_and_added':
          factsUpdated++
          console.log('[MemoryExtractor] Replaced user fact:', result.decision.reason)
          break
        case 'skipped':
          factsSkipped++
          console.log('[MemoryExtractor] Skipped duplicate fact:', result.decision.reason)
          break
      }
    } catch (error) {
      console.error('[MemoryExtractor] Failed to process user fact:', error)
    }
  }

  // Process agent memories with intelligent memory management
  for (const memory of extracted.agentMemories) {
    try {
      const result = await processAgentMemory(
        providerId,
        providerConfig,
        agentId,
        {
          content: memory.content,
          category: memory.category,
          emotionalWeight: memory.emotionalWeight,
        }
      )

      switch (result.action) {
        case 'added':
          memoriesAdded++
          console.log('[MemoryExtractor] Added agent memory:', memory.content.slice(0, 50))
          break
        case 'updated':
          memoriesUpdated++
          console.log('[MemoryExtractor] Updated agent memory:', result.decision.reason)
          break
        case 'deleted_and_added':
          memoriesUpdated++
          console.log('[MemoryExtractor] Replaced agent memory:', result.decision.reason)
          break
        case 'skipped':
          memoriesSkipped++
          console.log('[MemoryExtractor] Skipped duplicate memory:', result.decision.reason)
          break
      }
    } catch (error) {
      console.error('[MemoryExtractor] Failed to process agent memory:', error)
    }
  }

  console.log(`[MemoryExtractor] Completed. Facts: ${factsAdded} added, ${factsUpdated} updated, ${factsSkipped} skipped. Memories: ${memoriesAdded} added, ${memoriesUpdated} updated, ${memoriesSkipped} skipped`)
}

/**
 * Extract and save only user facts (for non-agent mode)
 * This allows building user profile even without an agent
 *
 * Uses MemoryManager for intelligent deduplication and conflict resolution
 */
export async function extractAndSaveUserFactsOnly(
  providerId: string,
  providerConfig: ProviderConfig,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  console.log('[MemoryExtractor] Starting user facts extraction (non-agent mode)')

  const extracted = await extractMemoriesFromConversation(
    providerId,
    providerConfig,
    userMessage,
    assistantMessage
  )

  if (!extracted || extracted.userFacts.length === 0) {
    console.log('[MemoryExtractor] No user facts extracted')
    return
  }

  let factsAdded = 0
  let factsUpdated = 0
  let factsSkipped = 0

  // Process user facts with intelligent memory management
  for (const fact of extracted.userFacts) {
    try {
      const result = await processUserFact(
        providerId,
        providerConfig,
        {
          content: fact.content,
          category: fact.category,
          confidence: fact.confidence,
        }
        // No sourceAgentId in non-agent mode
      )

      switch (result.action) {
        case 'added':
          factsAdded++
          console.log('[MemoryExtractor] Added user fact:', fact.content.slice(0, 50))
          break
        case 'updated':
          factsUpdated++
          console.log('[MemoryExtractor] Updated user fact:', result.decision.reason)
          break
        case 'deleted_and_added':
          factsUpdated++
          console.log('[MemoryExtractor] Replaced user fact:', result.decision.reason)
          break
        case 'skipped':
          factsSkipped++
          console.log('[MemoryExtractor] Skipped duplicate fact:', result.decision.reason)
          break
      }
    } catch (error) {
      console.error('[MemoryExtractor] Failed to process user fact:', error)
    }
  }

  console.log(`[MemoryExtractor] Completed (non-agent mode). Facts: ${factsAdded} added, ${factsUpdated} updated, ${factsSkipped} skipped`)
}
