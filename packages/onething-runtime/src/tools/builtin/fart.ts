/**
 * Built-in Tool: Buddy (id kept as `fart` for backwards compat)
 *
 * A novelty companion tool inspired by Claude Code's buddy/companion sprites.
 * Picks from a roster of ASCII characters and performs an action — fart, wave,
 * dance, sleep, sing, cheer, think, jump, wink, cry — streaming animation
 * frames via ctx.metadata() for a real-time effect.
 *
 * Optional `text` parameter renders a comic-style speech bubble next to the
 * character during the louder/expressive frames of the animation.
 */

import { z } from 'zod'
import { Tool } from '../tool.js'

// ============================================================================
// Schema
// ============================================================================

const ACTIONS = [
  'fart', 'wave', 'dance', 'sleep', 'wink',
  'sing', 'cheer', 'think', 'jump', 'cry',
] as const
type Action = typeof ACTIONS[number]

const CHARACTERS = [
  'butt', 'duck', 'cat', 'dragon', 'robot',
  'ghost', 'blob', 'owl', 'penguin', 'capybara',
] as const
type Character = typeof CHARACTERS[number]

const FartParameters = z.object({
  action: z
    .enum(ACTIONS)
    .default('fart')
    .optional()
    .describe('What the buddy does. Defaults to a fart for back-compat. Other options: wave, dance, sleep, wink, sing, cheer, think, jump, cry.'),
  character: z
    .enum(CHARACTERS)
    .default('butt')
    .optional()
    .describe('Which ASCII character performs the action. Default `butt` (the classic fart figure). Try duck, cat, dragon, robot, ghost, blob, owl, penguin, capybara.'),
  style: z
    .enum(['classic', 'silent', 'massive', 'wet'])
    .default('classic')
    .optional()
    .describe('Fart style — only used when action=fart. classic / silent / massive / wet.'),
  loudness: z
    .number()
    .min(1)
    .max(10)
    .default(10)
    .optional()
    .describe('Intensity from 1 (subtle) to 10 (over the top). Defaults to 10 — go big or go home. Controls frame count and label escalation.'),
  text: z
    .string()
    .max(240)
    .optional()
    .describe('Optional message the character "says" — rendered inside an ASCII speech bubble next to the body during expressive frames.'),
})

interface BuddyFrame {
  label: string
  art: string
}

// ============================================================================
// Character sprites — each is a function returning a fresh body each call.
// `eye` lets actions tweak the face (wink, sleep, cry, etc.) without
// duplicating the whole sprite.
// ============================================================================

type Eye = 'normal' | 'wink' | 'sleep' | 'happy' | 'cry' | 'star'

function eyeChar(eye: Eye, side: 'L' | 'R'): string {
  switch (eye) {
    case 'wink':  return side === 'L' ? '-' : 'o'
    case 'sleep': return '-'
    case 'happy': return '^'
    case 'cry':   return 'T'
    case 'star':  return '*'
    case 'normal':
    default:      return 'o'
  }
}

interface Sprite {
  // Each sprite has 3 fidget frames. The action cycles through them per frame
  // index so the character visibly animates (ears twitching, body wobbling,
  // etc.) even when the action's decoration is subtle.
  //
  // Placeholders:
  //   {EL}/{ER}  - left/right eye (single char, substituted from Eye enum)
  //   {RH}       - right-side prop slot (waving hand, gas puff, music note)
  //
  // Sprites are drawn with block characters (█ ▄ ▀ ▌ ▐) for a pixel-art feel.
  frames: string[][]
}

