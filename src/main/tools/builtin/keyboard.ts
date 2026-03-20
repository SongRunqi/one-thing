/**
 * Built-in Tool: Keyboard
 *
 * Control the keyboard - type text, press keys, execute shortcuts.
 * Requires Accessibility permission on macOS.
 */

import { z } from 'zod'
import { Tool } from '../core/tool.js'
import {
  checkAccessibilityPermission,
  getAccessibilityPermissionError,
} from '../../utils/accessibility.js'

// Import nut.js modules
import { keyboard, Key } from '@nut-tree-fork/nut-js'

/**
 * Keyboard Tool Metadata
 */
export interface KeyboardMetadata {
  action: string
  text?: string
  key?: string
  modifiers?: string[]
  success: boolean
  [key: string]: unknown
}

/**
 * Keyboard Tool Parameters Schema
 */
const KeyboardParameters = z.object({
  action: z
    .enum(['type', 'press', 'hotkey', 'hold', 'release'])
    .describe(
      'The keyboard action: type (type text), press (press and release a key), ' +
        'hotkey (keyboard shortcut with modifiers), hold (press and hold), release (release held key)'
    ),

  text: z
    .string()
    .optional()
    .describe('Text to type. Required for "type" action.'),

  key: z
    .string()
    .optional()
    .describe(
      'Key to press (e.g., "enter", "escape", "tab", "backspace", "delete", "space", ' +
        '"up", "down", "left", "right", "home", "end", "pageup", "pagedown", ' +
        '"f1"-"f12", or single characters like "a", "1", etc.). Required for press/hold/release.'
    ),

  modifiers: z
    .array(z.enum(['command', 'cmd', 'control', 'ctrl', 'alt', 'option', 'shift', 'meta']))
    .optional()
    .describe('Modifier keys for hotkey action (e.g., ["command", "shift"] for Cmd+Shift+key).'),

  delay: z
    .number()
    .optional()
    .default(0)
    .describe('Delay between keystrokes in milliseconds (for type action). Defaults to 0.'),
})

/**
 * Map string key names to nut.js Key enum
 */
function getKey(keyName: string): Key {
  const keyMap: Record<string, Key> = {
    // Special keys
    enter: Key.Enter,
    return: Key.Enter,
    escape: Key.Escape,
    esc: Key.Escape,
    tab: Key.Tab,
    backspace: Key.Backspace,
    delete: Key.Delete,
    space: Key.Space,

    // Arrow keys
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,

    // Navigation
    home: Key.Home,
    end: Key.End,
    pageup: Key.PageUp,
    pagedown: Key.PageDown,

    // Function keys
    f1: Key.F1,
    f2: Key.F2,
    f3: Key.F3,
    f4: Key.F4,
    f5: Key.F5,
    f6: Key.F6,
    f7: Key.F7,
    f8: Key.F8,
    f9: Key.F9,
    f10: Key.F10,
    f11: Key.F11,
    f12: Key.F12,

    // Modifier keys (for hold/release)
    shift: Key.LeftShift,
    control: Key.LeftControl,
    ctrl: Key.LeftControl,
    alt: Key.LeftAlt,
    option: Key.LeftAlt,
    command: Key.LeftSuper,
    cmd: Key.LeftSuper,
    meta: Key.LeftSuper,

    // Punctuation and special characters
    minus: Key.Minus,
    '-': Key.Minus,
    equal: Key.Equal,
    equals: Key.Equal,
    '=': Key.Equal,
    plus: Key.Equal, // Shift+Equal
    bracketleft: Key.LeftBracket,
    '[': Key.LeftBracket,
    bracketright: Key.RightBracket,
    ']': Key.RightBracket,
    backslash: Key.Backslash,
    '\\': Key.Backslash,
    semicolon: Key.Semicolon,
    ';': Key.Semicolon,
    quote: Key.Quote,
    "'": Key.Quote,
    comma: Key.Comma,
    ',': Key.Comma,
    period: Key.Period,
    '.': Key.Period,
    slash: Key.Slash,
    '/': Key.Slash,
    grave: Key.Grave,
    '`': Key.Grave,

    // Numbers
    '0': Key.Num0,
    '1': Key.Num1,
    '2': Key.Num2,
    '3': Key.Num3,
    '4': Key.Num4,
    '5': Key.Num5,
    '6': Key.Num6,
    '7': Key.Num7,
    '8': Key.Num8,
    '9': Key.Num9,

    // Letters (lowercase)
    a: Key.A,
    b: Key.B,
    c: Key.C,
    d: Key.D,
    e: Key.E,
    f: Key.F,
    g: Key.G,
    h: Key.H,
    i: Key.I,
    j: Key.J,
    k: Key.K,
    l: Key.L,
    m: Key.M,
    n: Key.N,
    o: Key.O,
    p: Key.P,
    q: Key.Q,
    r: Key.R,
    s: Key.S,
    t: Key.T,
    u: Key.U,
    v: Key.V,
    w: Key.W,
    x: Key.X,
    y: Key.Y,
    z: Key.Z,
  }

  const normalizedKey = keyName.toLowerCase()

  if (keyMap[normalizedKey]) {
    return keyMap[normalizedKey]
  }

  // For single uppercase letters, map to the key
  if (/^[A-Z]$/.test(keyName)) {
    return keyMap[keyName.toLowerCase()]
  }

  throw new Error(
    `Unknown key: "${keyName}". Supported keys: enter, escape, tab, backspace, delete, space, ` +
      'up, down, left, right, home, end, pageup, pagedown, f1-f12, and single characters.'
  )
}

