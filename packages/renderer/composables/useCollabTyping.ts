/**
 * 「谁在说话」—— 房间的 typing 信号,给所有想画波纹的地方用。
 *
 * 从 `CollabTypingLine.vue` 抽出来的原样逻辑(C1 的活卡片「正在执行」与 C2/C3
 * 账页流的进行中态吃同一条):store 在**读**的时候才过期陈旧的 true,所以正在
 * 显示的一行需要一记脉搏去重读;而脉搏只在真的有人在打字时存在 —— 安静的房间
 * (常态)一个定时器都不跑。
 *
 * 名册的取用也一并搬进来:名字来自 agents 花名册,房间可能还没加载过它,
 * 第一次需要时拉一次(store 自带去重,全 app 仍是一次拉取),绝不在挂载时拉。
 */
import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'

const TYPING_PULSE_MS = 1000

/** 此刻在这个房间里打字的 agent id,先开口的在前。 */
export function useCollabTypingAgents(
  sessionId: Ref<string | undefined> | ComputedRef<string | undefined>,
): ComputedRef<string[]> {
  const agentsStore = useAgentsStore()
  const collabBoardStore = useCollabBoardStore()

  collabBoardStore.ensureSubscribed()

  const tick = ref(0)
  let pulse: ReturnType<typeof setInterval> | null = null

  function stopPulse(): void {
    if (pulse === null) return
    clearInterval(pulse)
    pulse = null
  }

  const typingIds = computed(() => {
    void tick.value
    return collabBoardStore.typingAgents(sessionId.value)
  })

  watch(typingIds, ids => {
    if (ids.length === 0) {
      stopPulse()
      return
    }
    if (pulse === null) pulse = setInterval(() => { tick.value += 1 }, TYPING_PULSE_MS)
    if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  }, { immediate: true })

  onBeforeUnmount(stopPulse)

  return typingIds
}