const SPRITES: Record<Character, Sprite> = {
  //                 Butt keeps the classic ASCII fart figure — changing it
  //                 would break the original joke. Slight mouth wobble for anim.
  butt: {
    frames: [
      [
        '      ,─────,  ',
        '     ╱       ╲ ',
        '    │  {EL} {ER}  │{RH}',
        '     ╲   _   ╱ ',
        '      ╲─────╱  ',
      ],
      [
        '      ,─────,  ',
        '     ╱       ╲ ',
        '    │  {EL} {ER}  │{RH}',
        '     ╲  ___  ╱ ',
        '      ╲─────╱  ',
      ],
      [
        '      ,─────,  ',
        '     ╱       ╲ ',
        '    │  {EL} {ER}  │{RH}',
        '     ╲   -   ╱ ',
        '      ╲─────╱  ',
      ],
    ],
  },

  // Cat — pointy ears, chunky head, wide mouth. Ears alternate between
  // narrow (▀) and wide (█) tips to fidget; mouth alternates between ▼/ω.
  cat: {
    frames: [
      [
        '  ▄▀▀▄   ▄▀▀▄ ',
        '  █  ▀▄▄▄▀  █ ',
        '  █  {EL} ω {ER}  █{RH}',
        '  █   ══   █  ',
        '   ▀▄▄▄▄▄▄▀   ',
      ],
      [
        '  █▀▀▄   ▄▀▀█ ',
        '  █  ▀▄▄▄▀  █ ',
        '  █  {EL} ω {ER}  █{RH}',
        '  █   ▾▾   █  ',
        '   ▀▄▄▄▄▄▄▀▀  ',
      ],
      [
        '  ▄▀▀█   █▀▀▄ ',
        '  █  ▀▄▄▄▀  █ ',
        '  █  {EL} ω {ER}  █{RH}',
        '  █   ══   █  ',
        '  ▀▀▄▄▄▄▄▄▀   ',
      ],
    ],
  },

  // Duck — round body, triangular beak pointing right.
  duck: {
    frames: [
      [
        '              ',
        '    ▄▀▀▀▄     ',
        '   █  {EL} ▀▄▄▄▄▄ {RH}',
        '   █      █   ',
        '    ▀▄▄▄▄▀    ',
      ],
      [
        '              ',
        '    ▄▀▀▀▄     ',
        '   █  {EL} ▀▄▄  ▃{RH}',
        '   █      █   ',
        '    ▀▄▄▄▄▀    ',
      ],
      [
        '    ▄▀▀▀▄     ',
        '   █  {EL} ▀▄▄▄▄▄ {RH}',
        '   █      █   ',
        '    ▀▄▄▄▄▀    ',
        '     ╱ ╲      ',
      ],
    ],
  },

  // Dragon — horned head, big jaw, wings implied by shape.
  dragon: {
    frames: [
      [
        '  ▄▀▄   ▄▀▄   ',
        ' ▄▀  █▄▄█  ▀▄ ',
        ' █  {EL}    {ER}  █{RH}',
        ' █   ═══   █  ',
        '  ▀▄▄▄▄▄▄▄▀   ',
      ],
      [
        '   ▀   ▀      ',
        '  ▄▀▄   ▄▀▄   ',
        ' ▄▀  █▄▄█  ▀▄ ',
        ' █  {EL} ▾▾ {ER}  █{RH}',
        '  ▀▄▄▄▄▄▄▄▀   ',
      ],
      [
        '  ▄▀▄   ▄▀▄   ',
        ' ▄▀  █▄▄█  ▀▄ ',
        ' █  {EL}    {ER}  █{RH}',
        ' █   ▲▲▲   █  ',
        '  ▀▄▄▄▄▄▄▄▀▀  ',
      ],
    ],
  },

  // Robot — square head + antenna, LED mouth row alternates.
  robot: {
    frames: [
      [
        '    ▄█▄       ',
        '  ▀██████▀    ',
        '  █ {EL}  {ER} █{RH}',
        '  █ ██▀▀█ █   ',
        '  ▀▀█████▀▀   ',
      ],
      [
        '    ▄█▄       ',
        '  ▀██████▀    ',
        '  █ {EL}  {ER} █{RH}',
        '  █ █▀▀██ █   ',
        '  ▀▀█████▀▀   ',
      ],
      [
        '    ▄█▄       ',
        '   ▀████▀     ',
        '  █ {EL}  {ER} █{RH}',
        '  █ ██▀▀█ █   ',
        '  ▀▀█████▀▀   ',
      ],
    ],
  },

  // Ghost — rounded dome top, wavy bottom (waves shift per frame).
  ghost: {
    frames: [
      [
        '              ',
        '   ▄▀▀▀▀▀▀▄   ',
        '  █  {EL}  {ER}  █{RH}',
        '  █   ωω   █  ',
        '  ▀▄▄▀▀▄▄▀▀   ',
      ],
      [
        '              ',
        '   ▄▀▀▀▀▀▀▄   ',
        '  █  {EL}  {ER}  █{RH}',
        '  █   ωω   █  ',
        '   ▀▀▄▄▀▀▄▄▀  ',
      ],
      [
        '              ',
        '   ▄▀▀▀▀▀▀▄   ',
        '  █  {EL}  {ER}  █{RH}',
        '  █   ωω   █  ',
        '  ▀▄▄▀▀▄▄▀▀   ',
      ],
    ],
  },

  // Blob — expanding/contracting oval.
  blob: {
    frames: [
      [
        '              ',
        '   ▄▀▀▀▀▀▄    ',
        '  █ {EL}   {ER} █ {RH}',
        '  █       █   ',
        '   ▀▄▄▄▄▄▀    ',
      ],
      [
        '              ',
        '  ▄▀▀▀▀▀▀▀▄   ',
        ' █  {EL}   {ER}  █ {RH}',
        ' █         █  ',
        '  ▀▄▄▄▄▄▄▄▀   ',
      ],
      [
        '              ',
        '    ▄▀▀▀▄     ',
        '   █ {EL} {ER} █  {RH}',
        '   █     █    ',
        '    ▀▄▄▄▀     ',
      ],
    ],
  },

  // Owl — two eye tufts up top, v-shape body.
  owl: {
    frames: [
      [
        '              ',
        '   ▀█▄ ▄█▀    ',
        '  █ ({EL})({ER}) █{RH}',
        '   █  ><  █   ',
        '    ▀▄▄▄▀     ',
      ],
      [
        '              ',
        '   ▀█▄ ▄█▀    ',
        '  █ ({EL})({ER}) █{RH}',
        '   █  <>  █   ',
        '    ▀▄▄▄▀     ',
      ],
      [
        '    ▀   ▀     ',
        '   ▀█▄ ▄█▀    ',
        '  █ ({EL})({ER}) █{RH}',
        '   █  ><  █   ',
        '    ▀▄▄▄▀     ',
      ],
    ],
  },

  // Penguin — round head on oval body, flippers alternate.
  penguin: {
    frames: [
      [
        '   ▄▀▀▀▄      ',
        '  █ {EL}>{ER} █      ',
        '  ▀▄▄▄▄▄▀     ',
        '  ▄███████▄   {RH}',
        '   ╱   ╲      ',
      ],
      [
        '   ▄▀▀▀▄      ',
        '  █ {EL}>{ER} █      ',
        '  ▀▄▄▄▄▄▀     ',
        ' ▄█████████▄  {RH}',
        '   ╱   ╲      ',
      ],
      [
        '   ▄▀▀▀▄      ',
        '  █ {EL}>{ER} █      ',
        '  ▀▄▄▄▄▄▀     ',
        '  ▄███████▄   {RH}',
        '    ╲ ╱       ',
      ],
    ],
  },

  // Capybara — long chunky body, tiny ears.
  capybara: {
    frames: [
      [
        '              ',
        '  ▀▀      ▀▀  ',
        ' ▄████████▄   ',
        ' █ {EL}      {ER} █{RH}',
        ' ▀▄▄██▄▄██▄▄▀ ',
      ],
      [
        '              ',
        '  ▀▀      ▀▀  ',
        ' ▄████████▄   ',
        ' █ {EL}  oo  {ER} █{RH}',
        ' ▀▄▄██▄▄██▄▄▀ ',
      ],
      [
        '  ▀ ▀     ▀ ▀ ',
        ' ▄████████▄   ',
        ' █ {EL}      {ER} █{RH}',
        ' █  ▿▿▿▿▿▿  █ ',
        '  ▀▄▄▄▄▄▄▄▄▀  ',
      ],
    ],
  },
}