/**
 * Map modifier string to nut.js Key
 */
function getModifierKey(modifier: string): Key {
  const modifierMap: Record<string, Key> = {
    command: Key.LeftSuper,
    cmd: Key.LeftSuper,
    meta: Key.LeftSuper,
    control: Key.LeftControl,
    ctrl: Key.LeftControl,
    alt: Key.LeftAlt,
    option: Key.LeftAlt,
    shift: Key.LeftShift,
  }

  const key = modifierMap[modifier.toLowerCase()]
  if (!key) {
    throw new Error(`Unknown modifier: "${modifier}"`)
  }
  return key
}

/**
 * Keyboard Tool Definition
 */
export const KeyboardTool = Tool.define<typeof KeyboardParameters, KeyboardMetadata>('keyboard', {
  name: 'Keyboard',
  description: `Control the keyboard to type text and press keys.

Actions:
- type: Type a string of text
- press: Press and release a single key
- hotkey: Execute a keyboard shortcut (e.g., Cmd+C, Ctrl+V)
- hold: Press and hold a key
- release: Release a held key

Common keys: enter, escape, tab, backspace, delete, space, up, down, left, right,
home, end, pageup, pagedown, f1-f12, and letters/numbers.

Modifiers for hotkey: command (or cmd), control (or ctrl), alt (or option), shift

Note: Requires Accessibility permission on macOS.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires user confirmation for safety

  parameters: KeyboardParameters,

  async execute(args, ctx) {
    const { action, text, key, modifiers, delay } = args

    // Check accessibility permission on macOS
    if (!checkAccessibilityPermission(false)) {
      throw new Error(getAccessibilityPermissionError())
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Keyboard: ${action}`,
      metadata: {
        action,
        text: text?.slice(0, 50), // Truncate for display
        key,
        modifiers,
        success: false,
      },
    })

    // Configure typing delay
    if (delay && delay > 0) {
      keyboard.config.autoDelayMs = delay
    } else {
      keyboard.config.autoDelayMs = 0
    }

    let resultMessage = ''

    try {
      switch (action) {
        case 'type': {
          if (!text) {
            throw new Error('text is required for type action')
          }

          await keyboard.type(text)
          resultMessage = `Typed ${text.length} characters: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`
          break
        }

        case 'press': {
          if (!key) {
            throw new Error('key is required for press action')
          }

          const keyCode = getKey(key)
          await keyboard.pressKey(keyCode)
          await keyboard.releaseKey(keyCode)
          resultMessage = `Pressed key: ${key}`
          break
        }

        case 'hotkey': {
          if (!key) {
            throw new Error('key is required for hotkey action')
          }
          if (!modifiers || modifiers.length === 0) {
            throw new Error('modifiers are required for hotkey action (e.g., ["command"])')
          }

          // Get all keys to press
          const modifierKeys = modifiers.map(getModifierKey)
          const mainKey = getKey(key)

          // Press modifiers
          for (const mod of modifierKeys) {
            await keyboard.pressKey(mod)
          }

          // Press and release main key
          await keyboard.pressKey(mainKey)
          await keyboard.releaseKey(mainKey)

          // Release modifiers in reverse order
          for (const mod of modifierKeys.reverse()) {
            await keyboard.releaseKey(mod)
          }

          const modString = modifiers.join('+')
          resultMessage = `Executed hotkey: ${modString}+${key}`
          break
        }

        case 'hold': {
          if (!key) {
            throw new Error('key is required for hold action')
          }

          const keyCode = getKey(key)
          await keyboard.pressKey(keyCode)
          resultMessage = `Holding key: ${key}`
          break
        }

        case 'release': {
          if (!key) {
            throw new Error('key is required for release action')
          }

          const keyCode = getKey(key)
          await keyboard.releaseKey(keyCode)
          resultMessage = `Released key: ${key}`
          break
        }

        default:
          throw new Error(`Unknown action: ${action}`)
      }

      const metadata: KeyboardMetadata = {
        action,
        text: text?.slice(0, 50),
        key,
        modifiers,
        success: true,
      }

      return {
        title: `Keyboard ${action} completed`,
        output: resultMessage,
        metadata,
      }
    } catch (error: any) {
      const metadata: KeyboardMetadata = {
        action,
        text: text?.slice(0, 50),
        key,
        modifiers,
        success: false,
      }

      return {
        title: `Keyboard ${action} failed`,
        output: `Error: ${error.message}`,
        metadata,
      }
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid keyboard parameters:\n${issues.join('\n')}`
  },
})
