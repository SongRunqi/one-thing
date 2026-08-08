<template>
  <div
    ref="hostEl"
    class="ui-slot-block"
    :style="{ maxHeight: `${maxHeight}px` }"
  >
    <!-- 锚点块的错误态必须**小** —— 它住在输入框上方/状态条里,
         一整面错误墙会把宿主 UI 挤烂。 -->
    <button
      v-if="degraded"
      type="button"
      class="ui-slot-state"
      :title="degradedReason || 'Switched off after repeated failures. Click to try once more.'"
      @click="render({ bypassDegraded: true })"
    >
      ⚠ {{ entry.label }} — paused
    </button>
    <button
      v-else-if="error"
      type="button"
      class="ui-slot-state"
      :title="error"
      @click="render()"
    >
      ⚠ {{ entry.label }} — retry
    </button>
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
        @action="invoke"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onErrorCaptured, onMounted, ref, watch } from 'vue'
import PluginPanelNode from './PluginPanelNode.vue'
import { usePluginUiBlock } from './usePluginUiBlock'
import { uiSlotSurface, type PluginContributedUiSlot } from '@/workspace/ui-anchor-registry'

const props = defineProps<{
  entry: PluginContributedUiSlot
  /** 当前会话;切换时重拉(全局块的 render 不读它,插件自己决定)。 */
  sessionId: string | null
  /** 锚点容量给的单块最大高度。 */
  maxHeight: number
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
  renderPayload: () => ({ sessionId: props.sessionId }),
  shareInflight: true,
  enabled: props.entry.loaded,
}))

const hostEl = ref<HTMLElement | null>(null)

onMounted(() => {
  observeVisibility(hostEl.value)
})

// 会话切换 = 这一块要重拉(render ctx 的 sessionId 随之变化)。
watch(() => props.sessionId, () => {
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