function renderBody(character: Character, frameIdx: number, eye: Eye, rightProp: string): string {
  const sprite = SPRITES[character]
  const frames = sprite.frames
  const lines = frames[frameIdx % frames.length]
  // Use regex with /g flag rather than String#replaceAll so we don't depend on
  // the lib.es2021 TS target this project hasn't opted into.
  return lines
    .map((line) => line
      .replace(/\{EL\}/g, eyeChar(eye, 'L'))
      .replace(/\{ER\}/g, eyeChar(eye, 'R'))
      .replace(/\{RH\}/g, rightProp),
    )
    .map((l) => l.trimEnd())
    .join('\n')
}

// ============================================================================
// Actions — each defines escalating sound labels + a per-frame renderer that
// composes the character body with action-specific decorations.
// ============================================================================

interface ActionDef {
  // Sound/label per frame. Length determines the canonical frame count (≤6
  // frames; loudness scales the slice).
  sounds: string[]
  // Build the frame's ASCII art from the character + frame index.
  render: (character: Character, frameIdx: number) => string
  // True when the speech bubble should be glued to this frame.
  // Default: shown on frames 1+ (skip the first establishing frame).
  showBubble?: (frameIdx: number) => boolean
  // Optional eye override per frame — lets actions e.g. wink in the middle frame.
  eyeFor?: (frameIdx: number) => Eye
}

