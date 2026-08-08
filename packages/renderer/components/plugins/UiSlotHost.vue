<template>
  <div
    v-if="visibleSlots.length || failedCount"
    class="ui-slot-host"
    :data-anchor="anchor"
  >
    <UiSlotBlock
      v-for="slot in visibleSlots"
      :key="`${slot.pluginId}:${slot.slotId}`"
      :entry="slot"
      :session-id="sessionId ?? null"
      :max-height="maxHeight"
    />
    <!-- 加载失败的块不占容量,折叠为一个聚合指示(详情在设置页)。
         否则 3 个坏插件能永久占满整条锚点带。 -->
    <span
      v-if="failedCount"
      class="ui-slot-failed"
      :title="failedTitles"
    >
      {{ failedCount }} plugin block{{ failedCount > 1 ? 's' : '' }} not running
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import UiSlotBlock from './UiSlotBlock.vue'
import {
  UI_ANCHOR_CAPACITY_MIRROR,
  computeAnchorOverflow,
  useVisibleAnchorUiSlots,
} from '@/workspace/ui-anchor-registry'

/**
 * 锚点宿主(R5.x-c):把一个具名锚点上该渲染的插件块画出来。
 *
 * 职责只有装配:块清单来自 ui-anchor-registry(全局规范顺序 + unsupported
 * 过滤都在那里),容量裁决(maxBlocks 截断 / 失败块不占容量)在
 * computeAnchorOverflow;渲染本身每块一个 UiSlotBlock(共享内核)。
 */
const props = withDefaults(defineProps<{
  anchor: string
  /** 当前会话;切换时每个块都会重拉(render ctx 的 sessionId 随之变化)。 */
  sessionId?: string | null
}>(), {
  sessionId: null,
})

const visibleSlots = useVisibleAnchorUiSlots(props.anchor)
const maxHeight = UI_ANCHOR_CAPACITY_MIRROR[props.anchor]?.maxHeight ?? 32

const overflow = computed(() => computeAnchorOverflow(props.anchor))
const failedCount = computed(() => overflow.value.failed.length)
const failedTitles = computed(() =>
  overflow.value.failed.map(slot => `${slot.pluginName}: ${slot.label}`).join('\n'),
)
</script>

<style scoped>
.ui-slot-host {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ui-slot-failed {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  white-space: pre-line;
}
</style>
