/**
 * Reaction chips, display half (W8, docs/design/multi-agent-collab-im.md
 * §3.5 B). The set arithmetic is tested in @onething/runtime/collab; what is
 * asserted here is the naming — the human is 你, an agent is its roster name,
 * and a stale id never renders as a blank chip.
 */
import { describe, expect, it } from 'vitest'
import {
  REACTION_FALLBACK_AVATAR,
  REACTION_SELF_AVATAR,
  REACTION_SELF_LABEL,
  REACTION_UNKNOWN_AGENT_LABEL,
  buildReactionChips,
  buildReactionReactors,
} from '../reactions'

const AGENTS = [
  { id: 'fe', name: '小李', avatar: '🔧' },
  { id: 'pm', name: '阿明', avatar: '📋' },
]

function labelsOf(chip: { reactors: Array<{ label: string }> } | undefined): string[] {
  return (chip?.reactors ?? []).map(reactor => reactor.label)
}

describe('buildReactionChips', () => {
  it('is empty for a message nobody reacted to', () => {
    expect(buildReactionChips(undefined)).toEqual([])
    expect(buildReactionChips([])).toEqual([])
  })

  it('counts per emoji and names every reactor in the attribution rows', () => {
    const chips = buildReactionChips([
      { emoji: '👍', by: [{ type: 'user' }, { type: 'agent', agentId: 'fe' }] },
      { emoji: '🎉', by: [{ type: 'agent', agentId: 'pm' }] },
    ], { agents: AGENTS })

    expect(chips.map(chip => [chip.emoji, chip.count, chip.mine])).toEqual([
      ['👍', 2, true],
      ['🎉', 1, false],
    ])
    expect(chips[0].reactors).toEqual([
      { key: '0:user', avatar: REACTION_SELF_AVATAR, label: REACTION_SELF_LABEL, isUser: true },
      { key: '1:agent:fe', avatar: '🔧', label: '小李', isUser: false },
    ])
    expect(labelsOf(chips[1])).toEqual(['阿明'])
  })

  it('marks mine only when the human is actually in that group', () => {
    const chips = buildReactionChips([
      { emoji: '👍', by: [{ type: 'agent', agentId: 'fe' }] },
      { emoji: '👀', by: [{ type: 'user' }] },
    ], { agents: AGENTS })
    expect(chips.map(chip => chip.mine)).toEqual([false, true])
  })

  it('drops groups nobody is in — a 0 chip cannot be dismissed', () => {
    expect(buildReactionChips([{ emoji: '👍', by: [] }])).toEqual([])
  })

  it('falls back for an agent whose roster entry is gone', () => {
    const [chip] = buildReactionChips([
      { emoji: '👍', by: [{ type: 'agent', agentId: 'ghost' }] },
    ], { agents: AGENTS })
    expect(chip.reactors).toEqual([
      { key: '0:agent:ghost', avatar: REACTION_FALLBACK_AVATAR, label: 'ghost', isUser: false },
    ])

    const [idless] = buildReactionChips([
      { emoji: '👍', by: [{ type: 'agent' }] },
    ], { agents: AGENTS })
    expect(labelsOf(idless)).toEqual([REACTION_UNKNOWN_AGENT_LABEL])
  })
})

describe('buildReactionReactors', () => {
  it('is empty when nobody reacted', () => {
    expect(buildReactionReactors(undefined)).toEqual([])
    expect(buildReactionReactors([])).toEqual([])
  })

  it('keeps the order they reacted in, mixing the human and the roster', () => {
    const rows = buildReactionReactors(
      [
        { type: 'agent', agentId: 'pm' },
        { type: 'user' },
        { type: 'agent', agentId: 'fe' },
      ],
      { agents: AGENTS },
    )
    expect(rows.map(row => row.label)).toEqual(['阿明', REACTION_SELF_LABEL, '小李'])
    expect(rows.map(row => row.avatar)).toEqual(['📋', REACTION_SELF_AVATAR, '🔧'])
    expect(rows.map(row => row.isUser)).toEqual([false, true, false])
  })

  it('stamps an avatar-less roster entry with the room fallback', () => {
    const [row] = buildReactionReactors([{ type: 'agent', agentId: 'qa' }], {
      agents: [{ id: 'qa', name: '小测' }],
    })
    expect(row).toEqual({
      key: '0:agent:qa',
      avatar: REACTION_FALLBACK_AVATAR,
      label: '小测',
      isUser: false,
    })
  })

  it('gives every row a distinct key, even for two id-less actors', () => {
    const rows = buildReactionReactors([{ type: 'agent' }, { type: 'agent' }])
    expect(new Set(rows.map(row => row.key)).size).toBe(2)
  })
})
