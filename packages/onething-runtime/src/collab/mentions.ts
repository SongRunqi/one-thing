import type { CollabAgentLike, CollabMentionLike } from './types.js'

/**
 * Parse @mentions of room members from a message text.
 *
 * CJK names have no word boundaries, so each member's name is matched
 * literally after '@'. Longer names are claimed first so that with members
 * 小李工 and 小李, "@小李工" resolves to the longer one (the shorter match at
 * the same '@' position is suppressed). Returns member ids in first-appearance
 * order, deduped.
 *
 * 重名 (W14a): when several members go by the SAME name they all match the
 * same position and all of them are returned — only a longer name suppresses
 * a shorter one. Text cannot tell two 小李 apart, so claiming one of them
 * would be a coin flip; the picker's id is what makes a mention precise.
 *
 * NOTE (W14a): this is the FALLBACK half of identity. A message that carries
 * `mentions` (agent ids fixed at authoring time) is resolved by id — see
 * resolveCollabMentionIds. Name text stays the degradation path for old
 * transcripts and for bare typing that never went through a picker.
 */
export function parseCollabMentions(
  text: string | undefined | null,
  members: readonly CollabAgentLike[],
): string[] {
  if (!text || !text.includes('@')) return []

  const byLength = members
    .filter(member => typeof member.name === 'string' && member.name.trim().length > 0)
    .sort((a, b) => b.name.trim().length - a.name.trim().length)

  const claims: Array<{ index: number; id: string }> = []
  // Longest name wins a position; equally long ones SHARE it (重名).
  const claimedLength = new Map<number, number>()
  for (const member of byLength) {
    const token = `@${member.name.trim()}`
    let from = 0
    for (;;) {
      const index = text.indexOf(token, from)
      if (index < 0) break
      const winner = claimedLength.get(index)
      if (winner === undefined || winner === token.length) {
        claimedLength.set(index, token.length)
        claims.push({ index, id: member.id })
      }
      from = index + token.length
    }
  }

  claims.sort((a, b) => a.index - b.index)
  const seen = new Set<string>()
  const ids: string[] = []
  for (const claim of claims) {
    if (seen.has(claim.id)) continue
    seen.add(claim.id)
    ids.push(claim.id)
  }
  return ids
}

/**
 * Name parse → mention records (W14a). The label is the roster name AT THIS
 * MOMENT: it is a snapshot, kept so a mention still reads as words after the
 * agent is deleted, while the id keeps it addressable after a rename.
 *
 * 重名 note: two members sharing a name both match the same `@名字`, so both
 * get an entry — bare typing is inherently ambiguous and the honest answer is
 * "both". The picker path (which knows exactly which member was chosen) is
 * what makes a mention precise.
 */
export function buildCollabMentions(
  text: string | undefined | null,
  members: readonly CollabAgentLike[],
): CollabMentionLike[] {
  const byId = new Map(members.map(member => [member.id, member]))
  return parseCollabMentions(text, members).map(agentId => ({
    agentId,
    label: byId.get(agentId)?.name?.trim() || agentId,
  }))
}

/**
 * Sanitize an untrusted mentions array into plain literals (a renderer hands
 * these across IPC; a persisted transcript is replayed from disk). Entries
 * without a usable agentId are dropped. When `members` is given, unknown ids
 * are dropped too and every label is re-stamped from the roster — the CLIENT
 * DOES NOT GET TO NAME ANOTHER AGENT: the label is a display snapshot, and
 * letting it arrive from outside would let a sender write words into the room
 * that no member ever went by.
 */
export function normalizeCollabMentions(
  value: unknown,
  options: { members?: readonly CollabAgentLike[] } = {},
): CollabMentionLike[] {
  if (!Array.isArray(value)) return []
  const byId = options.members ? new Map(options.members.map(member => [member.id, member])) : undefined
  const seen = new Set<string>()
  const mentions: CollabMentionLike[] = []
  for (const entry of value) {
    const agentId = typeof (entry as CollabMentionLike | undefined)?.agentId === 'string'
      ? String((entry as CollabMentionLike).agentId).trim()
      : ''
    if (!agentId || seen.has(agentId)) continue
    if (byId && !byId.has(agentId)) continue
    const rosterName = byId?.get(agentId)?.name?.trim()
    const rawLabel = typeof (entry as CollabMentionLike).label === 'string'
      ? String((entry as CollabMentionLike).label).trim()
      : ''
    const label = rosterName || rawLabel || agentId
    seen.add(agentId)
    mentions.push({ agentId, label })
  }
  return mentions
}

