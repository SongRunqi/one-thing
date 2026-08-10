<template>
  <div
    ref="hostEl"
    class="ui-slot-block"
    :style="{ maxHeight: `${maxHeight}px` }"
  >
    <!-- 锚点块的错误态必须**小** —— 它住在输入框上方/状态条里,
         一整面错误墙会把宿主 UI 挤烂。 -->
    <Tooltip
      v-if="degraded"
      :text="degradedReason || 'Switched off after repeated failures. Click to try once more.'"
    >
      <button
        type="button"
        class="ui-slot-state"
        @click="render({ bypassDegraded: true })"
      >
        ⚠ {{ entry.label }} — paused
      </button>
    </Tooltip>
    <Tooltip
      v-else-if="error"
      :text="error"
    >
      <button
        type="button"
        class="ui-slot-state"
        @click="render()"
      >
        ⚠ {{ entry.label }} — retry
      </button>
    </Tooltip>
    <span
      v-else-if="loading && !tree"
      class="ui-slot-state is-passive"
    >
      {{ entry.label }}…
    </span>
    <div
      v-else-if="tree"
      class="ui-slot-body"
    >
      <PluginPanelNode
        :node="tree.body"
        :plugin-id="entry.pluginId"
        @action="invoke"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onErrorCaptured, onMounted, ref, watch } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import PluginPanelNode from './PluginPanelNode.vue'
import { usePluginUiBlock } from './usePluginUiBlock'
import { uiSlotSurface, type PluginContributedUiSlot } from '@/workspace/ui-anchor-registry'

const props = defineProps<{
  entry: PluginContributedUiSlot
  /** 当前会话;切换时重拉(全局块的 render 不读它,插件自己决定)。 */
  sessionId: string | null
  /** 仅消息级锚点(message.footer):该块所属的消息 id,随 render payload 过线。 */
  messageId?: string | null
  /**
   * 仅抽屉块(F 期):当前档('expanded' | 'peek')。随 render payload 过线,
   * 插件据此返回不同的树;切档 = 重拉。**非抽屉块不传** —— 它们的 payload
   * 一个字节不变(老块看到的 ctx 与 F 期之前完全一致)。
   */
  drawerState?: 'expanded' | 'peek' | null
  /** 锚点容量给的单块最大高度。 */
  maxHeight: number
}>()

/**
 * 四态汇报(D 期加)。常显块的宿主不听 —— 块自己把状态画在原地就够了;
 * **触发式**锚点的挂点要听:弹层关掉后块就没了,而"这个插件项已暂停"
 * 必须留在入口上(置灰不消失,§9.3 第 4 条)。加一个出口,不改任何既有语义。
 */
const emit = defineEmits<{
  state: [{ degraded: boolean; error: boolean }]
}>()

/*
 * 渲染逻辑在共享内核(usePluginUiBlock)—— 与工作区面板同一套四态机、
 * 同一套通道语义。锚点块的多出来的三件事:
 *  1. render payload 带 sessionId(宿主在会话切换时重拉);
 *  2. shareInflight —— 主窗与浮层各挂一个宿主时,同时拉取共享在飞请求;
 *  3. 通知按 surface id(`ui:<anchor>:<id>`)对号入座。
 */
const {
  tree,
  error,
  degraded,
  degradedReason,
  loading,
  render,
  invoke,
  observeVisibility,
} = usePluginUiBlock(() => ({
  pluginId: props.entry.pluginId,
  renderAction: `ui:render:${props.entry.anchor}:${props.entry.slotId}`,
  invokeAction: `ui:action:${props.entry.anchor}:${props.entry.slotId}`,
  notificationId: uiSlotSurface(props.entry.anchor, props.entry.slotId),
  renderPayload: () => ({
    sessionId: props.sessionId,
    ...(props.messageId ? { messageId: props.messageId } : {}),
    ...(props.drawerState ? { drawerState: props.drawerState } : {}),
  }),
  shareInflight: true,
  enabled: props.entry.loaded,
}))

const hostEl = ref<HTMLElement | null>(null)

onMounted(() => {
  observeVisibility(hostEl.value)
})

/*
 * 每次拉取落定(loading 由 true 转 false)汇报一次当前四态 —— 只在
 * degraded/error 变化时发不够用:块每次打开都是**新实例**(初值 false),
 * 一个曾经降级、后来恢复的块不会产生"true → false"的变化,入口就永远灰着。
 */
watch([loading, degraded, error], ([isLoading]) => {
  if (isLoading) return
  emit('state', { degraded: degraded.value, error: !!error.value })
})

// 会话切换 = 这一块要重拉(render ctx 的 sessionId 随之变化);messageId
// 对消息级块同理(正常不会变 —— 每条消息挂各的实例,但变了就得重拉)。
// drawerState 同理:换档 = 换一棵树,重拉是宿主的责任(插件不自己轮询档)。
watch(() => [props.sessionId, props.messageId, props.drawerState], () => {
  void render()
})

/** 与面板同规的错误边界:一块炸不能带走整条锚点带。 */
onErrorCaptured((e: unknown) => {
  error.value = e instanceof Error ? e.message : 'This block could not be rendered.'
  tree.value = null
  return false
})
</script>

<style scoped>
.ui-slot-block {
  overflow-y: auto;
  min-width: 0;
  font-size: 12px;
}

.ui-slot-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted-fg);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ui-slot-state.is-passive {
  cursor: default;
}

.ui-slot-body {
  min-width: 0;
}
</style>
