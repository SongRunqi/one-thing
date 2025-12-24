/**
 * Smart Extraction Classifier
 *
 * Simplified approach: Only filter out obviously irrelevant content.
 * Let the LLM decide what's worth extracting - it's smarter than regex.
 */

export interface ConversationClassification {
  shouldExtract: boolean
  reason: string
  confidence: number
  category: 'skip' | 'extract'
}

// Only skip these obvious cases - everything else goes to LLM
const DEFINITE_SKIP_PATTERNS = [
  // Pure greetings (very short, no content)
  /^(hi|hello|hey|yo|sup|嗨|你好|喂)(\s|!|\?)?$/i,
  /^(ok|okay|sure|got it|好的|好|嗯|哦|明白了?)(\s|!)?$/i,
  /^(thanks|thank you|thx|谢谢|感谢)(\s|!)?$/i,
  /^(bye|goodbye|再见|拜拜)(\s|!)?$/i,

  // Pure code blocks (starts and ends with ```)
  /^```[\s\S]*```$/,

  // Single word or very short responses
  /^.{1,3}$/,
]

// Technical content that's unlikely to have personal info
const TECHNICAL_PATTERNS = [
  /^(npm|yarn|pip|cargo|go|git|docker)\s+(install|run|build|start)/i,
  /^(curl|wget|ssh|scp)\s+/i,
]

/**
 * Determine if memory extraction should run
 *
 * Strategy: Be permissive. Only skip obvious non-personal content.
 * The LLM extraction step will return empty if nothing worth saving.
 */
export async function shouldExtractMemory(
  userMessage: string,
  assistantMessage: string
): Promise<ConversationClassification> {
  const trimmed = userMessage.trim()

  // Skip definite non-content
  for (const pattern of DEFINITE_SKIP_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        shouldExtract: false,
        reason: 'trivial message',
        confidence: 0.95,
        category: 'skip',
      }
    }
  }

  // Skip pure technical commands
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        shouldExtract: false,
        reason: 'technical command',
        confidence: 0.85,
        category: 'skip',
      }
    }
  }

  // Skip if message is mostly code (>50% is code block)
  const codeBlockMatch = trimmed.match(/```[\s\S]*?```/g)
  if (codeBlockMatch) {
    const codeLength = codeBlockMatch.join('').length
    if (codeLength > trimmed.length * 0.5) {
      return {
        shouldExtract: false,
        reason: 'mostly code',
        confidence: 0.8,
        category: 'skip',
      }
    }
  }

  // Everything else: let LLM decide
  // The LLM will return empty arrays if nothing worth extracting
  return {
    shouldExtract: true,
    reason: 'may contain personal info',
    confidence: 0.7,
    category: 'extract',
  }
}

