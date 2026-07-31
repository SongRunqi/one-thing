/**
 * 房间消息的表情回应 —— 从 `MessageList.vue` 抬出的那一段(去复用重构 R1)。
 *
 * 抬出来是因为房面(`RoomSurface`)也收 `SayMessageRow` 的 `react` 事件,而这段
 * 逻辑里有两条不能各写一遍的纪律:
 *  1. **不做乐观写**:主进程广播 `message:updated`、store 合并,chips 永远显示
 *     真正落盘的东西。因此一次被拒的写在结构上是"看不见"的 —— 那正是下面这行
 *     失败痕迹存在的理由(P2-19)。
 *  2. **过桥的每个参数都是原始值**:响应式代理过不了结构化克隆(W7 血教训)。
 */
import { onScopeDispose, ref } from 'vue'
import { platformApi } from '@/platform'

const HINT_LINGER_MS = 4000

export function useCollabReactions(getSessionId: () => string | undefined) {
  /** Failure trace for room actions taken from the list (self-clearing). */
  const reactionHint = ref('')
  let reactionHintTimer: ReturnType<typeof setTimeout> | null = null

  function showReactionHint(message: string): void {
    reactionHint.value = message
    if (reactionHintTimer) clearTimeout(reactionHintTimer)
    reactionHintTimer = setTimeout(() => {
      reactionHint.value = ''
      reactionHintTimer = null
    }, HINT_LINGER_MS)
  }

  async function react(messageId: string, emoji: string) {
    const sessionId = getSessionId()
    if (!sessionId || !messageId || !emoji) return
    try {
      const response = await platformApi.reactToCollabMessage(
        String(sessionId),
        String(messageId),
        String(emoji),
        { type: 'user' },
      )
      if (response && response.success === false) {
        showReactionHint(response.error || '这个表情没有记上')
      }
    } catch (error) {
      console.error('[collab] reaction failed:', error)
      showReactionHint(error instanceof Error ? error.message : String(error))
    }
  }

  onScopeDispose(() => {
    if (reactionHintTimer) clearTimeout(reactionHintTimer)
    reactionHintTimer = null
  })

  return { reactionHint, react }
}