/**
 * Merge picker-supplied mentions with the name-parse fallback (W14a ingress).
 *
 * Per-LABEL authority: when the sender explicitly picked a member, the ids it
 * picked own that label and the text scan contributes nothing more for it —
 * that is exactly what makes 重名 precise (picking one 小李 must not also
 * activate the other one, whose name matches the same `@小李`). Labels the
 * picker said nothing about still come from the text, so a draft mixing one
 * picked mention with one typed by hand keeps both.
 */
export function mergeCollabMentions(
  picked: readonly CollabMentionLike[],
  parsed: readonly CollabMentionLike[],
): CollabMentionLike[] {
  const claimedLabels = new Set(picked.map(mention => mention.label))
  const merged: CollabMentionLike[] = []
  const seen = new Set<string>()
  for (const mention of [...picked, ...parsed.filter(entry => !claimedLabels.has(entry.label))]) {
    if (seen.has(mention.agentId)) continue
    seen.add(mention.agentId)
    merged.push({ agentId: mention.agentId, label: mention.label })
  }
  return merged
}

/**
 * The consumption rule (W14a): ids first, text second.
 *
 *  - a message carrying `mentions` is resolved from it — renames and 重名 are
 *    both already settled at authoring time
 *  - a message WITHOUT the field (every transcript written before W14a, and
 *    anything an external channel injects) falls back to the name scan
 *
 * An EMPTY mentions array is a real answer ("this message mentions nobody"),
 * not a missing field — writers therefore omit the key rather than store [].
 */
export function resolveCollabMentionIds(
  message: { content?: string | null; mentions?: readonly CollabMentionLike[] },
  members: readonly CollabAgentLike[],
): string[] {
  if (Array.isArray(message.mentions)) {
    const seen = new Set<string>()
    const ids: string[] = []
    for (const mention of message.mentions) {
      const agentId = typeof mention?.agentId === 'string' ? mention.agentId : ''
      if (!agentId || seen.has(agentId)) continue
      seen.add(agentId)
      ids.push(agentId)
    }
    return ids
  }
  return parseCollabMentions(message.content, members)
}

/**
 * Display-time rename resolution (W14a): `@<label>` is repainted with whatever
 * the mentioned agent is called NOW. One implementation for every surface —
 * the model projection, the willingness window and the room UI must all read
 * the same name, or an agent renamed mid-conversation would answer to a name
 * the transcript no longer shows.
 *
 * Fallbacks are deliberate: an agent that is gone from the roster keeps its
 * label snapshot (the words stay readable), and a label that two mentions
 * resolve differently (two 小李, one renamed) is left ALONE — silently picking
 * one of them would put a name next to the wrong person.
 */
export function renderCollabMentionText(
  text: string | undefined | null,
  mentions: readonly CollabMentionLike[] | undefined,
  agents: readonly CollabAgentLike[],
): string {
  const source = text ?? ''
  if (!source.includes('@') || !mentions || mentions.length === 0) return source

  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const resolved = new Map<string, string | null>()
  for (const mention of mentions) {
    const label = mention?.label?.trim()
    if (!label) continue
    const current = byId.get(mention.agentId)?.name?.trim() || label
    const previous = resolved.get(label)
    if (previous === undefined) resolved.set(label, current)
    else if (previous !== current) resolved.set(label, null) // ambiguous — leave the text as written
  }

  /**
   * Longest-name-wins, over EVERY name the room knows (P2-11) — the same
   * disambiguation `parseCollabMentions` does above, which the repaint used to
   * lack. The old candidate set held only the RENAMED labels, so a short
   * renamed name could eat the prefix of a longer one that had not changed:
   * with 小李→小李新 and 小李工 untouched, `@小李工` came out `@小李新工`.
   *
   * Unrenamed and ambiguous names stay in the set as BLOCKERS: matching one
   * emits it verbatim and steps past it, which is exactly what stops a shorter
   * candidate from claiming its opening characters.
   */
  const candidates = [...new Set([
    ...resolved.keys(),
    ...agents.map(agent => agent.name?.trim()).filter((name): name is string => Boolean(name)),
  ])].sort((a, b) => b.length - a.length)
  if (candidates.length === 0) return source

  let output = ''
  let index = 0
  while (index < source.length) {
    if (source[index] !== '@') {
      output += source[index]
      index += 1
      continue
    }
    const label = candidates.find(candidate => source.startsWith(candidate, index + 1))
    if (!label) {
      output += source[index]
      index += 1
      continue
    }
    const current = resolved.get(label)
    output += typeof current === 'string' && current !== label ? `@${current}` : `@${label}`
    index += 1 + label.length
  }
  return output
}
