import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/ipc.js'
import {
  formatMemoryReviewConversation,
  getMemoryReviewProgress,
  parseMemoryReviewModelResult,
} from '../review.js'

function userMessage(index: number): ChatMessage {
  return {
    id: `user-${index}`,
    role: 'user',
    content: `question ${index}`,
    timestamp: index,
  }
}

function assistantMessage(index: number): ChatMessage {
  return {
    id: `assistant-${index}`,
    role: 'assistant',
    content: `answer ${index}`,
    timestamp: index,
  }
}

function conversation(userTurns: number): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (let index = 1; index <= userTurns; index += 1) {
    messages.push(userMessage(index), assistantMessage(index))
  }
  return messages
}

describe('memory review helpers', () => {
  it('triggers every fixed number of user turns', () => {
    expect(getMemoryReviewProgress({
      messages: conversation(9),
      interval: 10,
    })).toMatchObject({
      userTurns: 9,
      turnsSinceReview: 9,
      turnsUntilReview: 1,
      shouldReview: false,
    })

    expect(getMemoryReviewProgress({
      messages: conversation(10),
      interval: 10,
    })).toMatchObject({
      userTurns: 10,
      turnsSinceReview: 0,
      turnsUntilReview: 0,
      shouldReview: true,
    })
  })

  it('does not trigger twice for the same reviewed turn', () => {
    expect(getMemoryReviewProgress({
      messages: conversation(10),
      interval: 10,
      lastReviewedTurn: 10,
    })).toMatchObject({
      userTurns: 10,
      shouldReview: false,
    })
  })

  it('parses fenced review JSON and filters sensitive candidates', () => {
    const parsed = parseMemoryReviewModelResult(`\`\`\`json
{
  "action": "review",
  "confidence": 0.9,
  "memories": [
    {"action": "add", "target": "user", "confidence": 0.92, "content": "User prefers Chinese explanations."},
    {"action": "add", "target": "memory", "confidence": 0.8, "content": "api_key = abc", "sensitivity": "secret"}
  ]
}
\`\`\``)

    expect(parsed?.confidence).toBe(0.9)
    expect(parsed?.candidates).toHaveLength(1)
    expect(parsed?.candidates[0]).toMatchObject({
      action: 'add',
      target: 'user',
      content: 'User prefers Chinese explanations.',
      confidence: 0.92,
    })
  })

  it('parses soul and dreams review targets', () => {
    const parsed = parseMemoryReviewModelResult(JSON.stringify({
      action: 'review',
      confidence: 0.86,
      memories: [
        {
          action: 'replace',
          target: 'soul',
          oldText: 'Keep replies formal.',
          newText: 'Keep replies warm and precise.',
          confidence: 0.9,
        },
        {
          action: 'remove',
          target: 'dreams',
          text: 'Maybe revisit tone later.',
          confidence: 0.88,
        },
      ],
    }))

    expect(parsed?.candidates).toEqual([
      {
        action: 'replace',
        target: 'soul',
        confidence: 0.9,
        content: 'Keep replies formal.',
        oldText: 'Keep replies formal.',
        newText: 'Keep replies warm and precise.',
        text: 'Keep replies formal.',
      },
      {
        action: 'remove',
        target: 'dreams',
        confidence: 0.88,
        content: 'Maybe revisit tone later.',
        text: 'Maybe revisit tone later.',
      },
    ])
  })

  it('keeps the latest conversation tail when compacting', () => {
    const formatted = formatMemoryReviewConversation(conversation(80), 220)

    expect(formatted).toContain('[Older conversation omitted]')
    expect(formatted).toContain('User: question 80')
    expect(formatted).toContain('Assistant: answer 80')
  })
})