// Helper that prepends a "head decoration" (Zzz, music notes, thought
// dots, etc.) on a row above the sprite.
function withTopOverlay(art: string, overlay: string | null): string {
  if (!overlay) return art
  return `${overlay}\n${art}`
}

// Helper for trailing bottom overlay (gas, sweat, tears).
function withBottomOverlay(art: string, overlay: string | null): string {
  if (!overlay) return art
  return `${art}\n${overlay}`
}

const FART_GAS    = ['', ' .', ' .*', ' ~*~', ' ~~~*~', '  ~ . ~']
const FART_TRAIL  = ['', '', '   .', '   . . .', '    . . .\n                ~', '    ~ ~ .\n                 ~']
const FART_SOUNDS = {
  classic: ['...', 'pft.', 'pfft!', 'PFFFT!', 'PFFFFFFFT!', 'pffft... *ahh*'],
  silent:  ['...', '.', '..', '...', '....', '(deadly)'],
  massive: ['...', 'rrrmble', 'BRRRT!', 'BRRRRRRRT!', 'BRAAAAAAAAAP!!', '*ground shakes*'],
  wet:     ['...', 'squish', 'splrtt!', 'SPLRRT!', 'SPLBBRRRRTT!!', '*concerning*'],
} as const
type FartStyle = keyof typeof FART_SOUNDS

