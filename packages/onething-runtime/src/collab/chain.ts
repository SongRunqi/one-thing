import { isCollabPassMessage } from './pass.js'
import { isCollabSayMessage, isCollabThinkingMessage } from './say.js'
import { isCollabDriveMessage, isCollabHarvestMessage, type CollabMessageLike } from './types.js'

/**
 * Chain accounting (§6.2):
 *  - counts:  an agent's actual speech — a `say` message (W14b), or in a
 *             pre-W14b transcript the non-pass turn message that WAS speech
 *  - ignores: drive messages, thinking records, pass turns, harvest posts,
 *             display-only roles
 *  - resets:  a real human message (non-drive user message). Steering resets
 *             too, but steering arrives as an event (steering:consumed), which
 *             the coordinator handles — persisted steered messages also satisfy
 *             this predicate, so a transcript replay reaches the same count.
 *
 * W14b epoch discipline: a turn that says three things counts three, because
 * the LIVE coordinator counts one per say and the boot recompute walks the
 * same messages — the two numbers must be identical or a restart silently
 * moves the chain gate. A thinking record counts zero no matter how long the
 * agent thought: thinking is not talking, and gating a room on it would punish
 * the very separation this工单 introduced.
 *
 * Harvest posts (delivery/progress reports) are work-pipeline output, not chat:
 * live accounting skips them (coordinator noteAgentSpoke is a noop for them),
 * so the replay must skip them too or a restart would inflate the count and
 * gate the room early (W12). Pre-W12 transcripts carry no marker and are still
 * over-counted on replay — a one-off that heals at the next human message.
 */
export function collabMessageCountsTowardChain(message: CollabMessageLike): boolean {
  if (message.role !== 'assistant' || !message.agentId) return false
  if (isCollabHarvestMessage(message)) return false
  // W14b epoch: the markers ARE the answer, both ways.
  if (isCollabThinkingMessage(message)) return false
  if (isCollabSayMessage(message)) return true
  // Pre-W14b transcript: the turn message was the speech.
  return !isCollabPassMessage(message.content)
}

export function collabMessageResetsChain(message: CollabMessageLike): boolean {
  if (message.role !== 'user') return false
  return !isCollabDriveMessage(message)
}

/** Recompute the chain count from a transcript tail (boot reconciliation). */
export function computeCollabChainCount(messages: readonly CollabMessageLike[]): number {
  let count = 0
  for (const message of messages) {
    if (collabMessageResetsChain(message)) {
      count = 0
    } else if (collabMessageCountsTowardChain(message)) {
      count += 1
    }
  }
  return count
}
