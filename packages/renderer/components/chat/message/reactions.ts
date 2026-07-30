/**
 * Reaction chips — the display half (W8,
 * docs/design/multi-agent-collab-im.md §3.5 B / §3.6).
 *
 * The set arithmetic lives in `@onething/runtime/collab` and is shared with the
 * coordinator; this module only turns a stored reaction array into what a chip
 * row needs: a count, a "did I do this" flag, and the attribution rows the
 * hover popover lists (W8b). Kept DOM-free so the naming rules are testable on
 * their own.
 */
import {
  hasCollabReactionFrom,
  tallyCollabReactions,
  type CollabReactionActorLike,
} from '@onething/runtime/collab'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'
import type { ChatMessageReaction } from '@/types'

/** How the human is named in a reaction tooltip. */
export const REACTION_SELF_LABEL = '你'

/** Fallback for an agent whose roster entry is gone. */
export const REACTION_UNKNOWN_AGENT_LABEL = '成员'

/** The human's stamp in the attribution popover — no roster entry to read. */
export const REACTION_SELF_AVATAR = '🧑'

/** Stamp for an agent with no avatar (same fallback the room gutter uses). */
export const REACTION_FALLBACK_AVATAR = AGENT_AVATAR_FALLBACK

/** The human's actor identity — one per app, no id. */
export const REACTION_USER_ACTOR: CollabReactionActorLike = { type: 'user' }

/** One line of the attribution popover: who, with their stamp (W8b). */
export interface ReactionReactor {
  /** Stable v-for key — actor identity plus its slot, so twins never collide. */
  key: string
  avatar: string
  /**
   * Media file name of the reactor's picture avatar, when it has one. Never set
   * for the human row: 🧑 is not an agent's mark and there is no roster entry
   * behind it to carry a picture.
   */
  avatarImage?: string
  label: string
  /** This row is the human — the popover may want to read it differently. */
  isUser: boolean
}

export interface ReactionChip {
  emoji: string
  count: number
  /** The current user is in this chip's roster — §3.6: darker line, no fill. */
  mine: boolean
  /** Who reacted, in the order they did — the popover's rows. */
  reactors: ReactionReactor[]
}

export interface BuildReactionChipsOptions {
  /** Roster used to name agent reactors; ids not found fall back to 成员. */
  agents?: ReadonlyArray<{ id: string; name?: string; avatar?: string; avatarImage?: string }>
}

/**
 * Actors → display rows. A roster miss keeps the raw agentId (an id the user
 * can still trace beats a nameless 成员); only an actor with no id at all —
 * corrupt or pre-id data — falls all the way back to the generic label.
 */
export function buildReactionReactors(
  actors: readonly CollabReactionActorLike[] | undefined,
  options: BuildReactionChipsOptions = {},
): ReactionReactor[] {
  return (actors ?? []).map((actor, index) => {
    if (actor?.type === 'user') {
      return {
        key: `${index}:user`,
        avatar: REACTION_SELF_AVATAR,
        label: REACTION_SELF_LABEL,
        isUser: true,
      }
    }
    const agentId = actor?.agentId
    const agent = agentId
      ? options.agents?.find(candidate => candidate.id === agentId)
      : undefined
    return {
      key: `${index}:agent:${agentId ?? ''}`,
      avatar: agent?.avatar || REACTION_FALLBACK_AVATAR,
      avatarImage: agent?.avatarImage,
      label: agent?.name || agentId || REACTION_UNKNOWN_AGENT_LABEL,
      isUser: false,
    }
  })
}

/**
 * One chip per emoji, in the order the room first used it. Empty groups are
 * already dropped by the tally, so a chip always has at least one reactor —
 * a `0` chip would be a ghost the user cannot dismiss.
 */
export function buildReactionChips(
  reactions: readonly ChatMessageReaction[] | undefined,
  options: BuildReactionChipsOptions = {},
): ReactionChip[] {
  return tallyCollabReactions(reactions).map(tally => ({
    emoji: tally.emoji,
    count: tally.count,
    mine: hasCollabReactionFrom(reactions, tally.emoji, REACTION_USER_ACTOR),
    reactors: buildReactionReactors(tally.actors, options),
  }))
}