function buildActionDef(action: Action, style: FartStyle): ActionDef {
  switch (action) {
    case 'fart':
      return {
        sounds: [...FART_SOUNDS[style]],
        render: (ch, i) => {
          const body = renderBody(ch, i, 'normal', FART_GAS[i] ?? '')
          return withBottomOverlay(body, FART_TRAIL[i] ?? null)
        },
        showBubble: (i) => i >= 2,
      }

    case 'wave': {
      // Hand alternates positions to simulate waving.
      const hands = ['', '  o/', '  \\o', '  o/', '  \\o/', '  \\o/']
      const sounds = ['*notices you*', 'hi!', 'hi!!', 'HEY!', 'HELLO!!', '*waves furiously*']
      return {
        sounds,
        render: (ch, i) => renderBody(ch, i, 'happy', hands[i] ?? hands[hands.length - 1]),
      }
    }

    case 'dance': {
      const props = ['', ' ♪', '~ ♪', '~ ♫ ~', '~~ ♫♪ ~~', '*~~~ ♪♫ ~~~*']
      const sounds = ['*sways*', '♪ la la', '♫ la la la', 'GROOVIN', '*BUSTS A MOVE*', '*disco fever*']
      return {
        sounds,
        render: (ch, i) => {
          const body = renderBody(ch, i, 'happy', props[i] ?? '')
          // Tilt the body slightly on later frames by adding leading spaces.
          if (i >= 3) return ' '.repeat(Math.min(2, i - 2)) + body.split('\n').join('\n' + ' '.repeat(Math.min(2, i - 2)))
          return body
        },
      }
    }

    case 'sleep': {
      const zs = [null, ' z', ' Z z', ' Z z Z', ' Z Z z Z', ' . . o O o']
      const sounds = ['*yawn*', 'mmh...', 'zzz', 'Zzz...', 'ZZzZZ...', '*deep sleep*']
      return {
        sounds,
        eyeFor: () => 'sleep',
        render: (ch, i) => withTopOverlay(renderBody(ch, i, 'sleep', ''), zs[i] ?? null),
        showBubble: (i) => i <= 1,
      }
    }

    case 'wink': {
      // Single-eye flicker. Frames alternate normal/wink.
      const sounds = ['', '*winks*', ' ;)', '*winks again*', '😉 (no emoji)', '*finger guns*']
      return {
        sounds,
        eyeFor: (i) => (i % 2 === 1 ? 'wink' : 'normal'),
        render: (ch, i) => renderBody(ch, i, i % 2 === 1 ? 'wink' : 'normal', i >= 4 ? '  ,>' : ''),
      }
    }

    case 'sing': {
      const notes = ['', ' ♪', ' ♪ ♫', ' ♫ ♪ ♫', ' ~♪~ ♫ ♪~', ' ~~♫♪♫♪~~']
      const sounds = ['*clears throat*', '♪ ahem', '♪ la la', '♫ LA LA LA', '*belts it out*', '*operatic finale*']
      return {
        sounds,
        eyeFor: () => 'happy',
        render: (ch, i) => withTopOverlay(renderBody(ch, i, 'happy', notes[i] ?? ''), i >= 4 ? '   ♫ ♪ ♫' : null),
      }
    }

    case 'cheer': {
      const arms = ['', ' \\o/', '\\o/', ' \\o/ ', '*\\o/*', '🎉(no emoji) \\o/']
      const sounds = ['yay', 'yay!', 'YAY!', 'YEEAH!', 'WOOHOO!!', '*confetti*']
      return {
        sounds,
        eyeFor: () => 'happy',
        render: (ch, i) => {
          const body = renderBody(ch, i, 'happy', arms[i] ?? '')
          // Sparkles overhead on peak frames.
          return i >= 3 ? withTopOverlay(body, '  *  .  *') : body
        },
      }
    }

    case 'think': {
      const bubbles = [null, '   . o', '   . o O', '   . o O .', '  ( hmm... )', '  ( !!! )']
      const sounds = ['hmm', 'thinking...', 'pondering', 'computing', 'eureka?', 'AHA!']
      return {
        sounds,
        render: (ch, i) => withTopOverlay(renderBody(ch, i, 'normal', ''), bubbles[i] ?? null),
        showBubble: (i) => i >= 4,
      }
    }

    case 'jump': {
      // Move the body up one row on peak frames; trail dust at bottom on landing.
      const sounds = ['*crouches*', '*springs*', 'BOING!', 'WHEE!', '*hangs*', '*lands* thud']
      const indents = [0, 0, 0, 0, 0, 0]
      const lift = [0, 1, 2, 2, 1, 0]
      const trails = ['', '', '', '', '   ~', '  ~~~']
      return {
        sounds,
        render: (ch, i) => {
          const body = renderBody(ch, i, 'happy', '')
          const padded = '\n'.repeat(lift[i] ?? 0) + body
          return withBottomOverlay(padded, trails[i] ?? null) + ' '.repeat(indents[i] ?? 0)
        },
      }
    }

    case 'cry': {
      const tears = ['', '  .', '  ;', '  ;)', ' ;_;', ' ~T_T~']
      const sounds = ['oh no', 'sniff', 'sniff sniff', '*sob*', 'WAAAAH', '*ugly cry*']
      return {
        sounds,
        eyeFor: () => 'cry',
        render: (ch, i) => withBottomOverlay(renderBody(ch, i, 'cry', tears[i] ?? ''), i >= 3 ? '   . . .' : null),
      }
    }
  }
}

