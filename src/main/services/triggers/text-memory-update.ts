/**
 * Text Memory Update Trigger
 *
 * Runs after each conversation to extract and save valuable information
 * to the text-based memory system (Markdown files).
 *
 * This replaces the complex memory-extraction.ts trigger with a simpler approach:
 * - Uses LLM to analyze conversation and decide what to remember
 * - Writes directly to Markdown files instead of SQLite
 * - No embeddings, no decay, just simple text files
 */

import type { Trigger, TriggerContext } from './index.js'
import { getSettings } from '../../stores/index.js'
import { generateChatResponseWithReasoning } from '../../providers/index.js'
import {
  updateUserProfile,
  updateUserPreferences,
  addAgentMemoryPoint,
  createTopicFile,
  listExistingTopics,
} from '../memory-text/index.js'

// Minimum message lengths to consider for extraction
const MIN_USER_MESSAGE_LENGTH = 10
const MIN_ASSISTANT_MESSAGE_LENGTH = 30

/**
 * Normalize content to ensure it has exactly one leading dash
 * Strips any existing dashes/bullets before adding one
 */
function formatAsListItem(content: string): string {
  // Remove leading dashes, bullets, spaces
  const cleaned = content.replace(/^[\s\-•*]+/, '').trim()
  return `- ${cleaned}`
}

// Prompt for memory extraction
const MEMORY_EXTRACTION_PROMPT = `Analyze this conversation and extract any valuable information that should be remembered about the user.

USER MESSAGE:
{userMessage}

ASSISTANT RESPONSE:
{assistantMessage}

EXISTING TOPICS (for reference):
{existingTopics}

Based on this conversation, identify any information worth remembering. Return a JSON object with the following structure:

{
  "shouldRemember": boolean,  // true if there's something worth remembering
  "profile": {                // User profile updates (optional)
    "section": "string",      // Section name (e.g., "Basic Info", "Background")
    "content": "string",      // Plain text content (NO markdown formatting, NO leading dash)
    "tags": string[]          // Recommended tags for this memory (2-5 tags)
  },
  "preferences": {            // User preferences updates (optional)
    "section": "string",
    "content": "string",      // Plain text content (NO markdown formatting, NO leading dash)
    "tags": string[]          // Recommended tags (2-5 tags)
  },
  "topic": {                  // Topic-specific memory (optional)
    "name": "string",         // Topic name (e.g., "vue", "electron")
    "section": "string",      // Section within the topic
    "content": "string",      // Plain text content (NO markdown formatting, NO leading dash)
    "isNew": boolean,         // true if this is a new topic file
    "tags": string[]          // Recommended tags (2-5 tags)
  },
  "agentMemory": "string"     // Brief observation about user (optional, for agent context)
}

**Tag Recommendation Rules**:
1. Suggest 2-5 relevant tags per memory
2. Use existing topics from {existingTopics} when applicable
3. Include technical terms (e.g., "vue", "typescript", "api")
4. Include category tags (e.g., "frontend", "backend", "design")
5. Use lowercase, no spaces (use hyphens: "web-dev", "code-review")
6. Prioritize consistency - reuse existing tags when possible

Rules:
1. Only extract genuinely useful, long-term information
2. Skip trivial conversations (greetings, simple Q&A)
3. Focus on: personal info, preferences, goals, technical interests, project context
4. Use the existing topics list to decide if a topic file exists or needs to be created
5. Return {"shouldRemember": false} if nothing worth remembering

Return ONLY the JSON object, no other text.`

/**
 * Text Memory Update Trigger
 */
