<template>
  <div
    v-if="visibleSlots.length || failedCount"
    class="ui-slot-host"
    :data-anchor="anchor"
    :data-chip-shell="chipShell || undefined"
  >
    <!-- chipShell:块穿 StatusChip 的**静态**壳(无浮层)进 S 状态带。
         换的只有外壳 —— 清单、顺序、容量裁决、失败折叠、重拉时机全部走
         上面同一条路,锚点契约零变化(composer-bands §3.2)。 -->
    <template
      v-for="slot in visibleSlots"
      :key="`${slot.pluginId}:${slot.slotId}`"
    >
      <StatusChip v-if="chipShell">
        <UiSlotBlock
          :entry="slot"
          :session-id="sessionId ?? null"
          :message-id="messageId ?? null"
          :max-height="maxHeight"
        />
      </StatusChip>
      <UiSlotBlock
        v-else
        :entry="slot"
        :session-id="sessionId ?? null"
        :message-id="messageId ?? null"
        :max-height="maxHeight"
      />
    </template>
    <!-- 加载失败的块不占容量,折叠为一个聚合指示(详情在设置页)。
         否则 3 个坏插件能永久占满整条锚点带。 -->
    <Tooltip
      v-if="failedCount"
      :text="failedTitles"
    >
      <span class="ui-slot-failed">
        {{ failedCount }} plugin block{{ failedCount > 1 ? 's' : '' }} not running
      </span>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StatusChip from '@/components/common/StatusChip.vue'
import Tooltip from '@/components/common/Tooltip.vue'
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
  /** 仅消息级锚点(message.footer):该宿主所属的消息 id,透传给每个块。 */
  messageId?: string | null
  /**
   * 每块穿 StatusChip 静态壳(S 状态带用)。**只影响外壳**:块清单、全局
   * 规范顺序、容量裁决、失败折叠一个字节都不变。
   */
  chipShell?: boolean
}>(), {
  sessionId: null,
  messageId: null,
  chipShell: false,
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

/* chip 壳形态:块并排成一行,块自身不再画自己的高度框。 */
.ui-slot-host[data-chip-shell] {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

/* 块在壳里以壳的高度为准(壳就是锚点容量的 24px),纵向滚动条在一枚 chip
   里没有意义 —— 溢出直接裁掉。`!important` 是压 UiSlotBlock 的内联
   max-height,容量数字本身仍由 UI_ANCHOR_CAPACITY_MIRROR 说了算。 */
.ui-slot-host[data-chip-shell] :deep(.ui-slot-block) {
  max-height: 100% !important;
  overflow: hidden;
  line-height: 1;
}

.ui-slot-failed {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  white-space: pre-line;
}
</style>