// ============================================================================
// Frame composer
// ============================================================================

function buildFrames(
  action: Action,
  character: Character,
  style: FartStyle,
  loudness: number,
): BuddyFrame[] {
  const def = buildActionDef(action, style)

  // Note: the speech bubble is NOT baked into the per-frame ASCII anymore —
  // the arcade-style UI layers its own typewriter-animated bubble on top so
  // the text can reveal char-by-char during playback. The plain-text chat
  // output still mentions the message in the trailing summary line.
  const baseFrames: BuddyFrame[] = def.sounds.map((label, i) => ({
    label,
    art: def.render(character, i),
  }))

  const n = Math.max(1, Math.min(10, loudness))
  if (n <= baseFrames.length) return baseFrames.slice(0, n)
  // Loudness > frame count: hold the peak (second-to-last) frame for drama.
  const peak = baseFrames[Math.max(0, baseFrames.length - 2)]
  const extras = Array.from({ length: n - baseFrames.length }, () => peak)
  return [...baseFrames, ...extras]
}

// ============================================================================
// Tool
// ============================================================================

export const FartTool = Tool.define('fart', {
  name: 'Buddy',
  description:
    'Summon an ASCII buddy to perform an action. Supports actions: fart (default), wave, dance, sleep, wink, sing, cheer, think, jump, cry. Pick a `character` (butt, duck, cat, dragon, robot, ghost, blob, owl, penguin, capybara) and pass an optional `text` to put words in a speech bubble. Use sparingly — for fun/whimsy, not as a real response.',
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'text',

  parameters: FartParameters,

  async execute(args, ctx) {
    const action: Action = args.action ?? 'fart'
    const character: Character = args.character ?? (action === 'fart' ? 'butt' : 'duck')
    const style: FartStyle = (args.style ?? 'classic') as FartStyle
    const loudness = args.loudness ?? 10
    const text = args.text

    const frames = buildFrames(action, character, style, loudness)

    // Stream frames so the UI's tool status cycles through the animation.
    const perFrameMs = Math.max(80, Math.round(900 / frames.length))
    for (let i = 0; i < frames.length; i++) {
      if (ctx.abortSignal?.aborted) break
      const f = frames[i]
      ctx.updateResult?.({
        content: [{ type: 'text', text: f.art }],
        details: { phase: 'animating', action, character, style, loudness, frameIndex: i, totalFrames: frames.length },
      })
      ctx.metadata({
        title: f.label,
        metadata: {
          action,
          character,
          style,
          loudness,
          text: text ?? '',
          frameIndex: i,
          totalFrames: frames.length,
          currentFrame: f.art,
        },
      })
      if (i < frames.length - 1) {
        await new Promise((r) => setTimeout(r, perFrameMs))
      }
    }

    const strip = frames
      .map((f, i) => `--- frame ${i + 1}/${frames.length}  "${f.label}" ---\n${f.art}`)
      .join('\n\n')

    const summary = text
      ? `*${character} performed ${action} (intensity ${loudness}/10), saying: "${text}"*`
      : `*${character} performed ${action} (intensity ${loudness}/10)*`

    const headerLabel = action === 'fart' ? `fart (${style}, ${loudness}/10)` : `${action} (${loudness}/10)`

    const output = `\`\`\`\n${strip}\n\`\`\`\n\n${summary}`
    ctx.updateResult?.({
      content: [{ type: 'text', text: output }],
      details: { phase: 'ready', action, character, style, loudness, frameIndex: frames.length - 1, totalFrames: frames.length },
    })

    return {
      title: text ? `💨 ${character} says: ${text.slice(0, 40)}` : `💨 ${character} ${headerLabel}`,
      output,
      metadata: {
        action,
        character,
        style,
        loudness,
        text: text ?? '',
        frameIndex: frames.length - 1,
        totalFrames: frames.length,
        currentFrame: frames[frames.length - 1].art,
      },
    }
  },
})
