export interface MarkdownEmojiMatch {
  from: number
  to: number
  name: string
  emoji: string
}

export const EMOJI_SHORTCODES: Record<string, string> = {
  '+1': '👍',
  '-1': '👎',
  grinning: '😀',
  smiley: '😃',
  smile: '😄',
  grin: '😁',
  laughing: '😆',
  satisfied: '😆',
  sweat_smile: '😅',
  joy: '😂',
  rofl: '🤣',
  wink: '😉',
  blush: '😊',
  innocent: '😇',
  heart_eyes: '😍',
  kissing_heart: '😘',
  thinking: '🤔',
  neutral_face: '😐',
  expressionless: '😑',
  confused: '😕',
  upside_down_face: '🙃',
  relieved: '😌',
  sleepy: '😪',
  sleeping: '😴',
  sunglasses: '😎',
  sob: '😭',
  cry: '😢',
  scream: '😱',
  angry: '😠',
  rage: '😡',
  mask: '😷',
  eyes: '👀',
  wave: '👋',
  clap: '👏',
  raised_hands: '🙌',
  pray: '🙏',
  thumbsup: '👍',
  thumbsdown: '👎',
  ok_hand: '👌',
  muscle: '💪',
  point_left: '👈',
  point_right: '👉',
  point_up: '☝️',
  point_down: '👇',
  heart: '❤️',
  red_heart: '❤️',
  orange_heart: '🧡',
  yellow_heart: '💛',
  green_heart: '💚',
  blue_heart: '💙',
  purple_heart: '💜',
  black_heart: '🖤',
  broken_heart: '💔',
  fire: '🔥',
  sparkles: '✨',
  star: '⭐',
  zap: '⚡',
  boom: '💥',
  collision: '💥',
  rocket: '🚀',
  tada: '🎉',
  confetti_ball: '🎊',
  white_check_mark: '✅',
  heavy_check_mark: '✔️',
  x: '❌',
  warning: '⚠️',
  rotating_light: '🚨',
  question: '❓',
  grey_question: '❔',
  exclamation: '❗',
  grey_exclamation: '❕',
  bulb: '💡',
  memo: '📝',
  book: '📖',
  books: '📚',
  bookmark: '🔖',
  pushpin: '📌',
  round_pushpin: '📍',
  paperclip: '📎',
  link: '🔗',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  gear: '⚙️',
  hammer: '🔨',
  wrench: '🔧',
  mag: '🔍',
  calendar: '📅',
  hourglass: '⌛',
  alarm_clock: '⏰',
  bell: '🔔',
  mailbox: '📫',
  inbox_tray: '📥',
  outbox_tray: '📤',
  package: '📦',
  bug: '🐛',
  computer: '💻',
  keyboard: '⌨️',
  iphone: '📱',
  globe_with_meridians: '🌐',
  earth_asia: '🌏',
  sunny: '☀️',
  cloud: '☁️',
  umbrella: '☔',
  snowflake: '❄️',
  coffee: '☕',
  tea: '🍵',
  pizza: '🍕',
  cake: '🍰',
  apple: '🍎',
  robot: '🤖',
  ghost: '👻',
  poop: '💩',
  cn: '🇨🇳',
  us: '🇺🇸',
  jp: '🇯🇵',
  kr: '🇰🇷',
  gb: '🇬🇧',
  eu: '🇪🇺',
}

function emojiShortcodePattern(): RegExp {
  return /:([a-zA-Z0-9_+\-]+):/g
}

export function emojiForShortcode(name: string): string | undefined {
  return EMOJI_SHORTCODES[name.toLowerCase()]
}

export function findEmojiShortcodes(text: string): MarkdownEmojiMatch[] {
  const matches: MarkdownEmojiMatch[] = []
  for (const match of text.matchAll(emojiShortcodePattern())) {
    if (match.index === undefined || !match[1]) continue
    const emoji = emojiForShortcode(match[1])
    if (!emoji) continue
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      name: match[1],
      emoji,
    })
  }
  return matches
}

export function replaceEmojiShortcodes(text: string): string {
  return text.replace(emojiShortcodePattern(), (source, name: string) => {
    return emojiForShortcode(name) || source
  })
}