export const textMemoryUpdateTrigger: Trigger = {
  id: 'text-memory-update',
  name: 'Text Memory Update',
  priority: 5,  // Run early, similar to the old memory-extraction trigger

  async shouldTrigger(ctx: TriggerContext): Promise<boolean> {
    const { lastUserMessage, lastAssistantMessage, messages } = ctx

    // Check if memory is enabled in settings
    const settings = getSettings()
    const memoryEnabled = settings.embedding?.memoryEnabled !== false
    if (!memoryEnabled) {
      console.log('[TextMemoryUpdate] Skipped: Memory is disabled in settings')
      return false
    }

    // Check if Memory Tool was used in this conversation
    // If AI already used the memory tool, it has handled memory saving
    const memoryToolUsed = messages.some(msg => {
      // Check toolCalls array (legacy format)
      if (msg.toolCalls?.some(tc => tc.toolName === 'memory')) {
        return true
      }
      // Check contentParts for tool calls (new format)
      if (msg.contentParts?.some(part =>
        part.type === 'tool-call' && part.toolCalls?.some(tc => tc.toolName === 'memory')
      )) {
        return true
      }
      return false
    })

    if (memoryToolUsed) {
      console.log('[TextMemoryUpdate] Skipped: Memory Tool was already used in this conversation')
      return false
    }

    // Skip if messages are too short (basic sanity check)
    if (lastUserMessage.length < MIN_USER_MESSAGE_LENGTH) {
      console.log('[TextMemoryUpdate] Skipped: User message too short')
      return false
    }

    if (lastAssistantMessage.length < MIN_ASSISTANT_MESSAGE_LENGTH) {
      console.log('[TextMemoryUpdate] Skipped: Assistant message too short')
      return false
    }

    // Let LLM decide if the conversation is worth remembering
    // All semantic decisions are made in execute() via the extraction prompt
    return true
  },

  async execute(ctx: TriggerContext): Promise<void> {
    const {
      providerId,
      providerConfig,
      lastUserMessage,
      lastAssistantMessage,
      agentId,
    } = ctx

    try {
      console.log('[TextMemoryUpdate] Analyzing conversation for memory extraction...')

      // Get existing topics for context
      const existingTopics = await listExistingTopics(agentId)

      // Build the extraction prompt
      const prompt = MEMORY_EXTRACTION_PROMPT
        .replace('{userMessage}', lastUserMessage.slice(0, 1000))  // Limit length
        .replace('{assistantMessage}', lastAssistantMessage.slice(0, 1000))
        .replace('{existingTopics}', existingTopics.join(', ') || 'None')

      // Call LLM for extraction
      const response = await generateChatResponseWithReasoning(
        providerId,
        providerConfig as { apiKey: string; model: string; baseUrl?: string },
        [{ role: 'user', content: prompt }],
        { maxTokens: 1000 }
      )

      // Parse the response - ChatResponseResult has 'text' property
      const responseText = response.text

      // Extract JSON from response (handle markdown code blocks)
      let jsonText = responseText.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }

      const extraction = JSON.parse(jsonText)

      if (!extraction.shouldRemember) {
        console.log('[TextMemoryUpdate] Nothing worth remembering')
        return
      }

      // Apply the extractions
      if (extraction.profile?.content) {
        await updateUserProfile(
          extraction.profile.section || 'Notes',
          formatAsListItem(extraction.profile.content),
          extraction.profile.tags
        )
        console.log('[TextMemoryUpdate] Updated user profile')
      }

      if (extraction.preferences?.content) {
        await updateUserPreferences(
          extraction.preferences.section || 'Notes',
          formatAsListItem(extraction.preferences.content),
          extraction.preferences.tags
        )
        console.log('[TextMemoryUpdate] Updated user preferences')
      }

      if (extraction.topic?.name && extraction.topic?.content) {
        const topicContent = `## ${extraction.topic.section || 'Notes'}\n${formatAsListItem(extraction.topic.content)}`
        if (extraction.topic.isNew) {
          await createTopicFile(
            extraction.topic.name,
            topicContent,
            agentId,
            extraction.topic.tags
          )
          console.log('[TextMemoryUpdate] Created new topic file:', extraction.topic.name)
        } else {
          // For existing topics, we'd need to append - simplified for now
          await createTopicFile(
            extraction.topic.name,
            topicContent,
            agentId,
            extraction.topic.tags
          )
          console.log('[TextMemoryUpdate] Updated topic:', extraction.topic.name)
        }
      }

      if (agentId && extraction.agentMemory) {
        await addAgentMemoryPoint(agentId, extraction.agentMemory)
        console.log('[TextMemoryUpdate] Added agent memory point')
      }

      console.log('[TextMemoryUpdate] Memory extraction completed')
    } catch (error) {
      console.error('[TextMemoryUpdate] Failed to extract memory:', error)
    }
  }
}
