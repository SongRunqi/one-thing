/**
 * 悬浮操作条上的表情账(im-message 设计稿 §E)。
 *
 * 「最近使用」是**本地偏好**,不是会话数据:它描述的是这台机器上这个人手快
 * 点哪几个,换台机器该重新长出来,更不该跟着转录同步给房里的其他人。所以它
 * 住在 localStorage,而不是 settings / session。
 *
 * 逻辑放在这里(而不是组件里)只为一件事:可测。写坏的 JSON、越界的条数、
 * 重复点同一枚表情——这些都该有用例钉住,而不是靠肉眼看面板。
 */

import { computed, ref } from 'vue'

/** 快捷位数量:操作条上直接可点的那几枚。 */
export const SAY_QUICK_EMOJI_COUNT = 3

/** 最近使用最多记多少枚(面板「最近」那一排)。 */
export const SAY_RECENT_EMOJI_MAX = 6

/** 还没点过任何表情时的快捷位与「最近」一排(设计稿 §E:最近永远满一排)。 */
export const SAY_DEFAULT_RECENT_EMOJIS: readonly string[] = ['👍', '🎯', '😂', '🙏', '🔥', '👀']

/** 面板「常用」网格 —— 固定一套,不随使用变动(变动的是上面那排)。 */
export const SAY_COMMON_EMOJIS: readonly string[] = [
  '✅', '❌', '❓', '💡', '🚀', '🎉',
  '😅', '🤔', '😮', '💯', '⏳', '📌',
]

export const SAY_RECENT_EMOJI_STORAGE_KEY = 'onething.say.recent-emojis'

/** localStorage 的最小面(测试塞一个假的进来即可)。 */
export interface SayEmojiStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const emojis: string[] = []
  for (const entry of value) {
    const emoji = typeof entry === 'string' ? entry.trim() : ''
    if (!emoji || seen.has(emoji)) continue
    seen.add(emoji)
    emojis.push(emoji)
    if (emojis.length >= SAY_RECENT_EMOJI_MAX) break
  }
  return emojis
}

/**
 * 读最近使用。读不出来(没存过 / 存坏了 / 没有 localStorage)一律回默认三枚
 * —— 偏好读失败的后果应该是"回到默认",不是"操作条空着"。
 */
export function readSayRecentEmojis(storage?: SayEmojiStorage | null): string[] {
  if (!storage) return [...SAY_DEFAULT_RECENT_EMOJIS]
  let parsed: unknown
  try {
    const raw = storage.getItem(SAY_RECENT_EMOJI_STORAGE_KEY)
    if (!raw) return [...SAY_DEFAULT_RECENT_EMOJIS]
    parsed = JSON.parse(raw)
  } catch {
    return [...SAY_DEFAULT_RECENT_EMOJIS]
  }
  const list = sanitizeList(parsed)
  return list.length > 0 ? list : [...SAY_DEFAULT_RECENT_EMOJIS]
}

/** 刚点过的那枚提到队首,去重、截断。返回新表(纯函数)。 */
export function pushSayRecentEmoji(current: readonly string[], emoji: string): string[] {
  const next = emoji.trim()
  if (!next) return [...current]
  return sanitizeList([next, ...current])
}

export function writeSayRecentEmojis(
  emojis: readonly string[],
  storage?: SayEmojiStorage | null,
): void {
  if (!storage) return
  try {
    storage.setItem(SAY_RECENT_EMOJI_STORAGE_KEY, JSON.stringify([...emojis]))
  } catch {
    // 配额满 / 隐私模式:偏好丢了不影响发消息,静默即可。
  }
}

/** 快捷位 = 最近使用的前三枚(不足时用默认补齐,操作条永远是三枚)。 */
export function quickSayEmojis(recent: readonly string[]): string[] {
  const filled = sanitizeList([...recent, ...SAY_DEFAULT_RECENT_EMOJIS])
  return filled.slice(0, SAY_QUICK_EMOJI_COUNT)
}

/**
 * 一屏里有几百个 SayMessageRow,但「最近使用」只有一份 —— 模块级单例,任何一
 * 行点过之后所有行的快捷位同时更新,不必等下一次挂载。
 */
const recentEmojis = ref<string[]>([...SAY_DEFAULT_RECENT_EMOJIS])
let hydrated = false

function defaultStorage(): SayEmojiStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** 面板「最近」一排 = 真实最近 + 默认补满(设计稿 §E:三枚孤零零很粗糙)。 */
export function panelSayRecentEmojis(recent: readonly string[]): string[] {
  return sanitizeList([...recent, ...SAY_DEFAULT_RECENT_EMOJIS])
}

export function useSayRecentEmojis(storage: SayEmojiStorage | null = defaultStorage()) {
  if (!hydrated) {
    hydrated = true
    recentEmojis.value = readSayRecentEmojis(storage)
  }
  const quick = computed(() => quickSayEmojis(recentEmojis.value))
  const panelRecent = computed(() => panelSayRecentEmojis(recentEmojis.value))
  function remember(emoji: string): void {
    recentEmojis.value = pushSayRecentEmoji(recentEmojis.value, emoji)
    writeSayRecentEmojis(recentEmojis.value, storage)
  }
  return { recentEmojis, quick, panelRecent, remember }
}

/** 测试收尾用:忘掉这一进程里记住的东西。 */
export function resetSayRecentEmojis(): void {
  hydrated = false
  recentEmojis.value = [...SAY_DEFAULT_RECENT_EMOJIS]
}
